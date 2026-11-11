using System.Text;

namespace KrakenMp3.Core;

/// <summary>Reads and writes M3U / M3U8 playlists.</summary>
public static class M3u
{
    public static bool IsPlaylist(string path)
    {
        var ext = Path.GetExtension(path);
        return ext.Equals(".m3u", StringComparison.OrdinalIgnoreCase) || ext.Equals(".m3u8", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>Returns the absolute paths of the entries. Relative entries are
    /// resolved against the playlist's folder; web URLs are skipped.</summary>
    public static List<string> Read(string path)
    {
        var dir = Path.GetDirectoryName(Path.GetFullPath(path))!;
        var result = new List<string>();
        foreach (var raw in File.ReadAllLines(path, Encoding.UTF8))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            if (line.StartsWith("file://", StringComparison.OrdinalIgnoreCase))
            {
                if (Uri.TryCreate(line, UriKind.Absolute, out var uri)) line = uri.LocalPath;
                else continue;
            }
            else if (line.Contains("://", StringComparison.Ordinal)) continue;
            try { result.Add(Path.GetFullPath(Path.IsPathRooted(line) ? line : Path.Combine(dir, line))); }
            catch (Exception) { /* malformed line */ }
        }
        return result;
    }

    /// <summary>Writes an extended M3U8. Entries inside the playlist's folder
    /// are stored relative so the folder can be moved as a whole.</summary>
    public static void Write(string path, IEnumerable<(string Path, string? Title, TimeSpan Duration)> entries)
    {
        var dir = Path.GetDirectoryName(Path.GetFullPath(path))!;
        var sb = new StringBuilder("#EXTM3U\n");
        foreach (var (p, title, dur) in entries)
        {
            if (title != null)
                sb.Append("#EXTINF:").Append(dur > TimeSpan.Zero ? (int)Math.Round(dur.TotalSeconds) : -1)
                  .Append(',').Append(title.Replace('\n', ' ')).Append('\n');
            var full = Path.GetFullPath(p);
            var rel = Path.GetRelativePath(dir, full);
            sb.Append(rel.StartsWith("..", StringComparison.Ordinal) || Path.IsPathRooted(rel) ? full : rel).Append('\n');
        }
        File.WriteAllText(path, sb.ToString(), new UTF8Encoding(false));
    }
}
