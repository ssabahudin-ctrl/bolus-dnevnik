package ba.bolusdnevnik

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WebAdresaTest {
    private val a = WebAdresa("https://korisnik.github.io/bolus-dnevnik/")

    @Test fun dozvoljeno() {
        assertTrue(a.dozvoljena("https://korisnik.github.io/bolus-dnevnik/"))
        assertTrue(a.dozvoljena("https://korisnik.github.io/bolus-dnevnik"))
        assertTrue(a.dozvoljena("https://KORISNIK.github.io/bolus-dnevnik/index.html#pair=abc"))
        assertTrue(a.dozvoljena("https://korisnik.github.io:443/bolus-dnevnik/assets/x.js"))
    }

    @Test fun drugiOriginIliFolder() {
        assertFalse(a.dozvoljena(null))
        assertFalse(a.dozvoljena(""))
        assertFalse(a.dozvoljena("http://korisnik.github.io/bolus-dnevnik/"))
        assertFalse(a.dozvoljena("https://korisnik.github.io:8443/bolus-dnevnik/"))
        assertFalse(a.dozvoljena("https://drugi.github.io/bolus-dnevnik/"))
        assertFalse(a.dozvoljena("https://korisnik.github.io.zlo.com/bolus-dnevnik/"))
        assertFalse(a.dozvoljena("https://korisnik.github.io@zlo.com/bolus-dnevnik/"))
        assertFalse(a.dozvoljena("https://zlo.com@korisnik.github.io/bolus-dnevnik/"))
        assertFalse(a.dozvoljena("https://korisnik.github.io/drugi-repo/"))
        assertFalse(a.dozvoljena("https://korisnik.github.io/bolus-dnevnik-zlo/"))
        assertFalse(a.dozvoljena("https://korisnik.github.io/bolus-dnevnik/../drugi-repo/"))
        assertFalse(a.dozvoljena("https://korisnik.github.io/bolus-dnevnik/%2e%2e/drugi-repo/"))
        assertFalse(a.dozvoljena("javascript:alert(1)"))
        assertFalse(a.dozvoljena("data:text/html,x"))
        assertFalse(a.dozvoljena("about:blank"))
    }
}
