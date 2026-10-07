package com.riverside.pulse

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import java.net.URL
import org.json.JSONArray

class PulseAlertsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), LifecycleEventListener {
  init { context.addLifecycleEventListener(this) }
  override fun getName() = "PulseAlerts"
  override fun onHostResume() { PulseAlertState.foreground = true }
  override fun onHostPause() { PulseAlertState.foreground = false }
  override fun onHostDestroy() { PulseAlertState.foreground = false }

  @ReactMethod fun start(base: String, volunteerId: String, promise: Promise) {
    try {
      require(URL(base).protocol in listOf("http", "https") && Regex("VOL-[0-9]{3}").matches(volunteerId))
      PulseAlertState.channels(context)
      PulseAlertState.foreground = true
      PulseAlarm.configure(context, base, volunteerId)
      check(NotificationManagerCompat.from(context).areNotificationsEnabled()) { "Enable Pulse notifications in Android settings first." }
      val prefs = PulseAlertState.prefs(context)
      if (prefs.getString("base", "") != base || prefs.getString("volunteer", "") != volunteerId) {
        PulseAlertState.clearNotifications(context)
        prefs.edit().putString("seen", "[]").apply()
      }
      prefs.edit().putString("base", base).putString("volunteer", volunteerId).putBoolean("enabled", true).apply()
      ContextCompat.startForegroundService(context, Intent(context, PulseAlertService::class.java))
      promise.resolve(null)
    } catch (error: Exception) {
      PulseAlertState.prefs(context).edit().putBoolean("enabled", false).apply()
      promise.reject("ALERT_START", error.message, error)
    }
  }

  @ReactMethod fun stop(promise: Promise) {
    PulseAlertState.prefs(context).edit().putBoolean("enabled", false).apply()
    context.stopService(Intent(context, PulseAlertService::class.java))
    PulseAlertState.clearNotifications(context)
    PulseAlarm.clear(context)
    promise.resolve(null)
  }

  @ReactMethod fun status(promise: Promise) {
    PulseAlertState.channels(context)
    val channel = if (Build.VERSION.SDK_INT >= 26) context.getSystemService(NotificationManager::class.java).getNotificationChannel(PulseAlertState.CHANNEL) else null
    val power = context.getSystemService(PowerManager::class.java)
    val prefs = PulseAlertState.prefs(context)
    promise.resolve(Arguments.createMap().apply {
      putBoolean("enabled", prefs.getBoolean("enabled", false) && PulseAlertState.running)
      putBoolean("notificationsAllowed", NotificationManagerCompat.from(context).areNotificationsEnabled() && (channel == null || channel.importance != NotificationManager.IMPORTANCE_NONE))
      putBoolean("vibrationEnabled", channel?.shouldVibrate() ?: true)
      putBoolean("batteryAllowed", power.isIgnoringBatteryOptimizations(context.packageName))
      putBoolean("fullScreenAllowed", Build.VERSION.SDK_INT < 34 || context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent())
      putString("volunteerId", prefs.getString("volunteer", ""))
      putString("base", prefs.getString("base", ""))
    })
  }

  @ReactMethod fun syncInbox(base: String, volunteer: String, json: String, promise: Promise) {
    try { PulseAlarm.snapshot(context, base, volunteer, JSONArray(json), true); promise.resolve(null) }
    catch (error: Exception) { promise.reject("ALARM_UPDATE", error.message, error) }
  }

  @ReactMethod fun silenceAlert(base: String, volunteer: String, id: String, promise: Promise) {
    try { PulseAlarm.silence(context, base, volunteer, id); promise.resolve(null) }
    catch (error: Exception) { promise.reject("ALARM_STOP", error.message, error) }
  }

  @ReactMethod fun getSilenced(base: String, volunteer: String, promise: Promise) {
    promise.resolve(Arguments.fromList(PulseAlarm.stopped(context, base, volunteer).toList()))
  }

  @ReactMethod fun wakeSettings(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= 34) context.startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
        Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("WAKE_SETTINGS", error.message, error) }
  }

  @ReactMethod fun notificationSettings(promise: Promise) {
    try {
      val intent = if (Build.VERSION.SDK_INT >= 26) Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName).putExtra(Settings.EXTRA_CHANNEL_ID, PulseAlertState.CHANNEL)
      else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("ALERT_SETTINGS", error.message, error) }
  }

  @ReactMethod fun batterySettings(promise: Promise) {
    try {
      context.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("BATTERY_SETTINGS", error.message, error) }
  }
}

class PulseAlertsPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(PulseAlertsModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
