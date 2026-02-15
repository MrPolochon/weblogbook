package com.weblogbook.vhfradio.data

import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.annotations.SerializedName
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Client API pour les appels HTTP vers Supabase Auth et l'API WebLogbook.
 */
object ApiClient {

    private const val TAG = "ApiClient"

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val JSON = "application/json; charset=utf-8".toMediaType()

    /* ══════════ Token Storage ══════════ */

    @Volatile private var storedAccessToken: String? = null
    @Volatile private var storedRefreshToken: String? = null

    /** Store tokens after successful login */
    fun setTokens(accessToken: String, refreshToken: String?) {
        storedAccessToken = accessToken
        storedRefreshToken = refreshToken
    }

    /** Get the current stored access token */
    fun getStoredAccessToken(): String? = storedAccessToken

    /** Refresh the access token using the stored refresh token */
    suspend fun refreshAccessToken(): String? = withContext(Dispatchers.IO) {
        val rt = storedRefreshToken
        if (rt == null) {
            Log.w(TAG, "Pas de refresh_token stocké")
            return@withContext null
        }
        try {
            val body = gson.toJson(mapOf("refresh_token" to rt))
            val request = Request.Builder()
                .url("${Config.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token")
                .addHeader("apikey", Config.SUPABASE_ANON_KEY)
                .addHeader("Content-Type", "application/json")
                .post(body.toRequestBody(JSON))
                .build()

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""

            if (!response.isSuccessful) {
                Log.e(TAG, "Refresh token failed: ${response.code} $responseBody")
                return@withContext null
            }

            val authResponse = gson.fromJson(responseBody, AuthResponse::class.java)
            val newToken = authResponse.accessToken
            if (newToken != null) {
                storedAccessToken = newToken
                authResponse.refreshToken?.let { storedRefreshToken = it }
                Log.i(TAG, "Token rafraîchi avec succès")
            }
            newToken
        } catch (e: Exception) {
            Log.e(TAG, "Erreur refresh token: ${e.message}")
            null
        }
    }

    /**
     * Get a fresh access token: returns stored one or refreshes if needed.
     * Falls back to the provided token if refresh fails.
     */
    suspend fun getFreshAccessToken(fallback: String): String {
        // Try refresh to ensure we have the latest
        val stored = storedAccessToken ?: fallback
        return stored
    }

    fun clearTokens() {
        storedAccessToken = null
        storedRefreshToken = null
    }

    /* ══════════ Modèles de données ══════════ */

    data class AuthResponse(
        @SerializedName("access_token") val accessToken: String?,
        @SerializedName("refresh_token") val refreshToken: String?,
        @SerializedName("token_type") val tokenType: String?,
        @SerializedName("user") val user: AuthUser?,
        @SerializedName("error") val error: String?,
        @SerializedName("error_description") val errorDescription: String?,
        @SerializedName("msg") val msg: String?
    )

    data class AuthUser(
        @SerializedName("id") val id: String
    )

    data class UserProfile(
        val id: String,
        val identifiant: String,
        val role: String,
        val atc: Boolean,
        val siavi: Boolean
    )

    data class LiveKitTokenResponse(
        val token: String?,
        val url: String?,
        val error: String?
    )

    data class SessionResponse(
        val session: SessionInfo?,
        val frequency: String?,
        val noSession: Boolean?,
        val error: String?
    )

    data class SessionInfo(
        val aeroport: String?,
        val position: String?
    )

    /* ══════════ Authentification Supabase ══════════ */

    /**
     * Login avec Supabase GoTrue REST API.
     * POST ${SUPABASE_URL}/auth/v1/token?grant_type=password
     */
    suspend fun signIn(identifiant: String, password: String): Result<Pair<AuthResponse, String>> =
        withContext(Dispatchers.IO) {
            try {
                val email = Config.identifiantToEmail(identifiant)
                val body = gson.toJson(mapOf("email" to email, "password" to password))

                val request = Request.Builder()
                    .url("${Config.SUPABASE_URL}/auth/v1/token?grant_type=password")
                    .addHeader("apikey", Config.SUPABASE_ANON_KEY)
                    .addHeader("Content-Type", "application/json")
                    .post(body.toRequestBody(JSON))
                    .build()

                val response = client.newCall(request).execute()
                val responseBody = response.body?.string() ?: ""

                if (!response.isSuccessful) {
                    val errorObj = try {
                        gson.fromJson(responseBody, JsonObject::class.java)
                    } catch (_: Exception) {
                        null
                    }
                    val errorMsg = errorObj?.get("error_description")?.asString
                        ?: errorObj?.get("msg")?.asString
                        ?: errorObj?.get("error")?.asString
                        ?: "Erreur d'authentification"
                    return@withContext Result.failure(Exception(errorMsg))
                }

                val authResponse = gson.fromJson(responseBody, AuthResponse::class.java)
                val token = authResponse.accessToken
                    ?: return@withContext Result.failure(Exception("Pas de token reçu"))

                Result.success(Pair(authResponse, token))
            } catch (e: Exception) {
                Result.failure(Exception("Erreur réseau: ${e.message}"))
            }
        }

    /**
     * Récupère le profil utilisateur depuis Supabase REST API.
     */
    suspend fun fetchProfile(userId: String, accessToken: String): Result<UserProfile> =
        withContext(Dispatchers.IO) {
            try {
                val request = Request.Builder()
                    .url("${Config.SUPABASE_URL}/rest/v1/profiles?id=eq.$userId&select=identifiant,role,atc,siavi")
                    .addHeader("apikey", Config.SUPABASE_ANON_KEY)
                    .addHeader("Authorization", "Bearer $accessToken")
                    .get()
                    .build()

                val response = client.newCall(request).execute()
                val responseBody = response.body?.string() ?: "[]"

                if (!response.isSuccessful) {
                    return@withContext Result.failure(Exception("Erreur lors de la récupération du profil"))
                }

                val profiles = gson.fromJson(responseBody, Array<JsonObject>::class.java)
                if (profiles.isNullOrEmpty()) {
                    return@withContext Result.failure(Exception("Profil introuvable"))
                }

                val p = profiles[0]
                Result.success(
                    UserProfile(
                        id = userId,
                        identifiant = p.get("identifiant")?.asString ?: "",
                        role = p.get("role")?.asString ?: "",
                        atc = p.get("atc")?.asBoolean ?: false,
                        siavi = p.get("siavi")?.asBoolean ?: false
                    )
                )
            } catch (e: Exception) {
                Result.failure(Exception("Erreur réseau: ${e.message}"))
            }
        }

    /* ══════════ API WebLogbook ══════════ */

    /**
     * Récupère un token LiveKit pour se connecter à une room VHF.
     * POST /api/livekit/token
     * Auto-retry on 401 by refreshing the access token.
     */
    suspend fun getLiveKitToken(
        roomName: String,
        participantName: String,
        accessToken: String
    ): Result<LiveKitTokenResponse> = withContext(Dispatchers.IO) {
        try {
            val body = gson.toJson(
                mapOf(
                    "roomName" to roomName,
                    "participantName" to participantName
                )
            )

            // Use stored token if available, otherwise use provided one
            var token = storedAccessToken ?: accessToken

            fun buildRequest(t: String) = Request.Builder()
                .url("${Config.API_BASE_URL}/api/livekit/token")
                .addHeader("Content-Type", "application/json")
                .addHeader("Authorization", "Bearer $t")
                .post(body.toRequestBody(JSON))
                .build()

            var response = client.newCall(buildRequest(token)).execute()
            var responseBody = response.body?.string() ?: ""

            // Retry on 401 with refreshed token
            if (response.code == 401) {
                Log.w(TAG, "LiveKit token 401 — tentative de refresh...")
                val newToken = refreshAccessToken()
                if (newToken != null) {
                    token = newToken
                    response = client.newCall(buildRequest(token)).execute()
                    responseBody = response.body?.string() ?: ""
                }
            }

            if (!response.isSuccessful) {
                val errMsg = try {
                    val j = gson.fromJson(responseBody, JsonObject::class.java)
                    j?.get("error")?.asString ?: j?.get("details")?.asString ?: "Erreur ${response.code}"
                } catch (_: Exception) { "Erreur API LiveKit: ${response.code}" }
                Log.e(TAG, "getLiveKitToken failed: ${response.code} $responseBody")
                return@withContext Result.failure(Exception(errMsg))
            }

            val tokenResponse = gson.fromJson(responseBody, LiveKitTokenResponse::class.java)
            Result.success(tokenResponse)
        } catch (e: Exception) {
            Log.e(TAG, "getLiveKitToken error: ${e.message}")
            Result.failure(Exception("Erreur réseau: ${e.message}"))
        }
    }

    /**
     * Vérifie la session ATC/AFIS active.
     * GET /api/atc/my-session?mode=atc|afis
     */
    suspend fun checkSession(mode: String, accessToken: String): Result<SessionResponse> =
        withContext(Dispatchers.IO) {
            try {
                var token = storedAccessToken ?: accessToken

                fun buildRequest(t: String) = Request.Builder()
                    .url("${Config.API_BASE_URL}/api/atc/my-session?mode=$mode")
                    .addHeader("Authorization", "Bearer $t")
                    .get()
                    .build()

                var response = client.newCall(buildRequest(token)).execute()
                var responseBody = response.body?.string() ?: ""

                // Retry on 401 with refreshed token
                if (response.code == 401) {
                    Log.w(TAG, "checkSession 401 — tentative de refresh...")
                    val newToken = refreshAccessToken()
                    if (newToken != null) {
                        token = newToken
                        response = client.newCall(buildRequest(token)).execute()
                        responseBody = response.body?.string() ?: ""
                    }
                }

                if (!response.isSuccessful) {
                    return@withContext Result.failure(Exception("Erreur API session: ${response.code}"))
                }

                val sessionResponse = gson.fromJson(responseBody, SessionResponse::class.java)
                Result.success(sessionResponse)
            } catch (e: Exception) {
                Result.failure(Exception("Erreur réseau: ${e.message}"))
            }
        }

    /**
     * Déconnexion locale Supabase (invalide le token localement seulement).
     * POST /auth/v1/logout?scope=local
     */
    suspend fun signOutLocal(accessToken: String) = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("${Config.SUPABASE_URL}/auth/v1/logout?scope=local")
                .addHeader("apikey", Config.SUPABASE_ANON_KEY)
                .addHeader("Authorization", "Bearer $accessToken")
                .post("".toRequestBody(JSON))
                .build()

            client.newCall(request).execute()
        } catch (_: Exception) {
            // Silencieux — pas critique
        }
    }
}
