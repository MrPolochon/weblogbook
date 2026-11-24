package com.weblogbook.vhfradio.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.weblogbook.vhfradio.BuildConfig
import com.weblogbook.vhfradio.update.UpdateState

@Composable
fun UpdatePanel(state: UpdateState, radioPowered: Boolean, onCheck: () -> Unit, onDownload: () -> Unit, onInstall: () -> Unit) {
    Surface(color = Color(0xff0f172a)) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
            val release = state.release
            if (release != null) {
                Text("Mise à jour disponible : ${release.versionName}", color = Color(0xff7dd3fc), fontSize = 14.sp)
                when {
                    state.downloading -> {
                        LinearProgressIndicator(progress = { state.progress / 100f }, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp))
                        Text("Téléchargement : ${state.progress} %", color = Color.White, fontSize = 12.sp)
                    }
                    state.verifying -> Text("Vérification de l'application…", color = Color.White)
                    state.file != null -> {
                        Button(onClick = onInstall, enabled = !radioPowered && !state.checking) { Text("Installer la mise à jour") }
                        Text(if (radioPowered) "Éteins la radio avec OFF pour installer." else "Android te demandera de confirmer l'installation.", color = Color(0xff94a3b8), fontSize = 12.sp)
                    }
                    else -> TextButton(onClick = onDownload, enabled = !state.checking) {
                        Text("Mettre à jour · ${release.size / 1024 / 1024} Mo")
                    }
                }
            } else {
                TextButton(onClick = onCheck, enabled = !state.checking) {
                    Text(if (state.checking) "Recherche des mises à jour…" else "v${BuildConfig.VERSION_NAME} · Rechercher une mise à jour", fontSize = 12.sp)
                }
            }
            state.message?.let { Text(it, color = Color(0xfffbbf24), fontSize = 12.sp) }
        }
    }
}
