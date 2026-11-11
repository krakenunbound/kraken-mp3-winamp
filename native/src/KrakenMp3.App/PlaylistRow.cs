using System.ComponentModel;
using System.Runtime.CompilerServices;
using KrakenMp3.Core;

namespace KrakenMp3.App;

/// <summary>One visible playlist line, tied to a <see cref="QueueItem"/>.</summary>
public sealed class PlaylistRow(QueueItem item) : INotifyPropertyChanged
{
    public QueueItem Item { get; } = item;

    private int _number;
    private string _title = System.IO.Path.GetFileNameWithoutExtension(item.Path);
    private TimeSpan _duration;
    private bool _isCurrent, _failed;

    public int Number { get => _number; set => Set(ref _number, value); }
    public string Title { get => _title; set => Set(ref _title, value); }
    public TimeSpan Duration
    {
        get => _duration;
        set { if (Set(ref _duration, value)) OnPropertyChanged(nameof(DurationText)); }
    }
    public string DurationText => _duration > TimeSpan.Zero ? FormatTime(_duration) : "";
    public bool IsCurrent { get => _isCurrent; set => Set(ref _isCurrent, value); }
    public bool Failed { get => _failed; set => Set(ref _failed, value); }

    public static string FormatTime(TimeSpan t) =>
        t.TotalHours >= 1 ? $"{(int)t.TotalHours}:{t.Minutes:00}:{t.Seconds:00}" : $"{(int)t.TotalMinutes}:{t.Seconds:00}";

    public event PropertyChangedEventHandler? PropertyChanged;
    private void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    private bool Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return false;
        field = value;
        OnPropertyChanged(name);
        return true;
    }
}
