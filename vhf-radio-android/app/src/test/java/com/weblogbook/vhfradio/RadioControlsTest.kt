package com.weblogbook.vhfradio

import com.weblogbook.vhfradio.data.*
import com.weblogbook.vhfradio.data.RadioControls.MicMode
import org.junit.Assert.*
import org.junit.Test

class RadioControlsTest {
    @Test fun observerNeverTransmits() {
        for (mode in MicMode.entries) {
            val controls = RadioControls()
            controls.arm(true, false, true, mode); controls.press("overlay")
            assertFalse(controls.transmitting)
        }
    }
    @Test fun microphonePermissionAndConnectionAreRequired() {
        for ((connected, microphone) in listOf(false to true, true to false, false to false)) {
            val controls = RadioControls()
            controls.arm(connected, true, microphone, MicMode.OPEN)
            assertFalse(controls.transmitting)
        }
    }
    @Test fun releaseAndCancelCloseOnlyTheirOwnPress() {
        val controls = RadioControls()
        controls.arm(true, true, true, MicMode.PTT)
        controls.press("screen"); controls.press("overlay"); controls.release("screen")
        assertTrue(controls.transmitting)
        controls.release("overlay"); assertFalse(controls.transmitting)
    }
    @Test fun networkLossAndLockNeverRestoreHeldPttOrOpenMicrophone() {
        for (mode in listOf(MicMode.PTT, MicMode.OPEN)) {
            val controls = RadioControls()
            controls.arm(true, true, true, mode); controls.press("overlay")
            assertTrue(controls.transmitting)
            controls.reset(); assertFalse(controls.transmitting)
            controls.arm(true, true, true, MicMode.PTT)
            assertFalse(controls.transmitting)
            controls.release("overlay"); assertFalse(controls.transmitting)
        }
    }
    @Test fun mutePreventsStalePress() {
        val controls = RadioControls()
        controls.arm(true, true, true, MicMode.PTT); controls.press("screen")
        controls.arm(true, true, true, MicMode.MUTED); controls.press("screen")
        assertFalse(controls.transmitting)
    }
    @Test fun retriesContinueWithBoundedDelay() {
        assertEquals(listOf(5000L,10000L,20000L,30000L), (0..3).map(::radioRetryDelay))
        assertEquals(30000L, radioRetryDelay(10000))
    }
    @Test fun aviationChannelsMatchWebsite() {
        assertEquals(3040, VhfFrequencies.TOTAL_FREQUENCIES)
        assertTrue(VhfFrequencies.isValid("136.990"))
        for (frequency in listOf("210.000","117.990","137.000","118.020","118.045")) assertFalse(VhfFrequencies.isValid(frequency))
        assertEquals("121.025", VhfFrequencies.step("121.015", false, 1))
        assertEquals("121.000", VhfFrequencies.step("121.990", false, 1))
        assertEquals("118.990", VhfFrequencies.step("136.990", true, 1))
    }
}
