package ba.bolusdnevnik.spike

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Prima glucodata.Minute od GlucoDataHandlera i upisuje sve extras sirovo.
 * Bez validacije i bez mreže: spike treba vidjeti tačno šta stiže.
 */
class GlucoReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val received = System.currentTimeMillis()
        val extras = mutableMapOf<String, Any?>()
        intent.extras?.let { bundle ->
            for (key in bundle.keySet()) {
                @Suppress("DEPRECATION")
                extras[key] = bundle.get(key)
            }
        }
        BroadcastLog.append(context, LogFormat.formatLine(received, intent.action, extras))
    }
}
