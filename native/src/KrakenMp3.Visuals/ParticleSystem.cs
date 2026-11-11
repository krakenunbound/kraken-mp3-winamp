using SkiaSharp;

namespace KrakenMp3.Visuals;

public enum ParticleEffect { None, Bubbles, Rain, Stars, Embers, Dust, Snow, Fireflies }

/// <summary>Particle colours per theme (v2 src/shared/uiThemes.js).</summary>
public sealed record ParticleTheme(float HueBase, float HueRange, float Saturation, SKColor Accent, SKColor BubbleHigh, SKColor Rain);

/// <summary>
/// Port of v2 src/shared/particleSystem.js: the seven ambient effects and the
/// track-change burst, with the same spawn rules, ranges and colours.
/// v2 moved some effects by a fixed amount per frame (it ran at 60 fps);
/// here every step is scaled by real elapsed time, so motion is identical at
/// any frame rate. Sizes and speeds are in v2 CSS px × <see cref="Scale"/>.
/// </summary>
public sealed class ParticleSystem : IDisposable
{
    private sealed class P
    {
        public float X, Y, Vx, Vy, Size, Speed, WobbleSpeed, WobbleAmp, WobbleOffset, Opacity;
        public float Length, TailLength, Brightness, Hue, Life, MaxLife, Decay, Rotation, RotationSpeed;
        public float TargetX, TargetY, GlowTimer, GlowIntensity = -1;
        public bool GlowOn;
        public SKColor Color;
    }

    private readonly List<P> _effect = [];
    private readonly List<P> _burst = [];
    private readonly Random _rng = new();
    private readonly SKPaint _fill = new() { IsAntialias = true, Style = SKPaintStyle.Fill };
    private readonly SKPaint _stroke = new() { IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeCap = SKStrokeCap.Round };
    private ParticleEffect _kind = ParticleEffect.Bubbles;
    private float _w = 500, _h = 600;

    public ParticleTheme Theme { get; set; } = Themes.Kraken;
    public float Scale { get; set; } = 1f;
    /// <summary>Multiplies every particle's opacity (1 = v2 look; up to 3 makes
    /// the see-through effects close to solid).</summary>
    public float Opacity { get; set; } = 1f;
    /// <summary>5–100.</summary>
    public int Quantity { get; private set; } = 25;
    /// <summary>1–20.</summary>
    public int Size { get; private set; } = 8;
    /// <summary>1–100.</summary>
    public int SpeedSetting { get; private set; } = 30;

    public ParticleEffect Effect
    {
        get => _kind;
        set
        {
            if (_kind == value) return;
            _kind = value;
            Respawn();
        }
    }

    public static class Themes
    {
        public static readonly ParticleTheme Kraken = new(190, 40, 80, new(59, 158, 190), new(120, 200, 255), new(150, 200, 255));
    }

    public static string Label(ParticleEffect e) => e == ParticleEffect.None ? "Off" : e.ToString();

    public bool IsIdle => _kind == ParticleEffect.None && _burst.Count == 0;

    /// <summary>Slider changes keep existing particles (no visible jump); the
    /// per-frame top-up grows into a larger quantity, excess is trimmed.</summary>
    public void SetSettings(int quantity, int size, int speed)
    {
        Quantity = Math.Clamp(quantity, 5, 100);
        Size = Math.Clamp(size, 1, 20);
        SpeedSetting = Math.Clamp(speed, 1, 100);
        if (_effect.Count > Quantity) _effect.RemoveRange(Quantity, _effect.Count - Quantity);
    }

    public void Resize(float w, float h)
    {
        bool first = _effect.Count == 0;
        _w = Math.Max(1, w);
        _h = Math.Max(1, h);
        if (first) Respawn();
    }

    public void Respawn()
    {
        _effect.Clear();
        if (_kind == ParticleEffect.None || _kind == ParticleEffect.Stars) return;
        for (int i = 0; i < Quantity; i++) _effect.Add(Create(randomY: true));
    }

    /// <summary>The burst from the centre that v2 plays on every track change.</summary>
    public void TriggerBurst()
    {
        for (int i = 0; i < 40; i++)
        {
            double a = _rng.NextDouble() * Math.PI * 2;
            float speed = (float)(_rng.NextDouble() * 200 + 80) * Scale;
            float hue = Theme.HueBase + (float)_rng.NextDouble() * Theme.HueRange;
            _burst.Add(new P
            {
                X = _w / 2, Y = _h / 2,
                Vx = (float)Math.Cos(a) * speed, Vy = (float)Math.Sin(a) * speed,
                Size = ((float)_rng.NextDouble() * 5 + 2) * Scale,
                Color = SKColor.FromHsl(hue % 360, 80, 60),
                Life = 1, Decay = (float)_rng.NextDouble() * 0.015f + 0.01f,
            });
        }
    }

    private float R() => (float)_rng.NextDouble();

    private P Create(bool randomY)
    {
        float sizeScale = Size / 10f * Scale, speedScale = SpeedSetting / 50f * Scale;
        switch (_kind)
        {
            case ParticleEffect.Bubbles:
                return new P
                {
                    X = R() * _w, Y = randomY ? R() * _h : _h + 20 * Scale,
                    Size = (R() * 8 + 4) * sizeScale, Speed = (R() * 20 + 15) * speedScale,
                    WobbleSpeed = R() * 2 + 1, WobbleAmp = (R() * 25 + 10) * Scale, WobbleOffset = R() * MathF.PI * 2,
                    Opacity = R() * 0.4f + 0.2f,
                };
            case ParticleEffect.Rain:
                return new P
                {
                    X = R() * _w, Y = randomY ? R() * _h : -20 * Scale,
                    Length = (R() * 15 + 10) * sizeScale, Speed = (R() * 300 + 200) * speedScale,
                    Opacity = R() * 0.5f + 0.3f,
                };
            case ParticleEffect.Stars:
            {
                // Shooting stars: from the top or sides of the top 70 %, toward the centre.
                float buffer = 50 * Scale, sky = _h * 0.7f, sx, sy;
                switch (_rng.Next(3))
                {
                    case 0: sx = R() * _w; sy = -buffer; break;
                    case 1: sx = -buffer; sy = R() * sky; break;
                    default: sx = _w + buffer; sy = R() * sky; break;
                }
                float dx = _w / 2 - sx, dy = _h / 2 - sy, dist = MathF.Sqrt(dx * dx + dy * dy);
                float duration = 0.6f + R() * 0.4f;
                float perFrame = dist / (duration * 60);
                float life = MathF.Ceiling(dist / perFrame) + 25;
                return new P
                {
                    X = sx, Y = sy,
                    // v2 moved these per frame at 60 fps: store px/s.
                    Vx = dx / dist * perFrame * 60 * (SpeedSetting / 50f), Vy = dy / dist * perFrame * 60 * (SpeedSetting / 50f),
                    TailLength = (60 + R() * 80) * Scale, Life = life, MaxLife = life,
                    Brightness = 0.8f + R() * 0.2f, Size = (1 + R()) * sizeScale,
                };
            }
            case ParticleEffect.Embers:
                return new P
                {
                    X = R() * _w, Y = randomY ? R() * _h : _h + 20 * Scale,
                    Size = (R() * 2 + 1) * sizeScale, Speed = (R() * 8 + 5) * speedScale,
                    WobbleSpeed = R() * 1.5f + 0.5f, WobbleAmp = (R() * 20 + 10) * Scale, WobbleOffset = R() * MathF.PI * 2,
                    Hue = R() * 40 + 10, Life = 1, Decay = 0.0003f + R() * 0.0003f,
                };
            case ParticleEffect.Dust:
                return new P
                {
                    X = R() * _w, Y = R() * _h,
                    Size = (R() * 1.5f + 0.5f) * sizeScale,
                    Vx = (R() - 0.5f) * 6 * speedScale, Vy = (R() - 0.5f) * 4 * speedScale,
                    WobbleSpeed = R() * 0.3f + 0.1f, WobbleOffset = R() * MathF.PI * 2,
                    Opacity = R() * 0.2f + 0.05f,
                };
            case ParticleEffect.Snow:
                return new P
                {
                    X = R() * _w, Y = randomY ? R() * _h : -20 * Scale,
                    Size = (R() * 3 + 2) * sizeScale, Speed = (R() * 15 + 10) * speedScale,
                    WobbleSpeed = R() * 1.5f + 0.5f, WobbleAmp = (R() * 20 + 10) * Scale, WobbleOffset = R() * MathF.PI * 2,
                    Rotation = R() * MathF.PI * 2, RotationSpeed = (R() - 0.5f) * 0.5f,
                    Opacity = R() * 0.6f + 0.4f,
                };
            case ParticleEffect.Fireflies:
                return new P
                {
                    X = R() * _w, Y = R() * _h,
                    Size = (R() * 2 + 1) * sizeScale,
                    Vx = (R() - 0.5f) * 5 * speedScale, Vy = (R() - 0.5f) * 5 * speedScale,
                    TargetX = R() * _w, TargetY = R() * _h,
                    GlowOn = R() > 0.5f, GlowTimer = R() * 3,
                };
            default:
                return new P();
        }
    }

    // Key-safe drawing: inside a layer, alpha is pushed up hard (a' = 10a − 1)
    // so anything above ~10 % opacity becomes solid and faint halos drop out.
    private static readonly SKPaint SolidLayer = new()
    {
        ColorFilter = SKColorFilter.CreateColorMatrix(
        [
            1, 0, 0, 0, 0,
            0, 1, 0, 0, 0,
            0, 0, 1, 0, 0,
            0, 0, 0, 10, -1f,
        ]),
    };

    /// <summary>Like <see cref="Tick"/>, but every particle comes out solid, for
    /// chroma/luma-key backgrounds: a key removes see-through pixels together
    /// with the background, so translucent particles would mostly vanish.</summary>
    public void TickSolid(SKCanvas c, float dt, double now)
    {
        c.SaveLayer(SolidLayer);
        Tick(c, dt, now);
        c.Restore();
    }

    /// <summary>Advances and draws one frame. <paramref name="now"/> in seconds.</summary>
    public void Tick(SKCanvas c, float dt, double now)
    {
        dt = Math.Clamp(dt, 0, 0.1f);
        float f60 = dt * 60; // v2 per-frame steps
        if (_kind != ParticleEffect.None)
        {
            for (int i = _effect.Count - 1; i >= 0; i--)
            {
                var p = _effect[i];
                switch (_kind)
                {
                    case ParticleEffect.Bubbles: Bubble(c, p, i, (float)now, f60); break;
                    case ParticleEffect.Rain: Rain(c, p, i, dt); break;
                    case ParticleEffect.Stars: Star(c, p, i, dt, f60); break;
                    case ParticleEffect.Embers: Ember(c, p, i, dt, (float)now, f60); break;
                    case ParticleEffect.Dust: Dust(c, p, dt, (float)now); break;
                    case ParticleEffect.Snow: Snow(c, p, i, dt, (float)now); break;
                    case ParticleEffect.Fireflies: Firefly(c, p, dt); break;
                }
            }
            if (_kind == ParticleEffect.Stars)
            {
                // Rare, occasional: 0.3 % per 60 fps frame, scaled by quantity.
                double chance = 0.003 * (Quantity / 50.0) * f60;
                if (_rng.NextDouble() < chance) _effect.Add(Create(false));
            }
            else
            {
                while (_effect.Count < Quantity) _effect.Add(Create(false));
            }
        }
        Bursts(c, dt, f60);
    }

    private void Bubble(SKCanvas c, P p, int i, float now, float f60)
    {
        p.Y -= p.Speed * 0.016f * f60;
        p.X += MathF.Sin(now * p.WobbleSpeed + p.WobbleOffset) * p.WobbleAmp * 0.016f * f60;
        var hi = Theme.BubbleHigh; var ac = Theme.Accent;
        using var shader = SKShader.CreateTwoPointConicalGradient(
            new SKPoint(p.X - p.Size * 0.3f, p.Y - p.Size * 0.3f), 0, new SKPoint(p.X, p.Y), p.Size,
            [hi.WithAlpha(A(p.Opacity)), ac.WithAlpha(A(p.Opacity * 0.5f)), ac.WithAlpha(A(p.Opacity * 0.1f))],
            [0, 0.5f, 1], SKShaderTileMode.Clamp);
        _fill.Shader = shader;
        c.DrawCircle(p.X, p.Y, p.Size, _fill);
        _fill.Shader = null;
        _fill.Color = SKColors.White.WithAlpha(A(p.Opacity * 0.7f));
        c.DrawCircle(p.X - p.Size * 0.3f, p.Y - p.Size * 0.3f, p.Size * 0.3f, _fill);
        if (p.Y + p.Size < -10 * Scale) _effect[i] = Create(false);
    }

    private void Rain(SKCanvas c, P p, int i, float dt)
    {
        p.Y += p.Speed * dt;
        _stroke.StrokeWidth = Scale;
        _stroke.StrokeCap = SKStrokeCap.Butt;
        _stroke.Color = Theme.Rain.WithAlpha(A(p.Opacity));
        c.DrawLine(p.X, p.Y, p.X + Scale, p.Y + p.Length, _stroke);
        if (p.Y > _h + p.Length) _effect[i] = Create(false);
    }

    private void Star(SKCanvas c, P p, int i, float dt, float f60)
    {
        p.X += p.Vx * dt;
        p.Y += p.Vy * dt;
        p.Life -= f60;
        float edge = 300 * Scale;
        if (p.Life <= 0 || p.X < -edge || p.X > _w + edge || p.Y < -edge || p.Y > _h + edge) { _effect.RemoveAt(i); return; }
        float alpha = p.Life / p.MaxLife;
        float speed = MathF.Sqrt(p.Vx * p.Vx + p.Vy * p.Vy);
        if (speed <= 0) return;
        float k = p.TailLength / speed;
        _stroke.StrokeCap = SKStrokeCap.Round;
        _stroke.StrokeWidth = (2 + alpha) * Scale;
        _stroke.Color = SKColors.White.WithAlpha(A(alpha * p.Brightness));
        c.DrawLine(p.X, p.Y, p.X - p.Vx * k, p.Y - p.Vy * k, _stroke);
    }

    private void Ember(SKCanvas c, P p, int i, float dt, float now, float f60)
    {
        p.Y -= p.Speed * dt;
        p.X += MathF.Sin(now * p.WobbleSpeed + p.WobbleOffset) * p.WobbleAmp * dt * 0.5f;
        p.Life -= p.Decay * f60;
        if (p.Life <= 0 || p.Y < -20 * Scale) { _effect[i] = Create(false); return; }
        float flicker = 0.6f + MathF.Sin(now * 8 + p.WobbleOffset) * 0.2f + MathF.Sin(now * 13 + p.WobbleOffset * 2) * 0.2f;
        _fill.Color = SKColor.FromHsl(p.Hue, 100, 50, A(p.Life * flicker * 0.15f));
        c.DrawCircle(p.X, p.Y, p.Size * 3, _fill);
        _fill.Color = SKColor.FromHsl(p.Hue + 10, 100, 60, A(p.Life * flicker * 0.4f));
        c.DrawCircle(p.X, p.Y, p.Size * 1.5f, _fill);
        _fill.Color = SKColor.FromHsl(p.Hue + 30, 100, 85, A(p.Life * flicker));
        c.DrawCircle(p.X, p.Y, p.Size * 0.6f, _fill);
    }

    private void Dust(SKCanvas c, P p, float dt, float now)
    {
        float wobble = MathF.Sin(now * p.WobbleSpeed + p.WobbleOffset);
        p.X += (p.Vx + wobble * 2 * Scale) * dt;
        p.Y += (p.Vy + wobble * Scale) * dt;
        float m = 10 * Scale;
        if (p.X < -m) p.X = _w + m;
        if (p.X > _w + m) p.X = -m;
        if (p.Y < -m) p.Y = _h + m;
        if (p.Y > _h + m) p.Y = -m;
        float fade = 0.8f + MathF.Sin(now * 0.5f + p.WobbleOffset) * 0.2f;
        _fill.Color = new SKColor(220, 215, 200, A(p.Opacity * fade));
        c.DrawCircle(p.X, p.Y, p.Size, _fill);
    }

    private void Snow(SKCanvas c, P p, int i, float dt, float now)
    {
        p.Y += p.Speed * dt;
        p.X += MathF.Sin(now * p.WobbleSpeed + p.WobbleOffset) * p.WobbleAmp * dt * 0.3f;
        p.Rotation += p.RotationSpeed * dt;
        if (p.Y > _h + p.Size) { _effect[i] = Create(false); return; }
        c.Save();
        c.Translate(p.X, p.Y);
        c.RotateRadians(p.Rotation);
        _stroke.StrokeCap = SKStrokeCap.Round;
        _stroke.StrokeWidth = Math.Max(0.5f, p.Size * 0.15f);
        _stroke.Color = SKColors.White.WithAlpha(A(p.Opacity));
        for (int k = 0; k < 6; k++)
        {
            c.Save();
            c.RotateRadians(k * MathF.PI / 3);
            c.DrawLine(0, 0, 0, -p.Size, _stroke);
            c.DrawLine(0, -p.Size * 0.4f, p.Size * 0.25f, -p.Size * 0.6f, _stroke);
            c.DrawLine(0, -p.Size * 0.4f, -p.Size * 0.25f, -p.Size * 0.6f, _stroke);
            c.Restore();
        }
        _fill.Color = SKColors.White.WithAlpha(A(p.Opacity));
        c.DrawCircle(0, 0, p.Size * 0.1f, _fill);
        c.Restore();
    }

    private void Firefly(SKCanvas c, P p, float dt)
    {
        float dx = p.TargetX - p.X, dy = p.TargetY - p.Y, dist = MathF.Sqrt(dx * dx + dy * dy);
        if (dist < 30 * Scale) { p.TargetX = R() * _w; p.TargetY = R() * _h; }
        if (dist > 0) { p.Vx += dx / dist * 5 * dt * Scale; p.Vy += dy / dist * 5 * dt * Scale; }
        float damp = MathF.Pow(0.95f, dt * 60);
        p.Vx *= damp;
        p.Vy *= damp;
        p.X += p.Vx * dt * 20;
        p.Y += p.Vy * dt * 20;
        p.GlowTimer -= dt;
        if (p.GlowTimer <= 0) { p.GlowOn = !p.GlowOn; p.GlowTimer = 1 + R() * 3; }
        if (p.GlowIntensity < 0) p.GlowIntensity = p.GlowOn ? 1 : 0;
        p.GlowIntensity += ((p.GlowOn ? 1 : 0) - p.GlowIntensity) * dt * 3;
        if (p.GlowIntensity < 0.02f) return;
        float g = p.GlowIntensity;
        _fill.Color = new SKColor(180, 255, 80, A(g * 0.1f));
        c.DrawCircle(p.X, p.Y, p.Size * 5, _fill);
        _fill.Color = new SKColor(200, 255, 120, A(g * 0.3f));
        c.DrawCircle(p.X, p.Y, p.Size * 2.5f, _fill);
        _fill.Color = new SKColor(255, 255, 180, A(g * 0.9f));
        c.DrawCircle(p.X, p.Y, p.Size, _fill);
    }

    private void Bursts(SKCanvas c, float dt, float f60)
    {
        for (int i = _burst.Count - 1; i >= 0; i--)
        {
            var p = _burst[i];
            p.X += p.Vx * dt;
            p.Y += p.Vy * dt;
            p.Vy += 80 * Scale * dt;
            p.Vx *= MathF.Pow(0.98f, f60);
            p.Life -= p.Decay * f60;
            if (p.Life <= 0) { _burst.RemoveAt(i); continue; }
            _fill.Color = p.Color.WithAlpha(A(p.Life));
            c.DrawCircle(p.X, p.Y, p.Size * p.Life, _fill);
        }
    }

    private byte A(float a) => (byte)Math.Clamp(a * Opacity * 255, 0, 255);

    public void Dispose()
    {
        _fill.Dispose();
        _stroke.Dispose();
    }
}
