using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using KrakenMp3.Audio;
using KrakenMp3.Visuals;
using SkiaSharp;
using SkiaSharp.Views.Desktop;
using SkiaSharp.Views.WPF;

namespace KrakenMp3.App;

public enum VizBackground { Normal, Green, Magenta, Black, Transparent }

/// <summary>
/// Standalone visualizer: all v2 modes, floating album art (Off / Float /
/// Bounce), and backgrounds for streaming (chroma-key colours, black for luma
/// key, or truly transparent). Frames are driven by its own render tick and
/// drawn with SkiaSharp, so it keeps animating whether it is covered,
/// unfocused, or the main window is minimised. Deliberately not owned by the
/// main window, so minimising the player leaves it running for OBS.
/// </summary>
public sealed class VisualizerWindow : Window
{
    private readonly MainWindow _host;
    private readonly Player _player;
    private readonly SKElement _canvas = new();
    private readonly VisualizerRenderer _renderer = new();
    private readonly FloatingArt _art = new();
    private readonly byte[] _spectrum = new byte[SpectrumAnalyzer.BinCount];
    private readonly byte[] _wave = new byte[SpectrumAnalyzer.FftSize];
    private readonly DispatcherTimer _frameTimer;
    private readonly Button _modeButton, _artButton, _bgButton;
    private readonly Border _titleBar;
    private byte[]? _artData;

    public VizBackground BackgroundMode { get; private set; }
    public long FramesDrawn { get; private set; }
    public long FramesWithSignal { get; private set; }

    public VizMode Mode
    {
        get => _renderer.Mode;
        set { _renderer.Mode = value; UpdateButtons(); }
    }

    /// <summary>Theme colours for the bars and the art's glow.</summary>
    public void SetTheme(VizTheme theme)
    {
        _renderer.Theme = theme;
        _art.Accent = theme.Accent;
    }

    public ArtMode ArtMode
    {
        get => _art.Mode;
        set { _art.Mode = value; UpdateButtons(); }
    }

    /// <summary>Frame cap in fps; 0 draws on every display refresh.</summary>
    public int FpsCap { get; set; } = 60;

    public VisualizerWindow(MainWindow host, Player player, VizBackground bg = VizBackground.Normal)
    {
        _host = host;
        _player = player;
        Title = "Kraken Visualizer";
        Width = 440;
        Height = 180;
        MinWidth = 160;
        MinHeight = 80;
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.CanResizeWithGrip;
        ShowInTaskbar = false;
        UseLayoutRounding = true;
        AllowsTransparency = bg == VizBackground.Transparent;
        FlatFrame.Apply(this);

        Button TitleButton(string text, string tip, RoutedEventHandler click)
        {
            var b = new Button { Content = text, ToolTip = tip, Style = (Style)Application.Current.Resources["TitleButton"] };
            b.Click += click;
            return b;
        }
        _modeButton = TitleButton("BARS", "Visualizer mode: click to change (or click the visualizer)", (_, _) => _host.CycleVizMode());
        _modeButton.MinWidth = 46;
        _artButton = TitleButton("ART", "Floating album art", (_, _) => _host.CycleArtMode());
        _bgButton = TitleButton("BG", "Background", (_, _) => _host.CycleVizBackground());
        var close = TitleButton("×", "Close (V)", (_, _) => Close());

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 3, 0) };
        foreach (var b in new[] { _modeButton, _artButton, _bgButton, close }) buttons.Children.Add(b);
        var titleGrid = new Grid();
        var titleText = new TextBlock
        {
            Text = "KRAKEN VISUALIZER",
            FontSize = 9, FontWeight = FontWeights.Bold,
            VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(6, 0, 0, 0),
        };
        titleText.SetResourceReference(TextBlock.ForegroundProperty, "TextMid");
        titleGrid.Children.Add(titleText);
        titleGrid.Children.Add(buttons);
        _titleBar = new Border { Height = 18, Child = titleGrid };
        _titleBar.MouseLeftButtonDown += (_, e) => { if (e.ButtonState == MouseButtonState.Pressed && e.OriginalSource is not Button) DragMove(); };

        var root = new DockPanel();
        DockPanel.SetDock(_titleBar, Dock.Top);
        root.Children.Add(_titleBar);
        root.Children.Add(_canvas);
        Content = root;

        _canvas.MouseLeftButtonUp += (_, _) => _host.CycleVizMode();
        _canvas.MouseRightButtonUp += (_, e) => { _host.ShowVizMenu(this); e.Handled = true; };
        _canvas.PaintSurface += OnPaintSurface;
        PreviewKeyDown += (_, e) => _host.HandleKey(e, inList: false);

        ApplyBackground(bg);

        // Primary driver: WPF's display-synced render tick. Backup: a timer in
        // case the render tick ever pauses.
        _frameTimer = new DispatcherTimer(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(50) };
        _frameTimer.Tick += (_, _) => { if (Environment.TickCount64 - _lastFrameMs > 45) _canvas.InvalidateVisual(); };
        Loaded += (_, _) => { CompositionTarget.Rendering += OnRendering; _frameTimer.Start(); };
        Closed += (_, _) =>
        {
            CompositionTarget.Rendering -= OnRendering;
            _frameTimer.Stop();
            _renderer.Dispose();
            _art.Dispose();
        };
        UpdateButtons();
    }

    /// <summary>True if switching to <paramref name="bg"/> needs a new window
    /// (WPF fixes AllowsTransparency when the window is created).</summary>
    public bool NeedsNewWindowFor(VizBackground bg) => (bg == VizBackground.Transparent) != AllowsTransparency;

    public void ApplyBackground(VizBackground bg)
    {
        BackgroundMode = bg;
        bool key = bg != VizBackground.Normal;
        _renderer.Bare = key;
        _art.Opaque = key;
        if (bg == VizBackground.Normal) SetResourceReference(BackgroundProperty, "PanelBgDark");
        else Background = bg switch
        {
            VizBackground.Green => new SolidColorBrush(Color.FromRgb(0, 255, 0)),
            VizBackground.Magenta => new SolidColorBrush(Color.FromRgb(255, 0, 255)),
            VizBackground.Black => Brushes.Black,
            _ => Brushes.Transparent,
        };
        // Title bar keeps a plain dark look in key modes so it can be cropped.
        _titleBar.SetResourceReference(Border.BackgroundProperty, key ? "PanelBgDark" : "TitleBg");
        UpdateButtons();
    }

    /// <summary>Sets the album art (encoded image bytes, or null for none).</summary>
    public void SetArtData(byte[]? data)
    {
        _artData = data;
        SKImage? img = null;
        if (data != null) { try { img = SKImage.FromEncodedData(data); } catch (Exception) { img = null; } }
        _art.SetImage(img);
    }

    /// <summary>Replaces this window with one for a background that needs
    /// different transparency; keeps position, size, mode, art and frame cap.</summary>
    public VisualizerWindow Recreate(VizBackground bg, Action<VisualizerWindow>? beforeClose = null)
    {
        var next = new VisualizerWindow(_host, _player, bg)
        {
            Left = Left, Top = Top, Width = Width, Height = Height, FpsCap = FpsCap,
            WindowStartupLocation = WindowStartupLocation.Manual,
        };
        next.Mode = Mode;
        next.ArtMode = ArtMode;
        next.SetArtData(_artData);
        next.Show();
        beforeClose?.Invoke(next);
        Close();
        return next;
    }

    private void UpdateButtons()
    {
        _modeButton.Content = VisualizerRenderer.Label(Mode).ToUpperInvariant();
        _artButton.Tag = ArtMode != ArtMode.Off ? "active" : null;
        _artButton.ToolTip = $"Floating album art: {ArtMode} — click to change";
        _bgButton.Tag = BackgroundMode != VizBackground.Normal ? "active" : null;
        _bgButton.ToolTip = "Background: " + BackgroundLabel(BackgroundMode) + " — click to change";
    }

    public static string BackgroundLabel(VizBackground bg) => bg switch
    {
        VizBackground.Green => "Green screen (OBS Chroma Key)",
        VizBackground.Magenta => "Magenta screen (OBS Chroma Key, best for green bars)",
        VizBackground.Black => "Black (OBS Luma Key)",
        VizBackground.Transparent => "Transparent (bars only)",
        _ => "Normal",
    };

    // ============================================================ frames

    private long _lastFrameMs;
    private TimeSpan _lastRenderTime;
    private double _dueMs;
    private readonly System.Diagnostics.Stopwatch _clock = System.Diagnostics.Stopwatch.StartNew();
    private double _lastDrawSec;

    private void OnRendering(object? sender, EventArgs e)
    {
        // Rendering can fire more than once per frame; only act on new frames.
        if (e is RenderingEventArgs r)
        {
            if (r.RenderingTime == _lastRenderTime) return;
            _lastRenderTime = r.RenderingTime;
            if (FpsCap > 0)
            {
                // Average exactly FpsCap on any refresh rate; after a stall,
                // resume without a burst of catch-up frames.
                double now = r.RenderingTime.TotalMilliseconds, period = 1000.0 / FpsCap;
                if (now + 0.5 < _dueMs) return;
                _dueMs = now - _dueMs > period ? now + period : _dueMs + period;
            }
        }
        _canvas.InvalidateVisual();
    }

    private void OnPaintSurface(object? sender, SKPaintSurfaceEventArgs e)
    {
        double now = _clock.Elapsed.TotalSeconds;
        double dt = _lastDrawSec == 0 ? 1 / 60.0 : now - _lastDrawSec;
        _lastDrawSec = now;

        var canvas = e.Surface.Canvas;
        canvas.Clear(SKColors.Transparent);
        float scale = _canvas.ActualWidth > 0 ? (float)(e.Info.Width / _canvas.ActualWidth) : 1f;
        _renderer.Scale = scale;
        _art.Scale = scale;
        _player.GetSpectrum(_spectrum);
        if (Mode == VizMode.Wave) _player.GetWaveform(_wave);
        _renderer.Draw(canvas, e.Info.Width, e.Info.Height, _spectrum, _wave, dt);
        _art.Draw(canvas, e.Info.Width, e.Info.Height, dt);

        FramesDrawn++;
        _lastFrameMs = Environment.TickCount64;
        if (_spectrum.AsSpan().IndexOfAnyExcept((byte)0) >= 0) FramesWithSignal++;
    }
}
