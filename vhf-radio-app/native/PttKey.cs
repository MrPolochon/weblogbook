using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

// Reads only the selected PTT key. No keyboard hook, key log or input injection.
class PttKey {
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    static int Main(string[] args) {
        int key, parent;
        if (args.Length != 2 || !int.TryParse(args[0], out key) || !int.TryParse(args[1], out parent) ||
            (key != 32 && key != 163 && key != 86)) return 2;
        bool armed = false, previous = false;
        var clock = Stopwatch.StartNew();
        long last = -1000;
        try {
            using (var owner = Process.GetProcessById(parent)) {
                while (!owner.HasExited) {
                    bool held = (GetAsyncKeyState(key) & 0x8000) != 0;
                    if (!held) armed = true; // Never transmit a key held before arming.
                    bool down = armed && held;
                    if (down != previous || clock.ElapsedMilliseconds - last >= 50) {
                        Console.WriteLine(down ? "1" : "0"); Console.Out.Flush();
                        previous = down; last = clock.ElapsedMilliseconds;
                    }
                    Thread.Sleep(10);
                }
            }
        } catch { return 1; }
        return 0;
    }
}
