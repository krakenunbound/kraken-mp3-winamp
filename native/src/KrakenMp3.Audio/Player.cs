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

    private TimeSpan? _measuredDuration;
    private CancellationTokenSource? _measureCts;

    /// <summary>Raised on the audio thread when a track plays to its end.</summary>
    public event EventHandler? TrackEnded;
    /// <summary>Raised on a worker thread when a better duration becomes known.</summary>
    public event EventHandler? DurationChanged;

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
        _output = new WasapiOut(AudioClientShareMode.Shared, true, LatencyMs);
        _output.Init(_gain);
        _output.PlaybackStopped += OnPlaybackStopped;
        _ended = false;
        Anchor(TimeSpan.Zero);

        if (Decoders.NeedsMeasuredDuration(path)) MeasureInBackground(path);
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

    public void Dispose() => CloseOutput();
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
