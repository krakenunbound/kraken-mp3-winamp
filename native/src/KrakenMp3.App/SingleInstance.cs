using System.IO;
using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;

namespace KrakenMp3.App;

/// <summary>
/// One player per user session. A second launch (for example double-clicking
/// a song in Explorer) hands its file arguments to the running player over a
/// named pipe and exits.
/// </summary>
public sealed class SingleInstance : IDisposable
{
    private readonly string _name;
    private readonly Mutex _mutex;
    private readonly CancellationTokenSource _cts = new();

    public bool IsFirst { get; }

    /// <summary>Raised on a worker thread with the other instance's arguments.</summary>
    public event Action<string[]>? ArgumentsReceived;

    public SingleInstance(string appId)
    {
        var user = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Environment.UserDomainName + "\\" + Environment.UserName)))[..16];
        _name = $"{appId}-{user}-{System.Diagnostics.Process.GetCurrentProcess().SessionId}";
        _mutex = new Mutex(true, @"Local\" + _name, out bool created);
        IsFirst = created;
        if (IsFirst) Task.Run(ListenLoop);
    }

    /// <summary>Sends arguments to the running instance. Returns false if it
    /// could not be reached (then this process should just carry on).</summary>
    public bool SendToFirst(string[] args)
    {
        try
        {
            using var client = new NamedPipeClientStream(".", _name, PipeDirection.Out);
            client.Connect(3000);
            using var w = new StreamWriter(client, new UTF8Encoding(false));
            foreach (var a in args) w.WriteLine(Path.GetFullPath(a));
            w.WriteLine(); // empty line = end (also means "just come to the front")
            w.Flush();
            return true;
        }
        catch (Exception) { return false; }
    }

    private async Task ListenLoop()
    {
        while (!_cts.IsCancellationRequested)
        {
            try
            {
                await using var server = new NamedPipeServerStream(_name, PipeDirection.In, 1,
                    PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                await server.WaitForConnectionAsync(_cts.Token);
                using var r = new StreamReader(server, Encoding.UTF8);
                var args = new List<string>();
                string? line;
                while ((line = await r.ReadLineAsync(_cts.Token)) is { Length: > 0 }) args.Add(line);
                ArgumentsReceived?.Invoke(args.ToArray());
            }
            catch (OperationCanceledException) { return; }
            catch (Exception) { await Task.Delay(200); }
        }
    }

    public void Dispose()
    {
        _cts.Cancel();
        if (IsFirst) { try { _mutex.ReleaseMutex(); } catch (ApplicationException) { } }
        _mutex.Dispose();
    }
}
