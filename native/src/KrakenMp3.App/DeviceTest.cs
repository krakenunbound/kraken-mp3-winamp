using System.IO;
using System.Text;
using KrakenMp3.Audio;

namespace KrakenMp3.App;

/// <summary>
/// --devicetest &lt;song&gt; &lt;out.txt&gt;: plays a song muted with no window, then
/// reopens the output mid-song exactly as a default-device change or a lost
/// device does, and checks playback carries on from the same position.
/// Does not change the system's default device.
/// </summary>
public static class DeviceTest
{
    public static int Run(string song, string outPath)
    {
        var log = new StringBuilder();
        int fail = 0;
        void Check(bool ok, string what) { if (!ok) fail++; log.AppendLine($"{(ok ? "PASS" : "FAIL")}  {what}"); }
        var spec = new byte[SpectrumAnalyzer.BinCount];
        bool ended = false;

        using var p = new Player { Muted = true };
        p.TrackEnded += (_, _) => ended = true;
        p.Open(song);
        p.Position = TimeSpan.FromSeconds(30);
        p.Play();
        Thread.Sleep(2500);
        log.AppendLine($"device: {p.OutputDeviceName}");
        var before = p.Position;
        Check(p.IsPlaying && before.TotalSeconds > 31.5, $"playing before the switch (at {before.TotalSeconds:F2} s)");

        Check(!p.FollowDefaultDevice(), "no switch when the default device has not changed");

        bool switched = p.ReconnectOutput();
        var after = p.Position;
        Check(switched, "output reopened on the default device");
        Check(Math.Abs((after - before).TotalSeconds) < 0.35, $"position kept across the switch ({before.TotalSeconds:F2} → {after.TotalSeconds:F2} s)");
        Thread.Sleep(2000);
        var later = p.Position;
        Check(p.IsPlaying, "still playing after the switch");
        Check(Math.Abs((later - after).TotalSeconds - 2.0) < 0.35, $"time keeps running ({after.TotalSeconds:F2} → {later.TotalSeconds:F2} s over 2 s)");
        p.GetSpectrum(spec);
        Check(spec.Max() > 0, "spectrum follows the new output");

        p.Pause();
        Thread.Sleep(200);
        var paused = p.Position;
        Check(p.ReconnectOutput() && !p.IsPlaying && Math.Abs((p.Position - paused).TotalSeconds) < 0.35, "a paused song stays paused at the same spot");
        p.Play();
        Thread.Sleep(500);
        Check(p.IsPlaying, "resumes after a paused switch");
        Check(!ended, "the switch never counted as the end of the song");

        log.AppendLine(fail == 0 ? "ALL PASSED" : $"{fail} FAILED");
        File.WriteAllText(outPath, log.ToString());
        return fail;
    }
}
