package com.weblogbook.vhfradio.data

/** All transmit entry points (screen, overlay and open mic) use this same gate. */
class RadioControls {
    enum class MicMode { MUTED, PTT, OPEN }
    var mode = MicMode.MUTED
        private set
    var ready = false
        private set
    private val held = mutableSetOf<String>()
    val transmitting: Boolean get() = ready && (mode == MicMode.OPEN || (mode == MicMode.PTT && held.isNotEmpty()))
    fun arm(connected: Boolean, canPublish: Boolean, microphoneReady: Boolean, requested: MicMode) {
        held.clear()
        ready = connected && canPublish && microphoneReady
        mode = if (ready) requested else MicMode.MUTED
    }
    fun press(source: String) { if (ready && mode == MicMode.PTT) held.add(source) }
    fun release(source: String) { held.remove(source) }
    fun reset() { held.clear(); ready = false; mode = MicMode.MUTED }
}

fun radioRetryDelay(attempt: Int): Long = when (attempt) { 0 -> 5_000L; 1 -> 10_000L; 2 -> 20_000L; else -> 30_000L }
