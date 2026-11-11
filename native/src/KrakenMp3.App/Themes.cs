using System.Windows;
using System.Windows.Media;
using KrakenMp3.Visuals;
using SkiaSharp;

namespace KrakenMp3.App;

/// <summary>One colour theme (v2 src/shared/uiThemes.js PRESETS).</summary>
public sealed record ThemePreset(
    string Id, string Name,
    float HueBase, float HueRange, float Saturation,
    Color Accent, Color BubbleHigh, Color Rain,
    Color PanelBg, Color PanelBgDark, Color TitleTop, Color TitleBottom,
    Color BevelLight, Color BevelDark, Color LcdBg, Color Lcd, Color LcdDim,
    Color AccentBright, Color TextHi, Color TextMid, Color TextLo,
    Color BtnBg, Color BtnHover, Color PlRowOdd, Color PlRowEven);

/// <summary>
/// Applies themes by swapping the brushes in the application resources
/// (every window uses DynamicResource, so all panels recolour at once), and
/// hands the matching colours to the visualizer and particle renderers.
/// </summary>
public static class Themes
{
    private static Color C(string hex) => (Color)ColorConverter.ConvertFromString(hex);
    private static Color C(byte r, byte g, byte b) => Color.FromRgb(r, g, b);

    // Panel colours are v2's rgba() values without the alpha: native panels
    // are opaque windows, not see-through web layers.
    public static readonly ThemePreset[] Presets =
    [
        new("kraken", "Kraken", 190, 40, 80, C(59, 158, 190), C(120, 200, 255), C(150, 200, 255),
            C(20, 28, 40), C(10, 16, 24), C(26, 58, 85), C(14, 32, 53), C("#2a4060"), C("#050c14"), C(6, 14, 20),
            C("#3ce0f8"), C("#0a6070"), C("#4fc8e8"), C("#d8eaf8"), C("#7a9ab8"), C("#3a5878"), C(17, 26, 38), C("#1a2a3c"), C(8, 16, 26), C(12, 22, 34)),
        new("grayscale", "Gray", 0, 0, 0, C(160, 160, 160), C(200, 200, 200), C(180, 180, 180),
            C(28, 28, 28), C(14, 14, 14), C(50, 50, 50), C(30, 30, 30), C("#505050"), C("#0a0a0a"), C(10, 10, 10),
            C("#d2d2d2"), C("#555555"), C("#c8c8c8"), C("#e8e8e8"), C("#999999"), C("#5a5a5a"), C(26, 26, 26), C("#333333"), C(14, 14, 14), C(20, 20, 20)),
        new("purple", "Purple", 270, 40, 80, C(140, 80, 200), C(180, 140, 255), C(170, 150, 255),
            C(28, 20, 40), C(16, 10, 24), C(50, 26, 85), C(30, 14, 53), C("#4a2a70"), C("#0a050f"), C(12, 6, 20),
            C("#c88cff"), C("#5a2a80"), C("#af6eeb"), C("#ecdcf8"), C("#9a7ab8"), C("#5a3a78"), C(26, 17, 38), C("#2c1a3c"), C(16, 8, 26), C(22, 12, 34)),
        new("red", "Crimson", 0, 30, 80, C(200, 60, 60), C(255, 140, 140), C(255, 150, 150),
            C(40, 20, 20), C(24, 10, 10), C(85, 26, 26), C(53, 14, 14), C("#703030"), C("#0f0505"), C(20, 6, 6),
            C("#ff6464"), C("#802020"), C("#eb5a5a"), C("#f8dada"), C("#b87a7a"), C("#783a3a"), C(38, 17, 17), C("#3c1a1a"), C(26, 8, 8), C(34, 12, 12)),
        new("blue", "Sapphire", 220, 40, 80, C(60, 100, 200), C(130, 180, 255), C(140, 180, 255),
            C(20, 24, 40), C(10, 12, 24), C(26, 38, 85), C(14, 20, 53), C("#2a3a70"), C("#05080f"), C(6, 10, 20),
            C("#64a0ff"), C("#203870"), C("#5a87eb"), C("#dae4f8"), C("#7a8eb8"), C("#3a4e78"), C(17, 20, 38), C("#1a223c"), C(8, 12, 26), C(12, 18, 34)),
        new("orange", "Amber", 30, 30, 80, C(200, 130, 40), C(255, 200, 120), C(255, 210, 150),
            C(40, 30, 20), C(24, 16, 10), C(85, 58, 26), C(53, 32, 14), C("#705028"), C("#0f0a05"), C(20, 12, 6),
            C("#ffbe50"), C("#805820"), C("#eba53c"), C("#f8ecd8"), C("#b89a7a"), C("#78583a"), C(38, 26, 17), C("#3c2a1a"), C(26, 16, 8), C(34, 22, 12)),
        new("green", "Emerald", 140, 40, 80, C(40, 180, 100), C(120, 235, 180), C(150, 240, 200),
            C(20, 36, 28), C(10, 20, 14), C(26, 75, 50), C(14, 45, 30), C("#2a6048"), C("#050f0a"), C(6, 18, 12),
            C("#50f096"), C("#1a6840"), C("#3cd782"), C("#d8f8e8"), C("#7ab898"), C("#3a7858"), C(17, 34, 24), C("#1a3c28"), C(8, 22, 14), C(12, 30, 20)),
        new("pink", "Rose", 330, 40, 80, C(200, 70, 130), C(255, 160, 210), C(255, 180, 210),
            C(40, 20, 30), C(24, 10, 16), C(85, 26, 55), C(53, 14, 34), C("#702a50"), C("#0f0508"), C(20, 6, 12),
            C("#ff82be"), C("#80284a"), C("#eb64a0"), C("#f8dae8"), C("#b87a98"), C("#783a58"), C(38, 17, 26), C("#3c1a2a"), C(26, 8, 16), C(34, 12, 22)),
    ];

    /// <summary>Colours a user can override in the Custom palette (v2 CUSTOM_COLOR_KEYS
    /// that apply to native panels; slider/lever/viz-bar colours follow Accent).</summary>
    public static readonly (string Key, string Label)[] CustomKeys =
    [
        ("Accent", "Accent"), ("AccentBright", "Accent bright"), ("Lcd", "Display / LCD text"),
        ("TextHi", "Primary text"), ("TextMid", "Secondary text"), ("BtnBg", "Button face"),
        ("BtnHover", "Button hover"), ("PanelBg", "Panel background"), ("TitleBg", "Title bar"),
    ];

    public static ThemePreset Get(string id) => Presets.FirstOrDefault(p => p.Id == id) ?? Presets[0];

    /// <summary>The preset that applies after custom overrides (same as base when none).</summary>
    public static ThemePreset Resolve(string themeId, string customBase, IReadOnlyDictionary<string, string>? custom)
    {
        if (themeId != "custom") return Get(themeId);
        var p = Get(customBase);
        if (custom == null) return p;
        Color Ov(string key, Color fallback) =>
            custom.TryGetValue(key, out var hex) && TryParse(hex, out var c) ? c : fallback;
        var title = Ov("TitleBg", p.TitleTop);
        return p with
        {
            Id = "custom", Name = "Custom",
            Accent = Ov("Accent", p.Accent), AccentBright = Ov("AccentBright", p.AccentBright),
            Lcd = Ov("Lcd", p.Lcd), TextHi = Ov("TextHi", p.TextHi), TextMid = Ov("TextMid", p.TextMid),
            BtnBg = Ov("BtnBg", p.BtnBg), BtnHover = Ov("BtnHover", p.BtnHover), PanelBg = Ov("PanelBg", p.PanelBg),
            TitleTop = title, TitleBottom = custom.ContainsKey("TitleBg") ? title : p.TitleBottom,
        };
    }

    public static bool TryParse(string? hex, out Color c)
    {
        c = default;
        if (string.IsNullOrWhiteSpace(hex)) return false;
        hex = hex.Trim();
        if (!hex.StartsWith('#')) hex = "#" + hex;
        if (hex.Length != 7) return false;
        try { c = (Color)ColorConverter.ConvertFromString(hex); return true; }
        catch (FormatException) { return false; }
    }

    public static string Hex(Color c) => $"#{c.R:x2}{c.G:x2}{c.B:x2}";

    /// <summary>Current colour of a theme key (for the custom editor).</summary>
    public static Color ValueOf(ThemePreset p, string key) => key switch
    {
        "Accent" => p.Accent, "AccentBright" => p.AccentBright, "Lcd" => p.Lcd, "TextHi" => p.TextHi,
        "TextMid" => p.TextMid, "BtnBg" => p.BtnBg, "BtnHover" => p.BtnHover, "PanelBg" => p.PanelBg,
        "TitleBg" => p.TitleTop, _ => Colors.Black,
    };

    private static Color WithA(Color c, double a) => Color.FromArgb((byte)Math.Round(a * 255), c.R, c.G, c.B);

    private static SolidColorBrush Brush(Color c)
    {
        var b = new SolidColorBrush(c);
        b.Freeze();
        return b;
    }

    /// <summary>Recolours every window.</summary>
    public static void Apply(ThemePreset p)
    {
        var r = Application.Current.Resources;
        r["PanelBg"] = Brush(p.PanelBg);
        r["PanelBgDark"] = Brush(p.PanelBgDark);
        var title = new LinearGradientBrush(p.TitleTop, p.TitleBottom, 90);
        title.Freeze();
        r["TitleBg"] = title;
        r["BevelLight"] = Brush(p.BevelLight);
        r["BevelDark"] = Brush(p.BevelDark);
        r["LcdBg"] = Brush(p.LcdBg);
        r["Lcd"] = Brush(p.Lcd);
        r["LcdDim"] = Brush(p.LcdDim);
        r["Accent"] = Brush(p.Accent);
        r["AccentBright"] = Brush(p.AccentBright);
        r["TextHi"] = Brush(p.TextHi);
        r["TextMid"] = Brush(p.TextMid);
        r["TextLo"] = Brush(p.TextLo);
        r["BtnBg"] = Brush(p.BtnBg);
        r["BtnHover"] = Brush(p.BtnHover);
        r["BtnActiveBg"] = Brush(WithA(p.Accent, 0.18));
        r["PlRowOdd"] = Brush(p.PlRowOdd);
        r["PlRowEven"] = Brush(p.PlRowEven);
        r["PlActive"] = Brush(WithA(p.Accent, 0.22));
        r["PlSelected"] = Brush(WithA(p.Accent, 0.35));
        r["LcdGlow"] = p.Lcd; // Color, for the clock's glow effect
        r["EqTrack"] = Brush(Blend(p.PanelBgDark, p.BevelLight, 0.25));
    }

    private static Color Blend(Color a, Color b, double t) =>
        Color.FromRgb((byte)(a.R + (b.R - a.R) * t), (byte)(a.G + (b.G - a.G) * t), (byte)(a.B + (b.B - a.B) * t));

    private static SKColor Sk(Color c) => new(c.R, c.G, c.B, c.A);

    public static VizTheme Viz(ThemePreset p) => new(p.HueBase, p.HueRange, p.Saturation, Sk(p.Accent));
    public static ParticleTheme Particles(ThemePreset p) => new(p.HueBase, p.HueRange, p.Saturation, Sk(p.Accent), Sk(p.BubbleHigh), Sk(p.Rain));
}
