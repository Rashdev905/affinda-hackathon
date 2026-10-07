import { useEffect } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { alertVibration, nativeAlerts, type AlertInbox } from './alerts';
import { Button, Icon, Notice, s } from './ui';

export function EmergencyAlert({ inbox, onOpen }: { inbox: AlertInbox; onOpen: (id: string) => void }) {
  const alert = inbox.current;
  useEffect(() => {
    // Android's service owns its continuous alarm, including across screen/app changes.
    if (!alert || nativeAlerts) return;
    // Zero off-time gives Android previews continuous vibration too. iOS uses pulses.
    Vibration.vibrate(Platform.OS === 'android' ? [0, 1000] : [...alertVibration, 3000, 0], true);
    return () => Vibration.cancel();
  }, [alert?.id]);
  if (!alert) return null;
  async function acknowledge(open: boolean) {
    if (alert && await inbox.acknowledge(alert) && open) onOpen(alert.incident_id);
  }
  return <Modal visible animationType="fade" onRequestClose={() => { /* Use Stop alert to acknowledge explicitly. */ }}>
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={[s.screen, { flexGrow: 1 }]}>
        <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.header}>
          <Icon name="warning" size={44} color="#fff" />
          <Text style={styles.kicker}>EMERGENCY ALERT</Text>
          <Text accessibilityRole="header" style={styles.title}>{alert.location}</Text>
          <Text style={styles.body}>{alert.message}</Text>
          <Text style={styles.body}>{alert.urgency.toUpperCase()} PRIORITY · {alert.source === 'manager' ? 'Manager message' : 'Incident reported'}</Text>
        </View>
        <View style={styles.instructions}>
          <Text style={s.h2}>What to do now</Text>
          {alert.instructions.map((instruction, index) => <Text key={index} style={styles.step}>{index + 1}. {instruction}</Text>)}
        </View>
        <Notice text={inbox.ackError} kind="error" />
        <Button title="Stop alert & open incident" busy={inbox.busy} onPress={() => void acknowledge(true)} />
        <Button title="Stop alert" secondary disabled={inbox.busy} onPress={() => void acknowledge(false)} />
        <Text style={s.small}>Vibration stays on continuously until you tap Stop alert. Stopping confirms you have seen it and works even if Wi-Fi drops. Send an update to tell your supervisor what you are doing.</Text>
        {inbox.pendingCount > 1 && <Text style={s.label}>{inbox.pendingCount - 1} more alerts waiting</Text>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff1ef' },
  header: { backgroundColor: '#b42318', borderRadius: 20, padding: 24, gap: 16 },
  kicker: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#fff', fontSize: 30, fontWeight: '800' },
  body: { color: '#fff', fontSize: 16, lineHeight: 25 },
  instructions: { backgroundColor: '#fff', borderRadius: 16, padding: 22, gap: 18 },
  step: { fontSize: 17, lineHeight: 26, color: '#57251e' },
});
