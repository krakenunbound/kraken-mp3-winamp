using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using KrakenMp3.Audio;
using KrakenMp3.Core;

namespace KrakenMp3.App;

/// <summary>
/// 10-band equalizer with preamp and presets (v2 values). Any manual change
/// switches to "Custom", which remembers that curve for later.
/// </summary>
public partial class EqWindow : Window
{
    private readonly MainWindow _host;
    private readonly Player _player;
    private readonly AppSettings _settings;
    private readonly Slider[] _bands = new Slider[Equalizer.Frequencies.Length];
    private bool _updating;

    public static readonly string[] PresetOrder = ["flat", "rock", "pop", "jazz", "classical", "bass-boost"];

    public EqWindow(MainWindow host, Player player, AppSettings settings)
    {
        _host = host;
        _player = player;
        _settings = settings;
        InitializeComponent();

        var style = (Style)FindResource("EqSlider");
        var labelStyle = (Style)FindResource("BandLabel");
        for (int i = 0; i < _bands.Length; i++)
        {
            int band = i;
            var f = Equalizer.Frequencies[i];
            var s = new Slider { Style = style, Margin = new Thickness(3, 0, 3, 0), ToolTip = Hz(f) };
            s.ValueChanged += (_, e) => { if (!_updating) OnBandChanged(band, (float)e.NewValue); };
            s.MouseDoubleClick += (_, _) => s.Value = 0;
            _bands[i] = s;
            var col = new StackPanel();
            col.Children.Add(s);
            col.Children.Add(new TextBlock { Text = f >= 1000 ? $"{f / 1000:0}K" : f.ToString("0", CultureInfo.InvariantCulture), Style = labelStyle });
            Bands.Items.Add(col);
        }
        PreampSlider.ValueChanged += (_, e) => { if (!_updating) OnPreampChanged((float)e.NewValue); };
        PreampSlider.MouseDoubleClick += (_, _) => PreampSlider.Value = 0;
        PreviewKeyDown += (_, e) => _host.HandleKey(e, inList: false);
        Refresh();
    }

    private static string Hz(float f) => f >= 1000 ? $"{f / 1000:0.#} kHz" : $"{f:0} Hz";

    public static string PresetLabel(string name) => name switch
    {
        "bass-boost" => "Bass Boost",
        "custom" => "Custom",
        _ => CultureInfo.InvariantCulture.TextInfo.ToTitleCase(name),
    };

    /// <summary>Pulls the current EQ state into the controls.</summary>
    public void Refresh()
    {
        _updating = true;
        for (int i = 0; i < _bands.Length; i++)
        {
            _bands[i].Value = _player.GetEqBand(i);
            _bands[i].ToolTip = $"{Hz(Equalizer.Frequencies[i])}: {Db(_player.GetEqBand(i))}";
        }
        PreampSlider.Value = _player.EqPreamp;
        _updating = false;
        OnButton.Tag = _player.EqEnabled ? "active" : null;
        OnButton.Content = _player.EqEnabled ? "ON" : "OFF";
        PresetText.Text = PresetLabel(_settings.EqPreset).ToUpperInvariant();
        ReadoutText.Text = $"{Db(_player.EqPreamp)} preamp";
    }

    private static string Db(float v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.Abs(v).ToString("0.#", CultureInfo.InvariantCulture) + " dB";

    private void OnBandChanged(int band, float db)
    {
        _player.SetEqBand(band, db);
        MarkCustom();
        ReadoutText.Text = $"{Hz(Equalizer.Frequencies[band])} {Db(db)}";
        _bands[band].ToolTip = $"{Hz(Equalizer.Frequencies[band])}: {Db(db)}";
    }

    private void OnPreampChanged(float db)
    {
        _player.SetEqPreamp(db);
        MarkCustom();
        ReadoutText.Text = $"{Db(db)} preamp";
    }

    /// <summary>A hand edit: switch to Custom (turning the EQ on, as moving a
    /// lever implies wanting to hear it) and remember the curve.</summary>
    private void MarkCustom()
    {
        _settings.EqPreset = "custom";
        for (int i = 0; i < _bands.Length; i++) _settings.EqCustomBands[i] = _player.GetEqBand(i);
        _settings.EqCustomPreamp = _player.EqPreamp;
        if (!_player.EqEnabled) _player.EqEnabled = true;
        OnButton.Tag = "active";
        OnButton.Content = "ON";
        PresetText.Text = "CUSTOM";
        _host.EqChanged();
    }

    public void ApplyPreset(string name)
    {
        if (name == "custom")
        {
            for (int i = 0; i < _bands.Length; i++) _player.SetEqBand(i, _settings.EqCustomBands[i]);
            _player.SetEqPreamp(_settings.EqCustomPreamp);
        }
        else
        {
            _player.ApplyEqPreset(name);
            _player.SetEqPreamp(0);
        }
        _settings.EqPreset = name;
        Refresh();
        _host.EqChanged();
    }

    private void On_Click(object sender, RoutedEventArgs e)
    {
        _player.EqEnabled = !_player.EqEnabled;
        Refresh();
        _host.EqChanged();
    }

    private void Reset_Click(object sender, RoutedEventArgs e) => ApplyPreset("flat");

    private void Preset_Click(object sender, RoutedEventArgs e)
    {
        var menu = new ContextMenu { PlacementTarget = PresetButton, Placement = System.Windows.Controls.Primitives.PlacementMode.Bottom };
        foreach (var name in PresetOrder.Append("custom"))
        {
            var mi = new MenuItem { Header = PresetLabel(name), IsCheckable = true, IsChecked = _settings.EqPreset == name };
            mi.Click += (_, _) => ApplyPreset(name);
            menu.Items.Add(mi);
        }
        menu.IsOpen = true;
    }

    private void TitleBar_MouseDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed && e.OriginalSource is not Button) DragMove();
    }

    private void Close_Click(object sender, RoutedEventArgs e) => _host.SetEqVisible(false);
}
