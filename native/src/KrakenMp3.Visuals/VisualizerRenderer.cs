using SkiaSharp;

namespace KrakenMp3.Visuals;

public sealed record VizTheme(float HueBase, float HueRange, float Saturation, SKColor Accent)
{
    // Values from v2 src/shared/uiThemes.js PRESETS.kraken
    public static readonly VizTheme Kraken = new(190, 40, 80, new SKColor(59, 158, 190));
}

public enum VizMode { None, Bars, Mirror, Led, Spectrum, Wave, Circle, Waterfall }

/// <summary>
/// Ports of every mode in v2 src/shared/canvasViz.js, drawn with SkiaSharp.
/// Same maths (log-frequency column sampling, bar/LED cell widths, colours).
/// Sizes are in v2 CSS pixels and multiplied by <see cref="Scale"/> (the
/// display's DPI factor) so the look is identical on high-DPI screens.
/// "Bare" draws only lit elements, fully opaque, for chroma/luma-key capture.
/// </summary>
public sealed class VisualizerRenderer : IDisposable
{
    private VizMode _mode = VizMode.Bars;
    public VizMode Mode
    {
        get => _mode;
        set { if (_mode != value) { _mode = value; ResetWaterfall(); } }
    }

    public VizTheme Theme { get; set; } = VizTheme.Kraken;

    private bool _bare;
    public bool Bare
    {
        get => _bare;
        set { if (_bare != value) { _bare = value; ResetWaterfall(); } }
    }

    /// <summary>Device pixels per v2 CSS pixel.</summary>
    public float Scale { get; set; } = 1f;

    private readonly SKPaint _fill = new() { IsAntialias = false, Style = SKPaintStyle.Fill };
    private readonly SKPaint _stroke = new() { IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeCap = SKStrokeCap.Butt };
    private readonly SKPath _path = new();
    private float[] _ys = [];

    public static string Label(VizMode m) => m switch
    {
        VizMode.None => "Off",
        VizMode.Led => "LED",
        _ => m.ToString(),
    };

    private SKColor ThemeColor(int i, int count, float alpha = 0.8f)
    {
        float hue = (Theme.HueBase + (float)i / count * Theme.HueRange) % 360;
        return SKColor.FromHsl(hue, Theme.Saturation, 50, (byte)((_bare ? 1f : alpha) * 255));
    }

    private SKColor Accent(float alpha) => Theme.Accent.WithAlpha((byte)((_bare ? 1f : alpha) * 255));

    /// <summary>Map canvas column x across all FFT bins (log frequency axis).</summary>
    public static float SampleFrequency(ReadOnlySpan<byte> freq, float x, float width)
    {
        int len = freq.Length;
        if (len < 1) return 0;
        if (width <= 1) return freq[0];
        double t = x / (width - 1);
        double pos = Math.Exp(t * Math.Log(len)) - 1;
        int i0 = Math.Clamp((int)Math.Floor(pos), 0, len - 1);
        int i1 = Math.Min(len - 1, i0 + 1);
        double frac = pos - i0;
        return (float)(freq[i0] * (1 - frac) + freq[i1] * frac);
    }

    /// <param name="freq">256 byte frequency bins (getByteFrequencyData).</param>
    /// <param name="wave">512 byte samples, 128 = silence (getByteTimeDomainData).</param>
    /// <param name="dt">Seconds since the previous frame (waterfall speed).</param>
    public void Draw(SKCanvas canvas, int w, int h, ReadOnlySpan<byte> freq, ReadOnlySpan<byte> wave, double dt = 1 / 60.0)
    {
        if (w < 1 || h < 1) return;
        switch (_mode)
        {
            case VizMode.Bars: DrawBars(canvas, w, h, freq, 6); break;
            case VizMode.Mirror: DrawMirror(canvas, w, h, freq); break;
            case VizMode.Led: DrawLed(canvas, w, h, freq); break;
            case VizMode.Spectrum: DrawSpectrum(canvas, w, h, freq); break;
            case VizMode.Wave: DrawWave(canvas, w, h, wave.Length > 0 ? wave : freq); break;
            case VizMode.Circle: DrawCircle(canvas, w, h, freq); break;
            case VizMode.Waterfall: DrawWaterfall(canvas, w, h, freq, dt); break;
        }
    }

    private void DrawBars(SKCanvas c, int w, int h, ReadOnlySpan<byte> freq, float target)
    {
        int cols = Math.Max(1, (int)(w / (target * Scale)));
        float barW = (float)w / cols;
        for (int i = 0; i < cols; i++)
        {
            float v = SampleFrequency(freq, (i + 0.5f) * barW, w) / 255f;
            float bh = v * h;
            _fill.Color = ThemeColor(i, cols);
            c.DrawRect(i * barW, h - bh, Math.Max(1, barW - Scale), bh, _fill);
        }
    }

    private void DrawMirror(SKCanvas c, int w, int h, ReadOnlySpan<byte> freq)
    {
        int cols = Math.Max(1, (int)(w / (5 * Scale)));
        float barW = (float)w / cols;
        float mid = h / 2f, halfMax = mid - 4 * Scale;
        for (int i = 0; i < cols; i++)
        {
            float v = SampleFrequency(freq, (i + 0.5f) * barW, w) / 255f;
            float bh = v * halfMax;
            _fill.Color = ThemeColor(i, cols);
            float bw = Math.Max(1, barW - Scale);
            c.DrawRect(i * barW, mid - bh, bw, bh, _fill);
            c.DrawRect(i * barW, mid, bw, bh, _fill);
        }
    }

    private void DrawLed(SKCanvas c, int w, int h, ReadOnlySpan<byte> freq)
    {
        const int segments = 12;
        int cols = Math.Max(1, (int)(w / (8 * Scale)));
        float colW = (float)w / cols, segH = (float)h / segments, g = Scale;
        var off = SKColor.FromHsl(Theme.HueBase, Theme.Saturation, 28, (byte)(0.4 * 255));
        for (int i = 0; i < cols; i++)
        {
            float v = SampleFrequency(freq, (i + 0.5f) * colW, w) / 255f;
            int lit = (int)(v * segments);
            for (int s = 0; s < segments; s++)
            {
                bool on = s < lit;
                if (!on && _bare) continue;
                _fill.Color = on ? ThemeColor(i, cols, 0.85f) : off;
                float y = h - (s + 1) * segH;
                c.DrawRect(i * colW + g, y + g, colW - 2 * g, segH - 2 * g, _fill);
            }
        }
    }

    private void DrawSpectrum(SKCanvas c, int w, int h, ReadOnlySpan<byte> freq)
    {
        if (_ys.Length < w) _ys = new float[w];
        for (int x = 0; x < w; x++) _ys[x] = h - SampleFrequency(freq, x, w) / 255f * h * 0.92f;
        _path.Reset();
        _path.MoveTo(0, h);
        for (int x = 0; x < w; x++) _path.LineTo(x, _ys[x]);
        _path.LineTo(w, h);
        _path.Close();
        if (_bare)
        {
            _fill.Shader = null;
            _fill.Color = Theme.Accent;
        }
        else
        {
            _fill.Color = SKColors.White;
            _fill.Shader = SKShader.CreateLinearGradient(new SKPoint(0, 0), new SKPoint(0, h),
                [Theme.Accent.WithAlpha((byte)(0.55 * 255)), Theme.Accent.WithAlpha((byte)(0.02 * 255))],
                SKShaderTileMode.Clamp);
        }
        _fill.IsAntialias = true;
        c.DrawPath(_path, _fill);
        _fill.Shader?.Dispose();
        _fill.Shader = null;
        _fill.IsAntialias = false;

        _path.Reset();
        for (int x = 0; x < w; x++) { if (x == 0) _path.MoveTo(x, _ys[x]); else _path.LineTo(x, _ys[x]); }
        _stroke.StrokeWidth = 2 * Scale;
        _stroke.Color = Accent(0.9f);
        c.DrawPath(_path, _stroke);
    }

    private void DrawWave(SKCanvas c, int w, int h, ReadOnlySpan<byte> data)
    {
        int n = data.Length;
        if (n < 2) return;
        float slice = (float)w / n, mid = h / 2f;
        _path.Reset();
        for (int i = 0; i < n; i++)
        {
            float v = data[i] / 128f;
            float y = mid + (v - 1) * mid * 0.9f;
            if (i == 0) _path.MoveTo(0, y); else _path.LineTo(i * slice, y);
        }
        _stroke.StrokeWidth = 2 * Scale;
        _stroke.Color = Accent(0.85f);
        c.DrawPath(_path, _stroke);
    }

    private void DrawCircle(SKCanvas c, int w, int h, ReadOnlySpan<byte> freq)
    {
        float cx = w / 2f, cy = h / 2f;
        float radius = Math.Min(w, h) * 0.15f, maxBar = radius * 0.8f;
        int n = freq.Length;
        _stroke.StrokeWidth = 2 * Scale;
        for (int i = 0; i < n; i++)
        {
            double a = (double)i / n * Math.PI * 2 - Math.PI / 2;
            float bar = freq[i] / 255f * maxBar;
            float cos = (float)Math.Cos(a), sin = (float)Math.Sin(a);
            _stroke.Color = ThemeColor(i, n, 0.7f);
            c.DrawLine(cx + cos * radius, cy + sin * radius, cx + cos * (radius + bar), cy + sin * (radius + bar), _stroke);
        }
        if (_bare) return;
        _fill.Color = Theme.Accent.WithAlpha((byte)(0.1 * 255));
        _fill.IsAntialias = true;
        c.DrawCircle(cx, cy, radius * 0.3f, _fill);
        _fill.IsAntialias = false;
    }

    // ------------------------------------------------------------ waterfall

    private SKBitmap? _wf;
    private double _wfCarry;

    public void ResetWaterfall()
    {
        _wf?.Dispose();
        _wf = null;
        _wfCarry = 0;
    }

    /// <summary>Scrolls down one row per 1/60 s (as v2 at 60 fps), newest on top.</summary>
    private unsafe void DrawWaterfall(SKCanvas c, int w, int h, ReadOnlySpan<byte> freq, double dt)
    {
        if (_wf == null || _wf.Width != w || _wf.Height != h)
        {
            ResetWaterfall();
            _wf = new SKBitmap(new SKImageInfo(w, h, SKColorType.Bgra8888, SKAlphaType.Unpremul));
            _wf.Erase(_bare ? SKColors.Transparent : new SKColor(6, 12, 20));
        }
        _wfCarry += Math.Clamp(dt, 0, 0.25) * 60;
        int rows = (int)_wfCarry;
        _wfCarry -= rows;
        if (rows > 0)
        {
            rows = Math.Min(rows, h);
            byte* px = (byte*)_wf.GetPixels();
            int stride = _wf.RowBytes;
            Buffer.MemoryCopy(px, px + rows * stride, (long)(h - rows) * stride, (long)(h - rows) * stride);
            var acc = Theme.Accent;
            for (int x = 0; x < w; x++)
            {
                float v = SampleFrequency(freq, x, w) / 255f;
                byte r = (byte)Math.Min(255, acc.Red * v + 20), g = (byte)Math.Min(255, acc.Green * v + 30), b = (byte)Math.Min(255, acc.Blue * v + 40);
                byte a = _bare ? (v > 0.05f ? (byte)255 : (byte)0) : (byte)(180 + v * 75);
                for (int y = 0; y < rows; y++)
                {
                    byte* p = px + y * stride + x * 4;
                    p[0] = b; p[1] = g; p[2] = r; p[3] = a;
                }
            }
            _wf.NotifyPixelsChanged();
        }
        c.DrawBitmap(_wf, 0, 0);
    }

    public void Dispose()
    {
        ResetWaterfall();
        _fill.Dispose();
        _stroke.Dispose();
        _path.Dispose();
    }
}
