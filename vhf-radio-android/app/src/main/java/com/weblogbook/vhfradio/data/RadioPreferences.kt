package com.weblogbook.vhfradio.data

import android.content.Context

/** Device settings only. Credentials never enter this store. */
class RadioPreferences(context: Context) {
    private val preferences = context.getSharedPreferences("radio-preferences", Context.MODE_PRIVATE)

    fun position(landscape: Boolean): OverlayPosition {
        val key = if (landscape) "landscape" else "portrait"
        return OverlayPosition(preferences.getFloat("$key-x", 0f), preferences.getFloat("$key-y", 0.3f))
    }
    fun savePosition(landscape: Boolean, position: OverlayPosition) {
        val key = if (landscape) "landscape" else "portrait"
        preferences.edit().putFloat("$key-x", position.horizontal).putFloat("$key-y", position.vertical).apply()
    }
    fun volume() = RadioVolume.clamp(preferences.getFloat("receive-volume", RadioVolume.DEFAULT))
    fun saveVolume(volume: Float) { preferences.edit().putFloat("receive-volume", RadioVolume.clamp(volume)).apply() }
}

object RadioVolume {
    const val DEFAULT = 2f
    const val MAX = 3f
    fun clamp(value: Float) = if (value.isFinite()) value.coerceIn(0f, MAX) else DEFAULT
    // The static must remain below voices even when reception is amplified.
    fun effectLevel(value: Float) = clamp(value).coerceAtMost(1f)
}
