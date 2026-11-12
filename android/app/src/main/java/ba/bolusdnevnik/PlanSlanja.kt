package ba.bolusdnevnik

/**
 * Logika "šta je neposlano" (SPEC 4 i 6). Čista funkcija bez Androida.
 *
 * U tabelu ide jedno očitanje po 5-minutnom slotu: prvo (najranije) očitanje u slotu.
 * Ostala očitanja iz istog slota se samo označe poslanim, i to tek nakon što server
 * vrati ok za očitanje koje predstavlja slot.
 */
object PlanSlanja {
    const val SLOT_MS = 5 * 60_000L

    /** Server odbija očitanja starija od 7 dana; uzimamo sat rezerve. */
    const val MAX_STAROST_ZA_SLANJE_MS = 7 * 24 * 3_600_000L - 3_600_000L

    /** Najviše očitanja u jednom zahtjevu (server prima do 2000). */
    const val VELICINA_PAKETA = 500

    data class Ocitanje(val vrijemeMs: Long, val mgdl: Int)

    /** Slot koji se šalje: predstavnik ide na server, ostali se označe poslanim uz njega. */
    data class Grupa(val predstavnik: Ocitanje, val ostali: List<Long>) {
        val svaVremena: List<Long> get() = listOf(predstavnik.vrijemeMs) + ostali
    }

    data class Plan(
        /** Slotovi koje treba poslati, po vremenu. */
        val grupe: List<Grupa>,
        /** Očitanja iz slotova koji su već poslani: odmah se označe poslanim, bez slanja. */
        val slotVecPoslan: List<Long>,
        /** Prestara za server: ne mogu se više poslati, označe se poslanim da ne vise. */
        val prestaro: List<Long>,
    ) {
        /** Broj slotova koji čekaju slanje (ovo se prikazuje kao "neposlano"). */
        val brojNeposlanih: Int get() = grupe.size

        fun paketi(velicina: Int = VELICINA_PAKETA): List<List<Grupa>> = grupe.chunked(velicina)
    }

    /** Vrijeme zaokruženo naniže na 5 min (isto kao slot_ na serveru). */
    fun slot(vrijemeMs: Long): Long = Math.floorDiv(vrijemeMs, SLOT_MS) * SLOT_MS

    /**
     * @param neposlana očitanja sa poslano = false, bilo kojim redom
     * @param poslaniSlotovi slotovi u kojima već postoji poslano očitanje
     */
    fun napravi(neposlana: List<Ocitanje>, poslaniSlotovi: Set<Long>, sadaMs: Long): Plan {
        val granica = sadaMs - MAX_STAROST_ZA_SLANJE_MS
        val prestaro = mutableListOf<Long>()
        val vecPoslan = mutableListOf<Long>()
        val poSlotu = LinkedHashMap<Long, MutableList<Ocitanje>>()
        for (o in neposlana.sortedBy { it.vrijemeMs }) {
            val s = slot(o.vrijemeMs)
            when {
                o.vrijemeMs < granica -> prestaro += o.vrijemeMs
                s in poslaniSlotovi -> vecPoslan += o.vrijemeMs
                else -> poSlotu.getOrPut(s) { mutableListOf() } += o
            }
        }
        val grupe = poSlotu.values.map { lista -> Grupa(lista.first(), lista.drop(1).map { it.vrijemeMs }) }
        return Plan(grupe, vecPoslan, prestaro)
    }
}
