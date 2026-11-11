using System.Text.Json;
using System.Text.Json.Serialization;

namespace KrakenMp3.Core;

public sealed class WindowPlacement
{
    public double Left { get; set; } = double.NaN;
    public double Top { get; set; } = double.NaN;
    public double Width { get; set; } = double.NaN;
    public double Height { get; set; } = double.NaN;
    public bool Visible { get; set; } = true;
}

/// <summary>Everything the player remembers between runs, stored as JSON.</summary>
public sealed class AppSettings
{
    public float Volume { get; set; } = 0.8f;
    public bool Muted { get; set; }
    public float Balance { get; set; }
    public bool Shuffle { get; set; }
    public RepeatMode Repeat { get; set; }
    public bool ShowRemainingTime { get; set; }

    public bool EqEnabled { get; set; }
    public string EqPreset { get; set; } = "flat";
    public float[] EqBands { get; set; } = new float[10];
    public float EqPreamp { get; set; }
    /// <summary>The user's own curve, restored when "Custom" is picked.</summary>
    public float[] EqCustomBands { get; set; } = new float[10];
    public float EqCustomPreamp { get; set; }

    public List<string> Playlist { get; set; } = [];
    public int PlaylistIndex { get; set; } = -1;
    public double PositionSeconds { get; set; }

    public string VisualizerMode { get; set; } = "Bars";
    public string VisualizerBackground { get; set; } = "Normal";
    /// <summary>Floating album art in the visualizer: Off, Float or Bounce.</summary>
    public string FloatArt { get; set; } = "Off";
    /// <summary>Visualizer frame cap; 0 = match the display refresh rate.</summary>
    public int VisualizerFps { get; set; } = 60;

    /// <summary>Colour theme id (kraken, grayscale, purple, red, blue, orange, green, pink, custom).</summary>
    public string Theme { get; set; } = "kraken";
    /// <summary>The preset the custom palette is built on.</summary>
    public string CustomBase { get; set; } = "kraken";
    public Dictionary<string, string> CustomColors { get; set; } = [];
    public string Effect { get; set; } = "Bubbles";
    public int EffectQuantity { get; set; } = 25;
    public int EffectSize { get; set; } = 8;
    public int EffectSpeed { get; set; } = 30;
    /// <summary>Particle opacity in percent, 10–300 (100 = as designed).</summary>
    public int EffectOpacity { get; set; } = 100;

    public bool AlwaysOnTop { get; set; }
    public WindowPlacement Main { get; set; } = new();
    public WindowPlacement Visualizer { get; set; } = new();
    public WindowPlacement PlaylistWindow { get; set; } = new() { Visible = true };
    public WindowPlacement EqWindow { get; set; } = new() { Visible = false };
    public WindowPlacement EffectsWindow { get; set; } = new() { Visible = false };

    private static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
        NumberHandling = JsonNumberHandling.AllowNamedFloatingPointLiterals,
    };

    public static string DefaultPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Kraken MP3 Native", "settings.json");

    /// <summary>Loads settings; a missing or damaged file gives defaults.</summary>
    public static AppSettings Load(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                var s = JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(path), Json);
                if (s != null) return s.Normalized();
            }
        }
        catch (Exception) { /* fall through to defaults */ }
        return new AppSettings();
    }

    /// <summary>Writes atomically so a crash mid-save never corrupts the file.</summary>
    public void Save(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tmp = path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(this, Json));
        File.Move(tmp, path, overwrite: true);
    }

    private AppSettings Normalized()
    {
        Volume = Math.Clamp(Volume, 0f, 1f);
        Balance = Math.Clamp(Balance, -1f, 1f);
        if (EqBands is not { Length: 10 }) EqBands = new float[10];
        if (EqCustomBands is not { Length: 10 }) EqCustomBands = new float[10];
        EqPreset ??= "flat";
        Playlist ??= [];
        if (PlaylistIndex >= Playlist.Count) PlaylistIndex = -1;
        if (VisualizerFps < 0) VisualizerFps = 60;
        Main ??= new(); Visualizer ??= new(); PlaylistWindow ??= new(); EqWindow ??= new() { Visible = false }; EffectsWindow ??= new() { Visible = false };
        CustomColors ??= [];
        Theme ??= "kraken"; CustomBase ??= "kraken"; Effect ??= "Bubbles";
        EffectQuantity = Math.Clamp(EffectQuantity, 5, 100);
        EffectSize = Math.Clamp(EffectSize, 1, 20);
        EffectSpeed = Math.Clamp(EffectSpeed, 1, 100);
        EffectOpacity = EffectOpacity == 0 ? 100 : Math.Clamp(EffectOpacity, 10, 300);
        return this;
    }
}
