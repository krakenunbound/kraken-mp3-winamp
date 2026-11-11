using NAudio.Dsp;
using NAudio.Wave;

namespace KrakenMp3.Audio;

/// <summary>
/// Pass-through tap that records the mono mix of everything played, and
/// produces byte spectra like Web Audio's AnalyserNode.getByteFrequencyData
/// (Blackman window, fftSize 512 → 256 bins, smoothing 0.8, −100…−30 dB),
/// so visualizer code ported from v2 behaves identically.
/// </summary>
public sealed class SpectrumAnalyzer : ISampleProvider
{
    public const int FftSize = 512;
    public const int BinCount = FftSize / 2;
    private const int FftLog2 = 9;
    private const float Smoothing = 0.8f;
    private const float MinDb = -100f, MaxDb = -30f;

    private readonly ISampleProvider _source;
    private readonly int _channels;
    private readonly float[] _ring = new float[1 << 15];
    private long _written; // mono samples written in total
    private readonly object _lock = new();
    private readonly Complex[] _fft = new Complex[FftSize];
    private readonly float[] _window = new float[FftSize];
    private readonly float[] _smoothed = new float[BinCount];

    public SpectrumAnalyzer(ISampleProvider source)
    {
        _source = source;
        _channels = source.WaveFormat.Channels;
        for (int i = 0; i < FftSize; i++)
        {
            double a = 2 * Math.PI * i / FftSize;
            _window[i] = (float)(0.42 - 0.5 * Math.Cos(a) + 0.08 * Math.Cos(2 * a)); // Blackman
        }
    }

    public WaveFormat WaveFormat => _source.WaveFormat;

    /// <summary>Output latency to compensate for, so the spectrum lines up
    /// with what is audible rather than what was just handed to WASAPI.</summary>
    public TimeSpan Latency { get; set; } = TimeSpan.FromMilliseconds(100);

    public int Read(float[] buffer, int offset, int count)
    {
        int read = _source.Read(buffer, offset, count);
        lock (_lock)
        {
            for (int i = 0; i + _channels <= read; i += _channels)
            {
                float m = 0;
                for (int c = 0; c < _channels; c++) m += buffer[offset + i + c];
                _ring[_written & (_ring.Length - 1)] = m / _channels;
                _written++;
            }
        }
        return read;
    }

    public void Reset()
    {
        lock (_lock) { _written = 0; Array.Clear(_ring); Array.Clear(_smoothed); }
    }

    private readonly byte[] _last = new byte[BinCount];

    /// <summary>Like Web Audio's getByteTimeDomainData: the 512 mono samples
    /// ending at <paramref name="endFrame"/>, as bytes (128 = silence).</summary>
    public void GetByteTimeDomainData(byte[] output, long? endFrame = null, bool silent = false)
    {
        int n = Math.Min(output.Length, FftSize);
        lock (_lock)
        {
            long end = endFrame ?? _written - (long)(Latency.TotalSeconds * WaveFormat.SampleRate);
            if (end > _written) end = _written;
            for (int i = 0; i < n; i++)
            {
                long idx = end - n + i;
                float v = !silent && idx >= 0 && idx < _written && _written - idx < _ring.Length ? _ring[idx & (_ring.Length - 1)] : 0f;
                output[i] = (byte)Math.Clamp(128 + v * 128, 0, 255);
            }
        }
    }
    private long _lastTicks;
    private readonly System.Diagnostics.Stopwatch _clock = System.Diagnostics.Stopwatch.StartNew();

    /// <summary>
    /// Fills <paramref name="output"/> (length ≥ 256) with 0–255 levels for the
    /// 512 samples ending at mono frame <paramref name="endFrame"/> (frames since
    /// the last <see cref="Reset"/>; null = newest minus <see cref="Latency"/>).
    /// <paramref name="silent"/> analyses silence so bars fall when paused.
    /// Smoothing is time-based (0.8 per 1/60 s, as v2 at 60 fps), so any frame
    /// rate looks the same; calls within 2 ms share one result, so several
    /// views can read the same frame without double smoothing.
    /// </summary>
    public void GetByteFrequencyData(byte[] output, long? endFrame = null, bool silent = false)
    {
        long now = _clock.ElapsedTicks;
        double dt = (now - _lastTicks) / (double)System.Diagnostics.Stopwatch.Frequency;
        if (_lastTicks != 0 && dt < 0.002)
        {
            Array.Copy(_last, output, BinCount);
            return;
        }
        _lastTicks = now;
        float smoothing = (float)Math.Pow(Smoothing, Math.Clamp(dt, 0, 0.1) * 60.0);

        lock (_lock)
        {
            long end = endFrame ?? _written - (long)(Latency.TotalSeconds * WaveFormat.SampleRate);
            if (end > _written) end = _written;
            for (int i = 0; i < FftSize; i++)
            {
                long idx = end - FftSize + i;
                float v = !silent && idx >= 0 && idx < _written && _written - idx < _ring.Length ? _ring[idx & (_ring.Length - 1)] : 0f;
                _fft[i].X = v * _window[i];
                _fft[i].Y = 0;
            }
        }
        // NAudio's FFT scales the forward transform by 1/N, as Web Audio does.
        FastFourierTransform.FFT(true, FftLog2, _fft);
        for (int k = 0; k < BinCount; k++)
        {
            float mag = MathF.Sqrt(_fft[k].X * _fft[k].X + _fft[k].Y * _fft[k].Y);
            _smoothed[k] = smoothing * _smoothed[k] + (1 - smoothing) * mag;
            float db = _smoothed[k] > 0 ? 20f * MathF.Log10(_smoothed[k]) : MinDb;
            float lv = (db - MinDb) / (MaxDb - MinDb) * 255f;
            _last[k] = (byte)Math.Clamp(lv, 0, 255);
        }
        Array.Copy(_last, output, BinCount);
    }
}
