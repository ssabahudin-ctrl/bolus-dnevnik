package ba.bolusdnevnik.baza

import android.content.Context
import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase

/** Tabela ocitanja (SPEC 4). Jedinstvenost po vremenu očitanja (glucodata.Minute.Time). */
@Entity(tableName = "ocitanja")
data class OcitanjeRed(
    @PrimaryKey @ColumnInfo(name = "vrijeme_ms") val vrijemeMs: Long,
    @ColumnInfo(name = "mgdl") val mgdl: Int,
    @ColumnInfo(name = "rate") val rate: Float?,
    @ColumnInfo(name = "izvor") val izvor: String,
    @ColumnInfo(name = "poslano") val poslano: Boolean = false,
)

data class VrijemeMgdl(
    @ColumnInfo(name = "vrijeme_ms") val vrijemeMs: Long,
    @ColumnInfo(name = "mgdl") val mgdl: Int,
)

@Dao
interface OcitanjaDao {
    /** INSERT OR IGNORE: isto očitanje stiže više puta. Vraća -1 ako je već postojalo. */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    fun upisi(o: OcitanjeRed): Long

    @Query("SELECT * FROM ocitanja ORDER BY vrijeme_ms DESC LIMIT 1")
    fun zadnje(): OcitanjeRed?

    @Query("SELECT vrijeme_ms, mgdl FROM ocitanja WHERE vrijeme_ms BETWEEN :odMs AND :doMs ORDER BY vrijeme_ms")
    fun uProzoru(odMs: Long, doMs: Long): List<VrijemeMgdl>

    @Query("SELECT vrijeme_ms FROM ocitanja WHERE vrijeme_ms >= :odMs ORDER BY vrijeme_ms")
    fun vremenaOd(odMs: Long): List<Long>

    @Query("SELECT vrijeme_ms, mgdl FROM ocitanja WHERE poslano = 0 ORDER BY vrijeme_ms")
    fun neposlana(): List<VrijemeMgdl>

    /** Slotovi (5 min) u kojima već postoji poslano očitanje. */
    @Query("SELECT DISTINCT (vrijeme_ms / 300000) * 300000 FROM ocitanja WHERE poslano = 1 AND vrijeme_ms >= :odMs")
    fun poslaniSlotovi(odMs: Long): List<Long>

    @Query("UPDATE ocitanja SET poslano = 1 WHERE vrijeme_ms IN (:vremena)")
    fun oznaciPoslano(vremena: List<Long>): Int

    @Query("DELETE FROM ocitanja WHERE vrijeme_ms < :granicaMs")
    fun obrisiStarije(granicaMs: Long): Int
}

@Database(entities = [OcitanjeRed::class], version = 1, exportSchema = true)
abstract class BazaOcitanja : RoomDatabase() {
    abstract fun dao(): OcitanjaDao

    companion object {
        @Volatile private var instanca: BazaOcitanja? = null

        fun get(ctx: Context): BazaOcitanja = instanca ?: synchronized(this) {
            instanca ?: Room.databaseBuilder(ctx.applicationContext, BazaOcitanja::class.java, "ocitanja.db")
                .build().also { instanca = it }
        }
    }
}

/** UPDATE ... IN (...) ima ograničen broj parametara u SQLite; šaljemo po komadima. */
fun OcitanjaDao.oznaciPoslanoSve(vremena: List<Long>) {
    vremena.chunked(500).forEach { oznaciPoslano(it) }
}
