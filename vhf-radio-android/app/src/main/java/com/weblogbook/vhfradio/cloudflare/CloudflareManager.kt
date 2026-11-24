package com.weblogbook.vhfradio.cloudflare

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack as AndroidAudioTrack
import kotlin.random.Random
import com.weblogbook.vhfradio.data.RadioControls
import com.weblogbook.vhfradio.data.RadioControls.MicMode
import com.weblogbook.vhfradio.data.radioRetryDelay
import android.media.AudioManager
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.weblogbook.vhfradio.data.ApiClient
import com.weblogbook.vhfradio.data.VhfFrequencies
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.*
import org.webrtc.*
import org.webrtc.audio.JavaAudioDeviceModule
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Native Cloudflare SFU radio. The microphone is disabled before publication.
 * Each retune gets new peer connections and a short-lived, room-bound ticket.
 */
class CloudflareManager(private val context: Context) {
    enum class ConnectionStatus { DISCONNECTED, CONNECTING, CONNECTED, ERROR }
    data class ParticipantInfo(val identity: String, val name: String, val isSpeaking: Boolean)
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
    private val _connectionError = MutableStateFlow<String?>(null)
    val connectionError: StateFlow<String?> = _connectionError
    val isPttActive: Boolean get() = _isTransmitting.value
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val http = OkHttpClient.Builder().build()
    private val gson = Gson()
    private var current: Session? = null
    private var connectionJob: Job? = null
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var collisionAndroidAudioTrack: AndroidAudioTrack? = null

    init {
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context.applicationContext).createInitializationOptions())
    }

    private val controls = RadioControls()
    private val _powered = MutableStateFlow(false)
    val powered: StateFlow<Boolean> = _powered
    private val _receiveOnly = MutableStateFlow(true)
    val receiveOnly: StateFlow<Boolean> = _receiveOnly
    private val _micMode = MutableStateFlow(MicMode.MUTED)
    val micMode: StateFlow<MicMode> = _micMode
    private val _preparing = MutableStateFlow(false)
    val preparing: StateFlow<Boolean> = _preparing
    private val _volume = MutableStateFlow(0.8f)
    val volume: StateFlow<Float> = _volume
    private val _effects = MutableStateFlow(true)
    val effects: StateFlow<Boolean> = _effects
    private var micJob: Job? = null
    private var receiveTail = 0L
    private var lastEffect = false

    fun connectToFrequency(freq: String, participantName: String, accessToken: String) {
        if (!VhfFrequencies.isValid(freq)) return
        disconnect()
        _powered.value = true
        _currentFrequency.value = freq
        connectionJob = scope.launch {
            var attempt = 0
            while (isActive && _powered.value) {
                val session = Session()
                current = session
                _connectionState.value = ConnectionStatus.CONNECTING
                try {
                    val ticket = ApiClient.getCloudflareToken(VhfFrequencies.frequencyToRoomName(freq), participantName, accessToken).getOrThrow()
                    ensureActive()
                    require(!ticket.url.isNullOrBlank() && !ticket.token.isNullOrBlank()) { "Réponse radio invalide" }
                    session.connect(ticket.url!!, ticket.token!!, ticket.canPublish == true)
                    ensureActive()
                    _connectionState.value = ConnectionStatus.CONNECTED
                    _connectionError.value = null
                    attempt = 0
                    session.permissionJob = scope.launch {
                        while (isActive) {
                            delay(30_000)
                            val permission = ApiClient.getCloudflareToken(VhfFrequencies.frequencyToRoomName(freq), participantName, accessToken)
                            if (permission.isFailure || permission.getOrNull()?.canPublish != session.canPublish) {
                                fail(session, "Actualisation des droits radio")
                                break
                            }
                        }
                    }
                    throw session.lost.await()
                } catch (cancelled: CancellationException) { throw cancelled }
                catch (error: Exception) {
                    if (current !== session) break
                    mute()
                    _receiveOnly.value = true
                    _participants.value = emptyList()
                    _collision.value = false
                    _connectionState.value = ConnectionStatus.ERROR
                    val wait = radioRetryDelay(attempt++)
                    _connectionError.value = (error.message ?: "Connexion interrompue") + " · nouvelle tentative dans " + (wait / 1000) + " s."
                    session.close()
                    delay(wait)
                } finally {
                    session.close()
                    if (current === session) current = null
                }
            }
        }
    }

    fun disconnect() {
        _powered.value = false
        connectionJob?.cancel(); connectionJob = null
        mute()
        val old = current; current = null; old?.close()
        _connectionState.value = ConnectionStatus.DISCONNECTED
        _connectionError.value = null
        _receiveOnly.value = true
        _participants.value = emptyList()
        _collision.value = false
    }
    fun destroy() { disconnect(); scope.cancel(); http.dispatcher.executorService.shutdown(); http.connectionPool.evictAll() }
    fun mute() {
        micJob?.cancel(); micJob = null
        controls.reset(); _micMode.value = MicMode.MUTED; _preparing.value = false
        applyTransmit()
        current?.recording(false)
        stopCollisionSound(); lastEffect = false
    }
    fun setMicMode(mode: MicMode) {
        mute()
        if (mode == MicMode.MUTED || _receiveOnly.value || _connectionState.value != ConnectionStatus.CONNECTED) return
        val session = current ?: return
        _preparing.value = true
        micJob = scope.launch {
            try {
                session.prepareMicrophone()
                ensureActive()
                if (current !== session) return@launch
                session.recording(true)
                controls.arm(true, session.canPublish, session.microphone != null, mode)
                _micMode.value = controls.mode
                applyTransmit()
            } catch (cancelled: CancellationException) {
                // An interrupted SDP publication cannot safely be reused by another PTT press.
                if (current === session && !session.microphonePrepared) fail(session, "Activation du microphone interrompue")
                throw cancelled
            }
            catch (_: Exception) { fail(session, "Microphone indisponible. Vérifie les autorisations et les autres appels.") }
            finally { _preparing.value = false }
        }
    }
    fun press(source: String) { controls.press(source); applyTransmit() }
    fun release(source: String) { controls.release(source); applyTransmit() }
    private fun applyTransmit() {
        val transmit = controls.transmitting && current?.canPublish == true && _connectionState.value == ConnectionStatus.CONNECTED
        current?.microphone?.setEnabled(transmit)
        current?.muteInput(!transmit)
        _isTransmitting.value = transmit
        updateSquelch()
    }
    fun setVolume(value: Float) {
        _volume.value = value.coerceIn(0f, 1f)
        current?.setVolume(_volume.value)
        collisionAndroidAudioTrack?.setVolume(_volume.value)
    }
    fun setEffects(enabled: Boolean) { _effects.value = enabled; updateSquelch() }
    private fun updateSquelch() {
        if (_participants.value.any { it.isSpeaking }) receiveTail = android.os.SystemClock.elapsedRealtime() + 400
        val active = _effects.value && (_isTransmitting.value || android.os.SystemClock.elapsedRealtime() < receiveTail)
        if (active == lastEffect) return
        lastEffect = active
        if (active) playCollisionSound() else stopCollisionSound()
    }
    private fun fail(session: Session, message: String) {
        if (current !== session) return
        mute()
        session.lost.complete(Exception(message))
    }

    private inner class Session {
        var canPublish = false
        val lost = CompletableDeferred<Exception>()
        var permissionJob: Job? = null
        private lateinit var configuration: PeerConnection.RTCConfiguration
        private val microphoneLock = Mutex()
        var microphonePrepared = false
            private set
        var microphone: AudioTrack? = null
        private var source: AudioSource? = null
        private var factory: PeerConnectionFactory? = null
        private var audioModule: JavaAudioDeviceModule? = null
        private var publisher: PeerConnection? = null
        private var subscriber: PeerConnection? = null
        private var socket: WebSocket? = null
        private var closed = false
        private var previousMode: Int? = null
        private val opened = CompletableDeferred<Unit>()
        private val pending = ConcurrentHashMap<Int, CompletableDeferred<JsonObject>>()
        private val sequence = AtomicInteger()
        private val subscriptions = mutableMapOf<String, String>()
        private val remoteTracks = mutableMapOf<String, AudioTrack>()
        private var desired = emptyList<JsonObject>()
        private val negotiation = Mutex()
        private var heartbeat: Job? = null
        private var meterJob: Job? = null
        private val jobs = mutableListOf<Job>()

        private fun launchActive(block: suspend () -> Unit) {
            if (closed) return
            val job = scope.launch {
                try { if (current === this@Session && !closed) block() }
                catch (_: CancellationException) { }
                catch (e: Exception) { fail(this@Session, e.message ?: "Erreur radio") }
            }
            jobs.removeAll { it.isCompleted }
            jobs.add(job)
        }
        suspend fun connect(url: String, token: String, ticketCanPublish: Boolean) {
            require(url.startsWith("wss://")) { "URL radio non sécurisée" }
            val request = Request.Builder().url(url)
                .header("Sec-WebSocket-Protocol", "weblogbook-radio-v1, ticket.$token").build()
            socket = http.newWebSocket(request, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) { opened.complete(Unit) }
                override fun onMessage(webSocket: WebSocket, text: String) {
                    try {
                        val message = gson.fromJson(text, JsonObject::class.java)
                        if (message.get("event")?.asString == "peers") {
                            launchActive {
                                desired = message.getAsJsonArray("peers").map { it.asJsonObject }
                                if (subscriber != null) reconcile()
                            }
                        } else {
                            val id = message.get("id")?.asInt ?: return
                            val waiter = pending.remove(id) ?: return
                            if (message.has("error")) waiter.completeExceptionally(Exception(message.get("error").asString))
                            else waiter.complete(message.getAsJsonObject("result") ?: JsonObject())
                        }
                    } catch (_: Exception) { launchActive { fail(this@Session, "Signal radio invalide") } }
                }
                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    opened.completeExceptionally(Exception("Connexion Cloudflare refusée"))
                    launchActive { fail(this@Session, "Connexion Cloudflare perdue") }
                }
                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    launchActive { fail(this@Session, "Radio déconnectée") }
                }
                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(code, null)
                    launchActive { fail(this@Session, "Radio déconnectée") }
                }
            })
            withTimeout(15_000) { opened.await() }
            val hello = rpc("hello")
            canPublish = ticketCanPublish && hello.get("canPublish")?.asBoolean == true
            _receiveOnly.value = !canPublish
            desired = hello.getAsJsonArray("peers").map { it.asJsonObject }
            val iceServers = hello.getAsJsonArray("iceServers").map { item ->
                val ice = item.asJsonObject
                val urls = ice.get("urls")
                val builder = PeerConnection.IceServer.builder(if (urls.isJsonArray) urls.asJsonArray.map { it.asString } else listOf(urls.asString))
                ice.get("username")?.let { builder.setUsername(it.asString) }
                ice.get("credential")?.let { builder.setPassword(it.asString) }
                builder.createIceServer()
            }
            previousMode = audioManager.mode
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
            audioModule = JavaAudioDeviceModule.builder(context.applicationContext)
                .setAudioRecordErrorCallback(object : JavaAudioDeviceModule.AudioRecordErrorCallback {
                    override fun onWebRtcAudioRecordInitError(error: String) { microphoneError() }
                    override fun onWebRtcAudioRecordStartError(code: JavaAudioDeviceModule.AudioRecordStartErrorCode, error: String) { microphoneError() }
                    override fun onWebRtcAudioRecordError(error: String) { microphoneError() }
                    private fun microphoneError() { launchActive { fail(this@Session, "Microphone indisponible. Vérifie les autorisations et les autres appels.") } }
                }).createAudioDeviceModule()
            factory = PeerConnectionFactory.builder().setAudioDeviceModule(audioModule).createPeerConnectionFactory()
            configuration = PeerConnection.RTCConfiguration(iceServers).apply { sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN }
            audioModule?.setMicrophoneMute(true)
            subscriber = factory!!.createPeerConnection(configuration, observer(true)) ?: error("WebRTC indisponible")
            reconcile()
            heartbeat = scope.launch {
                try { while (isActive && !closed) { delay(25_000); rpc("ping") } }
                catch (_: CancellationException) { }
                catch (_: Exception) { fail(this@Session, "Signal radio perdu") }
            }
            meterJob = scope.launch {
                while (isActive && !closed) { delay(300); updateLevels() }
            }
        }
        suspend fun prepareMicrophone() = microphoneLock.withLock {
            check(canPublish && !closed)
            if (microphonePrepared) return@withLock
            check(publisher == null) { "Activation du microphone interrompue" }
            publisher = factory!!.createPeerConnection(configuration, observer(false)) ?: error("WebRTC indisponible")
            publisher!!.setAudioRecording(false)
            source = factory!!.createAudioSource(MediaConstraints().apply {
                optional.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
                optional.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
                optional.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
            })
            microphone = factory!!.createAudioTrack("radio-microphone", source!!).apply { setEnabled(false) }
            val transceiver = publisher!!.addTransceiver(microphone!!, RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.SEND_ONLY))
                ?: error("Publication audio impossible")
            val offer = localDescription(publisher!!, true)
            val answer = rpc("publish", mapOf("mid" to transceiver.mid, "sessionDescription" to offer))
            setDescription(publisher!!, answer.getAsJsonObject("sessionDescription"), false)
            withTimeout(15_000) { while (publisher!!.connectionState() != PeerConnection.PeerConnectionState.CONNECTED) { check(!closed); delay(50) } }
            rpc("published")
            microphonePrepared = true
        }
        fun muteInput(muted: Boolean) { audioModule?.setMicrophoneMute(muted) }
        fun recording(enabled: Boolean) { publisher?.setAudioRecording(enabled) }
        fun setVolume(volume: Float) { remoteTracks.values.forEach { it.setVolume(volume.toDouble()) } }
        private suspend fun rpc(action: String, payload: Any = emptyMap<String, String>()): JsonObject {
            check(!closed) { "Radio déconnectée" }
            val id = sequence.incrementAndGet()
            val waiter = CompletableDeferred<JsonObject>()
            pending[id] = waiter
            try {
                check(socket?.send(gson.toJson(mapOf("id" to id, "action" to action, "payload" to payload))) == true)
                return withTimeout(20_000) { waiter.await() }
            } finally { pending.remove(id) }
        }
        private suspend fun reconcile() = negotiation.withLock {
            if (closed) return@withLock
            val peers = desired.associateBy { it.get("id").asString }
            val removed = subscriptions.keys.filter { peers[it]?.get("published")?.asBoolean != true }
            if (removed.isNotEmpty()) {
                rpc("unsubscribe", mapOf("peers" to removed))
                removed.forEach { id -> subscriptions.remove(id); remoteTracks.remove(id)?.setEnabled(false) }
            }
            val added = peers.filter { (id, p) -> p.get("published").asBoolean && !subscriptions.containsKey(id) }.keys
            for (chunk in added.chunked(32)) {
                val response = rpc("subscribe", mapOf("peers" to chunk))
                if (!response.has("sessionDescription")) continue
                response.getAsJsonArray("tracks").forEach {
                    val track = it.asJsonObject
                    subscriptions[track.get("peerId").asString] = track.get("mid").asString
                }
                setDescription(subscriber!!, response.getAsJsonObject("sessionDescription"), false)
                // Receiver reuse does not always produce another onTrack callback.
                subscriber!!.transceivers.forEach { transceiver ->
                    val id = subscriptions.entries.find { it.value == transceiver.mid }?.key
                    if (id != null) (transceiver.receiver.track() as? AudioTrack)?.let { track ->
                        remoteTracks[id] = track
                        track.setEnabled(true)
                        track.setVolume(_volume.value.toDouble())
                    }
                }
                val answer = localDescription(subscriber!!, false)
                rpc("answer", mapOf("sessionDescription" to answer))
            }
            if (!closed) updateLevels()
        }
        private fun observer(receive: Boolean) = object : PeerConnection.Observer {
            override fun onSignalingChange(state: PeerConnection.SignalingState) { }
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) { }
            override fun onIceConnectionReceivingChange(receiving: Boolean) { }
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) { }
            override fun onIceCandidate(candidate: IceCandidate) { /* full ICE gathering before SDP */ }
            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) { }
            override fun onAddStream(stream: MediaStream) { }
            override fun onRemoveStream(stream: MediaStream) { }
            override fun onDataChannel(channel: DataChannel) { channel.close() }
            override fun onRenegotiationNeeded() { /* explicit serialized negotiations only */ }
            override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) { }
            override fun onTrack(transceiver: RtpTransceiver) {
                if (!receive) return
                launchActive {
                    val id = subscriptions.entries.find { it.value == transceiver.mid }?.key ?: return@launchActive
                    (transceiver.receiver.track() as? AudioTrack)?.let { track ->
                        remoteTracks[id] = track
                        track.setEnabled(true)
                        track.setVolume(_volume.value.toDouble())
                    }
                }
            }
            override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
                if (state == PeerConnection.PeerConnectionState.DISCONNECTED || state == PeerConnection.PeerConnectionState.FAILED) {
                    // Never restore a held PTT across a network interruption.
                    launchActive { fail(this@Session, "Connexion audio interrompue") }
                }
            }
        }
        private suspend fun localDescription(pc: PeerConnection, offer: Boolean): Map<String, String> {
            val description = suspendCancellableCoroutine<SessionDescription> { continuation ->
                val observer = object : SdpObserver {
                    override fun onCreateSuccess(sdp: SessionDescription) { if (continuation.isActive) continuation.resume(sdp) }
                    override fun onCreateFailure(error: String) { if (continuation.isActive) continuation.resumeWithException(Exception(error)) }
                    override fun onSetSuccess() { }
                    override fun onSetFailure(error: String) { }
                }
                if (offer) pc.createOffer(observer, MediaConstraints()) else pc.createAnswer(observer, MediaConstraints())
            }
            val tuned = SessionDescription(description.type, description.description.replace(Regex("(a=fmtp:\\d+ .*minptime[^\\r\\n]*)"), "$1;usedtx=1;maxaveragebitrate=24000"))
            setDescription(pc, gson.toJsonTree(mapOf("type" to tuned.type.canonicalForm(), "sdp" to tuned.description)).asJsonObject, true)
            withTimeout(12_000) { while (pc.iceGatheringState() != PeerConnection.IceGatheringState.COMPLETE) { check(!closed); delay(50) } }
            return mapOf("type" to pc.localDescription.type.canonicalForm(), "sdp" to pc.localDescription.description)
        }
        private suspend fun setDescription(pc: PeerConnection, json: JsonObject, local: Boolean) = withTimeout(15_000) {
            suspendCancellableCoroutine<Unit> { continuation ->
                val observer = object : SdpObserver {
                    override fun onSetSuccess() { if (continuation.isActive) continuation.resume(Unit) }
                    override fun onSetFailure(error: String) { if (continuation.isActive) continuation.resumeWithException(Exception(error)) }
                    override fun onCreateSuccess(sdp: SessionDescription) { }
                    override fun onCreateFailure(error: String) { }
                }
                val sdp = SessionDescription(SessionDescription.Type.fromCanonicalForm(json.get("type").asString), json.get("sdp").asString)
                if (local) pc.setLocalDescription(observer, sdp) else pc.setRemoteDescription(observer, sdp)
            }
        }
        private fun updateLevels() {
            val pc = subscriber ?: return
            pc.getStats { report ->
                val levels = report.statsMap.values.filter { it.type == "inbound-rtp" }
                    .associate { (it.members["mid"]?.toString() ?: "") to ((it.members["audioLevel"] as? Number)?.toDouble() ?: 0.0) }
                launchActive {
                    val list = desired.map { p ->
                        val id = p.get("id").asString
                        ParticipantInfo(id, p.get("name").asString, (levels[subscriptions[id]] ?: 0.0) > 0.01)
                    }
                    _participants.value = list
                    updateSquelch()
                    val collision = list.count { it.isSpeaking } + (if (isPttActive) 1 else 0) >= 2
                    if (collision != _collision.value) {
                        _collision.value = collision
                        // Collision is indicated visually; squelch stays a quiet local effect.
                    }
                }
            }
        }
        fun close() {
            if (closed) return
            closed = true
            microphone?.setEnabled(false)
            permissionJob?.cancel(); heartbeat?.cancel(); meterJob?.cancel(); jobs.toList().forEach { it.cancel() }
            socket?.close(1000, "Radio off")
            socket?.cancel()
            pending.values.forEach { it.completeExceptionally(CancellationException("Radio off")) }
            pending.clear()
            publisher?.close(); subscriber?.close()
            publisher?.dispose(); subscriber?.dispose()
            microphone?.dispose(); source?.dispose(); factory?.dispose(); audioModule?.release()
            microphone = null
            previousMode?.let { if (audioManager.mode == AudioManager.MODE_IN_COMMUNICATION) audioManager.mode = it }
        }
    }
    private fun playCollisionSound() {
        if (collisionAndroidAudioTrack != null) return

        try {
            val sampleRate = 44100
            val amplitude = 0.025

            // Generate 1 second of tone
            val numSamples = sampleRate
            val samples = ShortArray(numSamples)
            for (i in 0 until numSamples) {
                val sample = amplitude * (Random.nextDouble() * 2 - 1)
                samples[i] = (sample * Short.MAX_VALUE).toInt().toShort()
            }

            val bufferSize = AndroidAudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )

            val audioTrack = AndroidAudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
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
                .setTransferMode(AndroidAudioTrack.MODE_STATIC)
                .build()

            audioTrack.write(samples, 0, samples.size)
            audioTrack.setLoopPoints(0, numSamples, -1) // Loop indefinitely
            audioTrack.setVolume(_volume.value)
            audioTrack.play()

            collisionAndroidAudioTrack = audioTrack
        } catch (e: Exception) {
            android.util.Log.w("CloudflareRadio", "Erreur son collision: ${e.message}")
        }
    }

    private fun stopCollisionSound() {
        collisionAndroidAudioTrack?.let {
            try {
                it.stop()
                it.release()
            } catch (_: Exception) { }
        }
        collisionAndroidAudioTrack = null
    }
}
