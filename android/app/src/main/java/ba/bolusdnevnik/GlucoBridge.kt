package ba.bolusdnevnik

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.webkit.JavascriptInterface
import ba.bolusdnevnik.baza.BazaOcitanja
import org.json.JSONArray
import org.json.JSONObject

/**
 * Most window.GlucoBridge (SPEC 4). Svi rezultati su JSON stringovi.
 *
 * Metode se pozivaju na pozadinskoj niti WebView-a. Svaka prvo provjerava da je trenutna
 * stranica sa našeg origina (dozvoljeno()), inače vraća "null" i ništa ne radi.
 * Android kod ne računa doze; most samo predaje očitanja i status.
 */
class GlucoBridge(
    private val activity: Activity,
    private val dozvoljeno: () -> Boolean,
) {
    private val app = activity.applicationContext
    private val dao get() = BazaOcitanja.get(app).dao()
    private val konfig = KonfigSkladiste(app)

    @JavascriptInterface
    fun latest(): String = siguran {
        val o = dao.zadnje() ?: return@siguran NULL
        JSONObject()
            .put("mgdl", o.mgdl)
            .put("time", o.vrijemeMs)
            .put("rate", o.rate?.toDouble() ?: JSONObject.NULL)
            .put("source", o.izvor)
            .toString()
    }

    @JavascriptInterface
    fun history(fromMs: Double, toMs: Double): String = siguran {
        if (fromMs.isNaN() || toMs.isNaN() || toMs < fromMs) return@siguran "[]"
        val niz = JSONArray()
        for (o in dao.uProzoru(fromMs.toLong(), toMs.toLong())) {
            niz.put(JSONObject().put("mgdl", o.mgdl).put("time", o.vrijemeMs))
        }
        niz.toString()
    }

    @JavascriptInterface
    fun status(): String = siguran {
        val sada = System.currentTimeMillis()
        val b = Brojaci(app)
        val d = dao
        val zadnje = d.zadnje()
        val plan = PlanSlanja.napravi(
            neposlana = d.neposlana().map { PlanSlanja.Ocitanje(it.vrijemeMs, it.mgdl) },
            poslaniSlotovi = d.poslaniSlotovi(PlanSlanja.slot(sada - Validacija.MAX_STAROST_MS)).toSet(),
            sadaMs = sada,
        )
        val od24h = sada - 24 * 3_600_000L
        val vremena24h = d.vremenaOd(od24h)
        val pm = app.getSystemService(PowerManager::class.java)
        JSONObject()
            .put("verzija", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            .put("zadnje_ocitanje", zadnje?.let { JSONObject().put("time", it.vrijemeMs).put("mgdl", it.mgdl) } ?: JSONObject.NULL)
            .put("zadnji_prijem", b.zadnjiPrijemMs ?: JSONObject.NULL)
            .put("neposlano", plan.brojNeposlanih)
            .put("odbijeno", b.odbijeno)
            .put("zadnje_odbijanje", b.zadnjeOdbijanje ?: JSONObject.NULL)
            .put("ocitanja_24h", vremena24h.size)
            .put("najveca_rupa_24h_min", Statistika.najvecaRupaMs(vremena24h, od24h, sada) / 60_000.0)
            .put("baterija_bez_ogranicenja", pm.isIgnoringBatteryOptimizations(app.packageName))
            .put("zadnje_slanje", b.zadnjeSlanjeMs ?: JSONObject.NULL)
            .put("zadnji_pokusaj_slanja", b.zadnjiPokusajMs ?: JSONObject.NULL)
            .put("greska_slanja", b.greskaSlanja ?: JSONObject.NULL)
            .put("prestaro_neposlano", b.prestaroPreskoceno)
            .put("upareno", konfig.citaj() != null)
            .toString()
    }

    @JavascriptInterface
    fun getConfig(): String = siguran {
        val k = konfig.citaj() ?: return@siguran NULL
        JSONObject().put("url", k.url).put("token", k.token).put("naziv", k.naziv).toString()
    }

    /** Prima JSON {url, token, naziv} ili "null" (odspajanje). Vraća {"ok":true} ili {"ok":false,"error":...}. */
    @JavascriptInterface
    fun setConfig(json: String?): String = siguran {
        try {
            if (json == null || json.trim() == "null") {
                konfig.pisi(null)
                return@siguran OK
            }
            val o = JSONObject(json)
            val url = o.optString("url").takeIf { o.has("url") }
            val token = o.optString("token").takeIf { o.has("token") }
            val naziv = o.optString("naziv").takeIf { o.has("naziv") }?.trim()
            Konfig.greska(url, token, naziv)?.let { return@siguran greska(it) }
            konfig.pisi(Konfig(url!!, token!!, naziv!!))
            UploadWorker.pokreniOdmah(app)
            OK
        } catch (e: Exception) {
            greska("Konfiguracija nije sačuvana: ${e.message}")
        }
    }

    @JavascriptInterface
    fun openBatterySettings() {
        if (!dozvoljeno()) return
        activity.runOnUiThread {
            val pm = app.getSystemService(PowerManager::class.java)
            val namjere = buildList {
                if (!pm.isIgnoringBatteryOptimizations(app.packageName)) {
                    add(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${app.packageName}")))
                }
                // Na MIUI su ovdje i Autostart i "Ušteda baterije: Bez ograničenja".
                add(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${app.packageName}")))
                add(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            }
            for (i in namjere) {
                try {
                    activity.startActivity(i)
                    return@runOnUiThread
                } catch (e: ActivityNotFoundException) {
                    Log.w(TAG, "Nema ekrana za ${i.action}")
                }
            }
        }
    }

    private inline fun siguran(blok: () -> String): String {
        if (!dozvoljeno()) return NULL
        return try {
            blok()
        } catch (e: Exception) {
            Log.e(TAG, "Greška u mostu", e)
            NULL
        }
    }

    private fun greska(poruka: String) = JSONObject().put("ok", false).put("error", poruka).toString()

    private companion object {
        const val TAG = "GlucoBridge"
        const val NULL = "null"
        const val OK = """{"ok":true}"""
    }
}
