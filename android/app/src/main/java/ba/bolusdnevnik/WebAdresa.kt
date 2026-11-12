package ba.bolusdnevnik

import java.net.URI

/**
 * Šta smije biti učitano u WebView i dobiti most (SPEC 4): isti origin (https, host, port)
 * kao adresa web dijela i putanja unutar njenog foldera. Na github.io isti host dijele svi
 * repozitoriji korisnika, zato se provjerava i putanja.
 */
class WebAdresa(baznaAdresa: String) {
    private val baza = URI(baznaAdresa)
    private val host = baza.host?.lowercase() ?: throw IllegalArgumentException("Adresa nema host: $baznaAdresa")
    private val port = efektivniPort(baza)
    private val folder = baza.path.let { if (it.endsWith("/")) it else "$it/" }

    init {
        require(baza.scheme == "https") { "Adresa web dijela mora biti https: $baznaAdresa" }
    }

    fun dozvoljena(url: String?): Boolean {
        if (url.isNullOrEmpty()) return false
        val u = try {
            URI(url).normalize()
        } catch (e: Exception) {
            return false
        }
        if (u.scheme?.lowercase() != "https") return false
        if (u.rawUserInfo != null) return false
        if (u.host?.lowercase() != host) return false
        if (efektivniPort(u) != port) return false
        val p = u.path.orEmpty()
        // Preglednik i %2e%2e tumači kao "..", a normalize() to ne vidi.
        if (p.split('/').any { it == ".." || it == "." }) return false
        return p == folder.dropLast(1) || p.startsWith(folder)
    }

    private fun efektivniPort(u: URI): Int = if (u.port == -1) 443 else u.port
}
