package com.weblogbook.vhfradio.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import com.weblogbook.vhfradio.BuildConfig
import com.weblogbook.vhfradio.cloudflare.CloudflareManager.ConnectionStatus
import com.weblogbook.vhfradio.data.RadioControls.MicMode
import com.weblogbook.vhfradio.data.VhfFrequencies
import com.weblogbook.vhfradio.service.VhfOverlayService

@Composable
fun RadioScreen(service: VhfOverlayService, onMicMode: (MicMode) -> Unit, onSwap: () -> Unit, onOverlay: () -> Unit) {
    val radio = service.radio
    val user by service.profile.collectAsState()
    val position by service.position.collectAsState()
    val positionAllowed by service.positionAllowed.collectAsState()
    val standby by service.standby.collectAsState()
    val frequency by radio.currentFrequency.collectAsState()
    val connected by radio.connectionState.collectAsState()
    val powered by radio.powered.collectAsState()
    val receiveOnly by radio.receiveOnly.collectAsState()
    val mode by radio.micMode.collectAsState()
    val tx by radio.isTransmitting.collectAsState()
    val preparing by radio.preparing.collectAsState()
    val participants by radio.participants.collectAsState()
    val error by radio.connectionError.collectAsState()
    val message by service.message.collectAsState()
    val overlay by service.overlayVisible.collectAsState()
    val volume by radio.volume.collectAsState()
    val effects by radio.effects.collectAsState()
    var confirmOpen by remember { mutableStateOf(false) }
    val canSpeak = connected == ConnectionStatus.CONNECTED && !receiveOnly && positionAllowed
    DisposableEffect(radio) { onDispose { radio.release("screen") } }
    Column(Modifier.fillMaxSize().background(Color(0xff020617)).safeDrawingPadding()
        .verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("COM BOX", color = Color.White, fontSize = 24.sp, modifier = Modifier.weight(1f))
            TextButton(onClick = { service.logout() }) { Text("Déconnexion") }
        }
        Text((user?.identifiant ?: "") + if (position.isBlank()) "" else " · $position", color = Color(0xff94a3b8))
        if (!positionAllowed) {
            Text(message ?: "Connecte-toi à une position sur le site.", color = Color(0xfffbbf24))
        } else {
            Surface(color = if (tx) Color(0xff7f1d1d) else Color(0xff042f2e), shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.fillMaxWidth().padding(18.dp)) {
                    Text("COM 1 · ACTIVE", color = Color.White)
                    Text(if (powered) frequency else "---.---", fontFamily = FontFamily.Monospace, color = Color.White, fontSize = 38.sp)
                    Text(when {
                        !powered -> "ÉTEINTE"
                        tx -> "ÉMISSION"
                        connected != ConnectionStatus.CONNECTED -> "CONNEXION / RECONNEXION"
                        receiveOnly -> "OBS · ÉCOUTE UNIQUEMENT"
                        else -> "ÉCOUTE"
                    }, color = Color(0xffbae6fd))
                }
            }
            OutlinedTextField(value = standby, onValueChange = { if (it.length <= 7) service.standby.value = it.replace(',', '.') },
                label = { Text("Fréquence en attente") }, singleLine = true,
                isError = !VhfFrequencies.isValid(standby), modifier = Modifier.fillMaxWidth())
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FrequencyDial("MHz", standby.take(3), Modifier.weight(1f)) { service.standby.value = VhfFrequencies.step(standby, true, it) }
                FrequencyDial("Décimales", standby.takeLast(3), Modifier.weight(1f)) { service.standby.value = VhfFrequencies.step(standby, false, it) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onSwap, enabled = VhfFrequencies.isValid(standby) && (!powered || standby != frequency), modifier = Modifier.weight(1f)) { Text("⇄ Basculer et connecter") }
                OutlinedButton(onClick = { service.powerOff() }, enabled = powered) { Text("OFF") }
            }
            Text("118.000 à 136.990 · le réglage modifie seulement la présélection.", color = Color(0xff94a3b8), fontSize = 12.sp)
            if (powered && receiveOnly && connected == ConnectionStatus.CONNECTED)
                Text("OBS : écoute uniquement. Un plan de vol actif ou une position connectée est nécessaire pour émettre.", color = Color(0xff7dd3fc))
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                listOf(MicMode.MUTED to "Coupé", MicMode.PTT to "PTT", MicMode.OPEN to "Ouvert").forEach { (choice, label) ->
                    OutlinedButton(onClick = { if (choice == MicMode.OPEN) confirmOpen = true else onMicMode(choice) },
                        enabled = choice == MicMode.MUTED || (canSpeak && !preparing), modifier = Modifier.weight(1f)) {
                        Text(if (choice == mode) "● $label" else label)
                    }
                }
            }
            if (preparing) Text("Préparation du microphone…", color = Color(0xff7dd3fc))
            if (mode == MicMode.PTT) {
                val enabled = canSpeak && !preparing
                Surface(color = if (tx) Color(0xffb91c1c) else Color(0xff075985), shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth().height(90.dp)
                        .semantics { contentDescription = "Maintenir pour parler"; if (!enabled) disabled() }
                        .pointerInput(enabled) {
                            if (enabled) detectTapGestures(onPress = {
                                radio.press("screen")
                                try { awaitRelease() } finally { radio.release("screen") }
                            })
                        }) {
                    Box(contentAlignment = Alignment.Center) { Text(if (tx) "ÉMISSION" else "Maintenir pour parler", color = Color.White, fontSize = 20.sp) }
                }
            }
            if (mode == MicMode.OPEN) Text("Micro ouvert : toutes tes paroles sont envoyées à la fréquence.", color = Color(0xfffca5a5))
            OutlinedButton(onClick = onOverlay, enabled = powered, modifier = Modifier.fillMaxWidth()) { Text(if (overlay) "Masquer la bulle PTT" else "Afficher la bulle sur Roblox") }
            Text("Pour parler depuis la bulle, active d'abord PTT ici. Déplace la bulle en faisant glisser sa fréquence.", color = Color(0xff94a3b8), fontSize = 12.sp)
            Text("Volume radio : " + (volume * 100).toInt() + " %", color = Color.White)
            Slider(value = volume, onValueChange = radio::setVolume)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = effects, onCheckedChange = radio::setEffects)
                Text("Grésillement radio", color = Color.White)
            }
            error?.let { Text(it, color = Color(0xfffca5a5)) }
            message?.let { Text(it, color = Color(0xfffbbf24)) }
            if (connected == ConnectionStatus.CONNECTED) {
                Text("Sur la fréquence : " + (participants.size + 1), color = Color.White)
                participants.forEach { Text((if (it.isSpeaking) "● " else "○ ") + it.name, color = if (it.isSpeaking) Color(0xff6ee7b7) else Color(0xff94a3b8)) }
            }
        }
        Text("Discord et la radio peuvent se disputer le micro sur un même téléphone. Utilise un autre appareil pour le cockpit Discord.", color = Color(0xff94a3b8), fontSize = 12.sp)
        Text("VHF Radio Android " + BuildConfig.VERSION_NAME, color = Color(0xff64748b), fontSize = 11.sp)
    }
    if (confirmOpen) AlertDialog(onDismissRequest = { confirmOpen = false }, title = { Text("Ouvrir le microphone ?") },
        text = { Text("Toutes tes paroles seront transmises à la fréquence, même quand tu passes sur Roblox. Le bouton « Couper le micro » de la notification permet de l'arrêter.") },
        confirmButton = { TextButton(onClick = { confirmOpen = false; onMicMode(MicMode.OPEN) }) { Text("Ouvrir") } },
        dismissButton = { TextButton(onClick = { confirmOpen = false }) { Text("Annuler") } })
}
@Composable
private fun FrequencyDial(label: String, value: String, modifier: Modifier, step: (Int) -> Unit) {
    Surface(modifier = modifier, color = Color(0xff0f172a), shape = RoundedCornerShape(12.dp)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, color = Color(0xff94a3b8), modifier = Modifier.padding(top = 8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { step(-1) }) { Text("−") }
                Text(value, color = Color(0xffbae6fd), fontFamily = FontFamily.Monospace, fontSize = 22.sp)
                TextButton(onClick = { step(1) }) { Text("+") }
            }
        }
    }
}
