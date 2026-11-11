using KrakenMp3.Core;

namespace KrakenMp3.Tests;

public class DockGeometryTests
{
    private static readonly PxRect Screen = new(0, 0, 1920, 1040);
    private static PxRect R(int x, int y, int w, int h) => new(x, y, x + w, y + h);

    [Fact]
    public void Stacked_windows_touch_and_chain_into_one_group()
    {
        var main = R(100, 100, 440, 136);
        var eq = R(100, 236, 440, 178);       // directly below main
        var pl = R(100, 414, 440, 300);       // below EQ
        var viz = R(540, 100, 300, 136);      // right of main
        var loose = R(1200, 600, 300, 200);   // elsewhere
        var g = DockGeometry.Connected([main, eq, pl, viz, loose], 0);
        Assert.Equal([0, 1, 3, 2], g);        // breadth-first: eq & viz, then pl
        Assert.DoesNotContain(4, g);
    }

    [Fact]
    public void Corner_contact_or_a_gap_does_not_dock()
    {
        Assert.False(DockGeometry.Touching(R(0, 0, 100, 100), R(100, 100, 50, 50)));  // corners only
        Assert.False(DockGeometry.Touching(R(0, 0, 100, 100), R(0, 103, 100, 50)));   // 3 px gap
        Assert.True(DockGeometry.Touching(R(0, 0, 100, 100), R(0, 101, 100, 50)));    // 1 px tolerated
    }

    [Fact]
    public void Dragging_near_a_window_snaps_flush_below_and_aligned()
    {
        var main = R(100, 100, 440, 136);
        var dragged = R(106, 243, 440, 178);   // 6 px right, 7 px below main's bottom
        var s = DockGeometry.SnapMove(dragged, [main], Screen, 10);
        Assert.Equal(R(100, 236, 440, 178), s);
    }

    [Fact]
    public void Snaps_beside_and_aligns_tops()
    {
        var main = R(100, 100, 440, 136);
        var s = DockGeometry.SnapMove(R(548, 95, 300, 136), [main], Screen, 10);
        Assert.Equal(R(540, 100, 300, 136), s);
    }

    [Fact]
    public void Far_away_does_not_snap_and_screen_edges_do()
    {
        var main = R(100, 100, 440, 136);
        var far = R(800, 500, 300, 200);
        Assert.Equal(far, DockGeometry.SnapMove(far, [main], Screen, 10));
        Assert.Equal(R(0, 500, 300, 200), DockGeometry.SnapMove(R(8, 500, 300, 200), [main], Screen, 10));
        Assert.Equal(R(800, 840, 300, 200), DockGeometry.SnapMove(R(800, 835, 300, 200), [main], Screen, 10));
    }

    [Fact]
    public void Not_snapped_to_a_window_it_is_not_near_on_the_other_axis()
    {
        // Horizontally lined up with main's right edge but 400 px lower: no x snap.
        var main = R(100, 100, 440, 136);
        var r = R(545, 600, 300, 100);
        Assert.Equal(r, DockGeometry.SnapMove(r, [main], Screen, 10));
    }

    [Fact]
    public void Resizing_snaps_only_the_moving_edge()
    {
        var pl = R(100, 414, 440, 300);
        var below = R(100, 720, 440, 100);
        var after = pl with { Bottom = 716 };            // dragging the bottom edge down
        var s = DockGeometry.SnapResize(pl, after, [below], Screen, 10);
        Assert.Equal(pl with { Bottom = 720 }, s);
    }
}
