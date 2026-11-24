package com.weblogbook.vhfradio

import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.FileProvider
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import com.weblogbook.vhfradio.data.OverlayPosition
import com.weblogbook.vhfradio.data.RadioPreferences
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class UpdateInstallTest {
    @Test fun providerOnlySharesThePrivateUpdatesDirectory() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val authority = "${context.packageName}.updates"
        val provider = context.packageManager.resolveContentProvider(authority, 0)!!
        assertFalse(provider.exported)
        assertTrue(provider.grantUriPermissions)
        val apk = File(context.cacheDir, "updates/update.apk")
        val uri = FileProvider.getUriForFile(context, authority, apk)
        assertEquals("content", uri.scheme)
        assertThrows(IllegalArgumentException::class.java) {
            FileProvider.getUriForFile(context, authority, File(context.filesDir, "private-account-data"))
        }
        val permissions = context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS).requestedPermissions.orEmpty()
        assertTrue(permissions.contains("android.permission.REQUEST_INSTALL_PACKAGES"))
        assertFalse(permissions.contains("android.permission.WRITE_EXTERNAL_STORAGE"))
    }

    @Test fun preservesDataAcrossSignedUpdate() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val preferences = context.getSharedPreferences("update-smoke-test", Context.MODE_PRIVATE)
        val radioPreferences = RadioPreferences(context)
        val expectedVersion = InstrumentationRegistry.getArguments().getString("verifyUpdate")?.toLongOrNull()
        if (expectedVersion != null) {
            assertEquals("keep-me", preferences.getString("marker", null))
            assertEquals(expectedVersion.toLong(), context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode)
            assertEquals(OverlayPosition(0.8f, 0.6f), radioPreferences.position(false))
            assertEquals(OverlayPosition(0.2f, 0.4f), radioPreferences.position(true))
            assertEquals(2.5f, radioPreferences.volume(), 0f)
        } else {
            assertTrue(preferences.edit().putString("marker", "keep-me").commit())
            assertTrue(context.getSharedPreferences("radio-preferences", Context.MODE_PRIVATE).edit().clear().commit())
            radioPreferences.savePosition(false, OverlayPosition(0.8f, 0.6f))
            assertEquals(OverlayPosition(0.8f, 0.6f), radioPreferences.position(true))
            radioPreferences.savePosition(true, OverlayPosition(0.2f, 0.4f))
            assertEquals(OverlayPosition(0.8f, 0.6f), radioPreferences.position(false))
            radioPreferences.saveVolume(2.5f)
        }
    }
}
