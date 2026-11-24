package com.weblogbook.vhfradio

import com.weblogbook.vhfradio.data.OverlayBounds
import com.weblogbook.vhfradio.data.OverlayPosition
import com.weblogbook.vhfradio.data.RadioVolume
import org.junit.Assert.*
import org.junit.Test

class OverlayPositionTest {
    @Test fun draggingBeyondAnyEdgeKeepsAllControlsInsideSafeArea() {
        val bounds = OverlayBounds.available(1080, 2400, 320, 560, 0, 80, 0, 100, 16)
        assertEquals(16 to 96, OverlayPosition.fromPixels(-500, -500, bounds, OverlayPosition()).pixels(bounds))
        assertEquals(744 to 1724, OverlayPosition.fromPixels(4000, 4000, bounds, OverlayPosition()).pixels(bounds))
    }
    @Test fun rightEdgeStaysReachableWhenMiniBubbleExpandsOrDisplayRotates() {
        val position = OverlayPosition(1f, 1f)
        val expanded = OverlayBounds.available(2400, 1080, 320, 560, 90, 0, 100, 60, 16)
        assertEquals(1964 to 444, position.pixels(expanded))
        val mini = OverlayBounds.available(1080, 2400, 112, 112, margin = 16)
        assertEquals(952 to 2272, position.pixels(mini))
    }
    @Test fun resizingPreservesTheChosenRelativePosition() {
        val portrait = OverlayBounds.available(1000, 2000, 200, 400)
        val saved = OverlayPosition.fromPixels(600, 400, portrait, OverlayPosition())
        assertEquals(1200 to 150, saved.pixels(OverlayBounds.available(2000, 1000, 400, 400)))
    }
    @Test fun tinyWindowsDoNotCrashOrOverwriteRememberedPosition() {
        val bounds = OverlayBounds.available(100, 100, 200, 400, margin = 8)
        val previous = OverlayPosition(1f, 0.6f)
        assertEquals(8 to 8, previous.pixels(bounds))
        assertEquals(previous, OverlayPosition.fromPixels(100, 100, bounds, previous))
    }
    @Test fun receiveGainBoostsVoiceWithoutAmplifyingStaticBeyondNormal() {
        assertEquals(2f, RadioVolume.DEFAULT, 0f)
        assertEquals(3f, RadioVolume.clamp(20f), 0f)
        assertEquals(0f, RadioVolume.clamp(-1f), 0f)
        assertEquals(2f, RadioVolume.clamp(Float.NaN), 0f)
        assertEquals(1f, RadioVolume.effectLevel(3f), 0f)
        assertEquals(0f, RadioVolume.effectLevel(0f), 0f)
    }
}
