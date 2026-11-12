package ba.bolusdnevnik

import org.junit.Assert.assertEquals
import org.junit.Test

class StatistikaTest {
    private val min = 60_000L
    private val od = 1_000_000_000_000L
    private val sada = od + 24 * 60 * min

    @Test fun bezOcitanjaRupaJeCijeliProzor() {
        assertEquals(24 * 60 * min, Statistika.najvecaRupaMs(emptyList(), od, sada))
    }

    @Test fun najvecaRupaIzmeduOcitanja() {
        val v = listOf(sada - 10 * min, sada - 9 * min, sada - 4 * min - 30_000, sada - 3 * min, sada - 1 * min)
        assertEquals(4 * min + 30_000, Statistika.najvecaRupaMs(v, od, sada))
    }

    @Test fun rupaDoSadaSeBroji() {
        val v = listOf(sada - 62 * min, sada - 61 * min, sada - 60 * min)
        assertEquals(60 * min, Statistika.najvecaRupaMs(v, od, sada))
    }

    @Test fun pocetakProzoraSeNeBrojiIRedoslijedNijeBitan() {
        val v = listOf(sada - 1 * min, sada - 2 * min, od - 5 * min)
        assertEquals(min, Statistika.najvecaRupaMs(v, od, sada))
    }
}
