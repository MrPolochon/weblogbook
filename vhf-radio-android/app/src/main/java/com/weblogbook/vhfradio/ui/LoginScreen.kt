package com.weblogbook.vhfradio.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.weblogbook.vhfradio.data.ApiClient
import com.weblogbook.vhfradio.ui.theme.*
import kotlinx.coroutines.launch

enum class RadioMode { PILOT, ATC, AFIS }

data class UserProfile(
    val id: String,
    val identifiant: String,
    val role: String,
    val atc: Boolean,
    val siavi: Boolean
)

@Composable
fun LoginScreen(
    onLogin: (UserProfile, RadioMode, String) -> Unit
) {
    var identifiant by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var mode by remember { mutableStateOf(RadioMode.PILOT) }
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Slate900, Color(0xFF020617))
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 380.dp)
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Logo
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Emerald600.copy(alpha = 0.2f))
                    .border(1.dp, Emerald500.copy(alpha = 0.3f), RoundedCornerShape(16.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Radio,
                    contentDescription = null,
                    tint = Emerald400,
                    modifier = Modifier.size(32.dp)
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "VHF Radio",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            Text(
                text = "Connexion WebLogbook",
                fontSize = 14.sp,
                color = Slate400,
                modifier = Modifier.padding(top = 4.dp)
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Mode selector
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Slate800.copy(alpha = 0.6f))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                ModeButton(
                    label = "Pilote",
                    icon = Icons.Default.Flight,
                    selected = mode == RadioMode.PILOT,
                    selectedColor = Sky500,
                    modifier = Modifier.weight(1f)
                ) { mode = RadioMode.PILOT }

                ModeButton(
                    label = "ATC",
                    icon = Icons.Default.Radio,
                    selected = mode == RadioMode.ATC,
                    selectedColor = Emerald500,
                    modifier = Modifier.weight(1f)
                ) { mode = RadioMode.ATC }

                ModeButton(
                    label = "AFIS",
                    icon = Icons.Default.LocalFireDepartment,
                    selected = mode == RadioMode.AFIS,
                    selectedColor = Red500,
                    modifier = Modifier.weight(1f)
                ) { mode = RadioMode.AFIS }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Identifiant
            Text(
                text = "Identifiant",
                fontSize = 12.sp,
                color = Slate400,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(6.dp))
            OutlinedTextField(
                value = identifiant,
                onValueChange = { identifiant = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text("Ton identifiant", color = Slate500) },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Emerald500.copy(alpha = 0.5f),
                    unfocusedBorderColor = Slate700,
                    focusedContainerColor = Slate800,
                    unfocusedContainerColor = Slate800,
                    cursorColor = Emerald400,
                    focusedTextColor = Slate200,
                    unfocusedTextColor = Slate200
                ),
                shape = RoundedCornerShape(10.dp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next)
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Password
            Text(
                text = "Mot de passe",
                fontSize = 12.sp,
                color = Slate400,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(6.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                placeholder = { Text("••••••••", color = Slate500) },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Emerald500.copy(alpha = 0.5f),
                    unfocusedBorderColor = Slate700,
                    focusedContainerColor = Slate800,
                    unfocusedContainerColor = Slate800,
                    cursorColor = Emerald400,
                    focusedTextColor = Slate200,
                    unfocusedTextColor = Slate200
                ),
                shape = RoundedCornerShape(10.dp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(
                    onDone = { focusManager.clearFocus() }
                )
            )

            // Error
            if (error.isNotEmpty()) {
                Spacer(modifier = Modifier.height(12.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(Red500.copy(alpha = 0.1f))
                        .border(1.dp, Red500.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
                        .padding(12.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    Icon(
                        imageVector = Icons.Default.Error,
                        contentDescription = null,
                        tint = Red400,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = error,
                        fontSize = 12.sp,
                        color = Red300
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Login button
            val buttonColor = when (mode) {
                RadioMode.PILOT -> Sky500
                RadioMode.ATC -> Emerald600
                RadioMode.AFIS -> Red500
            }
            val buttonLabel = when (mode) {
                RadioMode.PILOT -> "Connexion Pilote"
                RadioMode.ATC -> "Connexion ATC"
                RadioMode.AFIS -> "Connexion AFIS"
            }

            Button(
                onClick = {
                    if (identifiant.isBlank() || password.isBlank()) {
                        error = "Remplis tous les champs"
                        return@Button
                    }
                    error = ""
                    loading = true
                    focusManager.clearFocus()

                    scope.launch {
                        try {
                            // Sign in
                            val authResult = ApiClient.signIn(identifiant, password)
                            val (authResponse, token) = authResult.getOrElse {
                                val msg = it.message ?: "Erreur"
                                error = if (msg.contains("Invalid login", ignoreCase = true))
                                    "Identifiant ou mot de passe incorrect"
                                else msg
                                loading = false
                                return@launch
                            }

                            val userId = authResponse.user?.id
                            if (userId == null) {
                                error = "Impossible de se connecter"
                                loading = false
                                return@launch
                            }

                            // Fetch profile
                            val profileResult = ApiClient.fetchProfile(userId, token)
                            val profile = profileResult.getOrElse {
                                error = "Profil introuvable. Vérifie que ton compte existe sur WebLogbook."
                                loading = false
                                return@launch
                            }

                            // Validate role access
                            when (mode) {
                                RadioMode.ATC -> {
                                    val canAtc = profile.role == "admin" || profile.role == "atc" || profile.atc
                                    if (!canAtc) {
                                        error = "Ce compte n'a pas accès en tant qu'ATC."
                                        loading = false
                                        return@launch
                                    }
                                }
                                RadioMode.AFIS -> {
                                    val canAfis = profile.role == "admin" || profile.role == "siavi" || profile.siavi
                                    if (!canAfis) {
                                        error = "Ce compte n'a pas accès en tant qu'AFIS."
                                        loading = false
                                        return@launch
                                    }
                                }
                                RadioMode.PILOT -> {
                                    if (profile.role == "atc") {
                                        error = "Ce compte est uniquement ATC. Sélectionne \"ATC\"."
                                        loading = false
                                        return@launch
                                    }
                                    if (profile.role == "siavi") {
                                        error = "Ce compte est uniquement SIAVI. Sélectionne \"AFIS\"."
                                        loading = false
                                        return@launch
                                    }
                                }
                            }

                            // Sign out locally to not interfere with website session
                            ApiClient.signOutLocal(token)

                            // Callback
                            onLogin(
                                UserProfile(
                                    id = userId,
                                    identifiant = profile.identifiant,
                                    role = profile.role,
                                    atc = profile.atc,
                                    siavi = profile.siavi
                                ),
                                mode,
                                token
                            )
                        } catch (e: Exception) {
                            error = "Erreur de connexion. Vérifie ta connexion internet."
                        } finally {
                            loading = false
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                enabled = !loading,
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = buttonColor,
                    disabledContainerColor = buttonColor.copy(alpha = 0.5f)
                )
            ) {
                if (loading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Connexion...", color = Color.White)
                } else {
                    Icon(
                        imageVector = Icons.Default.Login,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(buttonLabel, fontWeight = FontWeight.SemiBold)
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = "Mêmes identifiants que sur WebLogbook",
                fontSize = 10.sp,
                color = Slate600,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun ModeButton(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    selectedColor: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) selectedColor else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (selected) Color.White else Slate400,
                modifier = Modifier.size(16.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = label,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = if (selected) Color.White else Slate400
            )
        }
    }
}
