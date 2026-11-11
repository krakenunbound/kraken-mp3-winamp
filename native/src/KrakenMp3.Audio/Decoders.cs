using Concentus;
using Concentus.Oggfile;
using NAudio.Vorbis;
using NAudio.Wave;

namespace KrakenMp3.Audio;

/// <summary>A decoded, seekable float sample source.</summary>
public interface IAudioSource : ISampleProvider, IDisposable
{
    TimeSpan CurrentTime { get; set; }
    TimeSpan TotalTime { get; }
    string DecoderName { get; }
}

public static class Decoders
{
    public static readonly string[] SupportedExtensions =
        [".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac", ".wma", ".opus"];

    public static bool IsSupported(string path) =>
        SupportedExtensions.Contains(Path.GetExtension(path).ToLowerInvariant());

    /// <summary>Opens any supported file. OGG and Opus use managed decoders;
    /// everything else goes through Windows Media Foundation.</summary>
    public static IAudioSource Open(string path)
    {
        return Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".ogg" => new WaveStreamSource(new VorbisWaveReader(path), "Vorbis (managed)"),
            ".opus" => new OpusSource(path),
            _ => new WaveStreamSource(new MediaFoundationReader(path), "Media Foundation"),
        };
    }

    /// <summary>True when the container's reported length is only an estimate
    /// (raw ADTS AAC has no index), so the real length must be measured.</summary>
    public static bool NeedsMeasuredDuration(string path) =>
        Path.GetExtension(path).Equals(".aac", StringComparison.OrdinalIgnoreCase);

    /// <summary>Decodes the whole file to find its exact length. Slow-ish
    /// (a few hundred ms per song); call off the UI thread.</summary>
    public static TimeSpan MeasureDuration(string path, CancellationToken ct = default)
    {
        using var reader = new MediaFoundationReader(path);
        var buf = new byte[1 << 18];
        long bytes = 0;
        int n;
        while ((n = reader.Read(buf, 0, buf.Length)) > 0)
        {
            ct.ThrowIfCancellationRequested();
            bytes += n;
        }
        return TimeSpan.FromSeconds(bytes / (double)reader.WaveFormat.AverageBytesPerSecond);
    }
}

internal sealed class WaveStreamSource : IAudioSource
{
    private readonly WaveStream _stream;
    private readonly ISampleProvider _samples;

    public WaveStreamSource(WaveStream stream, string decoderName)
    {
        _stream = stream;
        _samples = stream.ToSampleProvider();
        DecoderName = decoderName;
    }

    public WaveFormat WaveFormat => _samples.WaveFormat;
    public string DecoderName { get; }
    public TimeSpan TotalTime => _stream.TotalTime;

    public TimeSpan CurrentTime
    {
        get => _stream.CurrentTime;
        set => _stream.CurrentTime = value < TimeSpan.Zero ? TimeSpan.Zero : value;
    }

    public int Read(float[] buffer, int offset, int count) => _samples.Read(buffer, offset, count);
    public void Dispose() => _stream.Dispose();
}

/// <summary>Ogg Opus via Concentus. Always decodes to 48 kHz stereo.</summary>
internal sealed class OpusSource : IAudioSource
{
    private const int Rate = 48000;
    private const int Channels = 2;
    private readonly FileStream _file;
    private readonly OpusOggReadStream _reader;
    private short[] _pending = [];
    private int _pendingPos;
    private long _samplesOut; // interleaved samples emitted since last seek
    private TimeSpan _seekBase = TimeSpan.Zero;

    public OpusSource(string path)
    {
        _file = File.OpenRead(path);
        var decoder = OpusCodecFactory.CreateDecoder(Rate, Channels);
        _reader = new OpusOggReadStream(decoder, _file);
        TotalTime = _reader.TotalTime;
    }

    public WaveFormat WaveFormat { get; } = WaveFormat.CreateIeeeFloatWaveFormat(Rate, Channels);
    public string DecoderName => "Opus (Concentus)";
    public TimeSpan TotalTime { get; }

    public TimeSpan CurrentTime
    {
        get => _seekBase + TimeSpan.FromSeconds(_samplesOut / (double)(Rate * Channels));
        set
        {
            if (!_reader.CanSeek) return;
            var t = value < TimeSpan.Zero ? TimeSpan.Zero : value > TotalTime ? TotalTime : value;
            _reader.SeekTo(t);
            _pending = [];
            _pendingPos = 0;
            _samplesOut = 0;
            _seekBase = t;
        }
    }

    public int Read(float[] buffer, int offset, int count)
    {
        int written = 0;
        while (written < count)
        {
            if (_pendingPos >= _pending.Length)
            {
                if (!_reader.HasNextPacket) break;
                var packet = _reader.DecodeNextPacket();
                if (packet == null || packet.Length == 0) continue;
                _pending = packet;
                _pendingPos = 0;
            }
            int n = Math.Min(count - written, _pending.Length - _pendingPos);
            for (int i = 0; i < n; i++)
                buffer[offset + written + i] = _pending[_pendingPos + i] / 32768f;
            _pendingPos += n;
            written += n;
        }
        _samplesOut += written;
        return written;
    }

    public void Dispose() => _file.Dispose();
}
