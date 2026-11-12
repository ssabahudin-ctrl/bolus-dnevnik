package ba.bolusdnevnik

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature

/**
 * Jedan ekran sa WebView-om koji učitava web dio (SPEC 4). Sve van adrese web dijela
 * se otvara u vanjskom pregledniku, a most GlucoBridge radi samo za stranicu sa te adrese.
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private val adresa = WebAdresa(BuildConfig.WEB_URL)

    /** URL glavnog okvira; ažurira se na UI niti, čita ga most na svojoj niti. */
    @Volatile private var trenutniUrl: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        web = WebView(this)
        web.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        setContentView(web)
        ViewCompat.setOnApplyWindowInsetsListener(web) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.updatePadding(top = b.top, bottom = b.bottom, left = b.left, right = b.right)
            insets
        }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            setGeolocationEnabled(false)
            cacheMode = if (imaMreze()) WebSettings.LOAD_DEFAULT else WebSettings.LOAD_CACHE_ELSE_NETWORK
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
            WebSettingsCompat.setSafeBrowsingEnabled(web.settings, true)
        }

        web.addJavascriptInterface(GlucoBridge(this) { adresa.dozvoljena(trenutniUrl) }, "GlucoBridge")
        web.webViewClient = Klijent()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        if (web.url == null) web.loadUrl(pocetnaAdresa(intent))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Link za uparivanje otvoren dok aplikacija radi: učitaj ga, web dio obradi #pair=.
        val url = intent.dataString
        if (url != null && adresa.dozvoljena(url)) web.loadUrl(url)
    }

    override fun onResume() {
        super.onResume()
        web.settings.cacheMode = if (imaMreze()) WebSettings.LOAD_DEFAULT else WebSettings.LOAD_CACHE_ELSE_NETWORK
        UploadWorker.pokreniOdmah(this)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    private fun pocetnaAdresa(i: Intent?): String {
        val url = i?.dataString
        return if (url != null && adresa.dozvoljena(url)) url else BuildConfig.WEB_URL
    }

    private fun imaMreze(): Boolean {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return false
        val cap = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return cap.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun otvoriVani(url: String) {
        val uri = Uri.parse(url)
        if (uri.scheme != "https" && uri.scheme != "http" && uri.scheme != "mailto" && uri.scheme != "tel") {
            Log.w(TAG, "Blokiran link sa šemom ${uri.scheme}")
            return
        }
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, "Nema aplikacije za otvaranje linka.", Toast.LENGTH_SHORT).show()
        }
    }

    private inner class Klijent : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            if (adresa.dozvoljena(url)) return false
            if (request.isForMainFrame) otvoriVani(url)
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            trenutniUrl = url
            val lokalna = url == null || url.startsWith("about:") || url.startsWith("data:")
            if (!lokalna && !adresa.dozvoljena(url)) {
                // Ne bi se smjelo desiti (sve van adrese ide vani); za svaki slučaj zaustavi.
                view.stopLoading()
                view.loadUrl(BuildConfig.WEB_URL)
            }
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            trenutniUrl = url
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            trenutniUrl = null
            val html = """
                <!doctype html><html lang="bs"><meta name="viewport" content="width=device-width, initial-scale=1">
                <body style="font-family:sans-serif;padding:24px;font-size:18px">
                <h2>Web dio se ne može učitati</h2>
                <p>Provjeri internet vezu. Šećer se i dalje prima i čuva na telefonu.</p>
                <p style="color:#666;font-size:14px">${error.description}</p>
                <p><a href="${BuildConfig.WEB_URL}" style="display:inline-block;padding:14px 20px;background:#1565c0;color:#fff;text-decoration:none;border-radius:8px">Pokušaj ponovo</a></p>
                </body></html>
            """.trimIndent()
            view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
        }
    }

    private companion object {
        const val TAG = "MainActivity"
    }
}
