package ba.bolusdnevnik.spike

import android.content.Context
import java.io.File

/** Mali lokalni log primljenih broadcastova, jedna linija po prijemu. */
object BroadcastLog {
    private const val FILE = "broadcast_log.txt"
    private const val KEEP = 500
    private const val TRIM_AT = 600
    private val lock = Any()

    private fun file(context: Context) = File(context.filesDir, FILE)

    fun append(context: Context, line: String) = synchronized(lock) {
        val f = file(context)
        f.appendText(line + "\n")
        val lines = f.readLines()
        if (lines.size > TRIM_AT) {
            f.writeText(lines.takeLast(KEEP).joinToString("\n", postfix = "\n"))
        }
    }

    /** Sve linije, najstarija prva. */
    fun readAll(context: Context): List<LogFormat.Entry> = synchronized(lock) {
        val f = file(context)
        if (!f.exists()) emptyList()
        else f.readLines().mapNotNull { LogFormat.parseLine(it) }
    }

    fun clear(context: Context) = synchronized(lock) {
        file(context).delete()
    }
}
