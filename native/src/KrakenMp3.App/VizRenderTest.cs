using System.Diagnostics;
using System.IO;
using System.Text;
using KrakenMp3.Audio;
using KrakenMp3.Visuals;
using SkiaSharp;

namespace KrakenMp3.App;

/// <summary>
/// --vizrender &lt;song&gt; &lt;out.png&gt;: renders every visualizer mode off-screen
/// (no windows) from real decoded audio, normal and chroma-key, plus the
/// floating art, into one contact sheet, and times each mode. Writes
/// &lt;out&gt;.txt next to the image.
/// </summary>
public static class VizRenderTest
{
    private const int W = 440, H = 162, Pad = 8, Label = 14;

    public static int Run(string song, string outPng)
    {
        var log = new StringBuilder();
        using var src = Decoders.Open(song);
        if (src.TotalTime > TimeSpan.FromSeconds(80)) src.CurrentTime = TimeSpan.FromSeconds(60); // past any quiet intro
        var an = new SpectrumAnalyzer(src) { Latency = TimeSpan.Zero };
        int rate = src.WaveFormat.SampleRate, ch = src.WaveFormat.Channels;
        var chunk = new float[rate / 60 * ch];
        var freq = new byte[SpectrumAnalyzer.BinCount];
        var wave = new byte[SpectrumAnalyzer.FftSize];
        void Feed()
        {
            an.Read(chunk, 0, chunk.Length);
            Thread.Sleep(3); // analyzer shares results for calls < 2 ms apart
            an.GetByteFrequencyData(freq);
            an.GetByteTimeDomainData(wave);
        }
        for (int i = 0; i < 30; i++) Feed(); // settle smoothing

        var modes = Enum.GetValues<VizMode>().Where(m => m != VizMode.None).ToArray();
        int rows = modes.Length + 1;
        var info = new SKImageInfo(Pad + 2 * (W + Pad), Pad + rows * (H + Label + Pad));
        using var sheet = SKSurface.Create(info);
        var sc = sheet.Canvas;
        sc.Clear(new SKColor(30, 30, 30));
        using var text = new SKPaint { Color = SKColors.White, TextSize = 11, IsAntialias = true };

        var art = AlbumArt.Load(song);
        log.AppendLine($"album art: {(art != null ? $"{art.Length / 1024} KB" : "none")}");

        for (int r = 0; r < rows; r++)
        {
            for (int col = 0; col < 2; col++)
            {
                bool key = col == 1;
                var x = Pad + col * (W + Pad);
                var y = Pad + r * (H + Label + Pad);
                using var tile = SKSurface.Create(new SKImageInfo(W, H));
                var tc = tile.Canvas;
                tc.Clear(key ? new SKColor(0, 255, 0) : new SKColor(10, 16, 24));
                string label;
                if (r < modes.Length)
                {
                    using var rend = new VisualizerRenderer { Mode = modes[r], Bare = key };
                    // Waterfall needs history: run a couple of seconds of frames.
                    int frames = modes[r] == VizMode.Waterfall ? 150 : 1;
                    for (int f = 0; f < frames; f++)
                    {
                        if (frames > 1) Feed();
                        if (f == frames - 1) tc.Clear(key ? new SKColor(0, 255, 0) : new SKColor(10, 16, 24));
                        rend.Draw(tc, W, H, freq, wave, 1 / 60.0);
                    }
                    label = VisualizerRenderer.Label(modes[r]) + (key ? " — green key (bare)" : "");
                }
                else
                {
                    // Floating art over bars: Float (2.5 s into the spin) | Bounce (key mode).
                    using var rend = new VisualizerRenderer { Mode = VizMode.Bars, Bare = key };
                    rend.Draw(tc, W, H, freq, wave);
                    // Left: Float, 2.5 s into the spin. Right: Bounce on the normal
                    // background (v2 look: 180 px, 50 %, square, shadow outside), 1.5 s in.
                    using var fa = new FloatingArt { Mode = key ? ArtMode.Bounce : ArtMode.Float };
                    fa.SetImage(art != null ? SKImage.FromEncodedData(art) : null);
                    if (key)
                    {
                        tc.Clear(new SKColor(10, 16, 24));
                        using var r2 = new VisualizerRenderer { Mode = VizMode.Bars };
                        r2.Draw(tc, W, H, freq, wave);
                    }
                    int steps = key ? 30 : 50;
                    for (int f = 0; f < steps; f++) fa.Draw(f == steps - 1 ? tc : NullCanvas, W, H, 0.05);
                    label = key ? "Album art: Bounce (v2 look)" : "Album art: Float (3D spin, 2.5 s in)";
                    if (art == null) label += " — no art in file";
                }
                sc.DrawText(label, x, y + 11, text);
                using var img = tile.Snapshot();
                sc.DrawImage(img, x, y + Label);
            }
        }

        // Timing: average draw time per mode at 440×162.
        using (var bench = SKSurface.Create(new SKImageInfo(W, H)))
        {
            foreach (var m in modes)
            {
                using var rend = new VisualizerRenderer { Mode = m };
                var sw = Stopwatch.StartNew();
                for (int i = 0; i < 300; i++) { bench.Canvas.Clear(); rend.Draw(bench.Canvas, W, H, freq, wave); }
                bench.Canvas.Flush();
                log.AppendLine($"{VisualizerRenderer.Label(m),-10} {sw.Elapsed.TotalMilliseconds / 300:F3} ms/frame");
            }
        }

        using (var snap = sheet.Snapshot())
        using (var data = snap.Encode(SKEncodedImageFormat.Png, 100))
        using (var fs = File.Create(outPng)) data.SaveTo(fs);
        log.AppendLine($"spectrum max {freq.Max()}  wave range {wave.Min()}..{wave.Max()}");
        File.WriteAllText(Path.ChangeExtension(outPng, ".txt"), log.ToString());
        return 0;
    }

    private static readonly SKCanvas NullCanvas = new(new SKBitmap(1, 1));
}
