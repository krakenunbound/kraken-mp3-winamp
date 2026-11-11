using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace KrakenMp3.Audio;

/// <summary>
/// Playback engine: decoder → EQ → spectrum tap → volume/balance → WASAPI (shared).
/// The EQ and analyzer are recreated per track (sample rate / channel count
/// can change between files) but their settings carry over.
///
/// Position and spectrum follow the device clock (WASAPI's played position),
/// not the decoder, so the time display and the bars match what is audible.
///
/// Output always goes to Windows' default playback device and follows it:
/// when the default changes (or the device in use disappears), the host calls
/// <see cref="FollowDefaultDevice"/> and playback moves over at the same spot.
/// </summary>
public sealed class Player : IDisposable
{
    private const int LatencyMs = 60;
    private IAudioSource? _source;
    private Equalizer? _eq;
    private SpectrumAnalyzer? _analyzer;
    private VolumeBalanceProvider? _gain;
    private WasapiOut? _output;
    private bool _stopRequested;
    private volatile bool _ended;

    private bool _eqEnabled;
    private readonly float[] _eqBands = new float[Equalizer.Frequencies.Length];
    private float _eqPreamp;
    private float _vol = 0.8f, _balance;
    private bool _muted;

    // Device-clock anchor: audible time = _anchorTime + (device bytes played − _anchorBytes).
    private TimeSpan _anchorTime;
    private long _anchorBytes;

    private readonly MMDeviceEnumerator _devices = new();
    private readonly DeviceWatcher _watcher;
    private string? _deviceId;
    private volatile bool _deviceLost;
    private volatile bool _resumeAfterLoss; // the device died while playing

    private TimeSpan? _measuredDuration;
    private CancellationTokenSource? _measureCts;

    /// <summary>Raised on the audio thread when a track plays to its end.</summary>
    public event EventHandler? TrackEnded;
    /// <summary>Raised on a worker thread when a better duration becomes known.</summary>
    public event EventHandler? DurationChanged;
    /// <summary>Raised on a system thread when the default output changed or the
    /// device in use went away. Call <see cref="FollowDefaultDevice"/> on the
    /// thread that owns the player (after a short debounce).</summary>
    public event EventHandler? OutputDeviceChanged;

    /// <summary>Name of the playback device in use, e.g. "Speakers (Realtek…)".</summary>
    public string? OutputDeviceName { get; private set; }

    public Player()
    {
        _watcher = new DeviceWatcher(this);
        try { _devices.RegisterEndpointNotificationCallback(_watcher); } catch (Exception) { /* no notifications: still plays */ }
    }

    internal void NotifyDeviceChange(string? deviceId, bool lost)
    {
        if (lost && deviceId != null && deviceId != _deviceId) return; // some other device
        if (lost)
        {
            if (IsPlaying) _resumeAfterLoss = true;
            _deviceLost = true;
        }
        OutputDeviceChanged?.Invoke(this, EventArgs.Empty);
    }

    public string? FilePath { get; private set; }
    public string? DecoderName => _source?.DecoderName;
    public WaveFormat? SourceFormat => _source?.WaveFormat;
    public bool IsPlaying => _output?.PlaybackState == PlaybackState.Playing;
    public bool IsPaused => _output?.PlaybackState == PlaybackState.Paused;
    /// <summary>A track is loaded and Play will continue it (false after it ended).</summary>
    public bool CanResume => _output != null && !_ended;
    public TimeSpan Duration => _measuredDuration ?? _source?.TotalTime ?? TimeSpan.Zero;

    public TimeSpan Position
    {
        get
        {
            if (_source == null) return TimeSpan.Zero;
            var decoded = _source.CurrentTime;
            var played = PlayedSinceAnchor();
            var t = played is TimeSpan p ? _anchorTime + p : decoded;
            if (t > decoded) t = decoded;
            if (t > Duration) t = Duration;
            return t < TimeSpan.Zero ? TimeSpan.Zero : t;
        }
        set
        {
            if (_source == null) return;
            var d = Duration;
            if (d > TimeSpan.Zero && value > d) value = d;
            _source.CurrentTime = value < TimeSpan.Zero ? TimeSpan.Zero : value;
            _analyzer?.Reset();
            if (d <= TimeSpan.Zero || _source.CurrentTime < d) _ended = false;
            Anchor(_source.CurrentTime);
        }
    }

    public float Volume
    {
        get => _vol;
        set { _vol = Math.Clamp(value, 0f, 1f); ApplyGain(); }
    }

    /// <summary>−1 = left only, 0 = centre, 1 = right only.</summary>
    public float Balance
    {
        get => _balance;
        set { _balance = Math.Clamp(value, -1f, 1f); ApplyGain(); }
    }

    public bool Muted
    {
        get => _muted;
        set { _muted = value; ApplyGain(); }
    }

    public bool EqEnabled
    {
        get => _eqEnabled;
        set { _eqEnabled = value; if (_eq != null) _eq.Enabled = value; }
    }

    public float GetEqBand(int band) => _eqBands[band];
    public float EqPreamp => _eqPreamp;
    public void SetEqBand(int band, float db) { _eqBands[band] = db; _eq?.SetBand(band, db); }
    public void SetEqPreamp(float db) { _eqPreamp = db; _eq?.SetPreamp(db); }
    public void ApplyEqPreset(string name)
    {
        if (!Equalizer.Presets.TryGetValue(name, out var b)) return;
        for (int i = 0; i < b.Length; i++) SetEqBand(i, b[i]);
    }

    public void Open(string path)
    {
        CloseOutput();
        _source = Decoders.Open(path);
        FilePath = path;
        _eq = new Equalizer(_source) { Enabled = _eqEnabled };
        for (int i = 0; i < _eqBands.Length; i++) _eq.SetBand(i, _eqBands[i]);
        _eq.SetPreamp(_eqPreamp);
        _analyzer = new SpectrumAnalyzer(_eq) { Latency = TimeSpan.FromMilliseconds(LatencyMs + 40) };
        _gain = new VolumeBalanceProvider(_analyzer);
        ApplyGain();
        _output = CreateOutput();
        _output.Init(_gain);
        _output.PlaybackStopped += OnPlaybackStopped;
        _ended = false;
        _deviceLost = false;
        _resumeAfterLoss = false;
        Anchor(TimeSpan.Zero);

        if (Decoders.NeedsMeasuredDuration(path)) MeasureInBackground(path);
    }

    /// <summary>A shared-mode stream on the current default playback device.</summary>
    private WasapiOut CreateOutput()
    {
        var device = _devices.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        _deviceId = device.ID;
        try { OutputDeviceName = device.FriendlyName; } catch (Exception) { OutputDeviceName = null; }
        return new WasapiOut(device, AudioClientShareMode.Shared, true, LatencyMs);
    }

    /// <summary>
    /// Moves playback to Windows' current default output if it differs from
    /// the one in use (or the one in use was lost), keeping the position and
    /// the playing/paused state. Returns true if the output was switched.
    /// </summary>
    public bool FollowDefaultDevice()
    {
        if (_output == null || _gain == null || _source == null || _analyzer == null) return false;
        string id;
        try { id = _devices.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia).ID; }
        catch (Exception) { return false; } // no playback device at all right now; try again on the next change
        if (id == _deviceId && !_deviceLost) return false;

        bool resume = IsPlaying || _resumeAfterLoss;
        bool ended = _ended;
        var pos = Position; // audible position (decoder minus what was still buffered)

        _stopRequested = true;
        _output.PlaybackStopped -= OnPlaybackStopped;
        try { _output.Stop(); } catch (Exception) { }
        _output.Dispose();
        _stopRequested = false;

        try { _output = CreateOutput(); _output.Init(_gain); }
        catch (Exception) { _output = null; _deviceLost = true; return false; }
        _output.PlaybackStopped += OnPlaybackStopped;
        _deviceLost = false;
        _resumeAfterLoss = false;
        if (!ended)
        {
            _source.CurrentTime = pos;
            _analyzer.Reset();
        }
        Anchor(_source.CurrentTime);
        if (resume && !ended) _output.Play();
        return true;
    }

    /// <summary>Reopens the output on the default device even if it did not
    /// change (what a lost device triggers; also used by the device test).</summary>
    public bool ReconnectOutput()
    {
        _deviceLost = true;
        return FollowDefaultDevice();
    }

    public void Play() => _output?.Play();
    public void Pause() => _output?.Pause();

    /// <summary>Pauses and rewinds to the start.</summary>
    public void Stop()
    {
        _output?.Pause();
        Position = TimeSpan.Zero;
    }

    /// <summary>Spectrum of what is currently audible; falls to silence when paused.</summary>
    public void GetSpectrum(byte[] output)
    {
        if (_analyzer == null || _source == null) { Array.Clear(output); return; }
        long? end = null;
        if (PlayedSinceAnchor() is TimeSpan p) end = (long)(p.TotalSeconds * _source.WaveFormat.SampleRate);
        _analyzer.GetByteFrequencyData(output, end, silent: !IsPlaying);
    }

    /// <summary>Waveform of what is currently audible (flat when paused).</summary>
    public void GetWaveform(byte[] output)
    {
        if (_analyzer == null || _source == null) { Array.Fill(output, (byte)128); return; }
        long? end = null;
        if (PlayedSinceAnchor() is TimeSpan p) end = (long)(p.TotalSeconds * _source.WaveFormat.SampleRate);
        _analyzer.GetByteTimeDomainData(output, end, silent: !IsPlaying);
    }

    /// <summary>Audio played by the device since the last anchor, or null if unknown.</summary>
    private TimeSpan? PlayedSinceAnchor()
    {
        var o = _output;
        if (o == null || o.PlaybackState == PlaybackState.Stopped) return null;
        try
        {
            long bytes = o.GetPosition() - _anchorBytes;
            return bytes < 0 ? TimeSpan.Zero : TimeSpan.FromSeconds(bytes / (double)o.OutputWaveFormat.AverageBytesPerSecond);
        }
        catch (Exception) { return null; }
    }

    private void Anchor(TimeSpan at)
    {
        _anchorTime = at;
        try { _anchorBytes = _output?.PlaybackState is PlaybackState.Playing or PlaybackState.Paused ? _output.GetPosition() : 0; }
        catch (Exception) { _anchorBytes = 0; }
    }

    private void ApplyGain()
    {
        if (_gain == null) return;
        _gain.Volume = _muted ? 0f : _vol;
        _gain.Balance = _balance;
    }

    private void MeasureInBackground(string path)
    {
        var cts = _measureCts = new CancellationTokenSource();
        Task.Run(() =>
        {
            try
            {
                var d = Decoders.MeasureDuration(path, cts.Token);
                if (cts.IsCancellationRequested || FilePath != path) return;
                _measuredDuration = d;
                DurationChanged?.Invoke(this, EventArgs.Empty);
            }
            catch (Exception) { /* keep the estimate */ }
        });
    }

    private void OnPlaybackStopped(object? sender, StoppedEventArgs e)
    {
        if (_stopRequested) return;
        if (e.Exception != null)
        {
            // The device went away (unplugged, disabled, driver reset). That is
            // not the end of the song: move to the new default and carry on.
            _deviceLost = true;
            _resumeAfterLoss = true;
            OutputDeviceChanged?.Invoke(this, EventArgs.Empty);
            return;
        }
        _ended = true;
        TrackEnded?.Invoke(this, EventArgs.Empty);
    }

    private void CloseOutput()
    {
        _measureCts?.Cancel();
        _measureCts = null;
        _measuredDuration = null;
        if (_output != null)
        {
            _stopRequested = true;
            _output.PlaybackStopped -= OnPlaybackStopped;
            _output.Stop();
            _output.Dispose();
            _output = null;
            _stopRequested = false;
        }
        _source?.Dispose();
        _source = null;
        FilePath = null;
    }

    public void Dispose()
    {
        try { _devices.UnregisterEndpointNotificationCallback(_watcher); } catch (Exception) { }
        CloseOutput();
        _devices.Dispose();
    }
}

/// <summary>Windows audio endpoint notifications (called on a system thread).</summary>
internal sealed class DeviceWatcher(Player player) : NAudio.CoreAudioApi.Interfaces.IMMNotificationClient
{
    public void OnDefaultDeviceChanged(DataFlow flow, Role role, string defaultDeviceId)
    {
        if (flow == DataFlow.Render && role == Role.Multimedia) player.NotifyDeviceChange(defaultDeviceId, lost: false);
    }

    public void OnDeviceStateChanged(string deviceId, DeviceState newState)
    {
        if (newState != DeviceState.Active) player.NotifyDeviceChange(deviceId, lost: true);
    }

    public void OnDeviceRemoved(string deviceId) => player.NotifyDeviceChange(deviceId, lost: true);
    public void OnDeviceAdded(string pwstrDeviceId) { }
    public void OnPropertyValueChanged(string pwstrDeviceId, PropertyKey key) { }
}

/// <summary>Volume plus stereo balance (the louder side stays at full level).</summary>
internal sealed class VolumeBalanceProvider(ISampleProvider source) : ISampleProvider
{
    private readonly int _channels = source.WaveFormat.Channels;
    public float Volume { get; set; } = 1f;
    public float Balance { get; set; }
    public WaveFormat WaveFormat => source.WaveFormat;

    public int Read(float[] buffer, int offset, int count)
    {
        int n = source.Read(buffer, offset, count);
        float v = Volume, b = Balance;
        if (_channels == 2)
        {
            float l = v * Math.Min(1f, 1f - b), r = v * Math.Min(1f, 1f + b);
            for (int i = offset; i + 1 < offset + n; i += 2) { buffer[i] *= l; buffer[i + 1] *= r; }
        }
        else if (v != 1f)
        {
            for (int i = offset; i < offset + n; i++) buffer[i] *= v;
        }
        return n;
    }
}
