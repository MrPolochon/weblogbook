using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

// Reads only the selected PTT key. No keyboard hook, key log or input injection.
class PttKey {
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, IntPtr process);
    [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint thread);
    [DllImport("user32.dll")] static extern uint MapVirtualKeyEx(uint code, uint kind, IntPtr layout);
    static int Main(string[] args) {
        int key, parent;
        if (args.Length != 2 || !int.TryParse(args[1], out parent)) return 2;
        bool scan = args[0].StartsWith("scan:", StringComparison.Ordinal);
        if (!int.TryParse(scan ? args[0].Substring(5) : args[0], out key) ||
            (scan ? key < 2 || key > 86 : key < 8 || key > 254)) return 2;
        bool armed = false, previous = false;
        var clock = Stopwatch.StartNew();
        long last = -1000;
        try {
            using (var owner = Process.GetProcessById(parent)) {
                while (!owner.HasExited) {
                    // Resolve physical letter / number / punctuation keys using the foreground layout.
                    // This keeps the browser's KeyboardEvent.code aligned with Roblox on AZERTY too.
                    int virtualKey = scan ? (int)MapVirtualKeyEx((uint)key, 3,
                        GetKeyboardLayout(GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero))) : key;
                    bool held = virtualKey != 0 && (GetAsyncKeyState(virtualKey) & 0x8000) != 0;
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
