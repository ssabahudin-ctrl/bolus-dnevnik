package ba.bolusdnevnik

/**
 * Validacija očitanja iz broadcasta glucodata.Minute (SPEC 4). Čista funkcija bez Androida,
 * da se može testirati na JVM-u. Vrijednosti dolaze sirovo iz Intent extras.
 */
object Validacija {
    const val MIN_MGDL = 20
    const val MAX_MGDL = 600
    const val MAX_U_BUDUCNOSTI_MS = 2 * 60_000L
    const val MAX_STAROST_MS = 14 * 24 * 3_600_000L

    sealed interface Rezultat
    data class Ispravno(val vrijemeMs: Long, val mgdl: Int, val rate: Float?) : Rezultat
    data class Odbijeno(val razlog: String) : Rezultat

    /**
     * @param mgdl extra glucodata.Minute.mgdl, mora biti Integer 20-600
     * @param time extra glucodata.Minute.Time, Long ms od epohe (vrijeme očitanja, ne prijema)
     * @param rate extra glucodata.Minute.Rate, Float; NaN ili pogrešan tip daje null (samo za strelicu)
     */
    fun provjeri(mgdl: Any?, time: Any?, rate: Any?, sadaMs: Long): Rezultat {
        if (mgdl !is Int) return Odbijeno(if (mgdl == null) "nema mgdl" else "mgdl nije Integer")
        if (mgdl < MIN_MGDL || mgdl > MAX_MGDL) return Odbijeno("mgdl $mgdl van opsega $MIN_MGDL-$MAX_MGDL")
        if (time !is Long) return Odbijeno(if (time == null) "nema Time" else "Time nije Long")
        if (time > sadaMs + MAX_U_BUDUCNOSTI_MS) return Odbijeno("Time je u budućnosti")
        if (time < sadaMs - MAX_STAROST_MS) return Odbijeno("Time je starije od 14 dana")
        val r = (rate as? Float)?.takeUnless { it.isNaN() || it.isInfinite() }
        return Ispravno(time, mgdl, r)
    }
}
