package com.weblogbook.vhfradio

import android.Manifest
import android.content.*
import android.content.pm.PackageManager
import android.net.Uri
import android.os.*
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import com.weblogbook.vhfradio.data.RadioControls.MicMode
import com.weblogbook.vhfradio.service.VhfOverlayService
import com.weblogbook.vhfradio.ui.*
import com.weblogbook.vhfradio.ui.theme.VHFRadioTheme

class MainActivity : ComponentActivity() {
    private var service by mutableStateOf<VhfOverlayService?>(null)
    private var bound = false
    private var pendingMode: MicMode? = null
    private var pendingOverlay = false
    private val micPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val requested = pendingMode; pendingMode = null
        if (granted && requested != null) service?.setMicMode(requested)
        else service?.message?.value = "Microphone refusé : tu peux toujours écouter la radio."
    }
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }
    private val overlayPermission = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        if (pendingOverlay && Settings.canDrawOverlays(this)) service?.showOverlay()
        else service?.message?.value = "Autorisation d'affichage nécessaire pour le PTT au-dessus de Roblox."
        pendingOverlay = false
    }
    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) { service = (binder as VhfOverlayService.LocalBinder).service }
        override fun onServiceDisconnected(name: ComponentName?) { service = null }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bound = bindService(Intent(this, VhfOverlayService::class.java), connection, BIND_AUTO_CREATE)
        setContent {
            VHFRadioTheme {
                val current = service
                if (current == null) CircularProgressIndicator()
                else {
                    val user by current.profile.collectAsState()
                    if (user == null) LoginScreen { profile, mode, token -> current.login(profile, mode, token) }
                    else RadioScreen(current,
                        onMicMode = ::selectMicMode,
                        onSwap = {
                            current.swap()
                            if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                        },
                        onOverlay = {
                            if (current.overlayVisible.value) current.hideOverlay()
                            else if (Settings.canDrawOverlays(this)) current.showOverlay()
                            else {
                                pendingOverlay = true
                                overlayPermission.launch(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
                            }
                        })
                }
            }
        }
    }
    private fun selectMicMode(mode: MicMode) {
        if (mode != MicMode.MUTED && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingMode = mode; micPermission.launch(Manifest.permission.RECORD_AUDIO)
        } else service?.setMicMode(mode)
    }
    override fun onStop() {
        service?.radio?.release("screen")
        super.onStop()
    }
    override fun onDestroy() {
        if (bound) unbindService(connection)
        bound = false; service = null
        super.onDestroy()
    }
}
