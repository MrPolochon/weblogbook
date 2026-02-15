package com.weblogbook.vhfradio.service

import android.annotation.SuppressLint
import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Log
import android.view.*
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import com.weblogbook.vhfradio.MainActivity
import com.weblogbook.vhfradio.R
import com.weblogbook.vhfradio.data.VhfFrequencies
import com.weblogbook.vhfradio.livekit.LiveKitManager
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

/**
 * Foreground service qui gère :
 * 1. La bulle PTT flottante (overlay SYSTEM_ALERT_WINDOW)
 * 2. Les contrôles MediaSession dans la notification
 * 3. L'observation de l'état du LiveKitManager
 */
class VhfOverlayService : Service() {

    companion object {
        private const val TAG = "VhfOverlayService"
        const val CHANNEL_ID = "vhf_radio_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_STOP = "com.weblogbook.vhfradio.STOP"
        const val ACTION_PTT_ON = "com.weblogbook.vhfradio.PTT_ON"
        const val ACTION_PTT_OFF = "com.weblogbook.vhfradio.PTT_OFF"
        const val ACTION_FREQ_UP = "com.weblogbook.vhfradio.FREQ_UP"
        const val ACTION_FREQ_DOWN = "com.weblogbook.vhfradio.FREQ_DOWN"

        // Shared reference to LiveKitManager (set by MainActivity before starting service)
        var sharedLiveKitManager: LiveKitManager? = null
        var sharedIsLocked: Boolean = false
        var sharedStbyDecIndex: Int = 0
        var sharedStbyMhz: Int = 118
        var sharedOnStbyDecChange: ((Int) -> Unit)? = null
    }

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var mediaSession: MediaSessionCompat? = null
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var isExpanded = true

    // View references
    private var expandedLayout: LinearLayout? = null
    private var collapsedView: ImageView? = null
    private var tvFrequency: TextView? = null
    private var tvStatus: TextView? = null
    private var btnPtt: ImageView? = null
    private var btnMinimize: TextView? = null
    private var btnFreqUp: TextView? = null
    private var btnFreqDown: TextView? = null
    private var freqControls: LinearLayout? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        setupMediaSession()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_PTT_ON -> {
                scope.launch { sharedLiveKitManager?.startTransmit() }
                return START_STICKY
            }
            ACTION_PTT_OFF -> {
                scope.launch { sharedLiveKitManager?.stopTransmit() }
                return START_STICKY
            }
            ACTION_FREQ_UP -> {
                if (!sharedIsLocked) {
                    val decs = VhfFrequencies.getDecimalsForMhz(sharedStbyMhz)
                    val newIdx = (sharedStbyDecIndex + 1).coerceAtMost(decs.size - 1)
                    sharedStbyDecIndex = newIdx
                    sharedOnStbyDecChange?.invoke(newIdx)
                }
                return START_STICKY
            }
            ACTION_FREQ_DOWN -> {
                if (!sharedIsLocked) {
                    val newIdx = (sharedStbyDecIndex - 1).coerceAtLeast(0)
                    sharedStbyDecIndex = newIdx
                    sharedOnStbyDecChange?.invoke(newIdx)
                }
                return START_STICKY
            }
        }

        // Start foreground with notification
        startForeground(NOTIFICATION_ID, buildNotification("VHF Radio", "Démarrage..."))

        // Create overlay
        createOverlay()

        // Observe LiveKit state
        observeState()

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        removeOverlay()
        mediaSession?.release()
        scope.cancel()
        super.onDestroy()
    }

    /* ══════════════════════════════════════════════════
       Notification Channel
       ══════════════════════════════════════════════════ */

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.channel_description)
            setShowBadge(false)
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    /* ══════════════════════════════════════════════════
       MediaSession
       ══════════════════════════════════════════════════ */

    private fun setupMediaSession() {
        mediaSession = MediaSessionCompat(this, "VHFRadio").apply {
            setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            )
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() {
                    // Play = PTT ON
                    scope.launch { sharedLiveKitManager?.startTransmit() }
                }

                override fun onPause() {
                    // Pause = PTT OFF
                    scope.launch { sharedLiveKitManager?.stopTransmit() }
                }

                override fun onStop() {
                    scope.launch { sharedLiveKitManager?.stopTransmit() }
                }

                override fun onSkipToNext() {
                    // Next = Frequency decimal up (pilot only)
                    if (!sharedIsLocked) {
                        val decs = VhfFrequencies.getDecimalsForMhz(sharedStbyMhz)
                        val newIdx = (sharedStbyDecIndex + 1).coerceAtMost(decs.size - 1)
                        sharedStbyDecIndex = newIdx
                        sharedOnStbyDecChange?.invoke(newIdx)
                    }
                }

                override fun onSkipToPrevious() {
                    // Prev = Frequency decimal down (pilot only)
                    if (!sharedIsLocked) {
                        val newIdx = (sharedStbyDecIndex - 1).coerceAtLeast(0)
                        sharedStbyDecIndex = newIdx
                        sharedOnStbyDecChange?.invoke(newIdx)
                    }
                }
            })
            isActive = true
        }
    }

    private fun updateMediaSession(freq: String, transmitting: Boolean, sessionInfo: String) {
        mediaSession?.let { ms ->
            ms.setMetadata(
                MediaMetadataCompat.Builder()
                    .putString(MediaMetadataCompat.METADATA_KEY_TITLE, "VHF $freq")
                    .putString(
                        MediaMetadataCompat.METADATA_KEY_ARTIST,
                        if (transmitting) "TX — Transmission" else "RX — Réception"
                    )
                    .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, sessionInfo.ifEmpty { "VHF Radio" })
                    .build()
            )

            val stateBuilder = PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY or
                    PlaybackStateCompat.ACTION_PAUSE or
                    PlaybackStateCompat.ACTION_STOP or
                    PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                    PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                )
                .setState(
                    if (transmitting) PlaybackStateCompat.STATE_PLAYING
                    else PlaybackStateCompat.STATE_PAUSED,
                    0L,
                    1.0f
                )

            ms.setPlaybackState(stateBuilder.build())
        }
    }

    /* ══════════════════════════════════════════════════
       Notification
       ══════════════════════════════════════════════════ */

    private fun buildNotification(title: String, text: String): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, VhfOverlayService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_radio)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(openPendingIntent)
            .setOngoing(true)
            .setShowWhen(false)
            .addAction(R.drawable.ic_mic_off, "Arrêter", stopPendingIntent)

        // Add MediaStyle if session exists
        mediaSession?.let { ms ->
            builder.setStyle(
                androidx.media.app.NotificationCompat.MediaStyle()
                    .setMediaSession(ms.sessionToken)
                    .setShowActionsInCompactView(0)
            )
        }

        return builder.build()
    }

    private fun updateNotification(freq: String, transmitting: Boolean, connected: Boolean) {
        val title = "VHF $freq"
        val text = when {
            !connected -> "Hors ligne"
            transmitting -> "TX — Transmission en cours"
            else -> "RX — En écoute"
        }

        val notification = buildNotification(title, text)
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, notification)
    }

    /* ══════════════════════════════════════════════════
       Overlay (Floating Bubble)
       ══════════════════════════════════════════════════ */

    @SuppressLint("ClickableViewAccessibility")
    private fun createOverlay() {
        if (overlayView != null) return

        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

        val inflater = LayoutInflater.from(this)
        overlayView = inflater.inflate(R.layout.overlay_bubble, null)

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = 16
            y = 200
        }

        overlayView?.let { view ->
            expandedLayout = view.findViewById(R.id.bubble_expanded)
            collapsedView = view.findViewById(R.id.bubble_collapsed)
            tvFrequency = view.findViewById(R.id.tv_frequency)
            tvStatus = view.findViewById(R.id.tv_status)
            btnPtt = view.findViewById(R.id.btn_ptt)
            btnMinimize = view.findViewById(R.id.btn_minimize)
            btnFreqUp = view.findViewById(R.id.btn_freq_up)
            btnFreqDown = view.findViewById(R.id.btn_freq_down)
            freqControls = view.findViewById(R.id.freq_controls)

            // Show/hide frequency controls based on mode
            freqControls?.visibility = if (sharedIsLocked) View.GONE else View.VISIBLE

            // PTT touch handler (hold-to-talk)
            btnPtt?.setOnTouchListener { _, event ->
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        scope.launch { sharedLiveKitManager?.startTransmit() }
                        true
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                        scope.launch { sharedLiveKitManager?.stopTransmit() }
                        true
                    }
                    else -> false
                }
            }

            // Frequency +/- buttons
            btnFreqUp?.setOnClickListener {
                if (!sharedIsLocked) {
                    val decs = VhfFrequencies.getDecimalsForMhz(sharedStbyMhz)
                    val newIdx = (sharedStbyDecIndex + 1).coerceAtMost(decs.size - 1)
                    sharedStbyDecIndex = newIdx
                    sharedOnStbyDecChange?.invoke(newIdx)
                }
            }

            btnFreqDown?.setOnClickListener {
                if (!sharedIsLocked) {
                    val newIdx = (sharedStbyDecIndex - 1).coerceAtLeast(0)
                    sharedStbyDecIndex = newIdx
                    sharedOnStbyDecChange?.invoke(newIdx)
                }
            }

            // Minimize button
            btnMinimize?.setOnClickListener {
                isExpanded = false
                expandedLayout?.visibility = View.GONE
                collapsedView?.visibility = View.VISIBLE
            }

            // Collapsed click = expand
            collapsedView?.setOnClickListener {
                isExpanded = true
                expandedLayout?.visibility = View.VISIBLE
                collapsedView?.visibility = View.GONE
            }

            // Drag the entire bubble
            setupDrag(view, params)

            windowManager?.addView(view, params)
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupDrag(view: View, params: WindowManager.LayoutParams) {
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f
        var isDragging = false

        // Use the root view for drag, but only if not touching PTT
        view.findViewById<View>(R.id.bubble_root)?.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    isDragging = false
                    false // Don't consume — let children handle
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (initialTouchX - event.rawX).toInt()
                    val dy = (event.rawY - initialTouchY).toInt()
                    if (kotlin.math.abs(dx) > 10 || kotlin.math.abs(dy) > 10) {
                        isDragging = true
                        params.x = initialX + dx
                        params.y = initialY + dy
                        windowManager?.updateViewLayout(view, params)
                        true
                    } else {
                        false
                    }
                }
                MotionEvent.ACTION_UP -> {
                    isDragging
                }
                else -> false
            }
        }
    }

    private fun removeOverlay() {
        overlayView?.let {
            try {
                windowManager?.removeView(it)
            } catch (_: Exception) { }
        }
        overlayView = null
    }

    /* ══════════════════════════════════════════════════
       State Observation
       ══════════════════════════════════════════════════ */

    private fun observeState() {
        val lkm = sharedLiveKitManager ?: return

        // Observe connection + transmitting + frequency
        scope.launch {
            combine(
                lkm.connectionState,
                lkm.isTransmitting,
                lkm.currentFrequency,
                lkm.collision
            ) { conn, tx, freq, coll ->
                StateSnapshot(conn, tx, freq, coll)
            }.collect { snapshot ->
                updateOverlayUI(snapshot)
                updateNotification(
                    freq = snapshot.frequency.ifEmpty { "---" },
                    transmitting = snapshot.transmitting,
                    connected = snapshot.connection == LiveKitManager.ConnectionStatus.CONNECTED
                )
                updateMediaSession(
                    freq = snapshot.frequency.ifEmpty { "---" },
                    transmitting = snapshot.transmitting,
                    sessionInfo = ""
                )
            }
        }
    }

    private data class StateSnapshot(
        val connection: LiveKitManager.ConnectionStatus,
        val transmitting: Boolean,
        val frequency: String,
        val collision: Boolean
    )

    @SuppressLint("SetTextI18n")
    private fun updateOverlayUI(state: StateSnapshot) {
        val isConnected = state.connection == LiveKitManager.ConnectionStatus.CONNECTED

        tvFrequency?.text = state.frequency.ifEmpty { "---" }
        tvFrequency?.setTextColor(
            when {
                state.collision -> 0xFFF87171.toInt() // Red400
                isConnected -> 0xFF10B981.toInt() // Emerald500
                else -> 0xFF64748B.toInt() // Slate500
            }
        )

        tvStatus?.text = when {
            !isConnected -> "HORS LIGNE"
            state.transmitting -> "TX"
            else -> "RX"
        }
        tvStatus?.setTextColor(
            when {
                state.transmitting -> 0xFF10B981.toInt()
                else -> 0xFF9CA3AF.toInt()
            }
        )

        // PTT button appearance
        btnPtt?.setImageResource(
            if (state.transmitting) R.drawable.ic_mic else R.drawable.ic_mic_off
        )
    }
}
