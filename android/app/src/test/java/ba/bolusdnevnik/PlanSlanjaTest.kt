package ba.bolusdnevnik

import ba.bolusdnevnik.PlanSlanja.Ocitanje
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PlanSlanjaTest {
    private val min = 60_000L
    private val dan = 24 * 60 * min

    // 12.11.2026 10:00:00 UTC, tačno na granici slota.
    private val t0 = 1_794_477_600_000L
    private val sada = t0 + 60 * min

    private fun o(minuta: Long, sekundi: Long = 0, mgdl: Int = 120) = Ocitanje(t0 + minuta * min + sekundi * 1000, mgdl)

    @Test fun slotJeZaokruzenNanizeNa5Min() {
        assertEquals(t0, PlanSlanja.slot(t0))
        assertEquals(t0, PlanSlanja.slot(t0 + 4 * min + 59_999))
        assertEquals(t0 + 5 * min, PlanSlanja.slot(t0 + 5 * min))
        assertEquals(t0 - 5 * min, PlanSlanja.slot(t0 - 1))
    }

    @Test fun jednoOcitanjePoSlotuIToPrvo() {
        val plan = PlanSlanja.napravi(listOf(o(3), o(0, 30), o(1), o(4, 59), o(5), o(9)), emptySet(), sada)
        assertEquals(listOf(o(0, 30), o(5)), plan.grupe.map { it.predstavnik })
        assertEquals(listOf(o(1).vrijemeMs, o(3).vrijemeMs, o(4, 59).vrijemeMs), plan.grupe[0].ostali)
        assertEquals(listOf(o(9).vrijemeMs), plan.grupe[1].ostali)
        assertEquals(2, plan.brojNeposlanih)
        assertTrue(plan.slotVecPoslan.isEmpty())
    }

    @Test fun svaVremenaGrupeSeOznacavajuZajedno() {
        val g = PlanSlanja.napravi(listOf(o(0), o(1), o(2)), emptySet(), sada).grupe.single()
        assertEquals(listOf(o(0).vrijemeMs, o(1).vrijemeMs, o(2).vrijemeMs), g.svaVremena)
    }

    @Test fun ocitanjaIzVecPoslanogSlotaSeSamoOznace() {
        // U slotu t0 je već poslano očitanje; nova iz 10:01 i 10:02 se ne šalju.
        val plan = PlanSlanja.napravi(listOf(o(1), o(2), o(6)), setOf(t0), sada)
        assertEquals(listOf(o(1).vrijemeMs, o(2).vrijemeMs), plan.slotVecPoslan)
        assertEquals(listOf(o(6)), plan.grupe.map { it.predstavnik })
        assertEquals(1, plan.brojNeposlanih)
    }

    @Test fun kasnoStiglaRanijaOcitanjaUPoslanomSlotuSeNeSalju() {
        // Poslano je 10:03; kasnije stigne 10:01 iz istog slota. Server bi ga ionako preskočio.
        val plan = PlanSlanja.napravi(listOf(o(1)), setOf(t0), sada)
        assertTrue(plan.grupe.isEmpty())
        assertEquals(listOf(o(1).vrijemeMs), plan.slotVecPoslan)
    }

    @Test fun praznoNemaStaSlati() {
        val plan = PlanSlanja.napravi(emptyList(), setOf(t0), sada)
        assertEquals(0, plan.brojNeposlanih)
        assertTrue(plan.paketi().isEmpty())
    }

    @Test fun prestaraOcitanjaSeNeSalju() {
        val granica = sada - PlanSlanja.MAX_STAROST_ZA_SLANJE_MS
        val staro = Ocitanje(granica - 1, 100)
        val tacnoNaGranici = Ocitanje(granica, 100)
        val plan = PlanSlanja.napravi(listOf(staro, tacnoNaGranici, o(0)), emptySet(), sada)
        assertEquals(listOf(staro.vrijemeMs), plan.prestaro)
        assertEquals(listOf(tacnoNaGranici, o(0)), plan.grupe.map { it.predstavnik })
        assertTrue(PlanSlanja.MAX_STAROST_ZA_SLANJE_MS < 7 * dan)
    }

    @Test fun paketiPo500Slotova() {
        val ocitanja = (0 until 1201).map { Ocitanje(t0 - it * 5 * min, 100) }
        val plan = PlanSlanja.napravi(ocitanja, emptySet(), t0 + min)
        val paketi = plan.paketi()
        assertEquals(listOf(500, 500, 201), paketi.map { it.size })
        // Paketi idu po vremenu, najstariji prvi.
        assertEquals(ocitanja.last(), paketi.first().first().predstavnik)
    }

    @Test fun svakaMinutaKrozDvaSataDaje24Slota() {
        val ocitanja = (0 until 120L).map { o(it) }
        val plan = PlanSlanja.napravi(ocitanja, emptySet(), t0 + 121 * min)
        assertEquals(24, plan.brojNeposlanih)
        assertTrue(plan.grupe.all { it.ostali.size == 4 })
        assertEquals(120, plan.grupe.sumOf { it.svaVremena.size })
    }
}
