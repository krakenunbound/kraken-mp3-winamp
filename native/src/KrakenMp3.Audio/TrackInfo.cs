namespace KrakenMp3.Audio;

/// <summary>Tags and stream properties shown on the LCD and in the playlist.</summary>
public sealed record TrackInfo(
    string Path, string Title, string Artist, string Album,
    int BitrateKbps, int SampleRate, int Channels, TimeSpan Duration)
{
    /// <summary>"Artist - Title", or just the title when there is no artist.</summary>
    public string DisplayName => string.IsNullOrWhiteSpace(Artist) ? Title : $"{Artist} - {Title}";

    public static TrackInfo Read(string path)
    {
        string fallback = System.IO.Path.GetFileNameWithoutExtension(path);
        try
        {
            using var f = TagLib.File.Create(path);
            var t = f.Tag;
            var p = f.Properties;
            string artist = FirstNonEmpty(t.Performers) ?? FirstNonEmpty(t.AlbumArtists) ?? "";
            return new TrackInfo(path,
                string.IsNullOrWhiteSpace(t.Title) ? fallback : t.Title.Trim(),
                artist.Trim(), (t.Album ?? "").Trim(),
                p?.AudioBitrate ?? 0, p?.AudioSampleRate ?? 0, p?.AudioChannels ?? 0,
                p?.Duration ?? TimeSpan.Zero);
        }
        catch (Exception)
        {
            return new TrackInfo(path, fallback, "", "", 0, 0, 0, TimeSpan.Zero);
        }
    }

    private static string? FirstNonEmpty(string[]? values) =>
        values?.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));
}
