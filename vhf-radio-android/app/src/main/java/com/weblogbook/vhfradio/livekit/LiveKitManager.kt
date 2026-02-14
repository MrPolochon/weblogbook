package com.weblogbook.vhfradio.livekit

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.util.Log
import com.weblogbook.vhfradio.data.ApiClient
import com.weblogbook.vhfradio.data.VhfFrequencies
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.room.Room
import io.livekit.android.room.participant.RemoteParticipant
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlin.math.sin

/**
 * Gère la connexion LiveKit pour la radio VHF.
 * Expose l'état via StateFlow pour l'observation par l'UI et le service.
 */
class LiveKitManager(private val context: Context) {

    companion object {
        private const val TAG = "LiveKitManager"
        private const val COLLISION_CHECK_MS = 300L
        private const val COLLISION_THRESHOLD = 0.01
    }

    /* ── State ── */
    private val _connectionState = MutableStateFlow(ConnectionStatus.DISCONNECTED)
    val connectionState: StateFlow<ConnectionStatus> = _connectionState

    private val _isTransmitting = MutableStateFlow(false)
    val isTransmitting: StateFlow<Boolean> = _isTransmitting

    private val _participants = MutableStateFlow<List<ParticipantInfo>>(emptyList())
    val participants: StateFlow<List<ParticipantInfo>> = _participants

    private val _collision = MutableStateFlow(false)
    val collision: StateFlow<Boolean> = _collision

    private val _currentFrequency = MutableStateFlow("")
    val currentFrequency: StateFlow<String> = _currentFrequency

    /* ── Internal ── */
    private var room: Room? = null
    private var scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var collisionJob: Job? = null
    private var collisionAudioTrack: AudioTrack? = null
    private var pttActive = false

    enum class ConnectionStatus {
        DISCONNECTED, CONNECTING, CONNECTED, ERROR
    }

    data class ParticipantInfo(
        val identity: String,
        val name: String,
        val isSpeaking: Boolean
    )

    /* ══════════════════════════════════════════════════
       Connexion
       ══════════════════════════════════════════════════ */

    suspend fun connectToFrequency(
        freq: String,
        participantName: String,
        accessToken: String
    ) {
        if (!VhfFrequencies.isValid(freq)) {
            Log.e(TAG, "Fréquence invalide: $freq")
            return
        }

        disconnect()
        _connectionState.value = ConnectionStatus.CONNECTING
        _currentFrequency.value = freq

        try {
            val roomName = VhfFrequencies.frequencyToRoomName(freq)

            // Fetch LiveKit token from API
            val result = ApiClient.getLiveKitToken(roomName, participantName, accessToken)
            val tokenResponse = result.getOrNull()
                ?: run {
                    Log.e(TAG, "Erreur token: ${result.exceptionOrNull()?.message}")
                    _connectionState.value = ConnectionStatus.ERROR
                    return
                }

            val token = tokenResponse.token
            val url = tokenResponse.url
            if (token.isNullOrEmpty() || url.isNullOrEmpty()) {
                Log.e(TAG, "Token ou URL vide")
                _connectionState.value = ConnectionStatus.ERROR
                return
            }

            // Create and connect room
            val newRoom = LiveKit.create(context)

            // Collect events in background
            scope.launch {
                newRoom.events.collect { event ->
                    handleRoomEvent(event, newRoom)
                }
            }

            newRoom.connect(url, token)

            // Enable mic then mute it (PTT off by default)
            newRoom.localParticipant.setMicrophoneEnabled(true)
            delay(200) // Wait for mic track to be published
            newRoom.localParticipant.setMicrophoneEnabled(false)

            room = newRoom
            _connectionState.value = ConnectionStatus.CONNECTED
            updateParticipants(newRoom)
            startCollisionDetection()

            Log.i(TAG, "Connecté à la fréquence $freq (room: $roomName)")

        } catch (e: Exception) {
            Log.e(TAG, "Erreur de connexion: ${e.message}", e)
            _connectionState.value = ConnectionStatus.ERROR
        }
    }

    fun disconnect() {
        stopCollisionDetection()
        stopCollisionSound()

        room?.let { r ->
            try {
                r.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "Erreur disconnect: ${e.message}")
            }
        }
        room = null

        _connectionState.value = ConnectionStatus.DISCONNECTED
        _isTransmitting.value = false
        _participants.value = emptyList()
        _collision.value = false
        pttActive = false
    }

    fun destroy() {
        disconnect()
        scope.cancel()
    }

    /* ══════════════════════════════════════════════════
       PTT
       ══════════════════════════════════════════════════ */

    suspend fun startTransmit() {
        if (pttActive || _connectionState.value != ConnectionStatus.CONNECTED) return
        pttActive = true
        _isTransmitting.value = true

        try {
            room?.localParticipant?.setMicrophoneEnabled(true)
            Log.d(TAG, "PTT ON — Transmission")
        } catch (e: Exception) {
            Log.e(TAG, "Erreur unmute: ${e.message}")
        }
    }

    suspend fun stopTransmit() {
        if (!pttActive) return
        pttActive = false
        _isTransmitting.value = false

        try {
            room?.localParticipant?.setMicrophoneEnabled(false)
            Log.d(TAG, "PTT OFF — Réception")
        } catch (e: Exception) {
            Log.e(TAG, "Erreur mute: ${e.message}")
        }
    }

    val isPttActive: Boolean get() = pttActive

    /* ══════════════════════════════════════════════════
       Events
       ══════════════════════════════════════════════════ */

    private fun handleRoomEvent(event: RoomEvent, room: Room) {
        when (event) {
            is RoomEvent.ParticipantConnected -> updateParticipants(room)
            is RoomEvent.ParticipantDisconnected -> updateParticipants(room)
            is RoomEvent.Disconnected -> {
                _connectionState.value = ConnectionStatus.DISCONNECTED
            }
            is RoomEvent.Reconnecting -> {
                _connectionState.value = ConnectionStatus.CONNECTING
            }
            is RoomEvent.Reconnected -> {
                _connectionState.value = ConnectionStatus.CONNECTED
            }
            else -> { /* ignore */ }
        }
    }

    private fun updateParticipants(room: Room) {
        val list = mutableListOf<ParticipantInfo>()
        room.remoteParticipants.values.forEach { p ->
            list.add(
                ParticipantInfo(
                    identity = p.identity ?: "",
                    name = p.name ?: p.identity ?: "Inconnu",
                    isSpeaking = p.isSpeaking
                )
            )
        }
        _participants.value = list
    }

    /* ══════════════════════════════════════════════════
       Collision Detection
       ══════════════════════════════════════════════════ */

    private fun startCollisionDetection() {
        collisionJob?.cancel()
        collisionJob = scope.launch {
            while (isActive) {
                delay(COLLISION_CHECK_MS)
                checkCollision()
            }
        }
    }

    private fun stopCollisionDetection() {
        collisionJob?.cancel()
        collisionJob = null
    }

    private fun checkCollision() {
        val r = room ?: return
        var speakingCount = 0
        if (pttActive) speakingCount++

        val list = mutableListOf<ParticipantInfo>()
        r.remoteParticipants.values.forEach { p: RemoteParticipant ->
            val speaking = (p.audioLevel ?: 0f) > COLLISION_THRESHOLD
            if (speaking) speakingCount++
            list.add(
                ParticipantInfo(
                    identity = p.identity ?: "",
                    name = p.name ?: p.identity ?: "Inconnu",
                    isSpeaking = speaking
                )
            )
        }

        _participants.value = list

        val isCollision = speakingCount >= 2
        if (isCollision != _collision.value) {
            _collision.value = isCollision
            if (isCollision) {
                playCollisionSound()
            } else {
                stopCollisionSound()
            }
        }
    }

    /* ══════════════════════════════════════════════════
       Collision Sound (1200 Hz tone)
       ══════════════════════════════════════════════════ */

    private fun playCollisionSound() {
        if (collisionAudioTrack != null) return

        try {
            val sampleRate = 44100
            val frequency = 1200.0
            val amplitude = 0.15

            // Generate 1 second of tone
            val numSamples = sampleRate
            val samples = ShortArray(numSamples)
            for (i in 0 until numSamples) {
                val sample = amplitude * sin(2.0 * Math.PI * frequency * i / sampleRate)
                samples[i] = (sample * Short.MAX_VALUE).toInt().toShort()
            }

            val bufferSize = AudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )

            val audioTrack = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setSampleRate(sampleRate)
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(maxOf(bufferSize, samples.size * 2))
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build()

            audioTrack.write(samples, 0, samples.size)
            audioTrack.setLoopPoints(0, numSamples, -1) // Loop indefinitely
            audioTrack.play()

            collisionAudioTrack = audioTrack
        } catch (e: Exception) {
            Log.e(TAG, "Erreur son collision: ${e.message}")
        }
    }

    private fun stopCollisionSound() {
        collisionAudioTrack?.let {
            try {
                it.stop()
                it.release()
            } catch (_: Exception) { }
        }
        collisionAudioTrack = null
    }
}
