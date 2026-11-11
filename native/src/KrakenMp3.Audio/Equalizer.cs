using NAudio.Dsp;
using NAudio.Wave;

namespace KrakenMp3.Audio;

/// <summary>10-band peaking graphic EQ + preamp, matching the v2 Web Audio
/// chain (BiquadFilter "peaking", Q = 1 at the same centre frequencies).</summary>
public sealed class Equalizer : ISampleProvider
{
    public static readonly float[] Frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    private const float Q = 1f;

    /// <summary>Same values as the v2 equalizer window (src/panels/eq-renderer.js).</summary>
    public static readonly IReadOnlyDictionary<string, float[]> Presets = new Dictionary<string, float[]>
    {
        ["flat"] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ["rock"] = [4, 3, -1, -2, 0, 2, 3, 4, 4, 4],
        ["pop"] = [-1, 1, 3, 4, 3, 0, -1, -1, -1, -1],
        ["jazz"] = [3, 2, 1, 2, -1, -1, 0, 1, 2, 3],
        ["classical"] = [4, 3, 2, 1, 0, 0, 0, 1, 2, 3],
        ["bass-boost"] = [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
    };

    private readonly ISampleProvider _source;
    private readonly int _channels;
    private readonly BiQuadFilter[,] _filters; // [channel, band]
    private readonly float[] _gains = new float[Frequencies.Length];
    private float _preampLinear = 1f;
    private volatile bool _dirty = true;

    public Equalizer(ISampleProvider source)
    {
        _source = source;
        _channels = source.WaveFormat.Channels;
        _filters = new BiQuadFilter[_channels, Frequencies.Length];
        float rate = source.WaveFormat.SampleRate;
        for (int c = 0; c < _channels; c++)
            for (int b = 0; b < Frequencies.Length; b++)
                _filters[c, b] = BiQuadFilter.PeakingEQ(rate, Math.Min(Frequencies[b], rate * 0.45f), Q, 0);
    }

    public WaveFormat WaveFormat => _source.WaveFormat;
    public bool Enabled { get; set; }

    public void SetBand(int band, float gainDb) { _gains[band] = gainDb; _dirty = true; }
    public void SetPreamp(float gainDb) => _preampLinear = (float)Math.Pow(10, gainDb / 20);
    public void ApplyPreset(string name)
    {
        if (!Presets.TryGetValue(name, out var bands)) return;
        for (int i = 0; i < bands.Length; i++) _gains[i] = bands[i];
        _dirty = true;
    }

    private void UpdateCoefficients()
    {
        float rate = WaveFormat.SampleRate;
        for (int c = 0; c < _channels; c++)
            for (int b = 0; b < Frequencies.Length; b++)
                _filters[c, b].SetPeakingEq(rate, Math.Min(Frequencies[b], rate * 0.45f), Q, _gains[b]);
        _dirty = false;
    }

    public int Read(float[] buffer, int offset, int count)
    {
        int read = _source.Read(buffer, offset, count);
        if (!Enabled) return read;
        if (_dirty) UpdateCoefficients();
        float pre = _preampLinear;
        for (int i = 0; i < read; i++)
        {
            int ch = i % _channels;
            float s = buffer[offset + i] * pre;
            for (int b = 0; b < Frequencies.Length; b++)
                s = _filters[ch, b].Transform(s);
            buffer[offset + i] = s;
        }
        return read;
    }
}
