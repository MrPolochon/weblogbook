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
import androidx.compose.foundation.layout.*
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.Lifecycle
import com.weblogbook.vhfradio.update.UpdateViewModel
import com.weblogbook.vhfradio.data.RadioControls.MicMode
import com.weblogbook.vhfradio.service.VhfOverlayService
import com.weblogbook.vhfradio.ui.*
import com.weblogbook.vhfradio.ui.theme.VHFRadioTheme

class MainActivity : ComponentActivity() {
    private val updater by lazy { ViewModelProvider(this)[UpdateViewModel::class.java] }
    private val installPermission = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        if (packageManager.canRequestPackageInstalls()) installUpdate()
        else updater.message("Installation non autorisée. Tu peux réessayer depuis le bouton Installer.")
    }
    private val installer = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        updater.message("Si l'installation a été annulée, tu peux la relancer avec Installer.")
    }
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
        updater.check(automatic = true)
        setContent {
            VHFRadioTheme {
                val current = service
                val updateState by updater.state.collectAsState()
                val powered = if (current == null) false else current.radio.powered.collectAsState().value
                Column(Modifier.fillMaxSize().safeDrawingPadding()) {
                Box(Modifier.weight(1f)) {
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
                UpdatePanel(updateState, powered, { updater.check() }, { updater.download() }, ::installUpdate)
                }
            }
        }
    }
    private fun installUpdate() {
        if (service?.radio?.powered?.value == true) {
            updater.message("Éteins la radio avec OFF avant d'installer la mise à jour.")
            return
        }
        if (!packageManager.canRequestPackageInstalls()) {
            try { installPermission.launch(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))) }
            catch (_: Exception) { updater.message("Impossible d'ouvrir les autorisations d'installation Android.") }
            return
        }
        updater.prepareInstallation { file ->
            // Recheck after disk verification or a round-trip through Android settings.
            if (service?.radio?.powered?.value == true || !lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
                updater.message("Reviens ici et éteins la radio avant d'installer.")
            } else try {
                val uri = FileProvider.getUriForFile(this, "$packageName.updates", file)
                installer.launch(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).apply { clipData = ClipData.newRawUri("VHF Radio", uri) })
            } catch (_: Exception) { updater.message("Impossible d'ouvrir l'installateur Android. Réessaie.") }
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
