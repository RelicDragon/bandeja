# Capacitor Android Production ProGuard Rules - 2025 Best Practices

# Keep line numbers for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Keep annotations and signatures
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Preserve generic signatures for better debugging
-keepattributes Signature

# Capacitor Core
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.annotation.CapacitorPlugin *;
    @com.getcapacitor.PluginMethod *;
}

# WebView JavaScript Interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
-keep public class * extends android.webkit.WebView
-keepclassmembers class * extends android.webkit.WebChromeClient {
    public void openFileChooser(...);
}

# Cordova/Ionic Native Plugins
-keep class org.apache.cordova.** { *; }
-keep class org.json.** { *; }

# AndroidX and Support Libraries
-keep class androidx.** { *; }
-keep interface androidx.** { *; }
-dontwarn androidx.**

# Google Play Services
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# Firebase
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Reflection - Keep classes used via reflection
-keep class * extends java.lang.reflect.Type
-keepclassmembers class * {
    public <init>(...);
}

# Serialization
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Enums
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Parcelables
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

# Keep R classes
-keepclassmembers class **.R$* {
    public static <fields>;
}

# Prevent obfuscation of models/data classes used in API responses
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# OkHttp and Retrofit (if used)
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# Gson (if used for JSON)
-keepattributes Signature
-keep class com.google.gson.** { *; }
-keep class sun.misc.Unsafe { *; }

# Remove logging in production
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int i(...);
    public static int w(...);
    public static int d(...);
    public static int e(...);
}

# Optimize for performance
-optimizationpasses 5
-dontusemixedcaseclassnames
-dontskipnonpubliclibraryclasses
-verbose

# App-specific: Keep MainActivity
-keep class com.funified.bandeja.MainActivity { *; }

# Keep all plugin classes in your namespace
-keep class com.funified.bandeja.** { *; }
