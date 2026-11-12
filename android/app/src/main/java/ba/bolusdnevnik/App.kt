package ba.bolusdnevnik

import android.app.Application
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        // Periodično slanje svakih 15 min; KEEP ne resetuje raspored pri svakom pokretanju.
        UploadWorker.zakaziPeriodicno(this)
    }

    companion object {
        /** Jedna pozadinska nit za upis u bazu iz receivera (redoslijed i bez paralelnih upisa). */
        val pozadina: ExecutorService = Executors.newSingleThreadExecutor()
    }
}
