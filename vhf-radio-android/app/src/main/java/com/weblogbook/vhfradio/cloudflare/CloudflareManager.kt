package com.weblogbook.vhfradio.cloudflare

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack as AndroidAudioTrack
import kotlin.math.sin
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

    suspend fun connectToFrequency(freq: String, participantName: String, accessToken: String) {
        if (!VhfFrequencies.isValid(freq)) return
        disconnect()
        _currentFrequency.value = freq
        _connectionState.value = ConnectionStatus.CONNECTING
        _connectionError.value = null
        val session = Session()
        current = session
        connectionJob = scope.launch {
            try {
                val ticket = ApiClient.getCloudflareToken(VhfFrequencies.frequencyToRoomName(freq), participantName, accessToken).getOrThrow()
                ensureActive()
                require(!ticket.url.isNullOrBlank() && !ticket.token.isNullOrBlank()) { "Réponse radio invalide" }
                session.connect(ticket.url!!, ticket.token!!)
                ensureActive()
                if (current === session) _connectionState.value = ConnectionStatus.CONNECTED
            } catch (_: CancellationException) { /* retune or disconnect */ }
            catch (e: Exception) { fail(session, e.message ?: "Connexion Cloudflare impossible") }
        }
        connectionJob?.join()
    }

    fun disconnect() {
        connectionJob?.cancel()
        connectionJob = null
        val old = current
        current = null
        old?.close()
        stopCollisionSound()
        _connectionState.value = ConnectionStatus.DISCONNECTED
        _connectionError.value = null
        _isTransmitting.value = false
        _participants.value = emptyList()
        _collision.value = false
    }
    fun destroy() { disconnect(); scope.cancel(); http.dispatcher.executorService.shutdown() }
    suspend fun startTransmit() {
        if (_connectionState.value != ConnectionStatus.CONNECTED) return
        current?.microphone?.setEnabled(true)
        _isTransmitting.value = current?.microphone != null
    }
    suspend fun stopTransmit() {
        current?.microphone?.setEnabled(false)
        _isTransmitting.value = false
    }
    private fun fail(session: Session, message: String) {
        if (current !== session) return
        disconnect()
        _connectionState.value = ConnectionStatus.ERROR
        _connectionError.value = "$message — reconnectez la radio."
    }

    private inner class Session {
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
        suspend fun connect(url: String, token: String) {
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
            audioModule = JavaAudioDeviceModule.builder(context.applicationContext).createAudioDeviceModule()
            factory = PeerConnectionFactory.builder().setAudioDeviceModule(audioModule).createPeerConnectionFactory()
            fun configuration() = PeerConnection.RTCConfiguration(iceServers).apply { sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN }
            publisher = factory!!.createPeerConnection(configuration(), observer(false)) ?: error("WebRTC indisponible")
            subscriber = factory!!.createPeerConnection(configuration(), observer(true)) ?: error("WebRTC indisponible")
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
                    }
                }
            }
            override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
                if (state == PeerConnection.PeerConnectionState.DISCONNECTED || state == PeerConnection.PeerConnectionState.FAILED) {
                    // Never restore a held PTT across a network interruption.
                    microphone?.setEnabled(false)
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
                    val collision = list.count { it.isSpeaking } + (if (isPttActive) 1 else 0) >= 2
                    if (collision != _collision.value) {
                        _collision.value = collision
                        if (collision) playCollisionSound() else stopCollisionSound()
                    }
                }
            }
        }
        fun close() {
            if (closed) return
            closed = true
            microphone?.setEnabled(false)
            heartbeat?.cancel(); meterJob?.cancel(); jobs.toList().forEach { it.cancel() }
            socket?.close(1000, "Radio off")
            pending.values.forEach { it.completeExceptionally(CancellationException("Radio off")) }
            pending.clear()
            publisher?.close(); subscriber?.close()
            publisher?.dispose(); subscriber?.dispose()
            microphone?.dispose(); source?.dispose(); factory?.dispose(); audioModule?.release()
            microphone = null
            previousMode?.let { audioManager.mode = it }
        }
    }
    private fun playCollisionSound() {
        if (collisionAndroidAudioTrack != null) return

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

            val bufferSize = AndroidAudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )

            val audioTrack = AndroidAudioTrack.Builder()
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
                .setTransferMode(AndroidAudioTrack.MODE_STATIC)
                .build()

            audioTrack.write(samples, 0, samples.size)
            audioTrack.setLoopPoints(0, numSamples, -1) // Loop indefinitely
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
