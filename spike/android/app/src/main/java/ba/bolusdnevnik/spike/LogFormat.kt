package ba.bolusdnevnik.spike

/**
 * Čiste funkcije bez Android zavisnosti, da se mogu testirati na JVM-u.
 *
 * Linija loga: "<prijem_ms>|<akcija>|<extras>"
 * extras: "kljuc=Tip:vrijednost; kljuc2=Tip:vrijednost", ključevi sortirani.
 */
object LogFormat {

    data class Entry(val receivedMs: Long, val action: String, val extras: String)

    data class GapStats(val count: Int, val minSec: Long, val medianSec: Long, val maxSec: Long)

    private fun clean(s: String): String =
        s.replace('|', '/').replace('\n', ' ').replace('\r', ' ')

    fun formatExtras(extras: Map<String, Any?>): String =
        extras.keys.sorted().joinToString("; ") { key ->
            val v = extras[key]
            val type = v?.let { it::class.java.simpleName } ?: "null"
            clean("$key=$type:$v")
        }

    fun formatLine(receivedMs: Long, action: String?, extras: Map<String, Any?>): String =
        "$receivedMs|${clean(action ?: "null")}|${formatExtras(extras)}"

    fun parseLine(line: String): Entry? {
        val parts = line.split('|', limit = 3)
        if (parts.size < 3) return null
        val ms = parts[0].toLongOrNull() ?: return null
        return Entry(ms, parts[1], parts[2])
    }

    /** Razmaci između uzastopnih vremena (u sekundama). Null ako ima manje od dva vremena. */
    fun gapStats(timesMs: List<Long>): GapStats? {
        if (timesMs.size < 2) return null
        val sorted = timesMs.sorted()
        val gaps = sorted.zipWithNext { a, b -> (b - a) / 1000 }.sorted()
        val n = gaps.size
        val median = if (n % 2 == 1) gaps[n / 2] else (gaps[n / 2 - 1] + gaps[n / 2]) / 2
        return GapStats(n, gaps.first(), median, gaps.last())
    }

    fun describeGaps(stats: GapStats?): String =
        if (stats == null) "premalo podataka za razmake"
        else "razmaci (${stats.count}): min ${stats.minSec} s, medijan ${stats.medianSec} s, max ${stats.maxSec} s"
}
