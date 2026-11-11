using System.Collections.Concurrent;
using System.Collections.ObjectModel;
using System.IO;
using System.Windows.Threading;
using KrakenMp3.Audio;
using KrakenMp3.Core;

namespace KrakenMp3.App;

/// <summary>
/// The visible rows for the <see cref="PlayQueue"/>, plus the tag cache.
/// Rows are updated in place for small edits (so selection and scroll
/// position survive); big reorders swap in a new collection.
/// </summary>
public sealed class PlaylistModel
{
    private const int InPlaceLimit = 400;
    private readonly Dispatcher _dispatcher;
    private readonly Dictionary<long, PlaylistRow> _byId = [];
    private readonly ConcurrentDictionary<string, TrackInfo> _tags = new(StringComparer.OrdinalIgnoreCase);

    public PlayQueue Queue { get; }
    public ObservableCollection<PlaylistRow> Rows { get; private set; } = [];
    public TimeSpan Total { get; private set; }

    /// <summary>The <see cref="Rows"/> instance was replaced (rebind it).</summary>
    public event EventHandler? RowsReplaced;
    /// <summary>Numbers, highlight or totals changed.</summary>
    public event EventHandler? Updated;

    public PlaylistModel(PlayQueue queue, Dispatcher dispatcher)
    {
        Queue = queue;
        _dispatcher = dispatcher;
        queue.Changed += (_, _) => Sync();
    }

    public TrackInfo GetInfo(string path) => _tags.GetOrAdd(path, TrackInfo.Read);
    public bool TryGetInfo(string path, out TrackInfo info) => _tags.TryGetValue(path, out info!);
    public PlaylistRow? RowFor(QueueItem? item) => item != null && _byId.TryGetValue(item.Id, out var r) ? r : null;

    private void Sync()
    {
        var items = Queue.Items;
        var target = new List<PlaylistRow>(items.Count);
        var missing = new List<string>();
        foreach (var item in items)
        {
            if (!_byId.TryGetValue(item.Id, out var row))
            {
                row = new PlaylistRow(item);
                if (_tags.TryGetValue(item.Path, out var t)) { row.Title = t.DisplayName; row.Duration = t.Duration; }
                else missing.Add(item.Path);
                _byId[item.Id] = row;
            }
            target.Add(row);
        }
        if (_byId.Count > target.Count)
        {
            var keep = new HashSet<long>(items.Select(i => i.Id));
            foreach (var id in _byId.Keys.Where(k => !keep.Contains(k)).ToList()) _byId.Remove(id);
        }

        if (!SameOrder(Rows, target)) Apply(target);

        int cur = Queue.CurrentIndex;
        long total = 0;
        for (int i = 0; i < Rows.Count; i++)
        {
            Rows[i].Number = i + 1;
            Rows[i].IsCurrent = i == cur;
            total += Rows[i].Duration.Ticks;
        }
        Total = TimeSpan.FromTicks(total);
        if (missing.Count > 0) LoadTagsInBackground(missing);
        Updated?.Invoke(this, EventArgs.Empty);
    }

    private static bool SameOrder(IList<PlaylistRow> a, List<PlaylistRow> b)
    {
        if (a.Count != b.Count) return false;
        for (int i = 0; i < a.Count; i++) if (!ReferenceEquals(a[i], b[i])) return false;
        return true;
    }

    /// <summary>Turns <see cref="Rows"/> into <paramref name="target"/> with
    /// the fewest notifications that keep the job cheap.</summary>
    private void Apply(List<PlaylistRow> target)
    {
        var rows = Rows;
        if (target.Count == 0) { rows.Clear(); return; }
        var targetSet = new HashSet<PlaylistRow>(target);

        // Removals (rows no longer in the queue).
        int removals = rows.Count(r => !targetSet.Contains(r));
        if (removals > InPlaceLimit) { Replace(target); return; }
        for (int i = rows.Count - 1; i >= 0 && removals > 0; i--)
            if (!targetSet.Contains(rows[i])) { rows.RemoveAt(i); removals--; }

        // Insertions (rows new to the list), at their target positions.
        var present = new HashSet<PlaylistRow>(rows);
        int inserts = target.Count(r => !present.Contains(r));
        if (inserts > InPlaceLimit) { Replace(target); return; }
        if (inserts > 0)
            for (int i = 0; i < target.Count; i++)
                if (!present.Contains(target[i])) rows.Insert(i, target[i]);

        // Moves (same rows, new order).
        int misplaced = 0;
        for (int i = 0; i < target.Count; i++) if (!ReferenceEquals(rows[i], target[i])) misplaced++;
        if (misplaced == 0) return;
        if (misplaced > InPlaceLimit) { Replace(target); return; }
        for (int i = 0; i < target.Count; i++)
        {
            if (ReferenceEquals(rows[i], target[i])) continue;
            int from = rows.IndexOf(target[i]);
            rows.Move(from, i);
        }
    }

    private void Replace(List<PlaylistRow> target)
    {
        Rows = new ObservableCollection<PlaylistRow>(target);
        RowsReplaced?.Invoke(this, EventArgs.Empty);
    }

    private void LoadTagsInBackground(List<string> paths)
    {
        Task.Run(() =>
        {
            var batch = new List<TrackInfo>();
            foreach (var p in paths.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                batch.Add(GetInfo(p));
                if (batch.Count >= 64) { ApplyTags(batch); batch = []; }
            }
            if (batch.Count > 0) ApplyTags(batch);
        });
    }

    private void ApplyTags(List<TrackInfo> infos) => _dispatcher.BeginInvoke(() =>
    {
        var byPath = new Dictionary<string, TrackInfo>(StringComparer.OrdinalIgnoreCase);
        foreach (var i in infos) byPath[i.Path] = i;
        long total = 0;
        foreach (var row in Rows)
        {
            if (byPath.TryGetValue(row.Item.Path, out var t))
            {
                row.Title = t.DisplayName;
                if (row.Duration == TimeSpan.Zero || !row.IsCurrent) row.Duration = t.Duration;
            }
            total += row.Duration.Ticks;
        }
        Total = TimeSpan.FromTicks(total);
        Updated?.Invoke(this, EventArgs.Empty);
    }, DispatcherPriority.Background);

    /// <summary>Updates one row's duration (e.g. measured after opening).</summary>
    public void SetDuration(QueueItem item, TimeSpan d)
    {
        if (RowFor(item) is not { } row || row.Duration == d) return;
        Total += d - row.Duration;
        row.Duration = d;
        Updated?.Invoke(this, EventArgs.Empty);
    }

    // ------------------------------------------------------------ editing

    /// <summary>Files and folders → supported audio files, playlists expanded.</summary>
    public static List<string> ExpandPaths(IEnumerable<string> paths)
    {
        var result = new List<string>();
        foreach (var p in paths)
        {
            try
            {
                if (Directory.Exists(p))
                    result.AddRange(Directory.EnumerateFiles(p, "*", SearchOption.AllDirectories)
                        .Where(Decoders.IsSupported)
                        .OrderBy(f => f, StringComparer.OrdinalIgnoreCase));
                else if (M3u.IsPlaylist(p) && File.Exists(p))
                    result.AddRange(M3u.Read(p).Where(Decoders.IsSupported));
                else if (File.Exists(p) && Decoders.IsSupported(p))
                    result.Add(p);
            }
            catch (Exception) { /* unreadable folder or playlist: skip it */ }
        }
        return result;
    }

    public enum SortKey { Title, Artist, Album, FileName, Path, Duration }

    public void Sort(SortKey key)
    {
        string Text(QueueItem i)
        {
            var t = _tags.TryGetValue(i.Path, out var info) ? info : null;
            return key switch
            {
                SortKey.Title => t?.Title ?? Path.GetFileNameWithoutExtension(i.Path),
                SortKey.Artist => (t?.Artist ?? "") + "\u0001" + (t?.Album ?? "") + "\u0001" + (t?.Title ?? Path.GetFileName(i.Path)),
                SortKey.Album => (t?.Album ?? "") + "\u0001" + i.Path,
                SortKey.FileName => Path.GetFileName(i.Path),
                _ => i.Path,
            };
        }
        var items = Queue.Items.ToList();
        var ordered = key == SortKey.Duration
            ? items.OrderBy(i => RowFor(i)?.Duration ?? TimeSpan.Zero).ToList()
            : items.OrderBy(Text, StringComparer.CurrentCultureIgnoreCase).ToList();
        Queue.SetOrder(ordered);
    }

    public void Reverse() => Queue.SetOrder(Queue.Items.Reverse().ToList());

    public void Randomize()
    {
        var items = Queue.Items.ToList();
        Random.Shared.Shuffle(System.Runtime.InteropServices.CollectionsMarshal.AsSpan(items));
        Queue.SetOrder(items);
    }

    /// <summary>Removes later copies of the same file. Returns how many went.</summary>
    public int RemoveDuplicates()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var remove = new List<int>();
        for (int i = 0; i < Queue.Count; i++)
        {
            var item = Queue.Items[i];
            // The playing entry is always kept, even if it is a later copy.
            if (!seen.Add(item.Path) && item.Id != Queue.Current?.Id) remove.Add(i);
        }
        RemoveIndices(remove);
        return remove.Count;
    }

    /// <summary>Removes entries whose file no longer exists. Returns how many went.</summary>
    public int RemoveMissing()
    {
        var remove = Enumerable.Range(0, Queue.Count).Where(i => !File.Exists(Queue.Items[i].Path)).ToList();
        RemoveIndices(remove);
        return remove.Count;
    }

    public void RemoveIndices(IEnumerable<int> indices)
    {
        foreach (var i in indices.Distinct().OrderByDescending(i => i)) Queue.RemoveAt(i);
    }

    /// <summary>Moves the given rows as a block so the first lands at
    /// <paramref name="insertAt"/> (an index in the list before the move).</summary>
    public void MoveBlock(IReadOnlyCollection<int> indices, int insertAt)
    {
        var sel = indices.Where(i => i >= 0 && i < Queue.Count).Distinct().OrderBy(i => i).ToList();
        if (sel.Count == 0) return;
        var items = Queue.Items.ToList();
        var moving = sel.Select(i => items[i]).ToList();
        int before = sel.Count(i => i < insertAt);
        var rest = items.Where((_, i) => !sel.Contains(i)).ToList();
        int at = Math.Clamp(insertAt - before, 0, rest.Count);
        rest.InsertRange(at, moving);
        if (!rest.SequenceEqual(items)) Queue.SetOrder(rest);
    }

    public void SavePlaylist(string path) =>
        M3u.Write(path, Queue.Items.Select(i =>
        {
            var row = RowFor(i);
            return (i.Path, (string?)(row?.Title ?? Path.GetFileNameWithoutExtension(i.Path)), row?.Duration ?? TimeSpan.Zero);
        }));
}
