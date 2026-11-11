using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Threading;
using KrakenMp3.Audio;
using NAudio.Wave;

namespace KrakenMp3.App;

/// <summary>Headless decode check for every supported format.</summary>
public static class Diagnostics
{
    public static int Probe(string outPath, string[] files)
    {
        var sb = new StringBuilder();
        int failures = 0;
        foreach (var f in files)
        {
            try
            {
                using var src = Decoders.Open(f);
                var eq = new Equalizer(src) { Enabled = true };
                foreach (var (b, i) in Equalizer.Presets["rock"].Select((b, i) => (b, i))) eq.SetBand(i, b);
                var an = new SpectrumAnalyzer(eq) { Latency = TimeSpan.Zero };
                var fmt = src.WaveFormat;
                var buf = new float[fmt.SampleRate * fmt.Channels]; // 1 s
                long total = 0; float peak = 0;
                for (int s = 0; s < 3; s++)
                {
                    int n = an.Read(buf, 0, buf.Length);
                    total += n;
                    for (int i = 0; i < n; i++) peak = Math.Max(peak, Math.Abs(buf[i]));
                }
                var spec = new byte[SpectrumAnalyzer.BinCount];
                an.GetByteFrequencyData(spec);
                src.CurrentTime = TimeSpan.FromSeconds(10);
                int afterSeek = an.Read(buf, 0, buf.Length);
                var pos = src.CurrentTime;
                var dur = Decoders.NeedsMeasuredDuration(f) ? Decoders.MeasureDuration(f) : src.TotalTime;
                bool ok = total > 0 && peak > 0.01 && afterSeek > 0 && spec.Max() > 0 && Math.Abs(pos.TotalSeconds - 11) < 0.6;
                if (!ok) failures++;
                sb.AppendLine($"{(ok ? "OK  " : "FAIL")} {Path.GetExtension(f),-6} {src.DecoderName,-18} {fmt.SampleRate} Hz {fmt.Channels} ch  dur {dur:m\\:ss\\.f}  peak {peak:F2}  spectrumMax {spec.Max()}  seek→{pos.TotalSeconds:F2}s");
            }
            catch (Exception ex)
            {
                failures++;
                sb.AppendLine($"FAIL {Path.GetExtension(f),-6} {ex.GetType().Name}: {ex.Message}");
            }
        }
        File.WriteAllText(outPath, sb.ToString());
        return failures;
    }
}

/// <summary>
/// Plays a file silently and measures visualizer frames while the visualizer
/// is visible, covered by another window, and while the main window is
/// minimized; then records memory and CPU and exits.
/// </summary>
public sealed class SelfTest
{
    private readonly MainWindow _main;
    private readonly string _file, _out;
    private readonly StringBuilder _log = new();
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private TimeSpan _cpuStart;
    private long _frames0, _signal0;
    private Window? _cover;

    public SelfTest(MainWindow main, string file, string outPath) { _main = main; _file = file; _out = outPath; }

    public void Start()
    {
        _main.Player.Muted = true; // silent: the analyzer taps before volume
        _main.OpenAndPlay(_file);
        _main.ShowViz();
        _cpuStart = Process.GetCurrentProcess().TotalProcessorTime;
        After(1.0, () => Mark());
        After(5.0, () => { Report("visible"); CoverViz(); Mark(); });
        After(9.0, () => { Report("covered by another window"); _cover?.Close(); _main.WindowState = WindowState.Minimized; Mark(); });
        After(13.0, () => { Report("main window minimized"); _main.WindowState = WindowState.Normal; _main.Viz!.FpsCap = 0; Mark(); });
        After(17.0, () => { Report("uncapped (match display)"); Finish(); });
    }

    private void After(double seconds, Action a)
    {
        var t = new DispatcherTimer { Interval = TimeSpan.FromSeconds(seconds) };
        t.Tick += (_, _) => { t.Stop(); a(); };
        t.Start();
    }

    private void Mark() { _frames0 = _main.Viz!.FramesDrawn; _signal0 = _main.Viz.FramesWithSignal; _clock.Restart(); }

    private void Report(string phase)
    {
        double secs = _clock.Elapsed.TotalSeconds;
        long frames = _main.Viz!.FramesDrawn - _frames0, signal = _main.Viz.FramesWithSignal - _signal0;
        _log.AppendLine($"{phase,-28} {frames / secs,6:F1} fps   frames with signal {signal}/{frames}");
    }

    private void CoverViz()
    {
        var v = _main.Viz!;
        _cover = new Window
        {
            WindowStyle = WindowStyle.None, ShowInTaskbar = false, Topmost = true,
            Background = System.Windows.Media.Brushes.DimGray,
            Left = v.Left - 20, Top = v.Top - 20, Width = v.ActualWidth + 40, Height = v.ActualHeight + 40,
        };
        _cover.Show();
    }

    private void Finish()
    {
        var p = Process.GetCurrentProcess();
        p.Refresh();
        double cpu = (p.TotalProcessorTime - _cpuStart).TotalSeconds / 16.0 / Environment.ProcessorCount * 100;
        _log.AppendLine($"working set {p.WorkingSet64 / 1048576.0:F0} MB   private {p.PrivateMemorySize64 / 1048576.0:F0} MB   " +
                        $"CPU avg {cpu:F1}% of {Environment.ProcessorCount} logical cores   processes 1");
        _log.AppendLine($"decoder {_main.Player.DecoderName}   file {Path.GetFileName(_file)}");
        File.WriteAllText(_out, _log.ToString());
        _main.Close();
    }
}
