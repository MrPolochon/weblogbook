plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.weblogbook.vhfradio"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.weblogbook.vhfradio.beta"
        minSdk = 26
        targetSdk = 36
        versionCode = providers.gradleProperty("radioVersionCode").orElse("6").get().toInt()
        versionName = providers.gradleProperty("radioVersionName").orElse("1.2.0-beta.4").get()
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Config values
        buildConfigField("String", "SUPABASE_URL", "\"https://iajcynzzybkomaouxwji.supabase.co\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhamN5bnp6eWJrb21hb3V4d2ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3NTkwMDQsImV4cCI6MjA4NDMzNTAwNH0.L4lkhc64EMP7Al3_s5JLipUdy5TbbHiz92UaALm8nuE\"")
        buildConfigField("String", "API_BASE_URL", "\"https://www.mixouairlinesptfsweblogbook.com\"")
    }

    val distributionKey = System.getenv("ANDROID_KEYSTORE_FILE")
    if (!distributionKey.isNullOrBlank()) {
        signingConfigs {
            create("distribution") {
                storeFile = file(distributionKey)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            }
        }
    }
    buildTypes {
        debug {
            applicationIdSuffix = ".dev"
        }
        release {
            if (!distributionKey.isNullOrBlank()) signingConfig = signingConfigs.getByName("distribution")
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
        viewBinding = true
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:rules:1.6.1")
    // Core Android
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")

    // Compose
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // Native WebRTC transport for Cloudflare SFU
    implementation("io.github.webrtc-sdk:android:150.7871.01")

    // Networking (OkHttp + Gson)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.code.gson:gson:2.11.0")

    // Media Session (notification controls)
    implementation("androidx.media:media:1.7.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
