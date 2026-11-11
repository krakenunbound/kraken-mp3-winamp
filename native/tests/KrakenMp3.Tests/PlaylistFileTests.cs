using KrakenMp3.Core;

namespace KrakenMp3.Tests;

public class PlaylistFileTests
{
    [Fact]
    public void M3u_round_trip_with_relative_absolute_and_unicode_paths()
    {
        var dir = Directory.CreateTempSubdirectory("kraken-m3u-");
        try
        {
            var inside = Path.Combine(dir.FullName, "sub", "Café da Esquina.mp3");
            var outside = Path.GetFullPath(Path.Combine(dir.FullName, "..", "elsewhere", "b.flac"));
            var pl = Path.Combine(dir.FullName, "list.m3u8");
            M3u.Write(pl, [(inside, "Artist - Café", TimeSpan.FromSeconds(185.4)), (outside, null, TimeSpan.Zero)]);
            var text = File.ReadAllText(pl);
            Assert.Contains("#EXTINF:185,Artist - Café", text);
            Assert.Contains(Path.Combine("sub", "Café da Esquina.mp3") + "\n", text); // stored relative
            Assert.Equal([inside, outside], M3u.Read(pl));
        }
        finally { dir.Delete(true); }
    }

    [Fact]
    public void M3u_skips_comments_urls_and_blank_lines()
    {
        var dir = Directory.CreateTempSubdirectory("kraken-m3u-");
        try
        {
            var pl = Path.Combine(dir.FullName, "x.m3u");
            File.WriteAllText(pl, "#EXTM3U\n\nhttp://radio.example/stream\n# note\nsong.mp3\r\nfile:///C:/Music/a%20b.mp3\n");
            var read = M3u.Read(pl);
            Assert.Equal(2, read.Count);
            Assert.Equal(Path.Combine(dir.FullName, "song.mp3"), read[0]);
            Assert.Equal(@"C:\Music\a b.mp3", read[1]);
        }
        finally { dir.Delete(true); }
    }

    [Fact]
    public void SetOrder_keeps_current_and_rejects_foreign_items()
    {
        var q = new PlayQueue(new Random(1));
        q.Add(["a", "b", "c"]);
        q.Select(1);
        q.SetOrder(q.Items.Reverse().ToList());
        Assert.Equal(["c", "b", "a"], q.Items.Select(i => i.Path));
        Assert.Equal("b", q.Current!.Path);
        Assert.Equal(1, q.CurrentIndex);
        Assert.Throws<ArgumentException>(() => q.SetOrder(q.Items.Take(2).ToList()));
    }
}
