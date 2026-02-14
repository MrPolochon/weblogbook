package com.weblogbook.vhfradio.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.weblogbook.vhfradio.data.ApiClient
import com.weblogbook.vhfradio.data.VhfFrequencies
import com.weblogbook.vhfradio.livekit.LiveKitManager
import com.weblogbook.vhfradio.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun RadioScreen(
    profile: UserProfile,
    mode: RadioMode,
    accessToken: String,
    liveKitManager: LiveKitManager,
    onLogout: () -> Unit,
    onStartOverlay: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val mhzRange = remember { VhfFrequencies.getMhzRange() }
    val allDecimals = remember { VhfFrequencies.ALL_DECIMALS }
    val isLocked = mode != RadioMode.PILOT

    // Radio state
    var radioOn by remember { mutableStateOf(false) }
    var actMhzIndex by remember { mutableIntStateOf(0) }
    var actDecIndex by remember { mutableIntStateOf(0) }
    var stbyMhzIndex by remember { mutableIntStateOf(0) }
    var stbyDecIndex by remember { mutableIntStateOf(0) }

    // Session state (ATC/AFIS)
    var sessionInfo by remember { mutableStateOf("") }
    var lockedFrequency by remember { mutableStateOf<String?>(null) }
    var noSession by remember { mutableStateOf(false) }
    var lastSessionKey by remember { mutableStateOf("") }

    // LiveKit state
    val connectionState by liveKitManager.connectionState.collectAsState()
    val isTransmitting by liveKitManager.isTransmitting.collectAsState()
    val participants by liveKitManager.participants.collectAsState()
    val collision by liveKitManager.collision.collectAsState()

    var showSettings by remember { mutableStateOf(false) }
    var isReconnecting by remember { mutableStateOf(false) }

    // Computed frequencies
    val actMhz = mhzRange.getOrElse(actMhzIndex) { 118 }
    val actDecimals = remember(actMhz) { VhfFrequencies.getDecimalsForMhz(actMhz) }
    val safeActDecIndex = actDecIndex.coerceAtMost(actDecimals.size - 1)
    val activeFreq = VhfFrequencies.format(actMhz, actDecimals.getOrElse(safeActDecIndex) { "000" })

    val stbyMhz = mhzRange.getOrElse(stbyMhzIndex) { 118 }
    val stbyDecimals = remember(stbyMhz) { VhfFrequencies.getDecimalsForMhz(stbyMhz) }
    val safeStbyDecIndex = stbyDecIndex.coerceAtMost(stbyDecimals.size - 1)
    val standbyFreq = VhfFrequencies.format(stbyMhz, stbyDecimals.getOrElse(safeStbyDecIndex) { "000" })

    val isConnected = connectionState == LiveKitManager.ConnectionStatus.CONNECTED
    val isConnecting = connectionState == LiveKitManager.ConnectionStatus.CONNECTING

    val participantName = if (sessionInfo.isNotEmpty()) {
        "${profile.identifiant} ($sessionInfo)"
    } else {
        profile.identifiant
    }

    // Session polling for ATC/AFIS
    LaunchedEffect(mode, accessToken) {
        if (mode == RadioMode.PILOT) return@LaunchedEffect
        while (true) {
            try {
                val modeStr = if (mode == RadioMode.ATC) "atc" else "afis"
                val result = ApiClient.checkSession(modeStr, accessToken)
                result.getOrNull()?.let { data ->
                    val info = if (data.session != null) {
                        "${data.session.aeroport ?: ""} ${data.session.position ?: ""}"
                    } else ""
                    val freq = data.frequency
                    val key = "$info|$freq|${data.noSession}"

                    if (key != lastSessionKey) {
                        lastSessionKey = key
                        sessionInfo = info
                        lockedFrequency = freq
                        noSession = data.noSession ?: false

                        if (freq != null) {
                            VhfFrequencies.parse(freq)?.let { (mhz, dec) ->
                                actMhzIndex = mhzRange.indexOf(mhz).coerceAtLeast(0)
                                actDecIndex = allDecimals.indexOf(dec).coerceAtLeast(0)
                                stbyMhzIndex = actMhzIndex
                                stbyDecIndex = actDecIndex
                            }
                        }
                    }
                }
            } catch (_: Exception) { }
            delay(30_000)
        }
    }

    // Auto-connect when freq changes
    var prevActiveFreq by remember { mutableStateOf("") }
    LaunchedEffect(radioOn, activeFreq) {
        if (!radioOn) {
            if (connectionState != LiveKitManager.ConnectionStatus.DISCONNECTED) {
                liveKitManager.disconnect()
            }
            prevActiveFreq = ""
            return@LaunchedEffect
        }
        if (activeFreq != prevActiveFreq) {
            prevActiveFreq = activeFreq
            liveKitManager.connectToFrequency(activeFreq, participantName, accessToken)
        }
    }

    // Auto-ON for ATC/AFIS
    LaunchedEffect(isLocked, lockedFrequency) {
        if (isLocked && lockedFrequency != null) {
            radioOn = true
        }
    }

    // Mode config
    val modeLabel = when (mode) {
        RadioMode.PILOT -> "PILOTE"
        RadioMode.ATC -> "ATC"
        RadioMode.AFIS -> "AFIS"
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Slate900, Color(0xFF020617))
                )
            )
    ) {
        // Top bar
        TopBar(
            profile = profile,
            sessionInfo = sessionInfo,
            modeLabel = modeLabel,
            mode = mode,
            onLogout = onLogout,
            onStartOverlay = onStartOverlay
        )

        // No session warning
        if (noSession && mode != RadioMode.PILOT) {
            NoSessionWarning(mode)
        }

        // Main content
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.Center
        ) {
            if (mode == RadioMode.PILOT || (lockedFrequency != null && !noSession)) {
                // Radio panel
                RadioPanel(
                    radioOn = radioOn,
                    collision = collision,
                    activeFreq = activeFreq,
                    standbyFreq = standbyFreq,
                    isLocked = isLocked,
                    isConnected = isConnected,
                    isConnecting = isConnecting,
                    isTransmitting = isTransmitting,
                    isReconnecting = isReconnecting,
                    participants = participants,
                    mhzRange = mhzRange,
                    stbyDecimals = stbyDecimals,
                    stbyMhzIndex = stbyMhzIndex,
                    safeStbyDecIndex = safeStbyDecIndex,
                    onToggleRadio = {
                        if (radioOn) {
                            liveKitManager.disconnect()
                            radioOn = false
                        } else {
                            radioOn = true
                        }
                    },
                    onSwapFrequencies = {
                        if (!isLocked) {
                            val tmpMhz = actMhzIndex
                            val tmpDec = actDecIndex
                            actMhzIndex = stbyMhzIndex
                            actDecIndex = stbyDecIndex
                            stbyMhzIndex = tmpMhz
                            stbyDecIndex = tmpDec
                        }
                    },
                    onStbyMhzChange = { stbyMhzIndex = it },
                    onStbyDecChange = {
                        stbyDecIndex = it.coerceAtMost(stbyDecimals.size - 1)
                    },
                    onPttDown = {
                        scope.launch { liveKitManager.startTransmit() }
                    },
                    onPttUp = {
                        scope.launch { liveKitManager.stopTransmit() }
                    },
                    onReconnect = {
                        if (!isReconnecting && radioOn) {
                            isReconnecting = true
                            scope.launch {
                                liveKitManager.disconnect()
                                delay(500)
                                prevActiveFreq = ""
                                liveKitManager.connectToFrequency(activeFreq, participantName, accessToken)
                                isReconnecting = false
                            }
                        }
                    }
                )
            } else if (noSession) {
                // Waiting for session
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Spacer(modifier = Modifier.height(48.dp))
                    Icon(
                        imageVector = Icons.Default.Radio,
                        contentDescription = null,
                        tint = Slate600,
                        modifier = Modifier.size(48.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "En attente de ta session ${if (mode == RadioMode.ATC) "ATC" else "AFIS"}...",
                        color = Slate400,
                        fontSize = 14.sp
                    )
                    Text(
                        text = "Connecte-toi sur le site WebLogbook",
                        color = Slate500,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            } else {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Spacer(modifier = Modifier.height(48.dp))
                    CircularProgressIndicator(
                        color = Emerald400,
                        modifier = Modifier.size(32.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Chargement de la fréquence...", color = Slate400, fontSize = 14.sp)
                }
            }
        }

        // Footer
        Text(
            text = "WebLogbook VHF Radio v1.0",
            fontSize = 9.sp,
            color = Slate600,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp)
        )
    }
}

/* ══════════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════════ */

@Composable
private fun TopBar(
    profile: UserProfile,
    sessionInfo: String,
    modeLabel: String,
    mode: RadioMode,
    onLogout: () -> Unit,
    onStartOverlay: () -> Unit
) {
    val modeColor = when (mode) {
        RadioMode.PILOT -> Sky500
        RadioMode.ATC -> Emerald500
        RadioMode.AFIS -> Red500
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Slate800.copy(alpha = 0.5f))
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Default.Radio,
            contentDescription = null,
            tint = Emerald400,
            modifier = Modifier.size(16.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = profile.identifiant,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = Slate300
        )
        if (sessionInfo.isNotEmpty()) {
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = sessionInfo,
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace,
                color = Emerald400,
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(Emerald500.copy(alpha = 0.2f))
                    .padding(horizontal = 8.dp, vertical = 2.dp)
            )
        }
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = modeLabel,
            fontSize = 10.sp,
            color = modeColor,
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(modeColor.copy(alpha = 0.2f))
                .padding(horizontal = 8.dp, vertical = 2.dp)
        )
        Spacer(modifier = Modifier.weight(1f))

        // Overlay button
        IconButton(
            onClick = onStartOverlay,
            modifier = Modifier.size(32.dp)
        ) {
            Icon(
                imageVector = Icons.Default.PictureInPicture,
                contentDescription = "Overlay",
                tint = Slate500,
                modifier = Modifier.size(18.dp)
            )
        }

        // Logout button
        IconButton(
            onClick = onLogout,
            modifier = Modifier.size(32.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Logout,
                contentDescription = "Déconnexion",
                tint = Slate500,
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

@Composable
private fun NoSessionWarning(mode: RadioMode) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Amber400.copy(alpha = 0.1f))
            .border(1.dp, Amber400.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
            .padding(12.dp),
        verticalAlignment = Alignment.Top
    ) {
        Icon(
            imageVector = Icons.Default.Warning,
            contentDescription = null,
            tint = Amber400,
            modifier = Modifier.size(16.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Column {
            Text(
                text = "Aucune session ${if (mode == RadioMode.ATC) "ATC" else "AFIS"} active.",
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = Amber300
            )
            Text(
                text = "Met-toi en service sur WebLogbook pour que ta fréquence soit assignée.",
                fontSize = 11.sp,
                color = Amber400.copy(alpha = 0.8f),
                modifier = Modifier.padding(top = 2.dp)
            )
        }
    }
}

@Composable
private fun RadioPanel(
    radioOn: Boolean,
    collision: Boolean,
    activeFreq: String,
    standbyFreq: String,
    isLocked: Boolean,
    isConnected: Boolean,
    isConnecting: Boolean,
    isTransmitting: Boolean,
    isReconnecting: Boolean,
    participants: List<LiveKitManager.ParticipantInfo>,
    mhzRange: List<Int>,
    stbyDecimals: List<String>,
    stbyMhzIndex: Int,
    safeStbyDecIndex: Int,
    onToggleRadio: () -> Unit,
    onSwapFrequencies: () -> Unit,
    onStbyMhzChange: (Int) -> Unit,
    onStbyDecChange: (Int) -> Unit,
    onPttDown: () -> Unit,
    onPttUp: () -> Unit,
    onReconnect: () -> Unit
) {
    val borderColor by animateColorAsState(
        targetValue = when {
            !radioOn -> Slate700.copy(alpha = 0.5f)
            collision -> Red500.copy(alpha = 0.5f)
            else -> Slate700
        },
        animationSpec = tween(300),
        label = "border"
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, borderColor, RoundedCornerShape(16.dp)),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = Slate800.copy(alpha = if (radioOn) 1f else 0.6f)
        )
    ) {
        Column {
            // Header
            RadioHeader(
                radioOn = radioOn,
                collision = collision,
                isConnected = isConnected,
                isConnecting = isConnecting,
                isReconnecting = isReconnecting,
                onToggleRadio = onToggleRadio,
                onReconnect = onReconnect
            )

            // Frequency display
            FrequencyDisplay(
                radioOn = radioOn,
                collision = collision,
                activeFreq = activeFreq,
                standbyFreq = standbyFreq,
                isLocked = isLocked,
                onSwapFrequencies = onSwapFrequencies
            )

            // Frequency dials (pilot only)
            if (!isLocked && radioOn) {
                FrequencyDials(
                    mhzRange = mhzRange,
                    stbyDecimals = stbyDecimals,
                    stbyMhzIndex = stbyMhzIndex,
                    safeStbyDecIndex = safeStbyDecIndex,
                    onStbyMhzChange = onStbyMhzChange,
                    onStbyDecChange = onStbyDecChange
                )
            }

            // PTT Button
            if (radioOn) {
                PttButton(
                    isConnected = isConnected,
                    isTransmitting = isTransmitting,
                    onPttDown = onPttDown,
                    onPttUp = onPttUp
                )
            }

            // Collision warning
            if (collision && radioOn) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = null,
                        tint = Red400,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "DOUBLE TRANSMISSION",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Red400
                    )
                }
            }

            // Participants
            if (isConnected && radioOn) {
                ParticipantsList(participants)
            }

            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

@Composable
private fun RadioHeader(
    radioOn: Boolean,
    collision: Boolean,
    isConnected: Boolean,
    isConnecting: Boolean,
    isReconnecting: Boolean,
    onToggleRadio: () -> Unit,
    onReconnect: () -> Unit
) {
    val headerBg = if (collision && radioOn) Red500.copy(alpha = 0.15f) else Slate800.copy(alpha = 0.8f)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(headerBg)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Power button
        IconButton(
            onClick = onToggleRadio,
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(if (radioOn) Emerald600 else Slate700)
        ) {
            Icon(
                imageVector = Icons.Default.Power,
                contentDescription = "Power",
                tint = if (radioOn) Color.White else Slate500,
                modifier = Modifier.size(18.dp)
            )
        }

        Spacer(modifier = Modifier.width(8.dp))

        Icon(
            imageVector = Icons.Default.Radio,
            contentDescription = null,
            tint = when {
                !radioOn -> Slate600
                collision -> Red400
                else -> Emerald400
            },
            modifier = Modifier.size(16.dp)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = "VHF COM1",
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Slate300,
            letterSpacing = 1.sp
        )

        Spacer(modifier = Modifier.weight(1f))

        // Status dot
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(
                    when {
                        !radioOn -> Slate600
                        isConnected -> Emerald400
                        isConnecting -> Amber400
                        else -> Red500
                    }
                )
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = when {
                !radioOn -> "OFF"
                isConnected -> "EN LIGNE"
                isConnecting -> "CONNEXION..."
                else -> "HORS LIGNE"
            },
            fontSize = 10.sp,
            color = Slate500
        )

        if (radioOn) {
            Spacer(modifier = Modifier.width(4.dp))
            IconButton(
                onClick = onReconnect,
                enabled = !isReconnecting && !isConnecting,
                modifier = Modifier.size(28.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = "Reconnexion",
                    tint = if (isReconnecting) Slate600 else Slate500,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}

@Composable
private fun FrequencyDisplay(
    radioOn: Boolean,
    collision: Boolean,
    activeFreq: String,
    standbyFreq: String,
    isLocked: Boolean,
    onSwapFrequencies: () -> Unit
) {
    val freqBg = if (collision) Red500.copy(alpha = 0.08f) else Slate900.copy(alpha = 0.5f)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(freqBg)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Active frequency
        Column(
            modifier = Modifier.weight(1f),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "ACT",
                fontSize = 9.sp,
                color = Slate500,
                letterSpacing = 2.sp
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = activeFreq,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                letterSpacing = 2.sp,
                color = when {
                    !radioOn -> Slate600
                    collision -> Red400
                    else -> Emerald300
                }
            )
        }

        // Swap button
        if (!isLocked) {
            IconButton(
                onClick = onSwapFrequencies,
                enabled = radioOn,
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Slate700)
            ) {
                Icon(
                    imageVector = Icons.Default.SwapHoriz,
                    contentDescription = "Swap",
                    tint = if (radioOn) Amber400 else Slate600,
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        // Standby frequency
        Column(
            modifier = Modifier.weight(1f),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "STBY",
                fontSize = 9.sp,
                color = Slate500,
                letterSpacing = 2.sp
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = standbyFreq,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                letterSpacing = 2.sp,
                color = if (!radioOn) Slate600 else Amber300.copy(alpha = 0.7f)
            )
        }
    }
}

@Composable
private fun FrequencyDials(
    mhzRange: List<Int>,
    stbyDecimals: List<String>,
    stbyMhzIndex: Int,
    safeStbyDecIndex: Int,
    onStbyMhzChange: (Int) -> Unit,
    onStbyDecChange: (Int) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "REGLAGE STBY",
            fontSize = 9.sp,
            color = Amber400.copy(alpha = 0.6f),
            letterSpacing = 2.sp
        )
        Spacer(modifier = Modifier.height(8.dp))

        Row(
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // MHz selector
            FrequencySelector(
                label = "MHz",
                values = mhzRange.map { it.toString() },
                currentIndex = stbyMhzIndex,
                onChange = onStbyMhzChange
            )

            Text(
                text = ".",
                fontSize = 28.sp,
                fontFamily = FontFamily.Monospace,
                color = Slate500,
                modifier = Modifier.padding(horizontal = 4.dp)
            )

            // kHz selector
            FrequencySelector(
                label = "kHz",
                values = stbyDecimals,
                currentIndex = safeStbyDecIndex,
                onChange = onStbyDecChange
            )
        }
    }
}

@Composable
private fun FrequencySelector(
    label: String,
    values: List<String>,
    currentIndex: Int,
    onChange: (Int) -> Unit
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        // Up button
        IconButton(
            onClick = { if (currentIndex > 0) onChange(currentIndex - 1) },
            modifier = Modifier.size(32.dp)
        ) {
            Icon(
                imageVector = Icons.Default.KeyboardArrowUp,
                contentDescription = "Up",
                tint = Slate400
            )
        }

        // Current value
        Text(
            text = values.getOrElse(currentIndex) { "---" },
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            color = Amber300,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(Slate700.copy(alpha = 0.5f))
                .padding(horizontal = 12.dp, vertical = 6.dp)
        )

        // Down button
        IconButton(
            onClick = { if (currentIndex < values.size - 1) onChange(currentIndex + 1) },
            modifier = Modifier.size(32.dp)
        ) {
            Icon(
                imageVector = Icons.Default.KeyboardArrowDown,
                contentDescription = "Down",
                tint = Slate400
            )
        }

        Text(text = label, fontSize = 9.sp, color = Slate500)
    }
}

@Composable
private fun PttButton(
    isConnected: Boolean,
    isTransmitting: Boolean,
    onPttDown: () -> Unit,
    onPttUp: () -> Unit
) {
    val pttColor by animateColorAsState(
        targetValue = if (isTransmitting) Emerald600 else Slate700,
        animationSpec = tween(150),
        label = "ptt"
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .height(56.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (isConnected) pttColor else Slate800)
            .then(
                if (isConnected) {
                    Modifier.pointerInput(Unit) {
                        detectTapGestures(
                            onPress = {
                                onPttDown()
                                tryAwaitRelease()
                                onPttUp()
                            }
                        )
                    }
                } else Modifier
            ),
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = if (isTransmitting) Icons.Default.Mic else Icons.Default.MicOff,
                contentDescription = null,
                tint = if (isTransmitting) Color.White else Slate400,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = if (isTransmitting) "TX — Transmission" else "PTT — Appuyer pour parler",
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
                color = if (isTransmitting) Color.White else Slate300
            )
        }
    }
}

@Composable
private fun ParticipantsList(participants: List<LiveKitManager.ParticipantInfo>) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
    ) {
        HorizontalDivider(color = Slate700.copy(alpha = 0.5f), thickness = 1.dp)
        Spacer(modifier = Modifier.height(8.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Default.People,
                contentDescription = null,
                tint = Slate400,
                modifier = Modifier.size(14.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = "SUR LA FREQUENCE (${participants.size})",
                fontSize = 10.sp,
                color = Slate400,
                letterSpacing = 1.sp
            )
        }

        Spacer(modifier = Modifier.height(4.dp))

        if (participants.isEmpty()) {
            Text(
                text = "Aucun utilisateur",
                fontSize = 10.sp,
                color = Slate600,
                fontStyle = androidx.compose.ui.text.font.FontStyle.Italic
            )
        } else {
            participants.forEach { p ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(4.dp))
                        .background(if (p.isSpeaking) Emerald500.copy(alpha = 0.1f) else Color.Transparent)
                        .padding(horizontal = 6.dp, vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(if (p.isSpeaking) Emerald400 else Slate600)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = p.name,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        color = if (p.isSpeaking) Emerald300 else Slate400
                    )
                    if (p.isSpeaking) {
                        Spacer(modifier = Modifier.weight(1f))
                        Icon(
                            imageVector = Icons.Default.Mic,
                            contentDescription = null,
                            tint = Emerald400,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                }
            }
        }
    }
}
