using SkiaSharp;

namespace KrakenMp3.Visuals;

public enum ArtMode { Off, Float, Bounce }

/// <summary>
/// The floating album art from v2 (styles.css .floating-album*):
/// 180 px, half-transparent, square, shadow + accent glow outside the box.
/// Float = centred, slow 3D spin (perspective 700, rotateY 0→360 over 14 s,
/// rotateX rocking 6°→−4°→6°). Bounce = drifts, bounces off the edges and
/// spins, with the same speeds as v2.
/// </summary>
public sealed class FloatingArt : IDisposable
{
    private const float Size = 180, Perspective = 700, SpinSeconds = 14;
    private SKImage? _image;
    private readonly SKPaint _paint = new() { IsAntialias = true };
    private readonly SKPaint _border = new() { IsAntialias = true, Style = SKPaintStyle.Stroke };
    private readonly SKPaint _glow = new() { IsAntialias = true };
    private readonly Random _rng = new();
    private double _time;

    // Bounce state, in CSS px.
    private float _x, _y, _vx, _vy, _rot, _vRot;
    private bool _bounceReady;

    public ArtMode Mode { get; set; } = ArtMode.Off;
    public float Scale { get; set; } = 1f;
    /// <summary>Draw fully opaque (key backgrounds) instead of v2's 50 %.</summary>
    public bool Opaque { get; set; }
    public SKColor Accent { get; set; } = new(59, 158, 190);

    public bool HasImage => _image != null;

    /// <summary>Takes ownership of the image (null clears it).</summary>
    public void SetImage(SKImage? image)
    {
        _image?.Dispose();
        _image = image;
        _bounceReady = false;
    }

    public void Draw(SKCanvas c, int w, int h, double dt)
    {
        if (Mode == ArtMode.Off || _image == null || w < 1 || h < 1) return;
        dt = dt <= 0 ? 0.016 : Math.Min(dt, 0.05); // v2: first frame 16 ms, cap 50 ms
        _time += dt;
        // Always 180 px, as in v2: in a window shorter than that the art keeps
        // to the top and bounces only sideways, clipped by the window edge.
        float s = Size * Scale;
        var rect = new SKRect(0, 0, s, s);

        c.Save();
        if (Mode == ArtMode.Float)
        {
            double phase = _time % SpinSeconds / SpinSeconds;           // 0..1
            double rotY = phase * 2 * Math.PI;
            // rotateX keyframes 6° → −4° → 6° (linear, like the CSS animation).
            double rotX = (phase < 0.5 ? 6 - 20 * phase : -4 + 20 * (phase - 0.5)) * Math.PI / 180;
            c.SetMatrix(Projection(w / 2f, h / 2f, s, rotY, rotX, Perspective * Scale));
        }
        else
        {
            StepBounce(w / Scale, h / Scale, (float)dt);
            // translate3d(x, y) rotate(rotZ) with the default centre origin.
            c.Translate(_x * Scale, _y * Scale);
            c.RotateDegrees(_rot, s / 2, s / 2);
        }

        if (!Opaque)
        {
            // box-shadow: 0 8px 28px rgba(0,0,0,.55), 0 0 16px accent-glow(.45).
            // A CSS box-shadow is painted only outside the box, so the bars
            // still show through the half-transparent cover.
            c.Save();
            c.ClipRect(rect, SKClipOperation.Difference, antialias: true);
            _glow.Color = SKColors.Black;
            _glow.ImageFilter = SKImageFilter.CreateDropShadowOnly(0, 8 * Scale, 14 * Scale, 14 * Scale, SKColors.Black.WithAlpha(140));
            c.DrawRect(rect, _glow);
            _glow.ImageFilter.Dispose();
            _glow.ImageFilter = SKImageFilter.CreateDropShadowOnly(0, 0, 8 * Scale, 8 * Scale, Accent.WithAlpha(115));
            c.DrawRect(rect, _glow);
            _glow.ImageFilter.Dispose();
            _glow.ImageFilter = null;
            c.Restore();
        }

        // img: object-fit cover, opacity .5, 1px rgba(0,200,255,.35) border,
        // square corners (v2 runs with theme-square: --radius-md = 0).
        byte alpha = Opaque ? (byte)255 : (byte)128;
        c.Save();
        c.ClipRect(rect, antialias: true);
        _paint.Color = SKColors.White.WithAlpha(alpha);
        _paint.FilterQuality = SKFilterQuality.High;
        c.DrawImage(_image, Cover(_image, rect), rect, _paint);
        c.Restore();
        if (!Opaque)
        {
            _border.StrokeWidth = Scale;
            _border.Color = new SKColor(0, 200, 255, (byte)(89 * alpha / 255));
            float half = Scale / 2;
            c.DrawRect(new SKRect(half, half, s - half, s - half), _border);
        }
        c.Restore();
    }

    /// <summary>object-fit: cover</summary>
    private static SKRect Cover(SKImage img, SKRect dest)
    {
        float k = Math.Max(dest.Width / img.Width, dest.Height / img.Height);
        float w = dest.Width / k, h = dest.Height / k;
        float x = (img.Width - w) / 2, y = (img.Height - h) / 2;
        return new SKRect(x, y, x + w, y + h); // source rect
    }

    /// <summary>CSS perspective(d) rotateY(ry) rotateX(rx) of an s×s square
    /// centred at (cx, cy), as a 2D projective matrix.</summary>
    public static SKMatrix Projection(float cx, float cy, float s, double ry, double rx, float d)
    {
        float cyA = (float)Math.Cos(ry), syA = (float)Math.Sin(ry);
        float cxA = (float)Math.Cos(rx), sxA = (float)Math.Sin(rx);
        // Local point (u, v, 0): rotateX then rotateY (CSS applies right to left).
        float a1 = cyA, a2 = sxA * syA;     // X = a1 u + a2 v
        float b1 = 0, b2 = cxA;             // Y = b1 u + b2 v
        float c1 = -syA, c2 = sxA * cyA;    // Z = c1 u + c2 v (towards the viewer)
        float p0 = -c1 / d, p1 = -c2 / d;   // w = 1 − Z/d
        var m = new SKMatrix
        {
            ScaleX = a1 + cx * p0, SkewX = a2 + cx * p1, TransX = cx,
            SkewY = b1 + cy * p0, ScaleY = b2 + cy * p1, TransY = cy,
            Persp0 = p0, Persp1 = p1, Persp2 = 1,
        };
        // Image space (0..s) → local (−s/2..s/2) first.
        return m.PreConcat(SKMatrix.CreateTranslation(-s / 2, -s / 2));
    }

    private void StepBounce(float w, float h, float dt)
    {
        float maxX = Math.Max(0, w - Size), maxY = Math.Max(0, h - Size);
        if (!_bounceReady)
        {
            _x = maxX * 0.5f;
            _y = maxY * 0.5f;
            _vx = (_rng.NextDouble() > 0.5 ? 1 : -1) * (70 + (float)_rng.NextDouble() * 40);
            _vy = (_rng.NextDouble() > 0.5 ? 1 : -1) * (55 + (float)_rng.NextDouble() * 35);
            _vRot = ((float)_rng.NextDouble() - 0.5f) * 55;
            _rot = 0;
            _bounceReady = true;
        }
        _x += _vx * dt;
        _y += _vy * dt;
        _rot += _vRot * dt;
        if (_x <= 0) { _x = 0; _vx = Math.Abs(_vx); _vRot = -_vRot; }
        else if (_x >= maxX) { _x = maxX; _vx = -Math.Abs(_vx); _vRot = -_vRot; }
        if (_y <= 0) { _y = 0; _vy = Math.Abs(_vy); }
        else if (_y >= maxY) { _y = maxY; _vy = -Math.Abs(_vy); }
    }

    public void Dispose()
    {
        _image?.Dispose();
        _paint.Dispose();
        _border.Dispose();
        _glow.Dispose();
    }
}
