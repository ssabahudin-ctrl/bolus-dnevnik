package ba.bolusdnevnik.spike

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BloodGlucoseRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

object HealthConnectReader {
    const val PROVIDER = "com.google.android.apps.healthdata"
    val PERMISSIONS = setOf(HealthPermission.getReadPermission(BloodGlucoseRecord::class))

    private val fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss xxx")

    fun sdkStatus(context: Context): Int = HealthConnectClient.getSdkStatus(context, PROVIDER)

    fun describeStatus(status: Int): String = when (status) {
        HealthConnectClient.SDK_AVAILABLE -> "dostupan"
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "treba instalirati ili ažurirati Health Connect"
        HealthConnectClient.SDK_UNAVAILABLE -> "nije dostupan na ovom telefonu"
        else -> "nepoznat status $status"
    }

    suspend fun hasPermission(context: Context): Boolean {
        val client = HealthConnectClient.getOrCreate(context)
        return client.permissionController.getGrantedPermissions().containsAll(PERMISSIONS)
    }

    private suspend fun readAll(context: Context, from: Instant, to: Instant): List<BloodGlucoseRecord> {
        val client = HealthConnectClient.getOrCreate(context)
        val out = mutableListOf<BloodGlucoseRecord>()
        var token: String? = null
        do {
            val resp = client.readRecords(
                ReadRecordsRequest(
                    recordType = BloodGlucoseRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(from, to),
                    pageToken = token,
                )
            )
            out += resp.records
            token = resp.pageToken
        } while (!token.isNullOrEmpty())
        return out.sortedBy { it.time }
    }

    private fun fmtTime(r: BloodGlucoseRecord): String {
        val zone = r.zoneOffset ?: ZoneId.systemDefault()
        return r.time.atZone(zone).format(fmt)
    }

    /** Detaljno: svako očitanje iz zadnjih [hours] sati. */
    suspend fun readDetailed(context: Context, hours: Long): String {
        val to = Instant.now()
        val from = to.minus(Duration.ofHours(hours))
        val records = readAll(context, from, to)
        val sb = StringBuilder()
        sb.append("Health Connect, zadnjih $hours h: ${records.size} očitanja\n")
        if (records.isEmpty()) return sb.toString()
        sb.append("Najstarije: ${fmtTime(records.first())}\n")
        sb.append("Najnovije: ${fmtTime(records.last())}\n")
        sb.append(LogFormat.describeGaps(LogFormat.gapStats(records.map { it.time.toEpochMilli() }))).append('\n')
        val origins = records.groupingBy { it.metadata.dataOrigin.packageName }.eachCount()
        sb.append("Izvori: ").append(origins.entries.joinToString { "${it.key} (${it.value})" }).append('\n')
        sb.append("vrijeme | mmol/L | mg/dL | izvor | specimen | odnos_obrok\n")
        for (r in records.asReversed()) {
            sb.append(fmtTime(r)).append(" | ")
                .append("%.2f".format(Locale.ROOT, r.level.inMillimolesPerLiter)).append(" | ")
                .append("%.1f".format(Locale.ROOT, r.level.inMilligramsPerDeciliter)).append(" | ")
                .append(r.metadata.dataOrigin.packageName).append(" | ")
                .append(r.specimenSource).append(" | ")
                .append(r.relationToMeal).append('\n')
        }
        return sb.toString()
    }

    /** Kratko: koliko historije ima unazad [days] dana. */
    suspend fun readSummary(context: Context, days: Long): String {
        val to = Instant.now()
        val from = to.minus(Duration.ofDays(days))
        val records = readAll(context, from, to)
        if (records.isEmpty()) return "Health Connect, zadnjih $days dana: 0 očitanja\n"
        val perDay = records.groupingBy {
            it.time.atZone(ZoneId.systemDefault()).toLocalDate().toString()
        }.eachCount()
        return buildString {
            append("Health Connect, zadnjih $days dana: ${records.size} očitanja\n")
            append("Najstarije: ${fmtTime(records.first())}\n")
            append("Najnovije: ${fmtTime(records.last())}\n")
            append(LogFormat.describeGaps(LogFormat.gapStats(records.map { it.time.toEpochMilli() }))).append('\n')
            append("Po danima: ").append(perDay.entries.joinToString { "${it.key}: ${it.value}" }).append('\n')
        }
    }
}
