package ba.bolusdnevnik

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant

/**
 * Poziv Apps Script API-ja (SPEC 6): POST text/plain sa JSON tijelom. Apps Script odgovara
 * preusmjerenjem (302) na googleusercontent.com, koje se prati ručno kao GET.
 */
object ApiKlijent {
    class ApiGreska(poruka: String, val trajna: Boolean) : Exception(poruka)

    fun saveGlucose(k: Konfig, ocitanja: List<PlanSlanja.Ocitanje>): JSONObject {
        val readings = JSONArray()
        for (o in ocitanja) {
            readings.put(JSONObject().put("time", Instant.ofEpochMilli(o.vrijemeMs).toString()).put("mgdl", o.mgdl))
        }
        val tijelo = JSONObject().put("token", k.token).put("action", "saveGlucose").put("readings", readings)
        val odgovor = JSONObject(posalji(k.url, tijelo.toString()))
        if (!odgovor.optBoolean("ok", false)) {
            val greska = odgovor.optString("error", "nepoznata greška")
            throw ApiGreska("Server: $greska", trajna = greska == "auth")
        }
        return odgovor
    }

    private fun posalji(url: String, tijelo: String): String {
        var c = otvori(url)
        c.requestMethod = "POST"
        c.doOutput = true
        c.setRequestProperty("Content-Type", "text/plain;charset=utf-8")
        c.outputStream.use { it.write(tijelo.toByteArray(Charsets.UTF_8)) }
        var skokova = 0
        while (c.responseCode in 300..399) {
            val dalje = c.getHeaderField("Location") ?: throw IOException("Preusmjerenje bez adrese")
            c.disconnect()
            if (++skokova > 5) throw IOException("Previše preusmjerenja")
            val novi = URL(URL(c.url, dalje).toString())
            if (novi.protocol != "https") throw IOException("Preusmjerenje van https")
            c = otvori(novi.toString())
        }
        val kod = c.responseCode
        val tekst = (if (kod in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        c.disconnect()
        if (kod !in 200..299) throw IOException("HTTP $kod")
        return tekst
    }

    private fun otvori(url: String): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            connectTimeout = 20_000
            readTimeout = 60_000
        }
}
