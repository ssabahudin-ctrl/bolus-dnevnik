package ba.bolusdnevnik.spike

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LogFormatTest {

    @Test
    fun formatAndParseRoundTrip() {
        val extras = mapOf<String, Any?>(
            "glucodata.Minute.mgdl" to 140,
            "glucodata.Minute.Time" to 1762790400000L,
            "glucodata.Minute.Rate" to Float.NaN,
            "glucodata.Minute.SerialNumber" to "AB|12\nX",
        )
        val line = LogFormat.formatLine(1762790401234L, "glucodata.Minute", extras)
        val e = LogFormat.parseLine(line)!!
        assertEquals(1762790401234L, e.receivedMs)
        assertEquals("glucodata.Minute", e.action)
        assertEquals(
            "glucodata.Minute.Rate=Float:NaN; " +
                "glucodata.Minute.SerialNumber=String:AB/12 X; " +
                "glucodata.Minute.Time=Long:1762790400000; " +
                "glucodata.Minute.mgdl=Integer:140",
            e.extras,
        )
    }

    @Test
    fun nullActionAndValue() {
        val line = LogFormat.formatLine(1L, null, mapOf("k" to null))
        assertEquals("1|null|k=null:null", line)
    }

    @Test
    fun badLineIsIgnored() {
        assertNull(LogFormat.parseLine("nije broj|a|b"))
        assertNull(LogFormat.parseLine("123|samo dva"))
    }

    @Test
    fun gapStats() {
        assertNull(LogFormat.gapStats(listOf(1000L)))
        // razmaci 60, 60, 300 s, nesortiran ulaz
        val s = LogFormat.gapStats(listOf(120_000L, 0L, 60_000L, 420_000L))!!
        assertEquals(3, s.count)
        assertEquals(60, s.minSec)
        assertEquals(60, s.medianSec)
        assertEquals(300, s.maxSec)
    }

    @Test
    fun gapStatsEvenCountMedian() {
        val s = LogFormat.gapStats(listOf(0L, 60_000L, 180_000L))!!
        assertEquals(90, s.medianSec)
    }
}
