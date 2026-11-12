package ba.bolusdnevnik.spike

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class MainActivity : ComponentActivity() {

    private val fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.systemDefault())

    private lateinit var txtDevice: TextView
    private lateinit var txtBroadcasts: TextView
    private lateinit var txtHc: TextView

    private var hcResult6h = "Health Connect još nije čitan."
    private var hcResult30d = ""

    private val requestHcPermission =
        registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
            if (granted.containsAll(HealthConnectReader.PERMISSIONS)) {
                read6h()
            } else {
                hcResult6h = "Dozvola za čitanje šećera NIJE data."
                render()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val root = findViewById<android.view.View>(R.id.root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.updatePadding(top = bars.top, bottom = bars.bottom)
            insets
        }

        txtDevice = findViewById(R.id.txtDevice)
        txtBroadcasts = findViewById(R.id.txtBroadcasts)
        txtHc = findViewById(R.id.txtHc)

        findViewById<Button>(R.id.btnHc).setOnClickListener { onHcClicked() }
        findViewById<Button>(R.id.btnHc30).setOnClickListener { read30d() }
        findViewById<Button>(R.id.btnRefresh).setOnClickListener { render() }
        findViewById<Button>(R.id.btnClear).setOnClickListener {
            BroadcastLog.clear(this)
            render()
        }
        findViewById<Button>(R.id.btnBattery).setOnClickListener {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
        findViewById<Button>(R.id.btnCopy).setOnClickListener { copyReport() }

        if (intent?.action == "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" ||
            intent?.action == "android.intent.action.VIEW_PERMISSION_USAGE"
        ) {
            Toast.makeText(this, "Spike čita šećer samo radi testa i ne šalje ga nikud.", Toast.LENGTH_LONG).show()
        }
    }

    override fun onResume() {
        super.onResume()
        render()
    }

    private fun onHcClicked() {
        when (val status = HealthConnectReader.sdkStatus(this)) {
            HealthConnectClient.SDK_AVAILABLE -> lifecycleScope.launch {
                try {
                    if (HealthConnectReader.hasPermission(this@MainActivity)) read6h()
                    else requestHcPermission.launch(HealthConnectReader.PERMISSIONS)
                } catch (e: Exception) {
                    hcResult6h = "Greška pri provjeri dozvole: ${e.javaClass.simpleName}: ${e.message}"
                    render()
                }
            }
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> {
                hcResult6h = "Health Connect treba instalirati ili ažurirati (otvaram Play Store)."
                render()
                val uri = Uri.parse(
                    "market://details?id=${HealthConnectReader.PROVIDER}&url=healthconnect%3A%2F%2Fonboarding"
                )
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri).setPackage("com.android.vending"))
                } catch (e: Exception) {
                    hcResult6h += "\nPlay Store se nije otvorio: ${e.message}"
                    render()
                }
            }
            else -> {
                hcResult6h = "Health Connect: ${HealthConnectReader.describeStatus(status)}"
                render()
            }
        }
    }

    private fun read6h() {
        hcResult6h = "Čitam..."
        render()
        lifecycleScope.launch {
            hcResult6h = try {
                HealthConnectReader.readDetailed(this@MainActivity, 6)
            } catch (e: Exception) {
                "Greška pri čitanju: ${e.javaClass.simpleName}: ${e.message}"
            }
            render()
        }
    }

    private fun read30d() {
        if (HealthConnectReader.sdkStatus(this) != HealthConnectClient.SDK_AVAILABLE) {
            hcResult30d = "Health Connect nije dostupan."
            render()
            return
        }
        hcResult30d = "Čitam 30 dana..."
        render()
        lifecycleScope.launch {
            hcResult30d = try {
                if (!HealthConnectReader.hasPermission(this@MainActivity)) "Prvo daj dozvolu (dugme iznad)."
                else HealthConnectReader.readSummary(this@MainActivity, 30)
            } catch (e: Exception) {
                "Greška pri čitanju: ${e.javaClass.simpleName}: ${e.message}"
            }
            render()
        }
    }

    private fun deviceSection(): String {
        val gdh = try {
            val pi = packageManager.getPackageInfo("de.michelinside.glucodatahandler", 0)
            "instaliran, verzija ${pi.versionName}"
        } catch (e: Exception) {
            "nije pronađen"
        }
        val pm = getSystemService(PowerManager::class.java)
        val batteryFree = pm.isIgnoringBatteryOptimizations(packageName)
        val hcStatus = HealthConnectReader.describeStatus(HealthConnectReader.sdkStatus(this))
        return buildString {
            append("== UREĐAJ ==\n")
            append("Proizvođač: ${Build.MANUFACTURER}\n")
            append("Model: ${Build.MODEL} (${Build.DEVICE})\n")
            append("Android: ${Build.VERSION.RELEASE}, SDK ${Build.VERSION.SDK_INT}\n")
            append("Spike: ${BuildConfigInfo.versionName(this@MainActivity)}\n")
            append("GDH: $gdh\n")
            append("Optimizacija baterije isključena za spike: ${if (batteryFree) "da" else "ne"}\n")
            append("Health Connect: $hcStatus\n")
            append("Izvještaj napravljen: ${fmt.format(Instant.now())}\n")
        }
    }

    private fun broadcastSection(limit: Int): String {
        val all = BroadcastLog.readAll(this)
        val gaps = LogFormat.describeGaps(LogFormat.gapStats(all.map { it.receivedMs }))
        return buildString {
            append("== BROADCAST glucodata.Minute ==\n")
            append("Ukupno u logu: ${all.size}\n")
            append("Prijem, $gaps\n")
            if (all.isEmpty()) append("Još nije primljen nijedan broadcast.\n")
            append("Zadnjih ${minOf(limit, all.size)} (najnoviji prvi):\n")
            for (e in all.takeLast(limit).asReversed()) {
                append(fmt.format(Instant.ofEpochMilli(e.receivedMs)))
                append(" [").append(e.receivedMs).append("] ")
                append(e.action).append('\n')
                append("   ").append(e.extras).append('\n')
            }
        }
    }

    private fun hcSection(): String = buildString {
        append("== HEALTH CONNECT ==\n")
        append(hcResult6h)
        if (hcResult30d.isNotEmpty()) append("\n").append(hcResult30d)
    }

    private fun render() {
        txtDevice.text = deviceSection()
        txtBroadcasts.text = broadcastSection(20)
        txtHc.text = hcSection()
    }

    private fun copyReport() {
        val report = listOf(deviceSection(), broadcastSection(200), hcSection()).joinToString("\n")
        val cm = getSystemService(ClipboardManager::class.java)
        cm.setPrimaryClip(ClipData.newPlainText("Bolus spike izvještaj", report))
        Toast.makeText(this, "Kopirano", Toast.LENGTH_SHORT).show()
    }
}

private object BuildConfigInfo {
    fun versionName(activity: ComponentActivity): String = try {
        activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: "?"
    } catch (e: Exception) {
        "?"
    }
}
