using System.Windows;
using System.Windows.Shell;

namespace KrakenMp3.App;

/// <summary>
/// Resizable borderless windows normally get an invisible 7–8 px resize
/// border (and a thin white top edge) from Windows. That border counts in the
/// window rectangle, so docked panels lined up by their invisible edges and
/// looked offset. A WindowChrome with no caption or glass makes the whole
/// window the visible panel while keeping edge resizing.
/// </summary>
public static class FlatFrame
{
    public static void Apply(Window w) => WindowChrome.SetWindowChrome(w, new WindowChrome
    {
        CaptionHeight = 0,
        ResizeBorderThickness = new Thickness(5),
        GlassFrameThickness = new Thickness(0),
        CornerRadius = new CornerRadius(0),
        UseAeroCaptionButtons = false,
    });
}
