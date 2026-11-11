using System.Runtime.InteropServices;
using KrakenMp3.Core;
using SkiaSharp;

namespace KrakenMp3.App;

/// <summary>
/// A transparent, click-through window over the docked player stack where
/// the particle effects are drawn (as v2's effects overlay). It is a raw Win32
/// layered window: each frame is drawn with SkiaSharp into a DIB section and
/// pushed with UpdateLayeredWindow — no WPF transparency, so it stays cheap.
/// Owned by the player, so it minimises and leaves the front with it.
/// </summary>
public sealed class ParticleOverlay : IDisposable
{
    private readonly IntPtr _hwnd;
    private readonly WndProcDelegate _proc; // keep alive for the window's lifetime
    private static ushort _classAtom;
    private static WndProcDelegate? _classProc;

    private IntPtr _memDc, _dib, _oldBmp, _bits;
    private int _w, _h;
    private PxRect _bounds;
    private bool _visible;

    public ParticleOverlay(IntPtr owner)
    {
        _proc = (h, m, w, l) => DefWindowProc(h, m, w, l);
        if (_classAtom == 0)
        {
            _classProc = _proc;
            var wc = new WNDCLASSEX
            {
                cbSize = Marshal.SizeOf<WNDCLASSEX>(),
                lpfnWndProc = Marshal.GetFunctionPointerForDelegate(_classProc),
                hInstance = GetModuleHandle(null),
                lpszClassName = "KrakenMp3ParticleOverlay",
            };
            _classAtom = RegisterClassEx(ref wc);
        }
        _hwnd = CreateWindowEx(WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW,
            "KrakenMp3ParticleOverlay", "Kraken effects", WS_POPUP, 0, 0, 1, 1, owner, IntPtr.Zero, GetModuleHandle(null), IntPtr.Zero);
    }

    public PxRect Bounds => _bounds;
    public bool Visible => _visible;

    /// <summary>Draws one frame at <paramref name="bounds"/> (screen pixels).</summary>
    public void Render(PxRect bounds, Action<SKCanvas, int, int> draw)
    {
        if (_hwnd == IntPtr.Zero || bounds.Width < 1 || bounds.Height < 1) return;
        _bounds = bounds;
        EnsureSurface(bounds.Width, bounds.Height);
        var info = new SKImageInfo(_w, _h, SKColorType.Bgra8888, SKAlphaType.Premul);
        using (var surface = SKSurface.Create(info, _bits, _w * 4))
        {
            surface.Canvas.Clear(SKColors.Transparent);
            draw(surface.Canvas, _w, _h);
            surface.Canvas.Flush();
        }
        var screen = GetDC(IntPtr.Zero);
        var dst = new POINT { X = bounds.Left, Y = bounds.Top };
        var size = new SIZE { cx = _w, cy = _h };
        var src = new POINT();
        var blend = new BLENDFUNCTION { BlendOp = 0, SourceConstantAlpha = 255, AlphaFormat = 1 };
        UpdateLayeredWindow(_hwnd, screen, ref dst, ref size, _memDc, ref src, 0, ref blend, 2 /* ULW_ALPHA */);
        ReleaseDC(IntPtr.Zero, screen);
        if (!_visible) Show(true);
    }

    public void Show(bool show)
    {
        if (_hwnd == IntPtr.Zero || _visible == show) return;
        _visible = show;
        ShowWindow(_hwnd, show ? 4 /* SW_SHOWNOACTIVATE */ : 0 /* SW_HIDE */);
    }

    /// <summary>Puts the overlay above the player's windows (topmost if they are).</summary>
    public void Raise(bool topmost)
    {
        if (_hwnd == IntPtr.Zero) return;
        SetWindowPos(_hwnd, topmost ? new IntPtr(-1) : IntPtr.Zero, 0, 0, 0, 0, 0x1 | 0x2 | 0x10 /* NOSIZE|NOMOVE|NOACTIVATE */);
        if (!topmost) SetWindowPos(_hwnd, new IntPtr(-2) /* NOTOPMOST */, 0, 0, 0, 0, 0x1 | 0x2 | 0x10);
    }

    private void EnsureSurface(int w, int h)
    {
        if (w == _w && h == _h && _bits != IntPtr.Zero) return;
        FreeSurface();
        _w = w; _h = h;
        var screen = GetDC(IntPtr.Zero);
        _memDc = CreateCompatibleDC(screen);
        ReleaseDC(IntPtr.Zero, screen);
        var bmi = new BITMAPINFOHEADER
        {
            biSize = Marshal.SizeOf<BITMAPINFOHEADER>(), biWidth = w, biHeight = -h, // top-down
            biPlanes = 1, biBitCount = 32,
        };
        _dib = CreateDIBSection(_memDc, ref bmi, 0, out _bits, IntPtr.Zero, 0);
        _oldBmp = SelectObject(_memDc, _dib);
    }

    private void FreeSurface()
    {
        if (_memDc != IntPtr.Zero)
        {
            SelectObject(_memDc, _oldBmp);
            DeleteObject(_dib);
            DeleteDC(_memDc);
        }
        _memDc = _dib = _oldBmp = _bits = IntPtr.Zero;
    }

    public void Dispose()
    {
        FreeSurface();
        if (_hwnd != IntPtr.Zero) DestroyWindow(_hwnd);
        GC.KeepAlive(_proc);
    }

    // ------------------------------------------------------------ native

    private delegate IntPtr WndProcDelegate(IntPtr h, uint m, IntPtr w, IntPtr l);
    private const int WS_EX_LAYERED = 0x80000, WS_EX_TRANSPARENT = 0x20, WS_EX_NOACTIVATE = 0x8000000, WS_EX_TOOLWINDOW = 0x80;
    private const uint WS_POPUP = 0x80000000;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WNDCLASSEX
    {
        public int cbSize; public uint style; public IntPtr lpfnWndProc; public int cbClsExtra, cbWndExtra;
        public IntPtr hInstance, hIcon, hCursor, hbrBackground; public string? lpszMenuName; public string lpszClassName; public IntPtr hIconSm;
    }
    [StructLayout(LayoutKind.Sequential)] private struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] private struct SIZE { public int cx, cy; }
    [StructLayout(LayoutKind.Sequential, Pack = 1)] private struct BLENDFUNCTION { public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat; }
    [StructLayout(LayoutKind.Sequential)]
    private struct BITMAPINFOHEADER
    {
        public int biSize, biWidth, biHeight; public short biPlanes, biBitCount; public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern ushort RegisterClassEx(ref WNDCLASSEX wc);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr CreateWindowEx(int exStyle, string cls, string name, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr inst, IntPtr param);
    [DllImport("user32.dll")] private static extern IntPtr DefWindowProc(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] private static extern bool DestroyWindow(IntPtr h);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] private static extern bool UpdateLayeredWindow(IntPtr h, IntPtr dstDc, ref POINT dst, ref SIZE size, IntPtr srcDc, ref POINT src, int key, ref BLENDFUNCTION blend, int flags);
    [DllImport("user32.dll")] private static extern IntPtr GetDC(IntPtr h);
    [DllImport("user32.dll")] private static extern int ReleaseDC(IntPtr h, IntPtr dc);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] private static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")] private static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateDIBSection(IntPtr dc, ref BITMAPINFOHEADER bmi, uint usage, out IntPtr bits, IntPtr section, uint offset);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandle(string? name);
}
