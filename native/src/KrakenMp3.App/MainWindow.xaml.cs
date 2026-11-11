using System.Globalization;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using KrakenMp3.Audio;
using KrakenMp3.Core;
using KrakenMp3.Visuals;
using Microsoft.Win32;
using SkiaSharp;
using SkiaSharp.Views.Desktop;

namespace KrakenMp3.App;

/// <summary>
/// The main player window and the app's controller: it owns the player, the
/// queue and the other windows (playlist, EQ, visualizer).
/// </summary>
public partial class MainWindow : Window
{
    public Player Player { get; } = new();
    public PlayQueue Queue { get; } = new();
    public PlaylistModel Playlist { get; }
    public VisualizerWindow? Viz { get; private set; }
    public PlaylistWindow? PlWindow { get; private set; }
    public EqWindow? EqWin { get; private set; }
    public AppSettings Settings { get; }
    public DockManager Dock { get; }

    private readonly string _settingsPath;
    private readonly DispatcherTimer _uiTimer = new() { Interval = TimeSpan.FromMilliseconds(100) };
    private readonly DispatcherTimer _saveTimer = new() { Interval = TimeSpan.FromSeconds(1.5) };
    private DateTime _lastSave = DateTime.UtcNow;
    private readonly byte[] _miniSpectrum = new byte[SpectrumAnalyzer.BinCount];
    private readonly Random _rng = new();

    private bool _seeking, _restoring, _closing;
    private TrackInfo? _info;
    private int _failStreak;
    private VizMode _vizMode = VizMode.Bars;
    private VizBackground _vizBg = VizBackground.Normal;
    private ArtMode _artMode = ArtMode.Off;

    // Themes and particle effects
    public EffectsWindow? FxWin { get; private set; }
    public ThemePreset CurrentTheme { get; private set; } = Themes.Presets[0];
    public VizMode CurrentVizMode => _vizMode;
    public ArtMode CurrentArtMode => _artMode;
    private readonly ParticleSystem _particles = new();
    private ParticleOverlay? _overlay;
    private readonly System.Diagnostics.Stopwatch _fxClock = System.Diagnostics.Stopwatch.StartNew();
    private double _fxDueMs, _fxLastSec;
    private SKColor _miniLo = new(59, 158, 190), _miniHi = new(79, 200, 232);
    private byte[]? _artData;
    private int _artRequest;

    // Ticker
    private const string TickerSep = "   ✦   ";
    private string _tickerBase = "";
    private double _tickerCycle;
    private readonly System.Diagnostics.Stopwatch _tickerClock = new();
    private TimeSpan _lastRender;
    private double _miniDueMs;

    public MainWindow(AppSettings settings, string settingsPath)
    {
        Settings = settings;
        _settingsPath = settingsPath;
        Playlist = new PlaylistModel(Queue, Dispatcher);
        InitializeComponent();
        Dock = new DockManager(this);

        VolumeSlider.ValueChanged += (_, e) =>
        {
            Player.Volume = (float)(e.NewValue / 100);
            if (!_restoring && Player.Muted) Player.Muted = false;
            UpdateVolumeText();
            ScheduleSave();
        };
        BalanceSlider.ValueChanged += (_, e) =>
        {
            Player.Balance = (float)(e.NewValue / 100);
            int b = (int)Math.Round(e.NewValue);
            BalText.Text = b == 0 ? "C" : b < 0 ? $"L{-b}" : $"R{b}";
            ScheduleSave();
        };
        BalanceSlider.MouseDoubleClick += (_, _) => BalanceSlider.Value = 0;

        SeekSlider.AddHandler(Thumb.DragStartedEvent, new DragStartedEventHandler((_, _) => _seeking = true));
        SeekSlider.AddHandler(Thumb.DragCompletedEvent, new DragCompletedEventHandler((_, _) =>
        {
            _seeking = false;
            SeekTo(SeekSlider.Value);
        }));
        SeekSlider.PreviewMouseLeftButtonUp += (_, _) => { if (!_seeking) SeekTo(SeekSlider.Value); };

        Player.TrackEnded += (_, _) => Dispatcher.BeginInvoke(OnTrackEnded);
        Player.DurationChanged += (_, _) => Dispatcher.BeginInvoke(OnDurationChanged);
        // Follow Windows' default output. Windows fires several notifications per
        // switch (one per role), so wait for them to settle first.
        var deviceTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(300) };
        deviceTimer.Tick += (_, _) =>
        {
            deviceTimer.Stop();
            if (Player.FollowDefaultDevice()) UpdatePlayButton();
        };
        Player.OutputDeviceChanged += (_, _) => Dispatcher.BeginInvoke(() => { deviceTimer.Stop(); deviceTimer.Start(); });

        Drop += OnDrop;
        PreviewKeyDown += (_, e) => HandleKey(e, inList: false);
        MiniViz.PaintSurface += OnMiniVizPaint;
        _uiTimer.Tick += (_, _) => RefreshUi();
        _saveTimer.Tick += (_, _) => { _saveTimer.Stop(); SaveSettings(); };
        // Before the window exists, so panels placed in Loaded stack under the real spot.
        RestorePlacement(this, Settings.Main);
        Loaded += (_, _) =>
        {
            CompositionTarget.Rendering += OnRendering;
            _tickerClock.Start();
            _uiTimer.Start();
            // Same stacking as v2: main, EQ, playlist; then the visualizer.
            if (Settings.EqWindow.Visible) SetEqVisible(true, save: false);
            if (Settings.PlaylistWindow.Visible) SetPlaylistVisible(true, save: false);
            if (Settings.Visualizer.Visible) ShowViz();
            if (Settings.EffectsWindow.Visible) SetEffectsVisible(true, save: false);
            _overlay = new ParticleOverlay(new System.Windows.Interop.WindowInteropHelper(this).Handle);
            HookStack(this);
        };
        Closing += (_, _) => { _closing = true; SaveSettings(); };
        Closed += (_, _) =>
        {
            CompositionTarget.Rendering -= OnRendering;
            Viz?.Close();
            PlWindow?.Close();
            EqWin?.Close();
            FxWin?.Close();
            _overlay?.Dispose();
            _overlay = null;
            Player.Dispose();
        };

        RestoreState();
    }

    // ================================================================ state

    private void RestoreState()
    {
        _restoring = true;
        var s = Settings;
        VolumeSlider.Value = s.Volume * 100;
        Player.Muted = s.Muted;
        BalanceSlider.Value = s.Balance * 100;
        UpdateVolumeText();

        Player.EqEnabled = s.EqEnabled;
        for (int i = 0; i < s.EqBands.Length; i++) Player.SetEqBand(i, s.EqBands[i]);
        Player.SetEqPreamp(s.EqPreamp);

        Enum.TryParse(s.VisualizerMode, out _vizMode);
        Enum.TryParse(s.VisualizerBackground, out _vizBg);
        Enum.TryParse(s.FloatArt, out _artMode);

        Queue.Repeat = s.Repeat;
        Queue.Add(s.Playlist);
        if (s.PlaylistIndex >= 0 && s.PlaylistIndex < Queue.Count)
        {
            Queue.Select(s.PlaylistIndex);
            LoadIndex(s.PlaylistIndex, play: false, startAt: s.PositionSeconds);
        }
        Queue.Shuffle = s.Shuffle;

        Topmost = s.AlwaysOnTop;
        _particles.Effect = Enum.TryParse<ParticleEffect>(s.Effect, out var fx) ? fx : ParticleEffect.Bubbles;
        _particles.SetSettings(s.EffectQuantity, s.EffectSize, s.EffectSpeed);
        ApplyTheme();
        UpdateModeButtons();
        _restoring = false;
    }

    public void ScheduleSave()
    {
        if (_restoring) return;
        _saveTimer.Stop();
        _saveTimer.Start();
    }

    public void SaveSettings()
    {
        var s = Settings;
        s.Volume = Player.Volume;
        s.Muted = Player.Muted;
        s.Balance = Player.Balance;
        s.Shuffle = Queue.Shuffle;
        s.Repeat = Queue.Repeat;
        s.EqEnabled = Player.EqEnabled;
        for (int i = 0; i < s.EqBands.Length; i++) s.EqBands[i] = Player.GetEqBand(i);
        s.EqPreamp = Player.EqPreamp;
        s.Playlist = Queue.Items.Select(i => i.Path).ToList();
        s.PlaylistIndex = Queue.CurrentIndex;
        s.PositionSeconds = Player.FilePath != null && Player.CanResume ? Player.Position.TotalSeconds : 0;
        s.VisualizerMode = _vizMode.ToString();
        s.VisualizerBackground = _vizBg.ToString();
        s.FloatArt = _artMode.ToString();
        s.AlwaysOnTop = Topmost;
        StorePlacement(this, s.Main);
        if (Viz != null) StorePlacement(Viz, s.Visualizer);
        if (PlWindow != null) StorePlacement(PlWindow, s.PlaylistWindow);
        if (EqWin != null) StorePlacement(EqWin, s.EqWindow);
        try { s.Save(_settingsPath); } catch (Exception) { /* next save will retry */ }
        _lastSave = DateTime.UtcNow;
    }

    internal static bool RestorePlacement(Window w, WindowPlacement p)
    {
        if (double.IsNaN(p.Left) || double.IsNaN(p.Top)) return false;
        double width = double.IsNaN(p.Width) ? w.Width : p.Width;
        // Only restore if the window would still be reachable on some monitor.
        var vs = new Rect(SystemParameters.VirtualScreenLeft, SystemParameters.VirtualScreenTop,
                          SystemParameters.VirtualScreenWidth, SystemParameters.VirtualScreenHeight);
        if (!vs.IntersectsWith(new Rect(p.Left + 20, p.Top, Math.Max(40, width - 40), 20))) return false;
        w.WindowStartupLocation = WindowStartupLocation.Manual;
        w.Left = p.Left;
        w.Top = p.Top;
        if (w.SizeToContent == SizeToContent.Manual && w.ResizeMode is ResizeMode.CanResize or ResizeMode.CanResizeWithGrip
            || w is VisualizerWindow)
        {
            if (!double.IsNaN(p.Width) && p.Width > 50) w.Width = p.Width;
            if (!double.IsNaN(p.Height) && p.Height > 30) w.Height = p.Height;
        }
        return true;
    }

    internal static void StorePlacement(Window w, WindowPlacement p)
    {
        if (w.WindowState != WindowState.Normal || w.ActualWidth <= 0) return;
        p.Left = w.Left; p.Top = w.Top; p.Width = w.ActualWidth; p.Height = w.ActualHeight;
    }

    /// <summary>Default spot for a panel: directly under the lowest of the
    /// given windows (v2's stacked layout), left-aligned with the player.</summary>
    private void PlaceBelow(Window w, params Window?[] above)
    {
        double bottom = Top + ActualHeight;
        foreach (var a in above)
            if (a is { IsLoaded: true, WindowState: WindowState.Normal }) bottom = Math.Max(bottom, a.Top + a.ActualHeight);
        w.WindowStartupLocation = WindowStartupLocation.Manual;
        w.Left = Left;
        w.Top = bottom;
        w.Width = ActualWidth;
    }

    // ============================================================= playback

    /// <summary>Opens files from Explorer, a second launch, or drag-drop:
    /// appends them and plays the first one.</summary>
    public void OpenFromShell(IEnumerable<string> paths)
    {
        var files = PlaylistModel.ExpandPaths(paths);
        if (files.Count == 0) return;
        int first = Queue.Add(files);
        PlayIndex(first);
        ScheduleSave();
    }

    /// <summary>Replaces the playlist and plays it (a random track when shuffling).</summary>
    public void OpenAndPlay(params string[] paths)
    {
        var files = PlaylistModel.ExpandPaths(paths);
        if (files.Count == 0) return;
        Queue.Clear();
        Queue.Add(files);
        PlayIndex(Queue.Shuffle ? _rng.Next(Queue.Count) : 0);
        ScheduleSave();
    }

    /// <summary>Inserts files/folders/playlists at a position; starts playing
    /// them only if nothing was loaded.</summary>
    public void InsertFiles(IEnumerable<string> paths, int at)
    {
        var files = PlaylistModel.ExpandPaths(paths);
        if (files.Count == 0) return;
        bool idle = Player.FilePath == null || !Player.CanResume;
        int first = Queue.Insert(at, files);
        if (idle && !Player.IsPlaying) PlayIndex(first);
        ScheduleSave();
    }

    /// <summary>The user picked a track to play.</summary>
    public void PlayIndex(int index)
    {
        if (Queue.Select(index) < 0) return;
        LoadIndex(index, play: true);
    }

    private void LoadIndex(int index, bool play, double startAt = 0)
    {
        if ((uint)index >= (uint)Queue.Count) return;
        var item = Queue.Items[index];
        var row = Playlist.RowFor(item);
        try
        {
            Player.Open(item.Path);
            if (startAt > 0) Player.Position = TimeSpan.FromSeconds(startAt);
            if (play) Player.Play();
            if (play) _particles.TriggerBurst(); // v2: burst on every track change
            _failStreak = 0;
            if (row != null) row.Failed = false;
        }
        catch (Exception ex)
        {
            if (row != null) row.Failed = true;
            _info = null;
            SetTicker($"Could not open {Path.GetFileName(item.Path)}: {ex.Message}");
            UpdatePlayButton();
            // Skip unplayable files, but never loop forever.
            if (play && ++_failStreak < Queue.Count)
            {
                int next = Queue.Next();
                if (next >= 0 && next != index) LoadIndex(next, play: true);
            }
            return;
        }
        _info = Playlist.GetInfo(item.Path);
        LoadArtInBackground(item.Path);
        if (row != null) row.Title = _info.DisplayName;
        if (Player.Duration > TimeSpan.Zero) Playlist.SetDuration(item, Player.Duration);
        UpdateTrackDisplay();
        PlWindow?.ScrollToCurrent();
        ScheduleSave();
    }

    public void TogglePlay()
    {
        if (Queue.Count == 0) { Open_Click(this, new RoutedEventArgs()); return; }
        if (Player.IsPlaying) Player.Pause();
        else if (Player.CanResume) Player.Play();
        else PlayIndex(Queue.CurrentIndex >= 0 ? Queue.CurrentIndex : 0);
        UpdatePlayButton();
    }

    private void PlayNext()
    {
        int i = Queue.Next();
        if (i >= 0) LoadIndex(i, play: true);
    }

    private void PlayPrevious()
    {
        if (Queue.Count == 0) return;
        if (Player.Position.TotalSeconds > 3) { SeekTo(0); return; }
        int i = Queue.Previous();
        if (i < 0) SeekTo(0);
        else LoadIndex(i, play: true);
    }

    private void StopPlayback()
    {
        Player.Stop();
        UpdatePlayButton();
        RefreshUi();
    }

    private void SeekTo(double seconds)
    {
        if (Player.FilePath == null) return;
        Player.Position = TimeSpan.FromSeconds(Math.Max(0, seconds));
        RefreshUi();
    }

    private void OnTrackEnded()
    {
        if (Player.IsPlaying) return; // stale: something else already started
        int next = Queue.Advance();
        if (next >= 0) LoadIndex(next, play: true);
        else UpdatePlayButton();
    }

    private void OnDurationChanged()
    {
        SeekSlider.Maximum = Math.Max(1, Player.Duration.TotalSeconds);
        if (Queue.Current is { } item) Playlist.SetDuration(item, Player.Duration);
        UpdateTrackDisplay();
    }

    // =========================================================== display

    private void UpdateTrackDisplay()
    {
        var item = Queue.Current;
        if (item == null || _info == null) return;
        int n = Queue.CurrentIndex + 1;
        var dur = Player.Duration;
        SetTicker($"{n}. {_info.DisplayName}" + (dur > TimeSpan.Zero ? $" ({PlaylistRow.FormatTime(dur)})" : ""));
        BitrateText.Text = _info.BitrateKbps > 0 ? _info.BitrateKbps.ToString(CultureInfo.InvariantCulture) : "---";
        int rate = _info.SampleRate > 0 ? _info.SampleRate : Player.SourceFormat?.SampleRate ?? 0;
        RateText.Text = rate > 0 ? (rate / 1000.0).ToString(rate % 1000 == 0 ? "0" : "0.#", CultureInfo.InvariantCulture) : "--";
        int ch = _info.Channels > 0 ? _info.Channels : Player.SourceFormat?.Channels ?? 2;
        MonoText.SetResourceReference(TextBlock.ForegroundProperty, ch == 1 ? "Lcd" : "LcdDim");
        StereoText.SetResourceReference(TextBlock.ForegroundProperty, ch >= 2 ? "Lcd" : "LcdDim");
        SeekSlider.Maximum = Math.Max(1, dur.TotalSeconds);
        UpdatePlayButton();
        RefreshUi();
        Title = $"{_info.DisplayName} - Kraken MP3";
    }

    private void RefreshUi()
    {
        var pos = Player.Position;
        if (!_seeking) SeekSlider.Value = Math.Min(SeekSlider.Maximum, pos.TotalSeconds);
        var shown = Settings.ShowRemainingTime && Player.Duration > TimeSpan.Zero ? Player.Duration - pos : pos;
        if (shown < TimeSpan.Zero) shown = TimeSpan.Zero;
        ClockText.Text = (Settings.ShowRemainingTime ? "-" : "") + PlaylistRow.FormatTime(shown);
        UpdatePlayButton();
        if (Player.IsPlaying && (DateTime.UtcNow - _lastSave).TotalSeconds > 15) SaveSettings();
    }

    private void UpdatePlayButton()
    {
        bool playing = Player.IsPlaying;
        PlayIcon.Visibility = playing ? Visibility.Collapsed : Visibility.Visible;
        PauseIcon.Visibility = playing ? Visibility.Visible : Visibility.Collapsed;
    }

    private void UpdateVolumeText() =>
        VolText.Text = Player.Muted ? "MUTE" : $"{(int)Math.Round(VolumeSlider.Value)}%";

    private void UpdateModeButtons()
    {
        ShuffleButton.Tag = Queue.Shuffle ? "active" : null;
        RepeatButton.Tag = Queue.Repeat != RepeatMode.Off ? "active" : null;
        RepeatButton.Content = Queue.Repeat == RepeatMode.One ? "REPEAT 1" : "REPEAT";
        RepeatButton.ToolTip = Queue.Repeat switch
        {
            RepeatMode.All => "Repeat all (R)", RepeatMode.One => "Repeat one (R)", _ => "Repeat off (R)",
        };
        OnTopButton.Tag = Topmost ? "active" : null;
        FxButton.Tag = FxWin != null ? "active" : null;
        PlToggle.Tag = PlWindow != null ? "active" : null;
        EqToggle.Tag = EqWin != null ? "active" : null;
        VizToggle.Tag = Viz != null ? "active" : null;
    }

    private void SetTicker(string text)
    {
        _tickerBase = text;
        double avail = TickerHost.ActualWidth > 0 ? TickerHost.ActualWidth : 180;
        double w = MeasureTicker(text);
        if (w <= avail)
        {
            TickerText.Text = text;
            _tickerCycle = 0;
            Canvas.SetLeft(TickerText, 0);
        }
        else
        {
            TickerText.Text = text + TickerSep + text;
            _tickerCycle = MeasureTicker(text + TickerSep);
            _tickerClock.Restart();
        }
    }

    private double MeasureTicker(string s) =>
        new FormattedText(s, CultureInfo.CurrentUICulture, FlowDirection.LeftToRight,
            new Typeface(TickerText.FontFamily, TickerText.FontStyle, TickerText.FontWeight, TickerText.FontStretch),
            TickerText.FontSize, Brushes.White, VisualTreeHelper.GetDpi(this).PixelsPerDip).WidthIncludingTrailingWhitespace;

    private void TickerHost_SizeChanged(object sender, SizeChangedEventArgs e) => SetTicker(_tickerBase.Length > 0 ? _tickerBase : TickerText.Text);

    private void OnRendering(object? sender, EventArgs e)
    {
        if (e is not RenderingEventArgs r || r.RenderingTime == _lastRender) return;
        _lastRender = r.RenderingTime;
        if (WindowState == WindowState.Minimized) return;

        if (_tickerCycle > 0)
        {
            // 1.5 s pause at the start of each pass, then 30 px/s.
            double t = _tickerClock.Elapsed.TotalSeconds;
            double travel = Math.Max(0, t - 1.5) * 30;
            if (travel >= _tickerCycle) { _tickerClock.Restart(); travel = 0; }
            Canvas.SetLeft(TickerText, -Math.Round(travel));
        }

        double now = r.RenderingTime.TotalMilliseconds;
        if (now >= _miniDueMs) // mini spectrum at 30 fps
        {
            _miniDueMs = now - _miniDueMs > 66 ? now + 33.3 : _miniDueMs + 33.3;
            MiniViz.InvalidateVisual();
        }
        TickOverlay(now);
    }

    // ===================================================== particle overlay

    /// <summary>The docked stack the particles cover (as v2: only when at least
    /// two panels are docked together and the stack is one compact column).</summary>
    private PxRect? StackBounds()
    {
        if (WindowState != WindowState.Normal || !IsVisible) return null;
        var group = Dock.GroupOfLeader().Where(w => w == EqWin || w == PlWindow || w == Viz).ToList();
        if (group.Count == 0) return null;
        group.Add(this);
        var b = Dock.Bounds(group);
        double dpi = VisualTreeHelper.GetDpi(this).DpiScaleX;
        if (b is not { } r || r.Width > 640 * dpi) return null;
        return r;
    }

    private void TickOverlay(double nowMs)
    {
        if (_overlay == null) return;
        // The render tick runs at the display rate; draw particles at 60 fps.
        if (nowMs + 0.5 < _fxDueMs) return;
        _fxDueMs = nowMs - _fxDueMs > 16.7 ? nowMs + 16.7 : _fxDueMs + 16.7;

        var bounds = _particles.IsIdle ? null : StackBounds();
        if (bounds is not { } b) { _overlay.Show(false); _fxLastSec = 0; return; }
        double t = _fxClock.Elapsed.TotalSeconds;
        float dt = _fxLastSec == 0 ? 1 / 60f : (float)(t - _fxLastSec);
        _fxLastSec = t;
        _particles.Scale = (float)VisualTreeHelper.GetDpi(this).DpiScaleX;
        _particles.Resize(b.Width, b.Height);
        bool wasHidden = !_overlay.Visible;
        _overlay.Render(b, (c, _, _) => _particles.Tick(c, dt, t));
        if (wasHidden) _overlay.Raise(Topmost);
    }

    /// <summary>Keeps the overlay above the stack when any stack window comes forward.</summary>
    private void HookStack(Window w) => w.Activated += (_, _) => _overlay?.Raise(Topmost);

    public void SetParticleEffect(ParticleEffect fx)
    {
        _particles.Effect = fx;
        Settings.Effect = fx.ToString();
        FxWin?.Refresh();
        ScheduleSave();
    }

    public void SetParticleSettings(int quantity, int size, int speed)
    {
        Settings.EffectQuantity = quantity;
        Settings.EffectSize = size;
        Settings.EffectSpeed = speed;
        _particles.SetSettings(quantity, size, speed);
        ScheduleSave();
    }

    // =============================================================== themes

    public void SetTheme(string id)
    {
        Settings.Theme = id;
        ApplyTheme();
        ScheduleSave();
    }

    /// <summary>Editing a colour switches to Custom, built on the current preset.</summary>
    public void SetCustomColor(string key, string hex)
    {
        if (Settings.Theme != "custom") { Settings.CustomBase = Settings.Theme; Settings.Theme = "custom"; }
        Settings.CustomColors[key] = hex;
        ApplyTheme();
        ScheduleSave();
    }

    public void ResetCustomColors()
    {
        Settings.CustomColors.Clear();
        ApplyTheme();
        ScheduleSave();
    }

    private void ApplyTheme()
    {
        CurrentTheme = Themes.Resolve(Settings.Theme, Settings.CustomBase, Settings.CustomColors);
        Themes.Apply(CurrentTheme);
        var viz = Themes.Viz(CurrentTheme);
        Viz?.SetTheme(viz);
        _particles.Theme = Themes.Particles(CurrentTheme);
        _miniLo = new SKColor(CurrentTheme.Accent.R, CurrentTheme.Accent.G, CurrentTheme.Accent.B);
        _miniHi = new SKColor(CurrentTheme.AccentBright.R, CurrentTheme.AccentBright.G, CurrentTheme.AccentBright.B);
        ClockGlow.Color = CurrentTheme.Lcd;
        FxWin?.Refresh();
    }

    public void SetEffectsVisible(bool visible, bool save = true)
    {
        if (visible && FxWin == null)
        {
            var w = new EffectsWindow(this) { Owner = this };
            if (!RestorePlacement(w, Settings.EffectsWindow))
            {
                // Beside the player, so it doesn't join the stack's column.
                w.WindowStartupLocation = WindowStartupLocation.Manual;
                w.Left = Left + ActualWidth + 8;
                w.Top = Top;
            }
            w.Closed += (_, _) => { if (FxWin == w) FxWin = null; UpdateModeButtons(); };
            FxWin = w;
            Dock.Register(w);
            w.Show();
        }
        else if (!visible && FxWin != null)
        {
            StorePlacement(FxWin, Settings.EffectsWindow);
            FxWin.Close();
        }
        if (!_closing) Settings.EffectsWindow.Visible = visible;
        UpdateModeButtons();
        if (save) ScheduleSave();
    }

    private void FxToggle_Click(object sender, RoutedEventArgs e) => SetEffectsVisible(FxWin == null);

    private static readonly SKPaint MiniBarPaint = new() { IsAntialias = false };
    private void OnMiniVizPaint(object? sender, SKPaintSurfaceEventArgs e)
    {
        var c = e.Surface.Canvas;
        c.Clear(new SKColor(2, 10, 14));
        Player.GetSpectrum(_miniSpectrum);
        float sx = e.Info.Width / 72f, sy = e.Info.Height / 14f;
        const int bars = 18;
        for (int b = 0; b < bars; b++)
        {
            float v = VisualizerRenderer.SampleFrequency(_miniSpectrum, b * 4 + 1.5f, 72) / 255f;
            float h = MathF.Max(0, MathF.Round(v * 14));
            if (h <= 0) continue;
            MiniBarPaint.Color = v > 0.8f ? _miniHi : _miniLo;
            c.DrawRect(b * 4 * sx, (14 - h) * sy, 3 * sx, h * sy, MiniBarPaint);
        }
    }

    // ======================================================= other windows

    public void SetPlaylistVisible(bool visible, bool save = true)
    {
        if (visible && PlWindow == null)
        {
            var w = new PlaylistWindow(this, Playlist) { Owner = this };
            if (!RestorePlacement(w, Settings.PlaylistWindow)) PlaceBelow(w, EqWin);
            w.Closed += (_, _) => { if (PlWindow == w) PlWindow = null; UpdateModeButtons(); };
            PlWindow = w;
            HookStack(w);
            Dock.Register(w);
            w.Show();
        }
        else if (!visible && PlWindow != null)
        {
            StorePlacement(PlWindow, Settings.PlaylistWindow);
            PlWindow.Close();
        }
        if (!_closing) Settings.PlaylistWindow.Visible = visible;
        UpdateModeButtons();
        if (save) ScheduleSave();
    }

    public void SetEqVisible(bool visible, bool save = true)
    {
        if (visible && EqWin == null)
        {
            var w = new EqWindow(this, Player, Settings) { Owner = this };
            if (!RestorePlacement(w, Settings.EqWindow)) PlaceBelow(w);
            w.Closed += (_, _) => { if (EqWin == w) EqWin = null; UpdateModeButtons(); };
            EqWin = w;
            HookStack(w);
            Dock.Register(w);
            w.Show();
        }
        else if (!visible && EqWin != null)
        {
            StorePlacement(EqWin, Settings.EqWindow);
            EqWin.Close();
        }
        if (!_closing) Settings.EqWindow.Visible = visible;
        UpdateModeButtons();
        if (save) ScheduleSave();
    }

    /// <summary>The EQ changed somewhere (EQ window or menu).</summary>
    public void EqChanged()
    {
        EqWin?.Refresh();
        ScheduleSave();
    }

    public void ShowViz()
    {
        if (Viz != null) { Viz.Activate(); return; }
        Viz = new VisualizerWindow(this, Player, _vizBg) { Mode = _vizMode, FpsCap = Settings.VisualizerFps, ArtMode = _artMode };
        Viz.SetArtData(_artData);
        if (!RestorePlacement(Viz, Settings.Visualizer))
        {
            PlaceBelow(Viz, EqWin, PlWindow); // flush: docked into the stack
        }
        AttachViz(Viz);
        Viz.SetTheme(Themes.Viz(CurrentTheme));
        HookStack(Viz);
        Dock.Register(Viz);
        Viz.Show();
        UpdateModeButtons();
    }

    private void AttachViz(VisualizerWindow v)
    {
        v.Closed += (_, _) =>
        {
            if (Viz != v) return; // replaced by a background change
            StorePlacement(v, Settings.Visualizer);
            Viz = null;
            if (IsLoaded && !_closing) { Settings.Visualizer.Visible = false; UpdateModeButtons(); ScheduleSave(); }
        };
    }

    /// <summary>Reads the cover for the new track off the UI thread; a newer
    /// track change wins if two overlap.</summary>
    private void LoadArtInBackground(string path)
    {
        int request = ++_artRequest;
        Task.Run(() => AlbumArt.Load(path)).ContinueWith(t =>
        {
            if (request != _artRequest) return;
            _artData = t.IsCompletedSuccessfully ? t.Result : null;
            Viz?.SetArtData(_artData);
        }, TaskScheduler.FromCurrentSynchronizationContext());
    }

    public void SetVizMode(VizMode m)
    {
        _vizMode = m;
        if (Viz != null) Viz.Mode = m;
        FxWin?.Refresh();
        ScheduleSave();
    }

    public void SetArtMode(ArtMode a)
    {
        _artMode = a;
        if (Viz != null) Viz.ArtMode = a;
        FxWin?.Refresh();
        ScheduleSave();
    }

    public void SetVizBackground(VizBackground bg)
    {
        _vizBg = bg;
        if (Viz != null)
        {
            if (Viz.NeedsNewWindowFor(bg)) Viz.Recreate(bg, beforeClose: n => { Viz = n; AttachViz(n); Dock.Register(n); n.SetTheme(Themes.Viz(CurrentTheme)); HookStack(n); });
            else Viz.ApplyBackground(bg);
        }
        ScheduleSave();
    }

    /// <summary>Next mode (Off is skipped when cycling; pick it from the menu).</summary>
    public void CycleVizMode()
    {
        var modes = Enum.GetValues<VizMode>().Where(m => m != VizMode.None).ToArray();
        int i = Array.IndexOf(modes, _vizMode);
        SetVizMode(modes[(i + 1) % modes.Length]);
    }

    public void CycleArtMode() => SetArtMode((ArtMode)(((int)_artMode + 1) % 3));
    public void CycleVizBackground() => SetVizBackground((VizBackground)(((int)_vizBg + 1) % Enum.GetValues<VizBackground>().Length));

    private IEnumerable<(string, bool, Action)> VizModeItems() =>
        Enum.GetValues<VizMode>().Select(m => (VisualizerRenderer.Label(m), m == _vizMode, (Action)(() => SetVizMode(m))));
    private IEnumerable<(string, bool, Action)> ArtItems() =>
        Enum.GetValues<ArtMode>().Select(a => (a.ToString(), a == _artMode, (Action)(() => SetArtMode(a))));
    private IEnumerable<(string, bool, Action)> BgItems() =>
        Enum.GetValues<VizBackground>().Select(b => (VisualizerWindow.BackgroundLabel(b), b == _vizBg, (Action)(() => SetVizBackground(b))));
    private IEnumerable<(string, bool, Action)> FpsItems() =>
        new[] { 30, 60, 0 }.Select(f => (f == 0 ? "Match display" : $"{f} fps", Settings.VisualizerFps == f, (Action)(() =>
        {
            Settings.VisualizerFps = f;
            if (Viz != null) Viz.FpsCap = f;
            ScheduleSave();
        })));

    /// <summary>Right-click menu on the visualizer itself.</summary>
    public void ShowVizMenu(Window owner)
    {
        var menu = new ContextMenu();
        var mode = new MenuItem { Header = "Mode" }; Fill(mode, VizModeItems());
        var art = new MenuItem { Header = "Album art" }; Fill(art, ArtItems());
        var bg = new MenuItem { Header = "Background" }; Fill(bg, BgItems());
        var fps = new MenuItem { Header = "Frame rate" }; Fill(fps, FpsItems());
        var close = new MenuItem { Header = "Close", InputGestureText = "V" };
        close.Click += (_, _) => Viz?.Close();
        foreach (var mi in new[] { mode, art, bg, fps }) menu.Items.Add(mi);
        menu.Items.Add(new Separator());
        menu.Items.Add(close);
        menu.PlacementTarget = owner;
        menu.IsOpen = true;
    }

    // ============================================================ input

    /// <summary>Player shortcuts, shared by every window. In the playlist,
    /// letters and Up/Down are left to the list (type-ahead, navigation).</summary>
    public void HandleKey(KeyEventArgs e, bool inList)
    {
        bool ctrl = (Keyboard.Modifiers & ModifierKeys.Control) != 0;
        bool shift = (Keyboard.Modifiers & ModifierKeys.Shift) != 0;
        bool alt = (Keyboard.Modifiers & ModifierKeys.Alt) != 0;
        if (alt) return;
        bool letters = !inList || ctrl;
        switch (e.Key)
        {
            case Key.Space: TogglePlay(); break;
            case Key.MediaPlayPause: TogglePlay(); break;
            case Key.MediaNextTrack: PlayNext(); break;
            case Key.MediaPreviousTrack: PlayPrevious(); break;
            case Key.MediaStop: StopPlayback(); break;
            case Key.Left when ctrl: PlayPrevious(); break;
            case Key.Right when ctrl: PlayNext(); break;
            case Key.Left: SeekTo(Player.Position.TotalSeconds - 5); break;
            case Key.Right: SeekTo(Math.Min(Player.Duration.TotalSeconds, Player.Position.TotalSeconds + 5)); break;
            case Key.Up when !inList || ctrl: VolumeSlider.Value = Math.Min(100, VolumeSlider.Value + 5); break;
            case Key.Down when !inList || ctrl: VolumeSlider.Value = Math.Max(0, VolumeSlider.Value - 5); break;
            case Key.O when ctrl && shift: AddFolderDialog(); break;
            case Key.O when ctrl: Open_Click(this, e); break;
            case Key.M when letters && !ctrl: ToggleMute(); break;
            case Key.S when letters && !ctrl: Shuffle_Click(this, e); break;
            case Key.R when letters && !ctrl: Repeat_Click(this, e); break;
            case Key.V when letters && !ctrl: VizShow_Click(this, e); break;
            case Key.E when letters && !ctrl: SetEqVisible(EqWin == null); break;
            case Key.P when letters && !ctrl: SetPlaylistVisible(PlWindow == null); break;
            case Key.Oem3: SetEffectsVisible(FxWin == null); break; // ~ / ` as in v2
            default: return;
        }
        e.Handled = true;
    }

    private void ToggleMute()
    {
        Player.Muted = !Player.Muted;
        UpdateVolumeText();
        ScheduleSave();
    }

    private void OnDrop(object sender, DragEventArgs e)
    {
        if (e.Data.GetData(DataFormats.FileDrop) is not string[] paths) return;
        var files = PlaylistModel.ExpandPaths(paths);
        if (files.Count == 0) return;
        bool wasIdle = !Player.IsPlaying;
        int first = Queue.Add(files);
        if (wasIdle) PlayIndex(first);
        ScheduleSave();
    }

    private void TitleBar_MouseDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed && e.OriginalSource is not Button) DragMove();
    }

    private void Clock_MouseDown(object sender, MouseButtonEventArgs e)
    {
        Settings.ShowRemainingTime = !Settings.ShowRemainingTime;
        RefreshUi();
        ScheduleSave();
    }

    // ========================================================== buttons

    private void Play_Click(object sender, RoutedEventArgs e) => TogglePlay();
    private void Stop_Click(object sender, RoutedEventArgs e) => StopPlayback();
    private void Next_Click(object sender, RoutedEventArgs e) => PlayNext();
    private void Prev_Click(object sender, RoutedEventArgs e) => PlayPrevious();

    private static string AudioFilter =>
        "Audio and playlists|" + string.Join(";", Decoders.SupportedExtensions.Select(x => "*" + x)) + ";*.m3u;*.m3u8|All files|*.*";

    private void Open_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new OpenFileDialog { Filter = AudioFilter, Multiselect = true, Title = "Open music" };
        if (dlg.ShowDialog(this) == true) OpenAndPlay(dlg.FileNames);
    }

    public void AddFilesDialog()
    {
        var dlg = new OpenFileDialog { Filter = AudioFilter, Multiselect = true, Title = "Add to playlist" };
        if (dlg.ShowDialog(PlWindow ?? (Window)this) == true) InsertFiles(dlg.FileNames, Queue.Count);
    }

    public void AddFolderDialog()
    {
        var dlg = new OpenFolderDialog { Title = "Add a folder of music", Multiselect = true };
        if (dlg.ShowDialog(PlWindow ?? (Window)this) == true) InsertFiles(dlg.FolderNames, Queue.Count);
    }

    private void AddFolder_Click(object sender, RoutedEventArgs e) => AddFolderDialog();

    private void Shuffle_Click(object sender, RoutedEventArgs e)
    {
        Queue.Shuffle = !Queue.Shuffle;
        UpdateModeButtons();
        ScheduleSave();
    }

    private void Repeat_Click(object sender, RoutedEventArgs e)
    {
        Queue.Repeat = (RepeatMode)(((int)Queue.Repeat + 1) % 3);
        UpdateModeButtons();
        ScheduleSave();
    }

    private void EqToggle_Click(object sender, RoutedEventArgs e) => SetEqVisible(EqWin == null);
    private void PlToggle_Click(object sender, RoutedEventArgs e) => SetPlaylistVisible(PlWindow == null);

    private void VizShow_Click(object sender, RoutedEventArgs e)
    {
        if (Viz != null) Viz.Close();
        else { Settings.Visualizer.Visible = true; ShowViz(); }
        UpdateModeButtons();
        ScheduleSave();
    }

    private void OnTop_Click(object sender, RoutedEventArgs e)
    {
        Topmost = !Topmost;
        _overlay?.Raise(Topmost);
        UpdateModeButtons();
        ScheduleSave();
    }

    private void Minimize_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

    private void Close_Click(object sender, RoutedEventArgs e) => Close();

    /// <summary>Brings the player to the front (another launch asked for it).</summary>
    public void BringToFront()
    {
        if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
        Activate();
        bool top = Topmost;
        Topmost = true;
        Topmost = top;
        Focus();
    }

    // ======================================================= context menu

    private void MainMenu_Opened(object sender, RoutedEventArgs e)
    {
        EqWindowItem.IsChecked = EqWin != null;
        PlaylistItem.IsChecked = PlWindow != null;
        EqEnabledItem.IsChecked = Player.EqEnabled;
        while (EqMenu.Items.Count > 3) EqMenu.Items.RemoveAt(3);
        foreach (var name in EqWindow.PresetOrder)
        {
            var mi = new MenuItem { Header = EqWindow.PresetLabel(name), IsCheckable = true, IsChecked = Settings.EqPreset == name };
            mi.Click += (_, _) =>
            {
                Player.ApplyEqPreset(name);
                Player.SetEqPreamp(0);
                Settings.EqPreset = name;
                Player.EqEnabled = true;
                EqChanged();
            };
            EqMenu.Items.Add(mi);
        }

        VizShowItem.IsChecked = Viz != null;
        Fill(VizModeMenu, VizModeItems());
        Fill(VizArtMenu, ArtItems());
        Fill(VizBgMenu, BgItems());
        Fill(VizFpsMenu, FpsItems());
        OnTopItem.IsChecked = Topmost;
        FxItem.IsChecked = FxWin != null;
    }

    private void EqEnabled_Click(object sender, RoutedEventArgs e)
    {
        Player.EqEnabled = !Player.EqEnabled;
        EqChanged();
    }

    private static void Fill(MenuItem parent, IEnumerable<(string Label, bool Checked, Action Do)> items)
    {
        parent.Items.Clear();
        foreach (var (label, isChecked, act) in items)
        {
            var mi = new MenuItem { Header = label, IsCheckable = true, IsChecked = isChecked };
            mi.Click += (_, _) => act();
            parent.Items.Add(mi);
        }
    }
}
