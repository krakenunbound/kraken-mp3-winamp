using KrakenMp3.Core;

namespace KrakenMp3.Tests;

public class PlayQueueTests
{
    private static PlayQueue Make(int n, int seed = 1, bool shuffle = false, RepeatMode repeat = RepeatMode.Off)
    {
        var q = new PlayQueue(new Random(seed)) { Repeat = repeat };
        q.Add(Enumerable.Range(0, n).Select(i => $"song{i}.mp3"));
        q.Select(0);
        q.Shuffle = shuffle;
        return q;
    }

    // ------------------------------------------------------------ sequential

    [Fact]
    public void Sequential_next_wraps_but_advance_stops_at_end()
    {
        var q = Make(3);
        Assert.Equal(1, q.Advance());
        Assert.Equal(2, q.Advance());
        Assert.Equal(-1, q.Advance());   // end of list, repeat off
        Assert.Equal(0, q.Next());       // a user Next always wraps
    }

    [Fact]
    public void Repeat_all_wraps_on_track_end()
    {
        var q = Make(2, repeat: RepeatMode.All);
        Assert.Equal(1, q.Advance());
        Assert.Equal(0, q.Advance());
    }

    [Fact]
    public void Repeat_one_replays_on_track_end_but_next_moves_on()
    {
        var q = Make(3, repeat: RepeatMode.One);
        Assert.Equal(0, q.Advance());
        Assert.Equal(1, q.Next());
    }

    [Fact]
    public void Sequential_previous_wraps()
    {
        var q = Make(3);
        Assert.Equal(2, q.Previous());
    }

    // --------------------------------------------------------------- shuffle

    [Theory]
    [InlineData(1)] [InlineData(2)] [InlineData(3)] [InlineData(42)]
    public void Shuffle_plays_every_track_once_before_any_repeat(int seed)
    {
        var q = Make(20, seed, shuffle: true);
        var heard = new List<long> { q.Current!.Id };
        for (int i = 0; i < 19; i++) { Assert.True(q.Advance() >= 0); heard.Add(q.Current!.Id); }
        Assert.Equal(20, heard.Distinct().Count());
        Assert.Equal(-1, q.Advance()); // repeat off: cycle done, stop
    }

    [Fact]
    public void Skipping_never_brings_back_the_first_song()
    {
        // The reported bug: skip song 1, song 2 finishes, song 1 restarts.
        for (int seed = 0; seed < 200; seed++)
        {
            var q = Make(10, seed, shuffle: true);
            long first = q.Current!.Id;
            q.Next();                      // user skips
            for (int i = 0; i < 8; i++)
            {
                q.Advance();
                Assert.NotEqual(first, q.Current!.Id);
            }
        }
    }

    [Fact]
    public void Previous_then_next_retraces_history()
    {
        var q = Make(10, 7, shuffle: true);
        var path = new List<int> { q.CurrentIndex };
        for (int i = 0; i < 4; i++) path.Add(q.Next());
        Assert.Equal(path[3], q.Previous());
        Assert.Equal(path[2], q.Previous());
        Assert.Equal(path[3], q.Next());
        Assert.Equal(path[4], q.Next());
        Assert.DoesNotContain(q.Next(), path); // then something new
    }

    [Fact]
    public void Previous_at_start_of_history_returns_minus_one()
    {
        var q = Make(5, shuffle: true);
        Assert.Equal(-1, q.Previous());
    }

    [Fact]
    public void New_cycle_never_starts_with_the_track_that_just_ended()
    {
        for (int seed = 0; seed < 200; seed++)
        {
            var q = Make(4, seed, shuffle: true, repeat: RepeatMode.All);
            for (int i = 0; i < 3; i++) q.Advance();
            long last = q.Current!.Id;
            q.Advance(); // wraps into cycle 2
            Assert.NotEqual(last, q.Current!.Id);
        }
    }

    [Fact]
    public void Repeat_all_shuffle_keeps_going_and_each_cycle_is_complete()
    {
        var q = Make(5, 3, shuffle: true, repeat: RepeatMode.All);
        var seen = new List<long> { q.Current!.Id };
        for (int i = 0; i < 24; i++) { Assert.True(q.Advance() >= 0); seen.Add(q.Current!.Id); }
        // first cycle complete
        Assert.Equal(5, seen.Take(5).Distinct().Count());
        // no back-to-back repeats anywhere
        for (int i = 1; i < seen.Count; i++) Assert.NotEqual(seen[i - 1], seen[i]);
    }

    [Fact]
    public void Duplicate_files_are_distinct_entries()
    {
        var q = new PlayQueue(new Random(5));
        q.Add(["a.mp3", "a.mp3", "b.mp3"]);
        q.Select(0);
        q.Shuffle = true;
        var ids = new HashSet<long> { q.Current!.Id };
        ids.Add(q.Items[q.Advance()].Id);
        ids.Add(q.Items[q.Advance()].Id);
        Assert.Equal(3, ids.Count);
    }

    [Fact]
    public void Single_track_repeat_all_replays()
    {
        var q = Make(1, shuffle: true, repeat: RepeatMode.All);
        Assert.Equal(0, q.Advance());
        Assert.Equal(-1, Make(1, shuffle: true).Advance());
    }

    // --------------------------------------------------------------- editing

    [Fact]
    public void Removing_current_track_continues_with_the_one_after_it()
    {
        var q = Make(4);
        q.Select(1);
        q.RemoveAt(1);
        Assert.Equal(-1, q.CurrentIndex);
        Assert.Equal(1, q.Advance());           // old index 2, now at 1
        Assert.Equal("song2.mp3", q.Current!.Path);
    }

    [Fact]
    public void Removing_tracks_keeps_shuffle_history_consistent()
    {
        var q = Make(6, 11, shuffle: true);
        int a = q.CurrentIndex;
        int b = q.Next();
        q.Next();
        var bItem = q.Items[b];
        q.RemoveAt(b);
        // Previous skips the removed track and lands on the first one.
        Assert.Equal(q.Items.ToList().FindIndex(i => i.Path == $"song{a}.mp3"), q.Previous());
        Assert.DoesNotContain(bItem, q.Items);
    }

    [Fact]
    public void Moving_items_keeps_the_current_track()
    {
        var q = Make(4);
        q.Select(2);
        q.Move(2, 0);
        Assert.Equal(0, q.CurrentIndex);
        q.Move(3, 0);
        Assert.Equal(1, q.CurrentIndex);
        Assert.Equal("song2.mp3", q.Current!.Path);
    }

    [Fact]
    public void Turning_shuffle_on_starts_a_fresh_cycle_from_current()
    {
        var q = Make(5, 9);
        q.Select(3);
        q.Shuffle = true;
        var seen = new HashSet<int> { 3 };
        for (int i = 0; i < 4; i++) Assert.True(seen.Add(q.Advance()));
        Assert.Equal(-1, q.Advance());
    }

    [Fact]
    public void Empty_queue_returns_minus_one()
    {
        var q = new PlayQueue();
        Assert.Equal(-1, q.Next());
        Assert.Equal(-1, q.Previous());
        Assert.Equal(-1, q.Advance());
        Assert.Null(q.Current);
    }
}

public class AppSettingsTests
{
    [Fact]
    public void Round_trips_and_survives_damage()
    {
        var dir = Directory.CreateTempSubdirectory("kraken-settings-");
        var path = Path.Combine(dir.FullName, "settings.json");
        try
        {
            var s = new AppSettings { Volume = 0.4f, Repeat = RepeatMode.One, Shuffle = true, Playlist = ["x.mp3"], PlaylistIndex = 0 };
            s.EqBands[3] = 4.5f;
            s.Save(path);
            var back = AppSettings.Load(path);
            Assert.Equal(0.4f, back.Volume);
            Assert.Equal(RepeatMode.One, back.Repeat);
            Assert.True(back.Shuffle);
            Assert.Equal(4.5f, back.EqBands[3]);
            Assert.Equal(["x.mp3"], back.Playlist);
            Assert.Contains("\"One\"", File.ReadAllText(path));

            File.WriteAllText(path, "{ not json");
            Assert.Equal(0.8f, AppSettings.Load(path).Volume);

            File.WriteAllText(path, "{\"Volume\": 7, \"EqBands\": [1,2], \"PlaylistIndex\": 9}");
            var fixedUp = AppSettings.Load(path);
            Assert.Equal(1f, fixedUp.Volume);
            Assert.Equal(10, fixedUp.EqBands.Length);
            Assert.Equal(-1, fixedUp.PlaylistIndex);
        }
        finally { dir.Delete(true); }
    }
}
