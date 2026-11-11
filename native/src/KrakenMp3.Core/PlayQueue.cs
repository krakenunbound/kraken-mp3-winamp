namespace KrakenMp3.Core;

public enum RepeatMode { Off, All, One }

/// <summary>One playlist entry. The id makes duplicate files distinct.</summary>
public sealed record QueueItem(long Id, string Path);

/// <summary>
/// Playlist order, shuffle and repeat, with no UI or audio dependencies.
///
/// Smart shuffle (same rules as v2.0.4): every track plays once per cycle,
/// Previous walks back through what actually played, Next after Previous
/// walks forward through that same history, and a new cycle never starts
/// with the track that just finished.
/// </summary>
public sealed class PlayQueue
{
    private const int HistoryLimit = 2000;
    private readonly List<QueueItem> _items = [];
    private readonly Random _rng;
    private long _nextId = 1;
    private long? _currentId;
    private int _cursor; // where sequential play resumes if the current item was removed

    private readonly List<long> _history = [];
    private int _historyPos = -1;
    private readonly HashSet<long> _played = [];
    private bool _shuffle;

    public PlayQueue(Random? rng = null) => _rng = rng ?? new Random();

    /// <summary>Raised after any change to the items or the current item.</summary>
    public event EventHandler? Changed;

    public IReadOnlyList<QueueItem> Items => _items;
    public int Count => _items.Count;
    public RepeatMode Repeat { get; set; }

    public int CurrentIndex => _currentId is long id ? IndexOf(id) : -1;
    public QueueItem? Current => CurrentIndex is var i and >= 0 ? _items[i] : null;

    public bool Shuffle
    {
        get => _shuffle;
        set
        {
            if (_shuffle == value) return;
            _shuffle = value;
            if (value) ResetShuffle();
        }
    }

    // ----------------------------------------------------------------- editing

    /// <summary>Appends paths; returns the index of the first one added, or -1.</summary>
    public int Add(IEnumerable<string> paths) => Insert(_items.Count, paths);

    public int Insert(int index, IEnumerable<string> paths)
    {
        index = Math.Clamp(index, 0, _items.Count);
        int at = index;
        foreach (var p in paths) _items.Insert(at++, new QueueItem(_nextId++, p));
        if (at == index) return -1;
        if (_currentId == null && _cursor >= index) _cursor += at - index;
        Changed?.Invoke(this, EventArgs.Empty);
        return index;
    }

    public void RemoveAt(int index)
    {
        if ((uint)index >= (uint)_items.Count) return;
        var item = _items[index];
        int current = CurrentIndex;
        _items.RemoveAt(index);
        if (item.Id == _currentId) { _currentId = null; _cursor = index; }
        else if (_currentId == null && _cursor > index) _cursor--;
        _played.Remove(item.Id);
        for (int i = _history.Count - 1; i >= 0; i--)
        {
            if (_history[i] != item.Id) continue;
            _history.RemoveAt(i);
            if (i <= _historyPos) _historyPos--;
        }
        if (_historyPos < 0 && _history.Count > 0) _historyPos = 0;
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public void Move(int from, int to)
    {
        if ((uint)from >= (uint)_items.Count) return;
        to = Math.Clamp(to, 0, _items.Count - 1);
        if (from == to) return;
        var item = _items[from];
        _items.RemoveAt(from);
        _items.Insert(to, item);
        Changed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>Puts the same items in a new order (sort, reverse, randomise).
    /// The current track and shuffle history are kept.</summary>
    public void SetOrder(IEnumerable<QueueItem> order)
    {
        var list = order.ToList();
        if (list.Count != _items.Count || !new HashSet<long>(list.Select(i => i.Id)).SetEquals(_items.Select(i => i.Id)))
            throw new ArgumentException("SetOrder needs exactly the existing items.", nameof(order));
        _items.Clear();
        _items.AddRange(list);
        if (_currentId == null) _cursor = Math.Min(_cursor, _items.Count);
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public void Clear()
    {
        _items.Clear();
        _currentId = null;
        _cursor = 0;
        _history.Clear();
        _historyPos = -1;
        _played.Clear();
        Changed?.Invoke(this, EventArgs.Empty);
    }

    // -------------------------------------------------------------- navigation

    /// <summary>The user picked a track (double-click, open). Returns its index.</summary>
    public int Select(int index)
    {
        if ((uint)index >= (uint)_items.Count) return -1;
        var id = _items[index].Id;
        if (_currentId != id || _history.Count == 0) Record(id);
        SetCurrent(id);
        return index;
    }

    /// <summary>The user pressed Next. Always moves on (wraps); -1 only if empty.</summary>
    public int Next() => Forward(userInitiated: true);

    /// <summary>The current track finished on its own. -1 means stop.</summary>
    public int Advance()
    {
        if (Repeat == RepeatMode.One && CurrentIndex >= 0) return CurrentIndex;
        return Forward(userInitiated: false);
    }

    /// <summary>The user pressed Previous (past the first 3 s the caller should
    /// just restart the track instead). -1 means nothing earlier: restart.</summary>
    public int Previous()
    {
        if (_items.Count == 0) return -1;
        if (_shuffle)
        {
            if (_historyPos <= 0) return -1;
            _historyPos--;
            SetCurrent(_history[_historyPos]);
            _played.Add(_history[_historyPos]);
            return CurrentIndex;
        }
        int from = CurrentIndex >= 0 ? CurrentIndex : _cursor;
        int prev = (from - 1 + _items.Count) % _items.Count;
        return Select(prev);
    }

    private int Forward(bool userInitiated)
    {
        if (_items.Count == 0) return -1;
        if (_shuffle) return ShuffleForward(allowWrap: userInitiated || Repeat == RepeatMode.All);

        int next;
        if (CurrentIndex >= 0) next = CurrentIndex + 1;
        else next = _cursor; // current was removed: the item that took its place
        if (next >= _items.Count)
        {
            if (!userInitiated && Repeat != RepeatMode.All) return -1;
            next = 0;
        }
        return Select(next);
    }

    private int ShuffleForward(bool allowWrap)
    {
        // Forward through history first (the user went Previous, then Next).
        if (_historyPos >= 0 && _historyPos < _history.Count - 1)
        {
            _historyPos++;
            SetCurrent(_history[_historyPos]);
            _played.Add(_history[_historyPos]);
            return CurrentIndex;
        }

        var current = _currentId;
        var pool = _items.Where(i => i.Id != current && !_played.Contains(i.Id)).ToList();
        if (pool.Count == 0)
        {
            if (!allowWrap) return -1;
            if (_items.Count == 1) return Select(0);
            // Whole playlist heard: new cycle, never the same track back-to-back.
            _played.Clear();
            if (current is long c) _played.Add(c);
            pool = _items.Where(i => i.Id != current).ToList();
        }
        var pick = pool[_rng.Next(pool.Count)];
        Record(pick.Id);
        SetCurrent(pick.Id);
        return CurrentIndex;
    }

    // ----------------------------------------------------------------- helpers

    private void ResetShuffle()
    {
        _history.Clear();
        _historyPos = -1;
        _played.Clear();
        if (_currentId is long id) Record(id);
    }

    private void Record(long id)
    {
        if (_historyPos < _history.Count - 1) _history.RemoveRange(_historyPos + 1, _history.Count - _historyPos - 1);
        _history.Add(id);
        if (_history.Count > HistoryLimit) _history.RemoveAt(0);
        _historyPos = _history.Count - 1;
        _played.Add(id);
    }

    private void SetCurrent(long id)
    {
        _currentId = id;
        Changed?.Invoke(this, EventArgs.Empty);
    }

    private int IndexOf(long id)
    {
        for (int i = 0; i < _items.Count; i++) if (_items[i].Id == id) return i;
        return -1;
    }
}
