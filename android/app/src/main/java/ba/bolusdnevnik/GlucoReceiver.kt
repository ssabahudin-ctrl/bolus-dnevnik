package ba.bolusdnevnik

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import ba.bolusdnevnik.baza.BazaOcitanja
import ba.bolusdnevnik.baza.OcitanjeRed

/**
 * Prijem glucodata.Minute od GlucoDataHandlera (SPEC 3 i 4): validacija i upis u lokalnu
 * bazu. Bez ikakve mreže; slanje radi UploadWorker.
 *
 * Napomena o bezbjednosti: receiver je izložen i Android ne javlja ko je poslao broadcast.
 * Zato web dio uvijek prikazuje izvor i starost očitanja prije izračuna.
 */
class GlucoReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != AKCIJA) return
        val sada = System.currentTimeMillis()
        val extras = intent.extras
        @Suppress("DEPRECATION")
        val rezultat = Validacija.provjeri(
            mgdl = extras?.get("glucodata.Minute.mgdl"),
            time = extras?.get("glucodata.Minute.Time"),
            rate = extras?.get("glucodata.Minute.Rate"),
            sadaMs = sada,
        )
        val serijski = extras?.getString("glucodata.Minute.SerialNumber")
        val app = context.applicationContext
        val pending = goAsync()
        App.pozadina.execute {
            try {
                val brojaci = Brojaci(app)
                brojaci.prijem(sada)
                when (rezultat) {
                    is Validacija.Ispravno -> {
                        BazaOcitanja.get(app).dao().upisi(
                            OcitanjeRed(rezultat.vrijemeMs, rezultat.mgdl, rezultat.rate, IZVOR, poslano = false)
                        )
                    }
                    is Validacija.Odbijeno -> {
                        brojaci.odbijeno(rezultat.razlog)
                        Log.w(TAG, "Odbijeno očitanje (senzor $serijski): ${rezultat.razlog}")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Upis očitanja nije uspio", e)
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        const val AKCIJA = "glucodata.Minute"
        const val IZVOR = "gdh"
        private const val TAG = "GlucoReceiver"
    }
}
