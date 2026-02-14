package com.weblogbook.vhfradio.data

/**
 * Logique des fréquences VHF aviation — espacement 8.33 kHz.
 *
 * Plage : 118.000 → 132.975
 * MHz   : 118 à 132 (15 valeurs)
 * Décimales : 160 valeurs par MHz (pattern 8.33 kHz)
 *
 * Porte depuis src/lib/vhf-frequencies.ts
 */
object VhfFrequencies {

    const val VHF_MIN_MHZ = 118
    const val VHF_MAX_MHZ = 132

    /**
     * Génère les 160 décimales valides par MHz.
     * Pattern par bloc de 50 : 0, 5, 10, 15, 25, 30, 35, 40
     */
    private fun generateDecimals(): List<String> {
        val decimals = mutableListOf<String>()
        val blockPattern = intArrayOf(0, 5, 10, 15, 25, 30, 35, 40)

        for (centaine in 0..9) {
            for (demiCentaine in 0..1) {
                val base = centaine * 100 + demiCentaine * 50
                for (offset in blockPattern) {
                    val value = base + offset
                    if (value > 999) break
                    decimals.add(value.toString().padStart(3, '0'))
                }
            }
        }
        return decimals
    }

    /** Les 160 décimales valides (ex: "000", "005", …, "990") */
    val ALL_DECIMALS: List<String> = generateDecimals()

    /** Toutes les fréquences VHF valides */
    private val ALL_FREQUENCIES_SET: Set<String> = buildSet {
        for (mhz in VHF_MIN_MHZ..VHF_MAX_MHZ) {
            for (dec in ALL_DECIMALS) {
                if (mhz == VHF_MAX_MHZ) {
                    val decNum = dec.toIntOrNull() ?: 0
                    if (decNum > 975) continue
                }
                add("$mhz.$dec")
            }
        }
    }

    /** Nombre total de fréquences valides */
    val TOTAL_FREQUENCIES: Int = ALL_FREQUENCIES_SET.size

    /** Vérifie si une fréquence est valide */
    fun isValid(freq: String): Boolean = ALL_FREQUENCIES_SET.contains(freq)

    /** Parse une fréquence en mhz + decimal */
    fun parse(freq: String): Pair<Int, String>? {
        val regex = Regex("""^(\d{3})\.(\d{3})$""")
        val match = regex.matchEntire(freq) ?: return null
        val mhz = match.groupValues[1].toIntOrNull() ?: return null
        val decimal = match.groupValues[2]
        if (mhz < VHF_MIN_MHZ || mhz > VHF_MAX_MHZ) return null
        if (decimal !in ALL_DECIMALS) return null
        return Pair(mhz, decimal)
    }

    /** Formate une fréquence */
    fun format(mhz: Int, decimal: String): String = "$mhz.$decimal"

    /** Retourne le tableau des MHz valides [118, 119, …, 132] */
    fun getMhzRange(): List<Int> = (VHF_MIN_MHZ..VHF_MAX_MHZ).toList()

    /** Retourne les décimales valides pour un MHz donné */
    fun getDecimalsForMhz(mhz: Int): List<String> {
        return if (mhz == VHF_MAX_MHZ) {
            ALL_DECIMALS.filter { (it.toIntOrNull() ?: 0) <= 975 }
        } else {
            ALL_DECIMALS
        }
    }

    /** Convertit une fréquence en nom de room LiveKit. Ex: "118.935" → "vhf-118935" */
    fun frequencyToRoomName(freq: String): String = "vhf-${freq.replace(".", "")}"

    /** Convertit un nom de room LiveKit en fréquence. Ex: "vhf-118935" → "118.935" */
    fun roomNameToFrequency(roomName: String): String? {
        val regex = Regex("""^vhf-(\d{3})(\d{3})$""")
        val match = regex.matchEntire(roomName) ?: return null
        return "${match.groupValues[1]}.${match.groupValues[2]}"
    }
}
