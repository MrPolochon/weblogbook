package com.weblogbook.vhfradio.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = Emerald500,
    secondary = Sky500,
    tertiary = Amber400,
    background = Slate900,
    surface = Slate800,
    onPrimary = Slate900,
    onSecondary = Slate900,
    onTertiary = Slate900,
    onBackground = Slate200,
    onSurface = Slate200,
    error = Red500,
    onError = Slate900,
    surfaceVariant = Slate700,
    onSurfaceVariant = Slate400,
    outline = Slate600
)

@Composable
fun VHFRadioTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}
