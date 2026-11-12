package ba.bolusdnevnik

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class KonfigTest {
    private val url = "https://script.google.com/macros/s/x/exec"
    private val token = "a".repeat(20)

    @Test fun ispravna() {
        assertNull(Konfig.greska(url, token, "Telefon 1"))
    }

    @Test fun neispravna() {
        assertNotNull(Konfig.greska(null, token, "T"))
        assertNotNull(Konfig.greska("http://script.google.com/x", token, "T"))
        assertNotNull(Konfig.greska("https://script.google.com", token, "T"))
        assertNotNull(Konfig.greska(url, "kratak", "T"))
        assertNotNull(Konfig.greska(url, null, "T"))
        assertNotNull(Konfig.greska(url, token, "  "))
        assertNotNull(Konfig.greska(url, token, null))
    }
}
