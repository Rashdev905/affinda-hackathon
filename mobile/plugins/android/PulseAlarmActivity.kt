package com.riverside.pulse

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/** Native alarm surface can wake the screen without waiting for React/Metro/network startup. */
class PulseAlarmActivity : Activity(), SharedPreferences.OnSharedPreferenceChangeListener {
  private var displayed = ""
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    prepareWakeUp()
    PulseAlertState.prefs(this).registerOnSharedPreferenceChangeListener(this)
    renderAlert()
  }
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    // Android can reuse this singleTop activity for a subsequent emergency.
    prepareWakeUp()
    renderAlert()
  }
  private fun prepareWakeUp() {
    if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
    else window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }
  override fun onSharedPreferenceChanged(prefs: SharedPreferences?, key: String?) {
    if (key == "pendingAlarms" || key == "enabled") runOnUiThread { renderAlert() }
  }
  private fun renderAlert() {
    val data = PulseAlarm.pending(this)
    if (data.length() == 0 || !PulseAlertState.prefs(this).getBoolean("enabled", false)) { finish(); return }
    val alert = data.getJSONObject(0)
    val signature = alert.toString() + data.length()
    if (signature == displayed) return
    displayed = signature
    val padding = (24 * resources.displayMetrics.density).toInt()
    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; setPadding(padding, padding * 2, padding, padding * 2)
      setBackgroundColor(Color.rgb(180, 35, 24))
    }
    fun text(value: String, size: Float) { content.addView(TextView(this).apply {
      this.text = value; textSize = size; setTextColor(Color.WHITE); setPadding(0, 0, 0, padding)
    }) }
    text("EMERGENCY ALERT", 20f)
    text(alert.getString("location"), 32f)
    text(alert.getString("message"), 21f)
    val instructions = alert.getJSONArray("instructions")
    for (i in 0 until instructions.length()) text("${i + 1}. ${instructions.getString(i)}", 18f)
    text("Vibration will continue until you open Pulse and tap Stop alert.", 17f)
    content.addView(Button(this).apply {
      text = "Open Pulse to stop alert"
      setOnClickListener {
        val open = {
          startActivity(packageManager.getLaunchIntentForPackage(packageName)!!.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP))
          finish()
        }
        val keyguard = getSystemService(KeyguardManager::class.java)
        if (Build.VERSION.SDK_INT >= 26 && keyguard.isKeyguardLocked) keyguard.requestDismissKeyguard(this@PulseAlarmActivity,
          object : KeyguardManager.KeyguardDismissCallback() { override fun onDismissSucceeded() { open() } })
        else open()
      }
    })
    setContentView(ScrollView(this).apply { setBackgroundColor(Color.rgb(180, 35, 24)); addView(content) })
  }
  override fun onDestroy() {
    PulseAlertState.prefs(this).unregisterOnSharedPreferenceChangeListener(this)
    // Closing/opening a screen is not an acknowledgement.
    super.onDestroy()
  }
}
