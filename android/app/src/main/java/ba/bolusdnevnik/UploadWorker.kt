package ba.bolusdnevnik

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import ba.bolusdnevnik.baza.BazaOcitanja
import ba.bolusdnevnik.baza.oznaciPoslanoSve
import java.util.concurrent.TimeUnit

/**
 * Slanje krive šećera u tabelu (SPEC 4): jedno očitanje po 5-minutnom slotu akcijom
 * saveGlucose. Očitanja se označavaju poslanim tek nakon odgovora ok.
 */
class UploadWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {

    override fun doWork(): Result {
        val sada = System.currentTimeMillis()
        val dao = BazaOcitanja.get(applicationContext).dao()
        val brojaci = Brojaci(applicationContext)

        // Lokalna baza čuva 14 dana.
        dao.obrisiStarije(sada - Validacija.MAX_STAROST_MS)

        val plan = PlanSlanja.napravi(
            neposlana = dao.neposlana().map { PlanSlanja.Ocitanje(it.vrijemeMs, it.mgdl) },
            poslaniSlotovi = dao.poslaniSlotovi(PlanSlanja.slot(sada - Validacija.MAX_STAROST_MS)).toSet(),
            sadaMs = sada,
        )
        dao.oznaciPoslanoSve(plan.slotVecPoslan)
        if (plan.prestaro.isNotEmpty()) {
            dao.oznaciPoslanoSve(plan.prestaro)
            brojaci.prestaro(plan.prestaro.size)
        }
        if (plan.grupe.isEmpty()) return Result.success()

        val konfig = KonfigSkladiste(applicationContext).citaj()
        if (konfig == null) {
            brojaci.slanje(sada, "Uređaj nije uparen.")
            return Result.success()
        }

        for (paket in plan.paketi()) {
            try {
                val odg = ApiKlijent.saveGlucose(konfig, paket.map { it.predstavnik })
                dao.oznaciPoslanoSve(paket.flatMap { it.svaVremena })
                Log.i(TAG, "saveGlucose: upisano ${odg.optInt("upisano")}, preskočeno ${odg.optInt("preskoceno")}, odbačeno ${odg.optInt("odbaceno")}")
            } catch (e: ApiKlijent.ApiGreska) {
                brojaci.slanje(sada, e.message)
                return if (e.trajna) Result.failure() else Result.retry()
            } catch (e: Exception) {
                brojaci.slanje(sada, "Mreža: ${e.javaClass.simpleName}: ${e.message}")
                return Result.retry()
            }
        }
        brojaci.slanje(sada, null)
        return Result.success()
    }

    companion object {
        private const val TAG = "UploadWorker"
        private const val PERIODICNO = "upload_periodicno"
        private const val ODMAH = "upload_odmah"

        private val uslovi = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun zakaziPeriodicno(ctx: Context) {
            val zahtjev = PeriodicWorkRequestBuilder<UploadWorker>(15, TimeUnit.MINUTES)
                .setConstraints(uslovi)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(PERIODICNO, ExistingPeriodicWorkPolicy.KEEP, zahtjev)
        }

        /** Nakon otvaranja aplikacije i nakon uparivanja. */
        fun pokreniOdmah(ctx: Context) {
            val zahtjev = OneTimeWorkRequestBuilder<UploadWorker>()
                .setConstraints(uslovi)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(ctx).enqueueUniqueWork(ODMAH, ExistingWorkPolicy.KEEP, zahtjev)
        }
    }
}
