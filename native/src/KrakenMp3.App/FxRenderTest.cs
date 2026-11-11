using System.IO;
using System.Text;
using KrakenMp3.Visuals;
using SkiaSharp;

namespace KrakenMp3.App;

/// <summary>
/// --fxrender &lt;out.png&gt;: simulates every particle effect (and the
/// track-change burst) off-screen over a stack-sized area, in two themes, and
/// writes a contact sheet plus timings (&lt;out&gt;.txt). No windows are opened.
/// </summary>
public static class FxRenderTest
{
    private const int W = 220, H = 300, Pad = 8, Label = 14;

    public static int Run(string outPng)
    {
        var log = new StringBuilder();
        var effects = Enum.GetValues<ParticleEffect>().Where(e => e != ParticleEffect.None).ToList();
        var themes = new[] { Themes.Get("kraken"), Themes.Get("red") };
        int cols = effects.Count + 1; // + burst
        var info = new SKImageInfo(Pad + cols * (W + Pad), Pad + themes.Length * (H + Label + Pad));
        using var sheet = SKSurface.Create(info);
        sheet.Canvas.Clear(new SKColor(30, 30, 30));
        using var text = new SKPaint { Color = SKColors.White, TextSize = 11, IsAntialias = true };

        for (int t = 0; t < themes.Length; t++)
        {
            var theme = themes[t];
            for (int i = 0; i < cols; i++)
            {
                bool burst = i == effects.Count;
                using var ps = new ParticleSystem { Theme = Themes.Particles(theme) };
                ps.Resize(W, H);
                ps.SetSettings(burst ? 25 : 60, 10, 50);
                ps.Effect = burst ? ParticleEffect.None : effects[i];
                using var tile = SKSurface.Create(new SKImageInfo(W, H));
                var bg = new SKColor(theme.PanelBg.R, theme.PanelBg.G, theme.PanelBg.B);
                // Run ~4 s (stars need time to appear); the burst is shown 0.25 s in.
                int frames = burst ? 15 : 240;
                if (burst) ps.TriggerBurst();
                var rng = new Random(i);
                for (int f = 0; f < frames; f++)
                {
                    tile.Canvas.Clear(bg);
                    ps.Tick(tile.Canvas, 1 / 60f, f / 60.0);
                }
                int x = Pad + i * (W + Pad), y = Pad + t * (H + Label + Pad);
                sheet.Canvas.DrawText((burst ? "Track-change burst" : ParticleSystem.Label(effects[i])) + " — " + theme.Name, x, y + 11, text);
                using var img = tile.Snapshot();
                sheet.Canvas.DrawImage(img, x, y + Label);
            }
        }

        // Timing: one frame of each effect over a full 440×800 stack at quantity 100.
        using (var bench = SKSurface.Create(new SKImageInfo(440, 800)))
        {
            foreach (var fx in effects)
            {
                using var ps = new ParticleSystem();
                ps.Resize(440, 800);
                ps.SetSettings(100, 10, 50);
                ps.Effect = fx;
                for (int f = 0; f < 60; f++) { bench.Canvas.Clear(); ps.Tick(bench.Canvas, 1 / 60f, f / 60.0); }
                var sw = System.Diagnostics.Stopwatch.StartNew();
                for (int f = 0; f < 300; f++) { bench.Canvas.Clear(); ps.Tick(bench.Canvas, 1 / 60f, (60 + f) / 60.0); }
                log.AppendLine($"{ParticleSystem.Label(fx),-10} {sw.Elapsed.TotalMilliseconds / 300:F3} ms/frame (440×800, 100 particles)");
            }
        }

        using (var snap = sheet.Snapshot())
        using (var data = snap.Encode(SKEncodedImageFormat.Png, 100))
        using (var fs = File.Create(outPng)) data.SaveTo(fs);
        File.WriteAllText(Path.ChangeExtension(outPng, ".txt"), log.ToString());
        return 0;
    }
}
