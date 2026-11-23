package com.weblogbook.vhfradio

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.weblogbook.vhfradio.cloudflare.CloudflareManager
import com.weblogbook.vhfradio.service.VhfOverlayService
import com.weblogbook.vhfradio.ui.LoginScreen
import com.weblogbook.vhfradio.ui.RadioMode
import com.weblogbook.vhfradio.ui.RadioScreen
import com.weblogbook.vhfradio.ui.UserProfile
import com.weblogbook.vhfradio.ui.theme.VHFRadioTheme

class MainActivity : ComponentActivity() {

    private var cloudflareManager: CloudflareManager? = null

    // Permission launchers
    private val requestMicPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (!granted) {
            Toast.makeText(this, "Le microphone est requis pour la radio VHF", Toast.LENGTH_LONG).show()
        }
    }

    private val requestNotifPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* optional */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Request permissions
        requestPermissions()

        setContent {
            VHFRadioTheme {
                AppContent()
            }
        }
    }

    override fun onDestroy() {
        cloudflareManager?.destroy()
        cloudflareManager = null
        // Stop overlay service
        stopService(Intent(this, VhfOverlayService::class.java))
        super.onDestroy()
    }

    @Composable
    private fun AppContent() {
        var screen by remember { mutableStateOf<AppScreen>(AppScreen.Login) }
        var profile by remember { mutableStateOf<UserProfile?>(null) }
        var mode by remember { mutableStateOf(RadioMode.PILOT) }
        var accessToken by remember { mutableStateOf("") }

        when (screen) {
            AppScreen.Login -> {
                LoginScreen { p, m, token ->
                    profile = p
                    mode = m
                    accessToken = token

                    // Initialize CloudflareManager
                    if (cloudflareManager == null) {
                        cloudflareManager = CloudflareManager(applicationContext)
                    }

                    screen = AppScreen.Radio
                }
            }

            AppScreen.Radio -> {
                val lkm = cloudflareManager
                val prof = profile
                if (lkm != null && prof != null) {
                    RadioScreen(
                        profile = prof,
                        mode = mode,
                        accessToken = accessToken,
                        cloudflareManager = lkm,
                        onLogout = {
                            lkm.disconnect()
                            stopService(Intent(this@MainActivity, VhfOverlayService::class.java))
                            profile = null
                            accessToken = ""
                            screen = AppScreen.Login
                        },
                        onStartOverlay = {
                            startOverlayService(lkm, mode)
                        }
                    )
                }
            }
        }
    }

    private fun requestPermissions() {
        // Microphone
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            requestMicPermission.launch(Manifest.permission.RECORD_AUDIO)
        }

        // Notifications (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                requestNotifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun startOverlayService(lkm: CloudflareManager, mode: RadioMode) {
        // Check overlay permission
        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(
                this,
                "Active la permission \"Affichage par-dessus d'autres applis\" pour la bulle PTT",
                Toast.LENGTH_LONG
            ).show()
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")
            )
            startActivity(intent)
            return
        }

        // Share the CloudflareManager with the service
        VhfOverlayService.sharedCloudflareManager = lkm
        VhfOverlayService.sharedIsLocked = mode != RadioMode.PILOT

        // Start the foreground service
        val serviceIntent = Intent(this, VhfOverlayService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }

        Toast.makeText(this, "Bulle PTT activée", Toast.LENGTH_SHORT).show()
    }

    private sealed class AppScreen {
        data object Login : AppScreen()
        data object Radio : AppScreen()
    }
}
