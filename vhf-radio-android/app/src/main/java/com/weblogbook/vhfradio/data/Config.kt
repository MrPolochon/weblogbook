package com.weblogbook.vhfradio.data

import com.weblogbook.vhfradio.BuildConfig

/**
 * Configuration centralisée de l'application.
 */
object Config {
    val SUPABASE_URL: String = BuildConfig.SUPABASE_URL
    val SUPABASE_ANON_KEY: String = BuildConfig.SUPABASE_ANON_KEY
    val API_BASE_URL: String = BuildConfig.API_BASE_URL

    const val EMAIL_DOMAIN = "logbook.local"

    fun identifiantToEmail(identifiant: String): String {
        return "${identifiant.trim().lowercase()}@$EMAIL_DOMAIN"
    }
}
