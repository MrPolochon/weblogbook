package com.weblogbook.vhfradio

import com.weblogbook.vhfradio.update.*
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.security.MessageDigest

class UpdateManifestTest {
    private val bytes = "verified APK test bytes".toByteArray()
    private val hash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    private val json get() = """{"schemaVersion":1,"versionCode":6,"versionName":"1.2.0-beta.4","applicationId":"com.weblogbook.vhfradio.beta","minSdk":26,"size":${bytes.size},"sha256":"$hash","apkUrl":"https://github.com/MrPolochon/weblogbook/releases/download/android-v1.2.0-beta.4/VHF-Radio-Android-1.2.0-beta.4.apk"}"""
    private fun parse(value: String = json) = UpdateManifest.parse(value, "com.weblogbook.vhfradio.beta")
    private fun rejected(value: String) = assertThrows(Exception::class.java) { parse(value) }

    @Test fun acceptsTheAndroidBetaReleaseAndChecksTheWholeDownload() {
        val release = parse()
        assertEquals(6L, release.versionCode)
        val output = ByteArrayOutputStream()
        val progress = mutableListOf<Int>()
        copyVerifiedApk(ByteArrayInputStream(bytes), output, release, progress::add)
        assertArrayEquals(bytes, output.toByteArray())
        assertEquals(100, progress.last())
    }
    @Test fun refusesOtherRepositoriesInsecureUrlsAndQueryParameters() {
        rejected(json.replace("github.com/MrPolochon", "github.com/attacker"))
        rejected(json.replace("https:", "http:"))
        rejected(json.replace(".apk\"", ".apk?redirect=elsewhere\""))
        rejected(json.replace("VHF-Radio-Android-1.2.0-beta.4.apk", "other.apk"))
    }
    @Test fun refusesAnotherPackageAndNonAndroidVersions() {
        rejected(json.replace("com.weblogbook.vhfradio.beta", "other.app"))
        rejected(json.replace("1.2.0-beta.4", "1.5.1"))
    }
    @Test fun refusesOversizedMalformedAndUnsupportedMetadata() {
        rejected(json.replace("\"size\":${bytes.size}", "\"size\":157286401"))
        rejected(json.replace("\"versionCode\":6", "\"versionCode\":6.5"))
        rejected(json.replace("\"schemaVersion\":1", "\"schemaVersion\":2"))
        rejected(json.replace(hash, "not-a-sha256"))
        rejected(" ".repeat(65537))
        rejected("{}")
    }
    @Test fun refusesCorruptTruncatedAndOverlongApks() {
        val release = parse()
        for (data in listOf(bytes + 0, bytes.copyOf(bytes.size - 1), bytes.copyOf().also { it[0] = 0 })) {
            assertThrows(IllegalArgumentException::class.java) {
                copyVerifiedApk(ByteArrayInputStream(data), ByteArrayOutputStream(), release)
            }
        }
    }
}
