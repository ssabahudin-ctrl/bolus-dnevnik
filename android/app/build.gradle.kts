import java.net.URI
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.ksp)
}

fun ucitajProperties(ime: String): Properties = Properties().apply {
    val f = rootProject.file(ime)
    if (f.exists()) f.inputStream().use { load(it) }
}

// Adresa web dijela nije u repozitoriju (CLAUDE.md): čita se iz local.properties ili -Pbolus.webUrl.
val lokalno = ucitajProperties("local.properties")
val webUrl: String = (findProperty("bolus.webUrl") as String?) ?: lokalno.getProperty("bolus.webUrl")
    ?: throw GradleException(
        "Nedostaje bolus.webUrl. Upiši u android/local.properties npr. " +
            "bolus.webUrl=https://<korisnik>.github.io/<repozitorij>/ (vidi local.properties.example)."
    )
val webUri = URI(webUrl)
if (webUri.scheme != "https" || webUri.host.isNullOrEmpty() || !webUrl.endsWith("/")) {
    throw GradleException("bolus.webUrl mora biti https adresa koja završava sa /, a glasi: $webUrl")
}

// Potpisivanje release builda: keystore.properties je izvan gita (vidi keystore.properties.example).
val potpis = ucitajProperties("keystore.properties")
val imaPotpis = listOf("storeFile", "storePassword", "keyAlias", "keyPassword").all { !potpis.getProperty(it).isNullOrBlank() }

android {
    namespace = "ba.bolusdnevnik"
    compileSdk = 36

    defaultConfig {
        applicationId = "ba.bolusdnevnik"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.5.0"

        buildConfigField("String", "WEB_URL", "\"$webUrl\"")
        manifestPlaceholders["webHost"] = webUri.host
        manifestPlaceholders["webPath"] = webUri.path
    }

    signingConfigs {
        if (imaPotpis) {
            create("release") {
                storeFile = file(potpis.getProperty("storeFile"))
                storePassword = potpis.getProperty("storePassword")
                keyAlias = potpis.getProperty("keyAlias")
                keyPassword = potpis.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        jvmToolchain(17)
    }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

if (!imaPotpis) {
    logger.lifecycle("keystore.properties nije pronađen ili nije potpun: release build neće biti potpisan.")
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.room.runtime)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.work.runtime)
    testImplementation(libs.junit)
}
