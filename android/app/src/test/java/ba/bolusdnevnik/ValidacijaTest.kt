package ba.bolusdnevnik

import ba.bolusdnevnik.Validacija.Ispravno
import ba.bolusdnevnik.Validacija.Odbijeno
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ValidacijaTest {
    private val sada = 1_762_900_000_000L
    private val min = 60_000L
    private val dan = 24 * 60 * min

    private fun provjeri(mgdl: Any?, time: Any?, rate: Any? = 1.5f) = Validacija.provjeri(mgdl, time, rate, sada)

    @Test fun ispravnoOcitanje() {
        assertEquals(Ispravno(sada - 5000, 132, 1.5f), provjeri(132, sada - 5000))
    }

    @Test fun granicneVrijednostiMgdl() {
        assertTrue(provjeri(20, sada) is Ispravno)
        assertTrue(provjeri(600, sada) is Ispravno)
        assertTrue(provjeri(19, sada) is Odbijeno)
        assertTrue(provjeri(601, sada) is Odbijeno)
        assertTrue(provjeri(0, sada) is Odbijeno)
        assertTrue(provjeri(-5, sada) is Odbijeno)
    }

    @Test fun mgdlMoraBitiInteger() {
        assertTrue(provjeri(null, sada) is Odbijeno)
        assertTrue(provjeri(132L, sada) is Odbijeno)
        assertTrue(provjeri(132.0f, sada) is Odbijeno)
        assertTrue(provjeri(132.0, sada) is Odbijeno)
        assertTrue(provjeri("132", sada) is Odbijeno)
    }

    @Test fun vrijemeMoraPostojatiIBitiLong() {
        assertTrue(provjeri(132, null) is Odbijeno)
        assertTrue(provjeri(132, (sada / 1000).toInt()) is Odbijeno)
        assertTrue(provjeri(132, sada.toString()) is Odbijeno)
        assertTrue(provjeri(132, sada.toDouble()) is Odbijeno)
    }

    @Test fun vrijemeUBuducnostiNajvise2Min() {
        assertTrue(provjeri(132, sada + 2 * min) is Ispravno)
        assertTrue(provjeri(132, sada + 2 * min + 1) is Odbijeno)
        assertTrue(provjeri(132, sada + dan) is Odbijeno)
    }

    @Test fun vrijemeNajvise14DanaStaro() {
        assertTrue(provjeri(132, sada - 14 * dan) is Ispravno)
        assertTrue(provjeri(132, sada - 14 * dan - 1) is Odbijeno)
        assertTrue(provjeri(132, 0L) is Odbijeno)
    }

    @Test fun rateNijeObavezan() {
        assertNull((provjeri(132, sada, Float.NaN) as Ispravno).rate)
        assertNull((provjeri(132, sada, null) as Ispravno).rate)
        assertNull((provjeri(132, sada, "1.0") as Ispravno).rate)
        assertNull((provjeri(132, sada, Float.POSITIVE_INFINITY) as Ispravno).rate)
        assertEquals(-2.0f, (provjeri(132, sada, -2.0f) as Ispravno).rate)
    }
}
