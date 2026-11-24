package com.weblogbook.vhfradio

import android.content.Context
import android.content.Intent
import android.content.ComponentName
import android.content.pm.ServiceInfo
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.ServiceTestRule
import com.weblogbook.vhfradio.data.RadioControls.MicMode
import com.weblogbook.vhfradio.service.VhfOverlayService
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RadioLifecycleTest {
    @get:Rule val services = ServiceTestRule()
    @Test fun recreationDoesNotDestroyBoundRadioAndOffNeverTransmits() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val binder = services.bindService(Intent(context, VhfOverlayService::class.java)) as VhfOverlayService.LocalBinder
        val service = binder.service
        ActivityScenario.launch(MainActivity::class.java).use { screen ->
            screen.onActivity {
                assertTrue(service.radio.receiveOnly.value)
                service.radio.setMicMode(MicMode.OPEN)
                service.radio.press("overlay")
                assertFalse(service.radio.isTransmitting.value)
            }
            screen.recreate()
            screen.onActivity {
                assertSame(service, binder.service)
                service.powerOff()
                assertFalse(service.radio.powered.value)
                assertFalse(service.radio.isTransmitting.value)
                assertEquals(MicMode.MUTED, service.radio.micMode.value)
            }
        }
    }
    @Test fun serviceDeclaresBothAudioForegroundTypes() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val info = context.packageManager.getServiceInfo(ComponentName(context, VhfOverlayService::class.java), 0)
        assertTrue(info.foregroundServiceType and ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE != 0)
        assertTrue(info.foregroundServiceType and ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK != 0)
        assertFalse(info.exported)
    }
}
