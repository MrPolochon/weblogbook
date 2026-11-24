package com.weblogbook.vhfradio.update

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import com.weblogbook.vhfradio.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.OutputStream
import java.util.concurrent.TimeUnit

class UpdateRepository(private val context: Context) {
    // Separate from authenticated radio requests: no account token goes to GitHub.
    private val http = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS).callTimeout(5, TimeUnit.MINUTES)
        .followSslRedirects(false).build()
    private val directory get() = File(context.cacheDir, "updates").apply { mkdirs() }

    suspend fun check(): UpdateManifest? = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(UpdateManifest.CHANNEL_URL).header("Cache-Control", "no-cache").build()
        http.newCall(request).execute().use { response ->
            check(response.isSuccessful) { "Vérification indisponible. Réessaie plus tard." }
            val body = checkNotNull(response.body)
            val bytes = body.byteStream().use { input ->
                val buffer = ByteArray(65537)
                var size = 0
                while (size < buffer.size) {
                    val read = input.read(buffer, size, buffer.size - size)
                    if (read == -1) break
                    size += read
                }
                require(size <= 65536) { "Informations de mise à jour invalides." }
                buffer.copyOf(size)
            }
            val manifest = UpdateManifest.parse(bytes.toString(Charsets.UTF_8), context.packageName)
            currentCoroutineContext().ensureActive()
            if (manifest.versionCode <= BuildConfig.VERSION_CODE) null else {
                require(manifest.minSdk <= Build.VERSION.SDK_INT) { "Cette version nécessite un Android plus récent." }
                manifest
            }
        }
    }

    suspend fun download(manifest: UpdateManifest, progress: (Int) -> Unit): File = withContext(Dispatchers.IO) {
        val partial = File(directory, "update.part")
        val target = File(directory, "update.apk")
        target.delete()
        try {
            val job = currentCoroutineContext()
            http.newCall(Request.Builder().url(manifest.apkUrl).build()).execute().use { response ->
                check(response.isSuccessful) { "Téléchargement indisponible. Réessaie." }
                val body = checkNotNull(response.body)
                require(body.contentLength() == -1L || body.contentLength() == manifest.size) { "Taille du téléchargement incorrecte." }
                body.byteStream().use { input -> partial.outputStream().use { output ->
                    copyVerifiedApk(input, output, manifest) { percent -> job.ensureActive(); progress(percent) }
                } }
            }
            job.ensureActive()
            verifyPackage(partial, manifest)
            check(partial.renameTo(target)) { "Impossible de préparer la mise à jour." }
            target
        } finally { partial.delete() }
    }

    suspend fun verifyForInstall(file: File, manifest: UpdateManifest) = withContext(Dispatchers.IO) {
        require(file.isFile && file.canonicalFile == File(directory, "update.apk").canonicalFile) { "Télécharge de nouveau la mise à jour." }
        file.inputStream().use { copyVerifiedApk(it, object : OutputStream() {
            override fun write(value: Int) {}
            override fun write(bytes: ByteArray, offset: Int, length: Int) {}
        }, manifest) }
        verifyPackage(file, manifest)
    }

    @Suppress("DEPRECATION")
    private fun verifyPackage(file: File, manifest: UpdateManifest) {
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val archive = context.packageManager.getPackageArchiveInfo(file.absolutePath, flags)
        requireNotNull(archive) { "Le fichier reçu n'est pas une application Android valide." }
        val installed = context.packageManager.getPackageInfo(context.packageName, flags)
        val version = if (Build.VERSION.SDK_INT >= 28) archive.longVersionCode else archive.versionCode.toLong()
        require(archive.packageName == context.packageName && version == manifest.versionCode && version > BuildConfig.VERSION_CODE) {
            "Cette mise à jour ne correspond pas à l'application installée."
        }
        fun signatures(info: PackageInfo): Set<String> {
            val certs = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
            return certs.orEmpty().map { it.toCharsString() }.toSet()
        }
        val existing = signatures(installed)
        require(existing.isNotEmpty() && signatures(archive) == existing) {
            "Signature différente : mise à jour refusée. Utilise uniquement le téléchargement officiel."
        }
    }
}
