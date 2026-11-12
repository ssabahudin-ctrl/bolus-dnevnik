package ba.bolusdnevnik

/** Konfiguracija uređaja (SPEC 4 i 6): URL servisa, token i naziv uređaja. */
data class Konfig(val url: String, val token: String, val naziv: String) {
    companion object {
        private val HTTPS_URL = Regex("""^https://[^\s/]+/\S*$""")

        /** Ista pravila kao provjeriKonfig u web/src/konfig.ts. Vraća poruku greške ili null. */
        fun greska(url: String?, token: String?, naziv: String?): String? = when {
            url == null || !HTTPS_URL.matches(url) -> "URL servisa nije ispravan https URL."
            token == null || token.length < 20 -> "Token nije ispravan."
            naziv == null || naziv.isBlank() -> "Naziv uređaja nedostaje."
            else -> null
        }
    }
}
