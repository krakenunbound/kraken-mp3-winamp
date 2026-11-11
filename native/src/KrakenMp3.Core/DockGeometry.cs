namespace KrakenMp3.Core;

/// <summary>A screen rectangle in physical pixels (right/bottom exclusive).</summary>
public record struct PxRect(int Left, int Top, int Right, int Bottom)
{
    public readonly int Width => Right - Left;
    public readonly int Height => Bottom - Top;
    public readonly PxRect Offset(int dx, int dy) => new(Left + dx, Top + dy, Right + dx, Bottom + dy);
}

/// <summary>
/// The maths behind magnetic docking, kept free of Win32 so it can be tested.
/// </summary>
public static class DockGeometry
{
    /// <summary>Gap (px) still counted as "docked".</summary>
    public const int Touch = 1;

    /// <summary>True when two windows share an edge (and overlap along it).</summary>
    public static bool Touching(PxRect a, PxRect b)
    {
        bool vOverlap = a.Top < b.Bottom && b.Top < a.Bottom;
        bool hOverlap = a.Left < b.Right && b.Left < a.Right;
        return (vOverlap && (Math.Abs(a.Right - b.Left) <= Touch || Math.Abs(b.Right - a.Left) <= Touch))
            || (hOverlap && (Math.Abs(a.Bottom - b.Top) <= Touch || Math.Abs(b.Bottom - a.Top) <= Touch));
    }

    /// <summary>Indices of every rect connected to <paramref name="start"/>
    /// through touching edges (including <paramref name="start"/>).</summary>
    public static List<int> Connected(IReadOnlyList<PxRect> rects, int start)
    {
        var group = new List<int> { start };
        var seen = new HashSet<int> { start };
        for (int q = 0; q < group.Count; q++)
            for (int i = 0; i < rects.Count; i++)
                if (!seen.Contains(i) && Touching(rects[group[q]], rects[i])) { seen.Add(i); group.Add(i); }
        return group;
    }

    /// <summary>Moves <paramref name="r"/> (size kept) by at most
    /// <paramref name="snap"/> px per axis so an edge meets a target's edge or
    /// the work area. Nearest candidate wins on each axis.</summary>
    public static PxRect SnapMove(PxRect r, IEnumerable<PxRect> targets, PxRect workArea, int snap)
    {
        int bestDx = int.MaxValue, bestDy = int.MaxValue;
        void TryX(int from, int to) { int d = to - from; if (Math.Abs(d) <= snap && Math.Abs(d) < Math.Abs(bestDx)) bestDx = d; }
        void TryY(int from, int to) { int d = to - from; if (Math.Abs(d) <= snap && Math.Abs(d) < Math.Abs(bestDy)) bestDy = d; }

        foreach (var t in targets)
        {
            bool sideBySide = r.Top <= t.Bottom + snap && r.Bottom >= t.Top - snap;
            bool stacked = r.Left <= t.Right + snap && r.Right >= t.Left - snap;
            if (sideBySide) { TryX(r.Left, t.Right); TryX(r.Right, t.Left); }
            if (stacked) { TryY(r.Top, t.Bottom); TryY(r.Bottom, t.Top); }
            // Once stacked/side by side, line the edges up too.
            if (stacked && (Math.Abs(r.Top - t.Bottom) <= snap || Math.Abs(r.Bottom - t.Top) <= snap))
            { TryX(r.Left, t.Left); TryX(r.Right, t.Right); }
            if (sideBySide && (Math.Abs(r.Left - t.Right) <= snap || Math.Abs(r.Right - t.Left) <= snap))
            { TryY(r.Top, t.Top); TryY(r.Bottom, t.Bottom); }
        }
        TryX(r.Left, workArea.Left); TryX(r.Right, workArea.Right);
        TryY(r.Top, workArea.Top); TryY(r.Bottom, workArea.Bottom);

        return r.Offset(bestDx == int.MaxValue ? 0 : bestDx, bestDy == int.MaxValue ? 0 : bestDy);
    }

    /// <summary>While resizing: snaps only the edges that moved (compared with
    /// <paramref name="before"/>) to nearby target or work-area lines.</summary>
    public static PxRect SnapResize(PxRect before, PxRect r, IEnumerable<PxRect> targets, PxRect workArea, int snap)
    {
        var all = targets.Append(workArea).ToList();
        int Best(int edge, IEnumerable<int> lines)
        {
            int best = edge, bd = snap + 1;
            foreach (var l in lines) { int d = Math.Abs(l - edge); if (d < bd) { bd = d; best = l; } }
            return best;
        }
        var xs = all.SelectMany(t => new[] { t.Left, t.Right }).ToList();
        var ys = all.SelectMany(t => new[] { t.Top, t.Bottom }).ToList();
        if (r.Right != before.Right) r.Right = Best(r.Right, xs);
        if (r.Left != before.Left) r.Left = Best(r.Left, xs);
        if (r.Bottom != before.Bottom) r.Bottom = Best(r.Bottom, ys);
        if (r.Top != before.Top) r.Top = Best(r.Top, ys);
        return r;
    }
}
