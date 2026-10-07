import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ConnectionProvider, useConnection } from './src/connection';
import { usePolling } from './src/api';
import { Icon, palette, type IconName } from './src/ui';
import { ReportScreen } from './src/screens/ReportScreen';
import { BoardScreen } from './src/screens/BoardScreen';
import { TeamScreen } from './src/screens/TeamScreen';
import { ConnectionScreen } from './src/screens/ConnectionScreen';
import { IncidentScreen } from './src/screens/IncidentScreen';

const tabs: { label: string; icon: IconName }[] = [
  { label: 'Report', icon: 'add-circle-outline' },
  { label: 'Incidents', icon: 'grid-outline' },
  { label: 'Team', icon: 'people-outline' },
  { label: 'Connection', icon: 'link-outline' },
];

function Workspace() {
  const { url, ready } = useConnection();
  const health = usePolling<{ status: string }>(url, '/health');
  const [tab, setTab] = useState(0);
  const [incidentId, setIncidentId] = useState<string | null>(null);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (incidentId) { setIncidentId(null); return true; }
      if (tab !== 0) { setTab(0); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [incidentId, tab]);
  useEffect(() => { setIncidentId(null); }, [url]);
  if (!ready) return <View style={styles.loading}><ActivityIndicator color={palette.green} /><Text>Opening Pulse…</Text></View>;
  const pages = [<ReportScreen key={`report-${url}`} active={tab === 0 && !incidentId} onOpen={setIncidentId} />, <BoardScreen key={`board-${url}`} onOpen={setIncidentId} />,
    <TeamScreen key={`team-${url}`} onOpen={setIncidentId} />, <ConnectionScreen key="connection" />];
  return <SafeAreaView style={styles.root}>
    <StatusBar style="dark" />
    <View style={styles.header}><View style={styles.brand}><Icon name="pulse" size={29} /><Text style={styles.wordmark}>pulse<Text style={{ color: '#8dac68' }}>.</Text></Text></View>
      <View><Text style={styles.event}>RIVERSIDE</Text><Text style={styles.status}>{!url ? 'Setup needed' : health.error ? 'Offline · retrying' : health.data ? 'Connected · Demo' : 'Connecting…'}</Text></View>
    </View>
    {!url && tab !== 3 && <Pressable accessibilityRole="button" onPress={() => setTab(3)} style={styles.setup}><Text style={{ color: palette.green }}>Connect to your Python server →</Text></Pressable>}
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {pages.map((page, index) => <View key={index} style={{ flex: 1, display: !incidentId && tab === index ? 'flex' : 'none' }}
        accessibilityElementsHidden={!!incidentId || tab !== index} importantForAccessibility={!incidentId && tab === index ? 'auto' : 'no-hide-descendants'}>{page}</View>)}
      {incidentId && <IncidentScreen key={incidentId} id={incidentId} onBack={() => setIncidentId(null)} />}
    </KeyboardAvoidingView>
    <View style={styles.tabs}>{tabs.map((item, index) => <Pressable key={item.label} accessibilityRole="tab" accessibilityLabel={item.label}
      accessibilityState={{ selected: tab === index && !incidentId }} onPress={() => { setIncidentId(null); setTab(index); }}
      style={[styles.tab, tab === index && !incidentId && { backgroundColor: '#eaf1df' }]}>
      <Icon name={item.icon} size={23} color={tab === index ? palette.green : palette.muted} /><Text style={styles.tabText}>{item.label}</Text>
    </Pressable>)}</View>
  </SafeAreaView>;
}

export default function App() {
  return <SafeAreaProvider><ConnectionProvider><Workspace /></ConnectionProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: palette.line },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  wordmark: { fontSize: 32, fontWeight: '800', letterSpacing: -1.5, color: palette.green },
  event: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700', color: palette.green, textAlign: 'right' },
  status: { fontSize: 11, color: palette.muted, marginTop: 5 },
  tabs: { flexDirection: 'row', gap: 4, padding: 8, backgroundColor: '#fff', borderTopWidth: 1, borderColor: palette.line },
  tab: { flex: 1, minHeight: 60, justifyContent: 'center', alignItems: 'center', gap: 5, paddingVertical: 8, borderRadius: 10 },
  tabText: { fontSize: 11, fontWeight: '600', color: palette.green },
  setup: { padding: 16, backgroundColor: '#eaf1df' },
});
