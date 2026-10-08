package com.riverside.pulse

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Independent per-phone cursor: one manager reading never silences another manager. */
object PulseManagerUpdates {
  const val IDENTITY = "MANAGER"
  const val CHANNEL = "pulse-manager-updates-v1"
  private const val NOTIFICATION_ID = 6200

  fun channel(context: Context) {
    if (Build.VERSION.SDK_INT >= 26) {
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL, "Volunteer updates", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "New incident updates sent by volunteers"
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 300, 150, 300)
          setSound(null, null)
        })
    }
  }

  fun clear(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 23) {
      for (notification in manager.activeNotifications) {
        if (notification.tag?.startsWith("pulse:manager:") == true) manager.cancel(notification.tag, notification.id)
      }
    }
  }

  fun poll(context: Context, base: String, stillCurrent: () -> Boolean) {
    val prefs = PulseAlertState.prefs(context)
    val manager = context.getSystemService(NotificationManager::class.java)
    check(NotificationManagerCompat.from(context).areNotificationsEnabled()) { "Notifications disabled" }
    if (Build.VERSION.SDK_INT >= 26) check(manager.getNotificationChannel(CHANNEL)?.importance != NotificationManager.IMPORTANCE_NONE)
    val cursorKey = "managerCursor:$base"
    val query = if (prefs.contains(cursorKey)) "?after=${prefs.getLong(cursorKey, 0)}" else ""
    val connection = URL("$base/api/manager/updates$query").openConnection() as HttpURLConnection
    try {
      connection.connectTimeout = 5000
      connection.readTimeout = 5000
      connection.useCaches = false
      check(connection.responseCode == 200) { "Backend unavailable" }
      val feed = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
      val updates = feed.getJSONArray("updates")
      val cursor = feed.getLong("cursor")
      if (!stillCurrent()) return
      for (index in 0 until updates.length()) {
        if (!stillCurrent()) return
        val update = updates.getJSONObject(index)
        val id = update.getLong("id")
        val link = Uri.Builder().scheme("pulse").authority("incident")
          .appendPath(update.getString("incident_id"))
          .appendQueryParameter("server", base).appendQueryParameter("update", id.toString()).build()
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)!!.apply {
          action = Intent.ACTION_VIEW
          data = link
          addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val open = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val text = "${update.getString("location")}: ${update.getString("message")}"
        val action = if (update.optString("kind") == "report") "sent a new report" else "sent an update"
        manager.notify("pulse:manager:$base:$id", NOTIFICATION_ID,
          NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.pulse_notification)
            .setContentTitle("${update.getString("volunteer_name")} $action")
            .setContentText(text).setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(open).setAutoCancel(true).setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE).setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setVibrate(longArrayOf(0, 300, 150, 300)).build())
        prefs.edit().putLong(cursorKey, id).apply()
      }
      if (stillCurrent()) prefs.edit().putLong(cursorKey, cursor).apply()
    } finally { connection.disconnect() }
  }
}
