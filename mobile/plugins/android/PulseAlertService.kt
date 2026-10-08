package com.riverside.pulse

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

object PulseAlertState {
  const val CHANNEL = "pulse-emergencies-v1"
  const val MONITOR_CHANNEL = "pulse-duty-v1"
  const val MONITOR_ID = 6100
  const val ALERT_ID = 6101
  @Volatile var foreground = false
  @Volatile var running = false
  fun prefs(context: Context) = context.getSharedPreferences("pulse-alerts", Context.MODE_PRIVATE)
  fun channels(context: Context) {
    PulseManagerUpdates.channel(context)
    if (Build.VERSION.SDK_INT >= 26) {
      val manager = context.getSystemService(NotificationManager::class.java)
      val alerts = NotificationChannel(CHANNEL, "Emergency alerts", NotificationManager.IMPORTANCE_HIGH)
      alerts.description = "Vibrating incident alerts while you are on duty"
      alerts.enableVibration(true)
      alerts.vibrationPattern = longArrayOf(0, 500, 180, 500, 180, 800)
      alerts.setSound(null, null)
      alerts.enableLights(true)
      alerts.lightColor = Color.RED
      manager.createNotificationChannel(alerts)
      manager.createNotificationChannel(NotificationChannel(MONITOR_CHANNEL, "On-duty connection", NotificationManager.IMPORTANCE_LOW).apply {
        setSound(null, null); enableVibration(false)
      })
    }
  }
  @Synchronized fun seen(context: Context): MutableSet<String> {
    val data = JSONArray(prefs(context).getString("seen", "[]"))
    return (0 until data.length()).map { data.getString(it) }.toMutableSet()
  }
  @Synchronized fun mark(context: Context, id: String) {
    val ids = seen(context).apply { add(id) }.toList().takeLast(300)
    prefs(context).edit().putString("seen", JSONArray(ids).toString()).apply()
  }
  fun clearNotifications(context: Context) {
    PulseManagerUpdates.clear(context)
    val manager = context.getSystemService(NotificationManager::class.java)
    for (id in seen(context)) manager.cancel("pulse:$id", ALERT_ID)
  }
}

class PulseAlertService : Service() {
  private val worker = Executors.newSingleThreadScheduledExecutor()
  private var started = false
  private var wakeLock: PowerManager.WakeLock? = null
  private var lastConnection = ""
  @Volatile private var destroyed = false

  override fun onBind(intent: Intent?) = null

  private fun openApp(): PendingIntent {
    val intent = packageManager.getLaunchIntentForPackage(packageName)!!.apply {
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    return PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun monitor(message: String): Notification {
    val stop = PendingIntent.getService(this, 1,
      Intent(this, PulseAlertService::class.java).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(this, PulseAlertState.MONITOR_CHANNEL)
      .setSmallIcon(R.drawable.pulse_notification).setContentTitle("Pulse alerts active")
      .setContentText(message).setContentIntent(openApp()).setOngoing(true).setOnlyAlertOnce(true)
      .addAction(0, "Stop alerts", stop).build()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val prefs = PulseAlertState.prefs(this)
    if (intent?.action == "STOP" || !prefs.getBoolean("enabled", false)) {
      prefs.edit().putBoolean("enabled", false).apply()
      PulseAlertState.clearNotifications(this)
      PulseAlarm.clear(this)
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    PulseAlertState.channels(this)
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(PulseAlertState.MONITOR_ID, monitor("Connecting to your supervisor…"), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(PulseAlertState.MONITOR_ID, monitor("Connecting to your supervisor…"))
    }
    PulseAlertState.running = true
    if (!started) {
      started = true
      val power = getSystemService(PowerManager::class.java)
      wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Pulse:OnDutyAlerts").apply {
        // Released on stop. The user explicitly enables this on-duty service.
        setReferenceCounted(false); acquire()
      }
      worker.scheduleWithFixedDelay({ poll() }, 0, 3, TimeUnit.SECONDS)
      PulseAlarm.restore(this)
    }
    return START_STICKY
  }

  private fun connection(message: String) {
    if (destroyed || lastConnection == message) return
    lastConnection = message
    getSystemService(NotificationManager::class.java).notify(PulseAlertState.MONITOR_ID, monitor(message))
  }

  private fun poll() {
    var request: HttpURLConnection? = null
    val prefs = PulseAlertState.prefs(this)
    val base = prefs.getString("base", "") ?: ""
    val volunteer = prefs.getString("volunteer", "") ?: ""
    if (!prefs.getBoolean("enabled", false) || base.isEmpty() || volunteer.isEmpty()) return
    try {
      if (volunteer == PulseManagerUpdates.IDENTITY) {
        PulseManagerUpdates.poll(this, base) {
          !destroyed && prefs.getBoolean("enabled", false) &&
            base == prefs.getString("base", "") && volunteer == prefs.getString("volunteer", "")
        }
        if (!destroyed && prefs.getString("volunteer", "") == volunteer) connection("Connected · manager updates")
        return
      }
      // One durable acknowledgement per cycle; a failed send never restarts its alarm.
      syncAcknowledgement(base, volunteer)
      request = URL("$base/api/volunteers/$volunteer/alerts").openConnection() as HttpURLConnection
      request.connectTimeout = 5000
      request.readTimeout = 5000
      request.useCaches = false
      if (request.responseCode != 200) throw IllegalStateException("Backend unavailable")
      val data = JSONArray(request.inputStream.bufferedReader().use { it.readText() })
      // A response for an old login/server must never alert the new volunteer.
      if (destroyed || !prefs.getBoolean("enabled", false) || base != prefs.getString("base", "") || volunteer != prefs.getString("volunteer", "")) return
      connection("Connected · volunteer ${volunteer.removePrefix("VOL-").padStart(4, '0')}")
      PulseAlarm.snapshot(this, base, volunteer, data)
    } catch (_: Exception) {
      // Do not log reports, device data, or server URLs into Android system logs.
      if (prefs.getBoolean("enabled", false)) connection("Connection lost · retrying. Check Wi-Fi and the laptop.")
    } finally { request?.disconnect() }
  }

  private fun syncAcknowledgement(base: String, volunteer: String) {
    val id = PulseAlarm.acknowledgements(this, base, volunteer).firstOrNull() ?: return
    val connection = URL("$base/api/volunteers/$volunteer/alerts/$id/acknowledge").openConnection() as HttpURLConnection
    try {
      connection.requestMethod = "POST"
      connection.connectTimeout = 3000; connection.readTimeout = 3000
      connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json")
      connection.outputStream.use { it.write("{}".toByteArray()) }
      if (connection.responseCode == 200 || connection.responseCode == 404) PulseAlarm.acknowledgementSent(this, base, volunteer, id)
    } catch (_: Exception) { /* Keep the acknowledgement queued; still try reading new alerts. */ }
    finally { connection.disconnect() }
  }

  override fun onDestroy() {
    destroyed = true
    PulseAlertState.running = false
    worker.shutdownNow()
    PulseAlarm.stop(this)
    wakeLock?.let { if (it.isHeld) it.release() }
    super.onDestroy()
  }
}
