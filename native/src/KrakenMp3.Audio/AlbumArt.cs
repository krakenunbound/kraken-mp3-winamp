namespace KrakenMp3.Audio;

/// <summary>Finds a track's cover: embedded picture first (front cover
/// preferred), then a cover image in the same folder.</summary>
public static class AlbumArt
{
    private static readonly string[] FolderNames = ["cover", "folder", "front", "album", "albumart"];
    private static readonly string[] ImageExts = [".jpg", ".jpeg", ".png", ".webp", ".bmp"];

    /// <summary>Encoded image bytes, or null. Safe to call off the UI thread.</summary>
    public static byte[]? Load(string audioPath)
    {
        try
        {
            using var f = TagLib.File.Create(audioPath);
            var pics = f.Tag.Pictures;
            if (pics is { Length: > 0 })
            {
                var pic = pics.FirstOrDefault(p => p.Type == TagLib.PictureType.FrontCover) ?? pics[0];
                if (pic.Data?.Count > 0) return pic.Data.Data;
            }
        }
        catch (Exception) { /* unreadable tags: try the folder */ }

        try
        {
            var dir = Path.GetDirectoryName(audioPath);
            if (dir == null || !Directory.Exists(dir)) return null;
            var images = Directory.EnumerateFiles(dir)
                .Where(p => ImageExts.Contains(Path.GetExtension(p).ToLowerInvariant()))
                .ToList();
            var named = images.FirstOrDefault(p => FolderNames.Contains(Path.GetFileNameWithoutExtension(p).ToLowerInvariant()))
                        ?? images.FirstOrDefault(p => Path.GetFileNameWithoutExtension(p)
                               .Equals(Path.GetFileNameWithoutExtension(audioPath), StringComparison.OrdinalIgnoreCase));
            return named != null ? File.ReadAllBytes(named) : null;
        }
        catch (Exception) { return null; }
    }
}
