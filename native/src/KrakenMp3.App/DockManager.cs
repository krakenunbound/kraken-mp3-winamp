using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using KrakenMp3.Core;

namespace KrakenMp3.App;

/// <summary>
/// Winamp-style magnetic docking for the player's windows.
///
/// * Any window dragged within 10 px (DPI-scaled) of another window's edge,
///   or of the screen's work area, snaps to it. Resizing snaps too.
/// * Windows whose edges touch form a group. Dragging the main player moves
///   every window connected to it (directly or through a chain) as one.
/// * Dragging any other window moves it alone: that is how a panel is pulled
///   off the stack. Drop it near an edge to snap it back on.
/// * Shift+drag on the main player moves it alone too.
///
/// Runs on the native move loop (WM_MOVING / WM_SIZING) in physical pixels;
/// the geometry lives in <see cref="DockGeometry"/> (unit tested).
/// </summary>
public sealed class DockManager
{
    private const double SnapDip = 10;
    private readonly Window _leader;
    private readonly List<Window> _windows = [];

    private readonly List<(IntPtr Hwnd, int Dx, int Dy)> _followers = [];
    private bool _leaderAlone;

    public DockManager(Window leader)
    {
        _leader = leader;
        Register(leader);
        leader.Activated += (_, _) => RaiseUnownedFollowers();
    }

    /// <summary>Adds a window to docking; it drops out again when it closes.</summary>
    public void Register(Window w)
    {
        if (_windows.Contains(w)) return;
        _windows.Add(w);
        void Hook() => ((HwndSource)PresentationSource.FromVisual(w)!).AddHook(
            (IntPtr hwnd, int msg, IntPtr wp, IntPtr lp, ref bool handled) => WndProc(w, hwnd, msg, lp));
        if (PresentationSource.FromVisual(w) != null) Hook();
        else w.SourceInitialized += (_, _) => Hook();
        w.Closed += (_, _) => _windows.Remove(w);
    }

    /// <summary>Windows currently docked to the leader (directly or chained).</summary>
    public IReadOnlyList<Window> GroupOfLeader()
    {
        var all = VisibleRects();
        int li = all.FindIndex(x => x.W == _leader);
        if (li < 0) return [];
        return DockGeometry.Connected(all.Select(x => x.R).ToList(), li).Where(i => i != li).Select(i => all[i].W).ToList();
    }

    /// <summary>Union of the given windows' screen rectangles (pixels), or null.</summary>
    public PxRect? Bounds(IEnumerable<Window> windows)
    {
        var set = windows.ToHashSet();
        var rects = VisibleRects().Where(x => set.Contains(x.W)).Select(x => x.R).ToList();
        if (rects.Count == 0) return null;
        return new PxRect(rects.Min(r => r.Left), rects.Min(r => r.Top), rects.Max(r => r.Right), rects.Max(r => r.Bottom));
    }

    // ================================================================ hooks

    private const int WM_SIZING = 0x0214, WM_MOVING = 0x0216, WM_ENTERSIZEMOVE = 0x0231, WM_EXITSIZEMOVE = 0x0232;

    private IntPtr WndProc(Window w, IntPtr hwnd, int msg, IntPtr lp)
    {
        switch (msg)
        {
            case WM_ENTERSIZEMOVE:
                if (w == _leader) BeginLeaderDrag();
                break;
            case WM_MOVING:
            {
                var r = Marshal.PtrToStructure<RECT>(lp).ToPx();
                var others = VisibleRects().Where(x => x.W != w && !_followers.Any(f => f.Hwnd == x.Hwnd)).Select(x => x.R);
                var snapped = DockGeometry.SnapMove(r, others, WorkAreaFor(r), SnapPx(w));
                if (snapped != r) Marshal.StructureToPtr(RECT.From(snapped), lp, false);
                if (w == _leader && !_leaderAlone) MoveFollowers(snapped);
                break;
            }
            case WM_SIZING:
            {
                var r = Marshal.PtrToStructure<RECT>(lp).ToPx();
                GetWindowRect(hwnd, out var before);
                var others = VisibleRects().Where(x => x.W != w).Select(x => x.R);
                var snapped = DockGeometry.SnapResize(before.ToPx(), r, others, WorkAreaFor(r), SnapPx(w));
                if (snapped != r) Marshal.StructureToPtr(RECT.From(snapped), lp, false);
                break;
            }
            case WM_EXITSIZEMOVE:
                _followers.Clear();
                break;
        }
        return IntPtr.Zero;
    }

    private void BeginLeaderDrag()
    {
        _followers.Clear();
        _leaderAlone = (Keyboard.Modifiers & ModifierKeys.Shift) != 0;
        if (_leaderAlone) return;
        var all = VisibleRects();
        int li = all.FindIndex(x => x.W == _leader);
        if (li < 0) return;
        var lr = all[li].R;
        foreach (int i in DockGeometry.Connected(all.Select(x => x.R).ToList(), li))
            if (i != li) _followers.Add((all[i].Hwnd, all[i].R.Left - lr.Left, all[i].R.Top - lr.Top));
    }

    private void MoveFollowers(PxRect leader)
    {
        foreach (var (hwnd, dx, dy) in _followers)
            SetWindowPos(hwnd, IntPtr.Zero, leader.Left + dx, leader.Top + dy, 0, 0,
                SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
    }

    /// <summary>Keeps an attached, unowned window (the visualizer) just under
    /// the player when the player comes to the front.</summary>
    private void RaiseUnownedFollowers()
    {
        var leaderHwnd = new WindowInteropHelper(_leader).Handle;
        foreach (var w in GroupOfLeader())
            if (w.Owner == null && !w.Topmost)
                SetWindowPos(new WindowInteropHelper(w).Handle, leaderHwnd, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
    }

    // ========================================================== geometry

    private static int SnapPx(Window w) =>
        (int)Math.Round(SnapDip * (PresentationSource.FromVisual(w)?.CompositionTarget?.TransformToDevice.M11 ?? 1));

    private List<(Window W, IntPtr Hwnd, PxRect R)> VisibleRects()
    {
        var list = new List<(Window, IntPtr, PxRect)>();
        foreach (var w in _windows)
        {
            if (!w.IsVisible || w.WindowState != WindowState.Normal) continue;
            var h = new WindowInteropHelper(w).Handle;
            if (h != IntPtr.Zero && GetWindowRect(h, out var r)) list.Add((w, h, r.ToPx()));
        }
        return list;
    }

    private static PxRect WorkAreaFor(PxRect p)
    {
        var r = RECT.From(p);
        var mon = MonitorFromRect(ref r, 2 /* MONITOR_DEFAULTTONEAREST */);
        var mi = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
        return GetMonitorInfo(mon, ref mi) ? mi.rcWork.ToPx() : p;
    }

    // ============================================================ native

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left, Top, Right, Bottom;
        public readonly PxRect ToPx() => new(Left, Top, Right, Bottom);
        public static RECT From(PxRect p) => new() { Left = p.Left, Top = p.Top, Right = p.Right, Bottom = p.Bottom };
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MONITORINFO { public int cbSize; public RECT rcMonitor, rcWork; public uint dwFlags; }

    private const uint SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10, SWP_NOOWNERZORDER = 0x200;

    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] private static extern IntPtr MonitorFromRect(ref RECT r, uint flags);
    [DllImport("user32.dll")] private static extern bool GetMonitorInfo(IntPtr mon, ref MONITORINFO mi);
}
