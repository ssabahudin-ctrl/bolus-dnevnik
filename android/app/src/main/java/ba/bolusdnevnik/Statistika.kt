package ba.bolusdnevnik

object Statistika {
    /**
     * Najveća rupa između uzastopnih očitanja u prozoru [odMs, sadaMs], uključujući rupu od
     * zadnjeg očitanja do sada (ako je prijem stao, to je upravo ta rupa). Rupa od početka
     * prozora do prvog očitanja se ne broji, da nova instalacija ne izgleda kao kvar.
     * Bez očitanja u prozoru vraća cijeli prozor.
     */
    fun najvecaRupaMs(vremena: List<Long>, odMs: Long, sadaMs: Long): Long {
        val u = vremena.filter { it in odMs..sadaMs }.sorted()
        if (u.isEmpty()) return sadaMs - odMs
        var max = sadaMs - u.last()
        for (i in 1 until u.size) max = maxOf(max, u[i] - u[i - 1])
        return max
    }
}
