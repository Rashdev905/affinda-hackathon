package com.riverside.pulse

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.BroadcastReceiver
import android.content.IntentFilter
import android.graphics.Color
import android.media.AudioAttributes
import android.media.AudioManager
import android.net.Uri
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

/** One native alarm owns vibration in both foreground and background. Opening UI never stops it. */
object PulseAlarm {
  private val handler = Handler(Looper.getMainLooper())
  private var context: Context? = null
  private var monitoring = false
  private var vibrating = false
  private var displayedId: String? = null
  private var activeIds = emptySet<String>()
  private var notificationTag: String? = null
  private var postedSignature: String? = null
  private var requestFullScreen = false
  private var lastWakeAttempt = 0L
  private const val WAKE_RETRY_MS = 30_000L
  private var screenReceiverRegistered = false
  private val screenRecovery = Runnable {
    val app = context
    if (app != null && monitoring && pending(app).length() > 0) {
      // Android may cancel even an indefinite alarm when the screen goes off.
      // Our previous start request is no longer evidence that the motor is on.
      vibrating = false
      handler.removeCallbacks(monitor)
      handler.post(monitor)
    }
  }
  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action == Intent.ACTION_SCREEN_OFF && monitoring) {
        handler.removeCallbacks(screenRecovery)
        // Run after Android's own screen-off cancellation has been processed.
        handler.postDelayed(screenRecovery, 500)
      }
    }
  }
  private val monitor = object : Runnable {
    override fun run() {
      val app = context ?: return
      if (!monitoring || pending(app).length() == 0) { stop(app); return }
      val manager = app.getSystemService(NotificationManager::class.java)
      val channel = if (Build.VERSION.SDK_INT >= 26) manager.getNotificationChannel(PulseAlertState.CHANNEL) else null
      val audio = app.getSystemService(AudioManager::class.java)
      val allowed = NotificationManagerCompat.from(app).areNotificationsEnabled() &&
        (channel == null || (channel.importance != NotificationManager.IMPORTANCE_NONE && channel.shouldVibrate())) &&
        audio.ringerMode != AudioManager.RINGER_MODE_SILENT && manager.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALL
      val vibrator = app.getSystemService(Vibrator::class.java)
      if (allowed && !vibrating) {
        val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()
        // One continuously-on segment repeats indefinitely: no off segment and no
        // timer restarting the motor. Android owns the effect until explicit cancellation.
        if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createWaveform(
          longArrayOf(1000), intArrayOf(VibrationEffect.DEFAULT_AMPLITUDE), 0), attributes)
        else vibrator.vibrate(longArrayOf(0, 1000), 0, attributes)
        vibrating = true
      } else if (!allowed && vibrating) {
        vibrator.cancel()
        vibrating = false
      }
      if (allowed) retryScreenWake(app)
      // Only observe permission/mode changes; leave an allowed vibration uninterrupted.
      handler.postDelayed(this, 1000)
    }
  }

  private fun retryScreenWake(app: Context) {
    val power = app.getSystemService(PowerManager::class.java)
    val manager = app.getSystemService(NotificationManager::class.java)
    if (power.isInteractive || (Build.VERSION.SDK_INT >= 34 && !manager.canUseFullScreenIntent())) return
    val now = SystemClock.elapsedRealtime()
    if (now - lastWakeAttempt < WAKE_RETRY_MS) return
    val active = pending(app)
    if (active.length() == 0) return
    // A full-screen intent is a one-time delivery. An unstopped emergency needs
    // a fresh notification if the screen has gone dark again. Throttle attempts,
    // retain a single visible notification, and never restart the vibration.
    notificationTag = "pulse:alarm:wake:$now"
    requestFullScreen = true
    postedSignature = null
    lastWakeAttempt = now
    showNotification(app, active.getJSONObject(0), active.length())
  }

  fun pending(context: Context) = JSONArray(PulseAlertState.prefs(context).getString("pendingAlarms", "[]"))
  private fun key(base: String, volunteer: String, kind: String) = "$kind:$base|$volunteer"
  @Synchronized fun stopped(context: Context, base: String, volunteer: String): Set<String> {
    val data = JSONArray(PulseAlertState.prefs(context).getString(key(base, volunteer, "stopped"), "[]"))
    return (0 until data.length()).map { data.getString(it) }.toSet()
  }
  @Synchronized fun acknowledgements(context: Context, base: String, volunteer: String): Set<String> {
    val data = JSONArray(PulseAlertState.prefs(context).getString(key(base, volunteer, "ackQueue"), "[]"))
    return (0 until data.length()).map { data.getString(it) }.toSet()
  }
  @Synchronized fun acknowledgementSent(context: Context, base: String, volunteer: String, id: String) {
    val ids = acknowledgements(context, base, volunteer) - id
    PulseAlertState.prefs(context).edit().putString(key(base, volunteer, "ackQueue"), JSONArray(ids.toList()).toString()).apply()
  }

  fun configure(context: Context, base: String, volunteer: String) {
    val prefs = PulseAlertState.prefs(context)
    if (prefs.getString("base", "") != base || prefs.getString("volunteer", "") != volunteer) {
      stop(context)
      PulseAlertState.clearNotifications(context)
      prefs.edit().putString("pendingAlarms", "[]").putString("base", base).putString("volunteer", volunteer).apply()
    }
  }

  fun snapshot(context: Context, base: String, volunteer: String, data: JSONArray, fromUI: Boolean = false) = handler.post {
    if (fromUI) configure(context, base, volunteer)
    val prefs = PulseAlertState.prefs(context)
    if ((!fromUI && !prefs.getBoolean("enabled", false)) || prefs.getString("base", "") != base || prefs.getString("volunteer", "") != volunteer) return@post
    val ignored = stopped(context, base, volunteer)
    val active = JSONArray()
    // Backend sends newest first; show the oldest outstanding alert first, like the app.
    for (index in data.length() - 1 downTo 0) {
      val alert = data.getJSONObject(index)
      if (alert.optString("volunteer_id") == volunteer && alert.optBoolean("active") && alert.isNull("acknowledged_at") && alert.getString("id") !in ignored) active.put(alert)
    }
    update(context, active)
  }

  @Synchronized fun silence(context: Context, base: String, volunteer: String, id: String) {
    // Persist the stop before returning to JS; server acknowledgement can wait for Wi-Fi.
    val ignored = (stopped(context, base, volunteer) + id).toList().takeLast(300)
    val queue = acknowledgements(context, base, volunteer) + id
    check(PulseAlertState.prefs(context).edit()
      .putString(key(base, volunteer, "stopped"), JSONArray(ignored).toString())
      .putString(key(base, volunteer, "ackQueue"), JSONArray(queue.toList()).toString()).commit())
    handler.post {
      val prefs = PulseAlertState.prefs(context)
      if (prefs.getString("base", "") != base || prefs.getString("volunteer", "") != volunteer) return@post
      val active = pending(context)
      val remaining = JSONArray()
      for (i in 0 until active.length()) if (active.getJSONObject(i).getString("id") != id) remaining.put(active.getJSONObject(i))
      // Keep the same continuous effect while another alert still needs a Stop tap.
      // update() cancels immediately when the last pending alert is removed.
      update(context, remaining)
    }
  }

  fun restore(context: Context) = handler.post {
    val prefs = PulseAlertState.prefs(context)
    if (!prefs.getBoolean("enabled", false)) return@post
    val ignored = stopped(context, prefs.getString("base", "") ?: "", prefs.getString("volunteer", "") ?: "")
    val cached = pending(context)
    val active = JSONArray()
    for (i in 0 until cached.length()) if (cached.getJSONObject(i).getString("id") !in ignored) active.put(cached.getJSONObject(i))
    update(context, active)
  }
  private fun update(app: Context, active: JSONArray) {
    context = app.applicationContext
    PulseAlertState.prefs(app).edit().putString("pendingAlarms", active.toString()).apply()
    if (active.length() == 0) {
      if (monitoring || displayedId != null) stop(app)
      else clearAlarmNotifications(app)
      return
    }
    val first = active.getJSONObject(0)
    val ids = (0 until active.length()).map { active.getJSONObject(it).getString("id") }.toSet()
    // A later emergency still needs a wake-up even with an older alert at the front.
    val arrival = ids.lastOrNull { it !in activeIds }
    activeIds = ids
    displayedId = first.getString("id")
    if (arrival != null || notificationTag == null) {
      notificationTag = "pulse:alarm:${arrival ?: first.getString("id")}"
      postedSignature = null
      val power = app.getSystemService(PowerManager::class.java)
      val keyguard = app.getSystemService(KeyguardManager::class.java)
      requestFullScreen = !PulseAlertState.foreground || !power.isInteractive || keyguard.isKeyguardLocked
      lastWakeAttempt = SystemClock.elapsedRealtime()
    }
    showNotification(app, first, active.length())
    if (!monitoring) {
      monitoring = true
      if (!screenReceiverRegistered) {
        ContextCompat.registerReceiver(app.applicationContext, screenReceiver,
          IntentFilter(Intent.ACTION_SCREEN_OFF), ContextCompat.RECEIVER_NOT_EXPORTED)
        screenReceiverRegistered = true
      }
      handler.post(monitor)
    }
  }

  fun stop(app: Context) {
    if (Looper.myLooper() != Looper.getMainLooper()) { handler.post { stop(app) }; return }
    handler.removeCallbacks(monitor)
    handler.removeCallbacks(screenRecovery)
    if (screenReceiverRegistered) {
      app.applicationContext.unregisterReceiver(screenReceiver)
      screenReceiverRegistered = false
    }
    monitoring = false; vibrating = false; displayedId = null
    activeIds = emptySet(); notificationTag = null; postedSignature = null; requestFullScreen = false; lastWakeAttempt = 0L
    app.getSystemService(Vibrator::class.java).cancel()
    clearAlarmNotifications(app)
  }
  fun clear(app: Context) = handler.post {
    PulseAlertState.prefs(app).edit().putString("pendingAlarms", "[]").apply()
    stop(app)
  }

  private fun clearAlarmNotifications(app: Context, keep: String? = null) {
    val manager = app.getSystemService(NotificationManager::class.java)
    for (notification in manager.activeNotifications) {
      val tag = notification.tag ?: continue
      if (notification.id == PulseAlertState.ALERT_ID &&
        (tag == "pulse:alarm" || tag.startsWith("pulse:alarm:")) && tag != keep) {
        manager.cancel(tag, notification.id)
      }
    }
  }

  private fun showNotification(app: Context, alert: JSONObject, count: Int) {
    val tag = notificationTag ?: return
    val signature = "$tag|$count|$alert"
    // Polling must not overwrite/remove the full-screen intent seconds after delivery.
    if (signature == postedSignature) return
    PulseAlertState.channels(app)
    if (!NotificationManagerCompat.from(app).areNotificationsEnabled()) return
    val manager = app.getSystemService(NotificationManager::class.java)
    val intent = Intent(app, PulseAlarmActivity::class.java)
      .setData(Uri.parse("pulse://alarm/${Uri.encode(tag)}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val options = ActivityOptions.makeBasic()
    if (Build.VERSION.SDK_INT >= 35) options.setPendingIntentCreatorBackgroundActivityStartMode(ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED)
    val fullScreen = PendingIntent.getActivity(app, 10, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE, options.toBundle())
    val launch = app.packageManager.getLaunchIntentForPackage(app.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val open = PendingIntent.getActivity(app, 11, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val details = alert.getString("message") + "\n\nOpen Pulse and tap Stop alert. Continuous vibration stays on until you stop it." +
      if (count > 1) "\n$count alerts waiting." else ""
    val builder = NotificationCompat.Builder(app, PulseAlertState.CHANNEL)
      .setSmallIcon(R.drawable.pulse_notification).setColor(Color.rgb(180, 35, 24))
      .setContentTitle("Emergency · ${alert.getString("location")}").setContentText(details)
      .setStyle(NotificationCompat.BigTextStyle().bigText(details)).setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX).setContentIntent(open)
      .setOngoing(true).setAutoCancel(false).setOnlyAlertOnce(postedSignature != null).setSound(null)
    // Use the documented, user-controlled lock-screen launch route, never bypass Android restrictions.
    if (requestFullScreen && (Build.VERSION.SDK_INT < 34 || manager.canUseFullScreenIntent())) {
      builder.setFullScreenIntent(fullScreen, true)
    }
    try {
      manager.notify(tag, PulseAlertState.ALERT_ID, builder.build())
      postedSignature = signature
      clearAlarmNotifications(app, tag)
    }
    catch (_: SecurityException) { /* Notification permission can change while the service is active. */ }
  }
}
