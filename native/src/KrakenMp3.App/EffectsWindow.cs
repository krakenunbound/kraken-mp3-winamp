using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using KrakenMp3.Visuals;

namespace KrakenMp3.App;

/// <summary>
/// "EFFECTS &amp; VISUALIZERS" — same sections as v2's effects window:
/// particle effect + quantity/size/speed, visualizer mode, floating album art,
/// colour themes, custom colours, and the Windows default-apps shortcut.
/// </summary>
public sealed class EffectsWindow : Window
{
    private readonly MainWindow _host;
    private readonly List<(Button B, Func<bool> Active)> _toggles = [];
    private readonly StackPanel _customRows = new();
    private Slider? _qty, _size, _speed, _opacity;
    private TextBlock? _qtyVal, _sizeVal, _speedVal, _opacityVal;
    private bool _syncing;

    public EffectsWindow(MainWindow host)
    {
        _host = host;
        Title = "Kraken Effects";
        Width = 300;
        SizeToContent = SizeToContent.Height;
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;
        UseLayoutRounding = true;
        TextOptions.SetTextFormattingMode(this, TextFormattingMode.Display);
        SetResourceReference(BackgroundProperty, "PanelBg");
        SetResourceReference(BorderBrushProperty, "BevelLight");
        BorderThickness = new Thickness(1);
        PreviewKeyDown += (_, e) => { if (e.OriginalSource is not TextBox) _host.HandleKey(e, inList: false); };

        var root = new StackPanel();
        root.Children.Add(TitleBar());
        var body = new StackPanel { Margin = new Thickness(8, 4, 8, 8) };
        root.Children.Add(body);
        Content = root;

        Section(body, "Particle Effects");
        body.Children.Add(Buttons(Enum.GetValues<ParticleEffect>().Select(fx =>
            (ParticleSystem.Label(fx), (Action)(() => _host.SetParticleEffect(fx)), (Func<bool>)(() => _host.Settings.Effect == fx.ToString())))));

        Section(body, "Particle Settings");
        body.Children.Add(SliderRow("Quantity", 5, 100, out _qty, out _qtyVal));
        body.Children.Add(SliderRow("Size", 1, 20, out _size, out _sizeVal));
        body.Children.Add(SliderRow("Speed", 1, 100, out _speed, out _speedVal));
        body.Children.Add(SliderRow("Opacity %", 10, 300, out _opacity, out _opacityVal));
        body.Children.Add(Hint("On a green, magenta, black or transparent visualizer background the particles are also drawn inside the visualizer, solid, so OBS captures them and the key keeps them. Raise Opacity to make faint effects stronger."));

        Section(body, "Audio Visualizers");
        body.Children.Add(Buttons(Enum.GetValues<VizMode>().Select(m =>
            (VisualizerRenderer.Label(m), (Action)(() => _host.SetVizMode(m)), (Func<bool>)(() => _host.CurrentVizMode == m)))));

        Section(body, "Floating Album Art");
        body.Children.Add(Buttons(Enum.GetValues<ArtMode>().Select(a =>
            (a.ToString(), (Action)(() => _host.SetArtMode(a)), (Func<bool>)(() => _host.CurrentArtMode == a)))));

        Section(body, "Color Themes");
        body.Children.Add(Buttons(Themes.Presets.Select(p =>
            (p.Name, (Action)(() => _host.SetTheme(p.Id)), (Func<bool>)(() => _host.Settings.Theme == p.Id)))));
        body.Children.Add(Buttons([("★ Custom palette", (Action)(() => _host.SetTheme("custom")), (Func<bool>)(() => _host.Settings.Theme == "custom"))]));

        Section(body, "Customize Colors");
        body.Children.Add(Hint("Click a swatch to pick a colour, or type #rrggbb and press Enter. Changes switch to the Custom palette, built on the theme you had."));
        body.Children.Add(_customRows);
        var reset = new Button { Content = "Reset custom colors", HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(1, 4, 1, 0) };
        reset.Click += (_, _) => _host.ResetCustomColors();
        body.Children.Add(reset);

        Section(body, "Windows Audio Defaults");
        body.Children.Add(Hint("Windows requires you to confirm which app opens each audio type. Kraken cannot change this protected setting automatically."));
        var defaults = new Button { Content = "Choose defaults for Kraken MP3", HorizontalAlignment = HorizontalAlignment.Left };
        defaults.Click += (_, _) =>
        {
            try { Process.Start(new ProcessStartInfo("ms-settings:defaultapps?registeredAppMachine=Kraken%20MP3") { UseShellExecute = true }); } catch (Exception) { }
        };
        body.Children.Add(defaults);

        Refresh();
    }

    /// <summary>Pulls the current state into the controls.</summary>
    public void Refresh()
    {
        _syncing = true;
        var s = _host.Settings;
        _qty!.Value = s.EffectQuantity; _qtyVal!.Text = s.EffectQuantity.ToString();
        _size!.Value = s.EffectSize; _sizeVal!.Text = s.EffectSize.ToString();
        _speed!.Value = s.EffectSpeed; _speedVal!.Text = s.EffectSpeed.ToString();
        _opacity!.Value = s.EffectOpacity; _opacityVal!.Text = s.EffectOpacity.ToString();
        foreach (var (b, active) in _toggles) b.Tag = active() ? "active" : null;
        BuildCustomRows();
        _syncing = false;
    }

    private UIElement TitleBar()
    {
        var grid = new Grid { Height = 18 };
        grid.SetResourceReference(Panel.BackgroundProperty, "TitleBg");
        var t = new TextBlock { Text = "EFFECTS & VISUALIZERS", FontSize = 9, FontWeight = FontWeights.Bold, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        t.SetResourceReference(TextBlock.ForegroundProperty, "TextMid");
        grid.Children.Add(t);
        var close = new Button { Content = "×", ToolTip = "Close (~)", HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 3, 0), Style = (Style)Application.Current.Resources["TitleButton"] };
        close.Click += (_, _) => _host.SetEffectsVisible(false);
        grid.Children.Add(close);
        grid.MouseLeftButtonDown += (_, e) => { if (e.ButtonState == MouseButtonState.Pressed && e.OriginalSource is not Button) DragMove(); };
        return grid;
    }

    private static void Section(Panel body, string title)
    {
        var t = new TextBlock { Text = title.ToUpperInvariant(), FontSize = 9, FontWeight = FontWeights.Bold, Margin = new Thickness(1, 8, 0, 3) };
        t.SetResourceReference(TextBlock.ForegroundProperty, "Lcd");
        body.Children.Add(t);
    }

    private static TextBlock Hint(string text)
    {
        var t = new TextBlock { Text = text, FontSize = 9.5, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(1, 0, 0, 4) };
        t.SetResourceReference(TextBlock.ForegroundProperty, "TextMid");
        return t;
    }

    private WrapPanel Buttons(IEnumerable<(string Label, Action Do, Func<bool> Active)> items)
    {
        var wrap = new WrapPanel();
        foreach (var (label, act, active) in items)
        {
            var b = new Button { Content = label, MinWidth = 52 };
            b.Click += (_, _) => { act(); Refresh(); };
            _toggles.Add((b, active));
            wrap.Children.Add(b);
        }
        return wrap;
    }

    private DockPanel SliderRow(string label, int min, int max, out Slider slider, out TextBlock value)
    {
        var row = new DockPanel { Margin = new Thickness(1, 1, 1, 3) };
        var l = new TextBlock { Text = label, Width = 62, FontSize = 10, VerticalAlignment = VerticalAlignment.Center };
        l.SetResourceReference(TextBlock.ForegroundProperty, "TextHi");
        DockPanel.SetDock(l, Dock.Left);
        var v = new TextBlock { Width = 28, FontSize = 10, TextAlignment = TextAlignment.Right, VerticalAlignment = VerticalAlignment.Center };
        v.SetResourceReference(TextBlock.ForegroundProperty, "Lcd");
        DockPanel.SetDock(v, Dock.Right);
        var s = new Slider { Minimum = min, Maximum = max, IsSnapToTickEnabled = true, TickFrequency = 1, Style = (Style)Application.Current.Resources["LcdSlider"], VerticalAlignment = VerticalAlignment.Center };
        s.ValueChanged += (_, _) =>
        {
            v.Text = ((int)s.Value).ToString();
            if (!_syncing && _opacity != null)
                _host.SetParticleSettings((int)_qty!.Value, (int)_size!.Value, (int)_speed!.Value, (int)_opacity.Value);
        };
        row.Children.Add(l);
        row.Children.Add(v);
        row.Children.Add(s);
        slider = s;
        value = v;
        return row;
    }

    private void BuildCustomRows()
    {
        _customRows.Children.Clear();
        var current = _host.CurrentTheme;
        foreach (var (key, label) in Themes.CustomKeys)
        {
            var c = Themes.ValueOf(current, key);
            var row = new DockPanel { Margin = new Thickness(1, 1, 1, 1) };
            var swatch = new Border { Width = 26, Height = 16, Background = new SolidColorBrush(c), BorderThickness = new Thickness(1), Cursor = Cursors.Hand, ToolTip = "Pick a colour" };
            swatch.SetResourceReference(Border.BorderBrushProperty, "BevelLight");
            DockPanel.SetDock(swatch, Dock.Left);
            var hex = new TextBox
            {
                Text = Themes.Hex(c), Width = 64, FontSize = 10, Margin = new Thickness(6, 0, 6, 0),
                VerticalContentAlignment = VerticalAlignment.Center, BorderThickness = new Thickness(1),
            };
            hex.SetResourceReference(TextBox.BackgroundProperty, "LcdBg");
            hex.SetResourceReference(TextBox.ForegroundProperty, "Lcd");
            hex.SetResourceReference(TextBox.BorderBrushProperty, "BevelLight");
            hex.SetResourceReference(TextBox.CaretBrushProperty, "Lcd");
            DockPanel.SetDock(hex, Dock.Left);
            var text = new TextBlock { Text = label, FontSize = 10, VerticalAlignment = VerticalAlignment.Center };
            text.SetResourceReference(TextBlock.ForegroundProperty, "TextHi");

            void Commit(string value)
            {
                if (Themes.TryParse(value, out var col)) { _host.SetCustomColor(key, Themes.Hex(col)); Refresh(); }
                else hex.Text = Themes.Hex(Themes.ValueOf(_host.CurrentTheme, key));
            }
            hex.KeyDown += (_, e) => { if (e.Key == Key.Enter) { Commit(hex.Text); e.Handled = true; } };
            swatch.MouseLeftButtonUp += (_, _) =>
            {
                if (PickColor(Themes.ValueOf(_host.CurrentTheme, key)) is { } picked) Commit(Themes.Hex(picked));
            };
            row.Children.Add(swatch);
            row.Children.Add(hex);
            row.Children.Add(text);
            _customRows.Children.Add(row);
        }
    }

    // ------------------------------------------------- Windows colour picker

    private static readonly int[] CustomColors = new int[16];

    private Color? PickColor(Color start)
    {
        var handle = GCHandle.Alloc(CustomColors, GCHandleType.Pinned);
        try
        {
            var cc = new CHOOSECOLOR
            {
                lStructSize = Marshal.SizeOf<CHOOSECOLOR>(),
                hwndOwner = new WindowInteropHelper(this).Handle,
                rgbResult = start.R | (start.G << 8) | (start.B << 16),
                lpCustColors = handle.AddrOfPinnedObject(),
                Flags = 0x1 | 0x2, // CC_RGBINIT | CC_FULLOPEN
            };
            if (!ChooseColor(ref cc)) return null;
            int v = cc.rgbResult;
            return Color.FromRgb((byte)(v & 0xFF), (byte)((v >> 8) & 0xFF), (byte)((v >> 16) & 0xFF));
        }
        finally { handle.Free(); }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct CHOOSECOLOR
    {
        public int lStructSize; public IntPtr hwndOwner, hInstance; public int rgbResult; public IntPtr lpCustColors;
        public int Flags; public IntPtr lCustData, lpfnHook, lpTemplateName;
    }

    [DllImport("comdlg32.dll", CharSet = CharSet.Unicode)] private static extern bool ChooseColor(ref CHOOSECOLOR cc);
}
