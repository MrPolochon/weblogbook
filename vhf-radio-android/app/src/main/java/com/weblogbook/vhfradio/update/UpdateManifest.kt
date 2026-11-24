package com.weblogbook.vhfradio.update

import com.google.gson.JsonParser
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest

data class UpdateManifest(
    val versionCode: Long,
    val versionName: String,
    val applicationId: String,
    val minSdk: Int,
    val apkUrl: String,
    val size: Long,
    val sha256: String
) {
    companion object {
        const val CHANNEL_URL = "https://github.com/MrPolochon/weblogbook/releases/download/android-channel-beta/android-update.json"
        const val MAX_APK_BYTES = 150L * 1024 * 1024

        fun parse(json: String, packageName: String): UpdateManifest {
            require(json.length <= 65536) { "Informations de mise à jour trop volumineuses." }
            val root = JsonParser.parseString(json).asJsonObject
            fun string(key: String): String {
                val value = root.getAsJsonPrimitive(key)
                require(value.isString) { "Informations de mise à jour invalides." }
                return value.asString
            }
            fun number(key: String): Long {
                val value = root.getAsJsonPrimitive(key)
                require(value.isNumber && value.asString.matches(Regex("[0-9]{1,12}")))
                return value.asLong
            }
            require(number("schemaVersion") == 1L)
            val version = string("versionName")
            require(version.matches(Regex("[0-9]{1,4}\\.[0-9]{1,4}\\.[0-9]{1,4}-beta\\.[0-9]{1,4}")))
            val id = string("applicationId")
            require(id == packageName) { "Cette mise à jour concerne une autre application." }
            val code = number("versionCode")
            require(code in 1..Int.MAX_VALUE.toLong())
            val sdk = number("minSdk")
            require(sdk in 26..100)
            val size = number("size")
            require(size in 1..MAX_APK_BYTES)
            val url = string("apkUrl")
            // No arbitrary URL, query, alternate repository or non-Android asset.
            require(url == "https://github.com/MrPolochon/weblogbook/releases/download/android-v$version/VHF-Radio-Android-$version.apk") {
                "Adresse de téléchargement non reconnue."
            }
            val hash = string("sha256").lowercase()
            require(hash.matches(Regex("[0-9a-f]{64}")))
            return UpdateManifest(code, version, id, sdk.toInt(), url, size, hash)
        }
    }
}

/** Bounded streaming, also used by the installer recheck. Never keeps the APK in memory. */
fun copyVerifiedApk(input: InputStream, output: OutputStream, manifest: UpdateManifest, progress: (Int) -> Unit = {}) {
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(64 * 1024)
    var total = 0L
    var lastPercent = -1
    while (true) {
        val count = input.read(buffer)
        if (count == -1) break
        total += count
        require(total <= manifest.size && total <= UpdateManifest.MAX_APK_BYTES) { "Taille du téléchargement incorrecte." }
        digest.update(buffer, 0, count)
        output.write(buffer, 0, count)
        val percent = (total * 100 / manifest.size).toInt()
        if (percent != lastPercent) { progress(percent); lastPercent = percent }
    }
    require(total == manifest.size) { "Téléchargement incomplet. Réessaie." }
    require(digest.digest().joinToString("") { "%02x".format(it) } == manifest.sha256) {
        "Le fichier téléchargé est endommagé. Réessaie."
    }
}
