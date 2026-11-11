using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Threading;
using KrakenMp3.Core;

namespace KrakenMp3.App;

/// <summary>
/// --docktest: opens all four windows where the settings put them, then
/// drives the real docking code by sending the window-move messages Windows
/// would send during a drag (no mouse or keyboard input is used), and checks
/// the playlist model's editing operations. Writes a report and exits.
/// </summary>
public sealed class DockTest(MainWindow main, string outPath)
{
    private readonly StringBuilder _log = new();
    private int _fail;

    public void Start()
    {
        main.Loaded += (_, _) => After(1.2, Run);
    }

    private static void After(double s, Action a)
    {
        var t = new DispatcherTimer { Interval = TimeSpan.FromSeconds(s) };
        t.Tick += (_, _) => { t.Stop(); a(); };
        t.Start();
    }

    private void Check(bool ok, string what)
    {
        if (!ok) _fail++;
        _log.AppendLine($"{(ok ? "PASS" : "FAIL")}  {what}");
    }

    private void Run()
    {
        try
        {
            ModelChecks();
            if (main.Viz == null) main.ShowViz();
            DockChecks();
        }
        catch (Exception ex) { _fail++; _log.AppendLine("ERROR " + ex); }
        _log.AppendLine(_fail == 0 ? "ALL PASSED" : $"{_fail} FAILED");
        File.WriteAllText(outPath, _log.ToString());
        main.Close();
    }

    // ------------------------------------------------------------ docking

    private static IntPtr H(Window w) => new WindowInteropHelper(w).Handle;
    private static PxRect Rect(Window w) { GetWindowRect(H(w), out var r); return new(r.L, r.T, r.R, r.B); }

    /// <summary>Simulates dragging <paramref name="w"/> by (dx, dy) the way the
    /// system move loop does: enter, WM_MOVING (which may snap), move, exit.</summary>
    private static PxRect Drag(Window w, int dx, int dy)
    {
        var h = H(w);
        var start = Rect(w).Offset(dx, dy);
        var r = new RECTW { L = start.Left, T = start.Top, R = start.Right, B = start.Bottom };
        IntPtr p = Marshal.AllocHGlobal(Marshal.SizeOf<RECTW>());
        try
        {
            SendMessage(h, 0x0231, IntPtr.Zero, IntPtr.Zero);           // WM_ENTERSIZEMOVE
            Marshal.StructureToPtr(r, p, false);
            SendMessage(h, 0x0216, new IntPtr(9), p);                    // WM_MOVING
            r = Marshal.PtrToStructure<RECTW>(p);
            SetWindowPos(h, IntPtr.Zero, r.L, r.T, 0, 0, 0x1 | 0x4 | 0x10);
            SendMessage(h, 0x0232, IntPtr.Zero, IntPtr.Zero);           // WM_EXITSIZEMOVE
        }
        finally { Marshal.FreeHGlobal(p); }
        return new PxRect(r.L, r.T, r.R, r.B);
    }

    private void DockChecks()
    {
        var eq = main.EqWin!;
        var pl = main.PlWindow!;
        var viz = main.Viz!;
        Window[] all = [main, eq, pl, viz];
        string Layout() => string.Join("  ", all.Select(w => $"{w.Title.Split(' ')[^1]}={Rect(w)}"));
        _log.AppendLine("start   " + Layout());

        // What the eye sees must equal what docking measures: no invisible borders.
        foreach (var w in all)
        {
            DwmGetWindowAttribute(H(w), 9 /* DWMWA_EXTENDED_FRAME_BOUNDS */, out var vis, Marshal.SizeOf<RECTW>());
            var r = Rect(w);
            Check(vis.L == r.Left && vis.T == r.Top && vis.R == r.Right && vis.B == r.Bottom,
                  $"{w.GetType().Name}: visible frame = docking rectangle ({vis.L},{vis.T},{vis.R},{vis.B} vs {r})");
        }

        var group = main.Dock.GroupOfLeader();
        Check(group.Contains(eq) && group.Contains(pl) && group.Contains(viz), "default layout: EQ, playlist and visualizer are docked to the player");

        // 1. Drag the player: everything follows.
        var before = all.Select(Rect).ToArray();
        Drag(main, 37, 23);
        var after = all.Select(Rect).ToArray();
        int mdx = after[0].Left - before[0].Left, mdy = after[0].Top - before[0].Top;
        Check(mdx == 37 && mdy == 23, $"player moved by the drag (moved {mdx},{mdy})");
        Check(Enumerable.Range(1, 3).All(i => after[i].Left - before[i].Left == mdx && after[i].Top - before[i].Top == mdy),
              "dragging the player moved the whole stack together");

        // 2. Drag the playlist away: only it moves, and it leaves the group.
        before = all.Select(Rect).ToArray();
        Drag(pl, 260, 140);
        after = all.Select(Rect).ToArray();
        Check(after[0] == before[0] && after[1] == before[1] && after[3] == before[3], "dragging the playlist moved only the playlist");
        Check(!main.Dock.GroupOfLeader().Contains(pl), "the playlist is now detached");

        // 3. Player drag no longer carries the detached playlist.
        var plBefore = Rect(pl);
        Drag(main, -15, 10);
        Check(Rect(pl) == plBefore, "a detached panel stays put when the player moves");

        // 4. Bring the playlist back within snap range: it snaps flush and re-docks.
        var target = Rect(eq);
        var cur = Rect(pl);
        var snapped = Drag(pl, target.Left + 6 - cur.Left, target.Bottom + 7 - cur.Top);
        Check(snapped.Left == target.Left && snapped.Top == target.Bottom, $"dropping near the EQ snaps flush under it ({snapped.Left},{snapped.Top} vs {target.Left},{target.Bottom})");
        Check(main.Dock.GroupOfLeader().Contains(pl), "the playlist is docked again");

        // 5. And moves with the player again.
        before = all.Select(Rect).ToArray();
        Drag(main, 20, -12);
        after = all.Select(Rect).ToArray();
        // The visualizer was docked under the playlist, so it was left behind
        // (loose) when the playlist was pulled away; the re-docked three move.
        Check(Enumerable.Range(0, 3).All(i => after[i].Left - before[i].Left == 20 && after[i].Top - before[i].Top == -12),
              "after re-docking, player, EQ and playlist move together again");
        Check(after[3] == before[3], "the visualizer left loose by the detach stays put");
        _log.AppendLine("end     " + Layout());
    }

    // -------------------------------------------------------------- model

    private void ModelChecks()
    {
        var q = new PlayQueue(new Random(4));
        var m = new PlaylistModel(q, main.Dispatcher);
        bool InSync() => m.Rows.Count == q.Count && m.Rows.Select(r => r.Item.Id).SequenceEqual(q.Items.Select(i => i.Id))
                         && m.Rows.Select((r, i) => r.Number == i + 1).All(b => b);
        var names = Enumerable.Range(0, 40).Select(i => $@"C:\nope\{i % 35:00}.mp3").ToList(); // 5 duplicates
        q.Add(names);
        q.Select(10);
        Check(InSync(), "add 40");
        var rowsInstance = m.Rows;
        m.MoveBlock([3, 4, 5], 20); Check(InSync() && ReferenceEquals(rowsInstance, m.Rows), "move a block down (in place)");
        m.MoveBlock([30, 31], 0); Check(InSync(), "move a block to the top");
        m.RemoveIndices([0, 7, 8, 39]); Check(InSync() && ReferenceEquals(rowsInstance, m.Rows), "remove scattered rows (in place)");
        q.Insert(5, ["a.mp3", "b.mp3"]); Check(InSync(), "insert in the middle");
        m.Sort(PlaylistModel.SortKey.Path); Check(InSync() && q.Items.Select(i => i.Path).SequenceEqual(q.Items.Select(i => i.Path).Order(StringComparer.CurrentCultureIgnoreCase)), "sort by path");
        m.Reverse(); Check(InSync(), "reverse");
        m.Randomize(); Check(InSync(), "randomise");
        var cur = q.Current;
        int removed = m.RemoveDuplicates();
        Check(InSync() && removed >= 1 && q.Items.Select(i => i.Path.ToLowerInvariant()).Distinct().Count() == q.Count && q.Current == cur,
              $"remove duplicates ({removed} removed, playing track kept)");
        int missing = m.RemoveMissing(); Check(InSync() && q.Count == 0 && missing > 0, "remove missing files");
        var big = Enumerable.Range(0, 3000).Select(i => $@"C:\nope\big{i}.mp3").ToList();
        q.Add(big); Check(InSync(), "add 3000 at once");
        q.Clear(); Check(InSync() && m.Rows.Count == 0, "clear");

        // M3U save → load through the same path Explorer/drop use.
        var td = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "testdata");
        var files = Directory.Exists(td) ? Directory.GetFiles(td, "t.*").Where(Audio.Decoders.IsSupported).OrderBy(f => f).ToList() : [];
        if (files.Count > 0)
        {
            q.Add(files);
            var m3u = Path.Combine(Path.GetTempPath(), $"kraken-docktest-{Environment.ProcessId}.m3u8");
            m.SavePlaylist(m3u);
            var back = PlaylistModel.ExpandPaths([m3u]);
            File.Delete(m3u);
            Check(back.Select(Path.GetFullPath).SequenceEqual(files.Select(Path.GetFullPath)), $"save and reload an M3U8 ({back.Count} tracks)");
            q.Clear();
        }
    }

    [StructLayout(LayoutKind.Sequential)] private struct RECTW { public int L, T, R, B; }
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr h, out RECTW r);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECTW r, int size);
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr wp, IntPtr lp);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
