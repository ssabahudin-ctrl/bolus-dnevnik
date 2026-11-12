package ba.bolusdnevnik

import android.content.Context

/** Mali brojači i vremena za status() (bez zdravstvenih podataka i bez tajni). */
class Brojaci(ctx: Context) {
    private val prefs = ctx.applicationContext.getSharedPreferences("brojaci", Context.MODE_PRIVATE)

    val odbijeno: Int get() = prefs.getInt("odbijeno", 0)
    val zadnjeOdbijanje: String? get() = prefs.getString("zadnje_odbijanje", null)
    val zadnjiPrijemMs: Long? get() = prefs.getLong("zadnji_prijem_ms", 0L).takeIf { it > 0 }
    val prestaroPreskoceno: Int get() = prefs.getInt("prestaro", 0)
    val zadnjeSlanjeMs: Long? get() = prefs.getLong("zadnje_slanje_ms", 0L).takeIf { it > 0 }
    val zadnjiPokusajMs: Long? get() = prefs.getLong("zadnji_pokusaj_ms", 0L).takeIf { it > 0 }
    val greskaSlanja: String? get() = prefs.getString("greska_slanja", null)

    fun prijem(sadaMs: Long) = synchronized(LOCK) {
        prefs.edit().putLong("zadnji_prijem_ms", sadaMs).apply()
    }

    fun odbijeno(razlog: String) = synchronized(LOCK) {
        prefs.edit().putInt("odbijeno", odbijeno + 1).putString("zadnje_odbijanje", razlog).apply()
    }

    fun prestaro(n: Int) = synchronized(LOCK) {
        if (n > 0) prefs.edit().putInt("prestaro", prestaroPreskoceno + n).apply()
    }

    fun slanje(sadaMs: Long, greska: String?) = synchronized(LOCK) {
        val e = prefs.edit().putLong("zadnji_pokusaj_ms", sadaMs).putString("greska_slanja", greska)
        if (greska == null) e.putLong("zadnje_slanje_ms", sadaMs)
        e.apply()
    }

    private companion object {
        val LOCK = Any()
    }
}
