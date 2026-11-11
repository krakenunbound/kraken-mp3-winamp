using System.IO;
using System.Windows;
using KrakenMp3.Core;

namespace KrakenMp3.App;

public partial class App : Application
{
    private SingleInstance? _instance;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        var args = e.Args;
        string? Arg(string name)
        {
            int i = Array.IndexOf(args, name);
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        }

        // Headless decode test: --probe <out.txt> <file> [file...]
        if (args.Length > 0 && args[0] == "--probe")
        {
            Shutdown(Diagnostics.Probe(args[1], args.Skip(2).ToArray()));
            return;
        }

        // Off-screen render of every visualizer mode: --vizrender <song> <out.png>
        if (args.Length > 2 && args[0] == "--vizrender")
        {
            Shutdown(VizRenderTest.Run(args[1], args[2]));
            return;
        }

        // Output-device switching test (no window): --devicetest <song> <out.txt>
        if (args.Length > 2 && args[0] == "--devicetest")
        {
            Shutdown(DeviceTest.Run(args[1], args[2]));
            return;
        }

        // Off-screen render of every particle effect: --fxrender <out.png>
        if (args.Length > 1 && args[0] == "--fxrender")
        {
            Shutdown(FxRenderTest.Run(args[1]));
            return;
        }

        // Automated run with throwaway settings: --selftest <file> --out <log.txt>
        if (args.Length > 0 && args[0] == "--selftest")
        {
            var tmp = Path.Combine(Path.GetTempPath(), $"kraken-selftest-{Environment.ProcessId}.json");
            var test = new MainWindow(new AppSettings(), tmp);
            MainWindow = test;
            test.Show();
            test.Closed += (_, _) => { try { File.Delete(tmp); } catch (IOException) { } };
            new SelfTest(test, args[1], Arg("--out") ?? "selftest.txt").Start();
            return;
        }

        // Docking + playlist-model test: --docktest --settings <json> --out <log>
        if (args.Length > 0 && args[0] == "--docktest")
        {
            var src = Arg("--settings")!;
            var tmp = Path.Combine(Path.GetTempPath(), $"kraken-docktest-{Environment.ProcessId}.json");
            File.Copy(src, tmp, true);
            var test = new MainWindow(AppSettings.Load(tmp), tmp);
            MainWindow = test;
            new DockTest(test, Arg("--out") ?? "docktest.txt").Start();
            test.Show();
            test.Closed += (_, _) => { try { File.Delete(tmp); } catch (IOException) { } };
            return;
        }

        // --settings <path> lets tests run beside a real install.
        var settingsPath = Arg("--settings") ?? AppSettings.DefaultPath;
        var files = args.Where(a => !a.StartsWith("--", StringComparison.Ordinal) && a != Arg("--settings"))
                        .Where(a => File.Exists(a) || Directory.Exists(a)).ToArray();

        // A custom settings file gets its own instance (stable hash: string.GetHashCode is per-process).
        _instance = new SingleInstance(Arg("--settings") == null ? "KrakenMP3Native"
            : "KrakenMP3Native-" + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
                System.Text.Encoding.UTF8.GetBytes(Path.GetFullPath(settingsPath).ToLowerInvariant())))[..12]);
        if (!_instance.IsFirst)
        {
            if (_instance.SendToFirst(files)) { Shutdown(0); return; }
            // The other copy is not answering (hung or closing): run anyway.
        }

        var main = new MainWindow(AppSettings.Load(settingsPath), settingsPath);
        MainWindow = main;
        _instance.ArgumentsReceived += received => Dispatcher.BeginInvoke(() =>
        {
            if (received.Length > 0) main.OpenFromShell(received);
            main.BringToFront();
        });
        main.Show();
        if (files.Length > 0) main.OpenFromShell(files);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _instance?.Dispose();
        base.OnExit(e);
    }
}
