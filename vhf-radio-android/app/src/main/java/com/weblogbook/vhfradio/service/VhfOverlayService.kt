package com.weblogbook.vhfradio.service

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.*
import android.provider.Settings
import android.view.*
import android.widget.*
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.weblogbook.vhfradio.MainActivity
import com.weblogbook.vhfradio.R
import com.weblogbook.vhfradio.cloudflare.CloudflareManager
import com.weblogbook.vhfradio.data.*
import com.weblogbook.vhfradio.data.RadioControls.MicMode
import com.weblogbook.vhfradio.ui.RadioMode
import com.weblogbook.vhfradio.ui.UserProfile
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

/** Owns the connection. Recreating or backgrounding the Activity does not own its lifetime. */
class VhfOverlayService : Service() {
    companion object {
        private const val CHANNEL = "vhf-radio"
        private const val NOTIFICATION = 5101
        const val ACTION_OFF = "com.weblogbook.vhfradio.OFF"
        const val ACTION_MUTE = "com.weblogbook.vhfradio.MUTE"
    }
    inner class LocalBinder : Binder() { val service get() = this@VhfOverlayService }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    lateinit var radio: CloudflareManager
        private set
    val profile = MutableStateFlow<UserProfile?>(null)
    val mode = MutableStateFlow(RadioMode.PILOT)
    val standby = MutableStateFlow("118.000")
    val position = MutableStateFlow("")
    val positionAllowed = MutableStateFlow(true)
    val message = MutableStateFlow<String?>(null)
    val overlayVisible = MutableStateFlow(false)
    private var token = ""
    private var positionJob: Job? = null
    private var foreground = false
    private var microphoneForeground = false
    private var bubble: View? = null
    private var bubbleParams: WindowManager.LayoutParams? = null
    private val windows by lazy { getSystemService(WINDOW_SERVICE) as WindowManager }
    private val audio by lazy { getSystemService(AUDIO_SERVICE) as AudioManager }
    private var selectedOutput: Int? = null
    private val audioDevices = object : AudioDeviceCallback() {
        override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) {
            // Never continue an open microphone after a headset is unplugged.
            if (removed.any { it.isSource || it.id == selectedOutput }) {
                radio.mute()
                if (removed.any { it.id == selectedOutput }) clearAudioOutput()
                if (radio.powered.value) message.value = "Casque déconnecté : micro coupé. Réactive PTT pour parler."
            }
        }
    }
    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            radio.mute()
            message.value = "Micro coupé : réactive le mode PTT après le verrouillage."
        }
    }
    override fun onCreate() {
        super.onCreate()
        radio = CloudflareManager(applicationContext)
        audio.registerAudioDeviceCallback(audioDevices, Handler(Looper.getMainLooper()))
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Radio VHF", NotificationManager.IMPORTANCE_LOW)
        )
        ContextCompat.registerReceiver(this, screenReceiver, IntentFilter(Intent.ACTION_SCREEN_OFF), ContextCompat.RECEIVER_NOT_EXPORTED)
        scope.launch {
            combine(radio.connectionState, radio.isTransmitting, radio.receiveOnly, radio.micMode, radio.powered) { _, _, _, _, _ -> Unit }
                .collect { renderBubble(); if (foreground) notifyState() }
        }
    }
    override fun onBind(intent: Intent?) = LocalBinder()
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_OFF -> powerOff()
            ACTION_MUTE -> radio.mute()
            else -> if (radio.powered.value) promote(microphoneForeground) else stopSelf(startId)
        }
        // A killed process never resurrects credentials, a held PTT or an open microphone.
        return START_NOT_STICKY
    }
    fun login(user: UserProfile, selectedMode: RadioMode, accessToken: String) {
        powerOff()
        profile.value = user; mode.value = selectedMode; token = accessToken
        positionAllowed.value = selectedMode == RadioMode.PILOT
        positionJob?.cancel()
        if (selectedMode != RadioMode.PILOT) positionJob = scope.launch {
            while (isActive) {
                val result = ApiClient.checkSession(if (selectedMode == RadioMode.ATC) "atc" else "afis", token)
                val session = result.getOrNull()
                val allowed = session?.session != null && session.noSession == false
                val name = session?.session?.let { (it.aeroport ?: "") + " · " + (it.position ?: "") } ?: ""
                if (name != position.value) radio.mute()
                position.value = name
                positionAllowed.value = allowed
                if (!allowed) {
                    if (radio.powered.value) powerOff()
                    message.value = if (result.isFailure) "Vérification de la position impossible." else "Connecte-toi à une position sur le site pour utiliser la radio ATC."
                } else message.value = null
                delay(15_000)
            }
        }
    }
    fun logout() {
        powerOff(); positionJob?.cancel(); positionJob = null
        ApiClient.clearTokens(); token = ""; profile.value = null; position.value = ""
    }
    fun swap() {
        val next = standby.value.trim().replace(',', '.')
        if (!VhfFrequencies.isValid(next) || profile.value == null || !positionAllowed.value) return
        val previous = radio.currentFrequency.value
        try {
            if (!foreground) {
                // Called by the visible Activity; subsequently the service keeps ownership.
                ContextCompat.startForegroundService(this, Intent(this, VhfOverlayService::class.java))
                promote(false)
            }
            radio.connectToFrequency(next, profile.value!!.identifiant + position.value.takeIf { it.isNotBlank() }.let { if (it == null) "" else " ($it)" }, token)
            if (previous.isNotEmpty()) standby.value = previous
            message.value = null
        } catch (_: Exception) {
            powerOff()
            message.value = "Impossible de démarrer la radio. Rouvre l'application et réessaie."
        }
    }
    fun setMicMode(requested: MicMode) {
        if (requested == MicMode.MUTED) { radio.mute(); return }
        if (!foreground || radio.receiveOnly.value || !positionAllowed.value) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            radio.mute(); message.value = "Autorise le microphone depuis l'application."; return
        }
        try {
            // Only called by the visible Activity after runtime permission approval.
            promote(true)
            radio.setMicMode(requested)
            message.value = null
        } catch (_: Exception) { radio.mute(); message.value = "Rouvre l'application pour activer le microphone." }
    }
    fun powerOff() {
        radio.disconnect()
        clearAudioOutput()
        hideOverlay()
        foreground = false; microphoneForeground = false
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }
    fun audioOutputs(): List<Pair<Int, String>> {
        if (Build.VERSION.SDK_INT < 31) return emptyList()
        return runCatching { audio.availableCommunicationDevices.map { device -> device.id to when (device.type) {
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "Haut-parleur"
            AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "Écouteur du téléphone"
            else -> device.productName.toString()
        } } }.getOrElse { message.value = "Impossible de lire les sorties audio."; emptyList() }
    }
    fun chooseAudioOutput(id: Int) {
        if (Build.VERSION.SDK_INT < 31 || !radio.powered.value) return
        radio.mute()
        val selected = runCatching {
            val device = audio.availableCommunicationDevices.find { it.id == id }
            device != null && audio.setCommunicationDevice(device)
        }.getOrDefault(false)
        if (selected) {
            selectedOutput = id
            message.value = "Sortie audio sélectionnée. Réactive PTT pour parler."
        } else message.value = "Cette sortie audio n'est pas disponible."
    }
    private fun clearAudioOutput() {
        if (Build.VERSION.SDK_INT >= 31 && selectedOutput != null) runCatching { audio.clearCommunicationDevice() }
        selectedOutput = null
    }
    private fun promote(microphone: Boolean) {
        val types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK or
            (if (microphone && Build.VERSION.SDK_INT >= 30) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0)
        ServiceCompat.startForeground(this, NOTIFICATION, notification(), types)
        foreground = true; microphoneForeground = microphone
    }
    private fun notification(): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        fun action(name: String, id: Int) = PendingIntent.getService(this, id, Intent(this, VhfOverlayService::class.java).setAction(name), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val status = when {
            radio.isTransmitting.value -> "ÉMISSION"
            radio.connectionState.value != CloudflareManager.ConnectionStatus.CONNECTED -> "Reconnexion · micro coupé"
            radio.receiveOnly.value -> "OBS · écoute uniquement"
            radio.micMode.value == MicMode.MUTED -> "Écoute · micro coupé"
            else -> "PTT prêt · maintenir le bouton pour parler"
        }
        return NotificationCompat.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_radio)
            .setContentTitle("VHF " + radio.currentFrequency.value).setContentText(status)
            .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(R.drawable.ic_mic_off, "Couper le micro", action(ACTION_MUTE, 1))
            .addAction(R.drawable.ic_radio, "OFF", action(ACTION_OFF, 2)).build()
    }
    private fun notifyState() {
        try { getSystemService(NotificationManager::class.java).notify(NOTIFICATION, notification()) } catch (_: SecurityException) { }
    }
    fun showOverlay() {
        if (!radio.powered.value || !Settings.canDrawOverlays(this)) return
        if (bubble != null) return
        try {
            val view = LayoutInflater.from(this).inflate(R.layout.overlay_bubble, null)
            val params = WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL, PixelFormat.TRANSLUCENT)
            params.gravity = Gravity.TOP or Gravity.START; params.x = 12; params.y = 160
            bubble = view; bubbleParams = params
            view.findViewById<View>(R.id.btn_ptt).setOnTouchListener { button, event ->
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> { radio.press("overlay"); true }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { radio.release("overlay"); button.performClick(); true }
                    else -> true
                }
            }
            view.findViewById<View>(R.id.btn_mute).setOnClickListener { radio.mute() }
            view.findViewById<View>(R.id.btn_off).setOnClickListener { powerOff() }
            view.findViewById<View>(R.id.btn_minimize).setOnClickListener {
                radio.release("overlay")
                view.findViewById<View>(R.id.bubble_expanded).visibility = View.GONE
                view.findViewById<View>(R.id.bubble_collapsed).visibility = View.VISIBLE
            }
            view.findViewById<View>(R.id.bubble_collapsed).setOnClickListener {
                view.findViewById<View>(R.id.bubble_expanded).visibility = View.VISIBLE
                view.findViewById<View>(R.id.bubble_collapsed).visibility = View.GONE
            }
            var x = 0; var y = 0; var touchX = 0f; var touchY = 0f
            view.findViewById<View>(R.id.tv_frequency).setOnTouchListener { _, event ->
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> { x = params.x; y = params.y; touchX = event.rawX; touchY = event.rawY; radio.release("overlay") }
                    MotionEvent.ACTION_MOVE -> {
                        val metrics = resources.displayMetrics
                        params.x = (x + event.rawX.toInt() - touchX.toInt()).coerceIn(0, (metrics.widthPixels - view.width).coerceAtLeast(0))
                        params.y = (y + event.rawY.toInt() - touchY.toInt()).coerceIn(0, (metrics.heightPixels - view.height).coerceAtLeast(0))
                        windows.updateViewLayout(view, params)
                    }
                }
                true
            }
            windows.addView(view, params)
            overlayVisible.value = true; renderBubble()
        } catch (_: Exception) {
            hideOverlay(); message.value = "Bulle indisponible : vérifie l'autorisation d'affichage."
        }
    }
    fun hideOverlay() {
        radio.release("overlay")
        bubble?.let { try { windows.removeView(it) } catch (_: Exception) { } }
        bubble = null; bubbleParams = null; overlayVisible.value = false
    }
    private fun renderBubble() {
        val view = bubble ?: return
        val connected = radio.connectionState.value == CloudflareManager.ConnectionStatus.CONNECTED
        val tx = radio.isTransmitting.value
        view.findViewById<TextView>(R.id.tv_frequency).text = radio.currentFrequency.value
        view.findViewById<TextView>(R.id.tv_status).text = when {
            tx -> "ÉMISSION"
            !connected -> "RECONNEXION"
            radio.receiveOnly.value -> "OBS · ÉCOUTE"
            radio.micMode.value == MicMode.PTT -> "MAINTENIR POUR PARLER"
            else -> "MICRO COUPÉ"
        }
        view.findViewById<ImageView>(R.id.btn_ptt).apply {
            isEnabled = connected && !radio.receiveOnly.value && radio.micMode.value == MicMode.PTT
            alpha = if (isEnabled) 1f else 0.4f
            setImageResource(if (tx) R.drawable.ic_mic else R.drawable.ic_mic_off)
            setBackgroundColor(if (tx) 0xffb91c1c.toInt() else 0xff0c4a6e.toInt())
        }
    }
    override fun onTaskRemoved(rootIntent: Intent?) { powerOff(); super.onTaskRemoved(rootIntent) }
    override fun onDestroy() {
        hideOverlay(); positionJob?.cancel(); scope.cancel()
        audio.unregisterAudioDeviceCallback(audioDevices)
        clearAudioOutput()
        radio.destroy(); ApiClient.clearTokens(); token = ""
        unregisterReceiver(screenReceiver)
        super.onDestroy()
    }
}
