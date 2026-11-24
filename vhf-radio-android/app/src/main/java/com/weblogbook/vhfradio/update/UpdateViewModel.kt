package com.weblogbook.vhfradio.update

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File

data class UpdateState(
    val release: UpdateManifest? = null,
    val checking: Boolean = false,
    val downloading: Boolean = false,
    val verifying: Boolean = false,
    val progress: Int = 0,
    val file: File? = null,
    val message: String? = null
)

class UpdateViewModel(app: Application) : AndroidViewModel(app) {
    private val repository = UpdateRepository(app)
    private val mutable = MutableStateFlow(UpdateState())
    val state = mutable.asStateFlow()
    private var checked = false
    private var operation: Job? = null

    fun check(automatic: Boolean = false) {
        if (operation?.isActive == true || (automatic && checked)) return
        checked = true
        operation = viewModelScope.launch {
            mutable.value = mutable.value.copy(checking = true, message = null)
            try {
                val release = repository.check()
                mutable.value = UpdateState(release = release, message = if (release == null && !automatic) "L'application est à jour." else null)
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) {
                mutable.value = mutable.value.copy(checking = false,
                    message = if (automatic) null else "Impossible de vérifier les mises à jour. Vérifie Internet puis réessaie.")
            }
        }
    }

    fun download() {
        if (operation?.isActive == true) return
        val release = mutable.value.release ?: return
        operation = viewModelScope.launch {
            mutable.value = mutable.value.copy(downloading = true, progress = 0, message = null, file = null)
            try {
                val file = repository.download(release) { mutable.value = mutable.value.copy(progress = it) }
                mutable.value = mutable.value.copy(downloading = false, file = file)
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { mutable.value = mutable.value.copy(downloading = false, message = "Téléchargement ou vérification impossible. Réessaie avec une connexion stable.") }
        }
    }

    fun prepareInstallation(onReady: (File) -> Unit) {
        if (operation?.isActive == true) return
        val release = mutable.value.release ?: return
        val file = mutable.value.file ?: return
        operation = viewModelScope.launch {
            mutable.value = mutable.value.copy(verifying = true, message = null)
            try {
                repository.verifyForInstall(file, release)
                mutable.value = mutable.value.copy(verifying = false)
                onReady(file)
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { mutable.value = mutable.value.copy(verifying = false, file = null, message = "Vérification impossible. Télécharge de nouveau la mise à jour.") }
        }
    }

    fun message(text: String) { mutable.value = mutable.value.copy(message = text) }
}
