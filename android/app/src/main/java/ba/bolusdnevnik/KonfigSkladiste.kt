package ba.bolusdnevnik

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Konfiguracija uređaja šifrovana AES-GCM ključem iz Android Keystore (SPEC 4).
 * Ključ ne napušta telefon; ako se ne može dešifrovati (npr. podaci preneseni na drugi
 * telefon), konfiguracija se smatra nepostojećom i uređaj treba ponovo upariti.
 */
class KonfigSkladiste(ctx: Context) {
    private val prefs = ctx.applicationContext.getSharedPreferences("konfig", Context.MODE_PRIVATE)

    fun citaj(): Konfig? {
        val s = prefs.getString(KLJUC, null) ?: return null
        return try {
            val o = JSONObject(desifruj(s))
            val k = Konfig(o.getString("url"), o.getString("token"), o.getString("naziv"))
            if (Konfig.greska(k.url, k.token, k.naziv) == null) k else null
        } catch (e: Exception) {
            null
        }
    }

    fun pisi(k: Konfig?) {
        if (k == null) {
            prefs.edit().remove(KLJUC).commit()
            return
        }
        val json = JSONObject().put("url", k.url).put("token", k.token).put("naziv", k.naziv).toString()
        if (!prefs.edit().putString(KLJUC, sifruj(json)).commit()) throw IllegalStateException("Konfiguracija nije upisana.")
    }

    private fun kljuc(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return gen.generateKey()
    }

    private fun sifruj(tekst: String): String {
        val c = Cipher.getInstance(TRANSFORMACIJA)
        c.init(Cipher.ENCRYPT_MODE, kljuc())
        val iv = Base64.encodeToString(c.iv, Base64.NO_WRAP)
        val ct = Base64.encodeToString(c.doFinal(tekst.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        return "$iv:$ct"
    }

    private fun desifruj(s: String): String {
        val (iv, ct) = s.split(':', limit = 2)
        val c = Cipher.getInstance(TRANSFORMACIJA)
        c.init(Cipher.DECRYPT_MODE, kljuc(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
        return String(c.doFinal(Base64.decode(ct, Base64.NO_WRAP)), Charsets.UTF_8)
    }

    private companion object {
        const val KLJUC = "konfig"
        const val ALIAS = "bolus_konfig"
        const val TRANSFORMACIJA = "AES/GCM/NoPadding"
    }
}
