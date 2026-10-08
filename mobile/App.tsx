import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConnectionProvider, useConnection } from './src/connection';
import { Button, Card, Heading, Icon, palette, s, type IconName } from './src/ui';
import { ReportScreen } from './src/screens/ReportScreen';
import { BoardScreen } from './src/screens/BoardScreen';
import { TeamScreen } from './src/screens/TeamScreen';
import { MapScreen } from './src/screens/MapScreen';
import { ConnectionScreen } from './src/screens/ConnectionScreen';
import { IncidentScreen } from './src/screens/IncidentScreen';
import { VolunteerAlertsScreen } from './src/screens/VolunteerAlertsScreen';
import { VolunteerLoginScreen } from './src/screens/VolunteerLoginScreen';
import type { Resource } from './src/types';
import { EmergencyAlert } from './src/EmergencyAlert';
import { ManagerUpdates } from './src/ManagerUpdates';
import { stopBackgroundAlerts, useDutyAlerts, useVolunteerAlerts } from './src/alerts';

type Mode = 'Manager' | 'Volunteer';
const modeKey = 'pulse.mode.v1';
const resolvedClearedAtKey = 'pulse.manager.resolvedClearedAt.v1';
const volunteerKey = 'pulse.volunteer.v1';
const managerTabs: { label: string; icon: IconName }[] = [
  { label: 'Operations', icon: 'grid-outline' },
  { label: 'Team', icon: 'people-outline' },
  { label: 'Map', icon: 'map-outline' },
  { label: 'Settings', icon: 'settings-outline' },
];
const volunteerTabs: { label: string; icon: IconName }[] = [
  { label: 'Report', icon: 'add-circle-outline' },
  { label: 'My alerts', icon: 'notifications-outline' },
  { label: 'Settings', icon: 'settings-outline' },
];

function Workspace() {
  const { url, ready } = useConnection();
  const [tab, setTab] = useState(0);
  const [mode, setMode] = useState<Mode | null>(null);
  const [modeReady, setModeReady] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [volunteerId, setVolunteerId] = useState<string | null>(null);
  const [volunteerName, setVolunteerName] = useState('');
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [resolvedClearedAt, setResolvedClearedAt] = useState<string | null>(null);
  const alertVolunteer = mode === 'Volunteer' ? volunteerId : null;
  const inbox = useVolunteerAlerts(url, alertVolunteer);
  const duty = useDutyAlerts(url, mode === 'Manager' ? 'MANAGER' : alertVolunteer);
  const tabs = mode === 'Manager' ? managerTabs : volunteerTabs;
  const connectionTab = tabs.length - 1;
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(modeKey).then(value => {
      if (mounted && (value === 'Manager' || value === 'Volunteer')) setMode(value);
    }).catch(() => {}).finally(() => { if (mounted) setModeReady(true); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(resolvedClearedAtKey).then(value => {
      if (mounted && value) setResolvedClearedAt(value);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (configuring) { setConfiguring(false); return true; }
      if (incidentId) { setIncidentId(null); return true; }
      if (tab !== 0) { setTab(0); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [incidentId, tab, configuring]);
  useEffect(() => { setIncidentId(null); setVolunteerId(null); setVolunteerName(''); }, [url]);
  useEffect(() => {
    let mounted = true;
    if (ready && mode === 'Volunteer') void AsyncStorage.getItem(volunteerKey).then(value => {
      const saved = value ? JSON.parse(value) : null;
      if (mounted && saved?.base === url && /^VOL-\d{3}$/.test(saved.id)) {
        setVolunteerId(saved.id); setVolunteerName(saved.name);
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, [ready, mode, url]);
  async function chooseMode(next: Mode) {
    if (next === 'Manager') await stopBackgroundAlerts();
    setMode(next);
    setIncidentId(null);
    setTab(0);
    try { await AsyncStorage.setItem(modeKey, next); } catch { /* Keep this session usable if storage is unavailable. */ }
  }
  async function clearResolvedFromApp() {
    const cutoff = new Date().toISOString();
    await AsyncStorage.setItem(resolvedClearedAtKey, cutoff);
    setResolvedClearedAt(cutoff);
  }
  async function returnToMenu() {
    await stopBackgroundAlerts();
    setTab(0); setIncidentId(null); setVolunteerId(null); setVolunteerName(''); setMode(null);
    await AsyncStorage.multiRemove([modeKey, volunteerKey]);
  }
  if (!ready || !modeReady) return <View style={styles.loading}><ActivityIndicator color={palette.green} /><Text>Opening Pulse…</Text></View>;
  if (configuring) return <SafeAreaView style={styles.root}><ConnectionScreen onReturnToMenu={() => setConfiguring(false)}
    returnLabel={mode === 'Volunteer' ? 'Back to volunteer login' : 'Back to role selection'} /></SafeAreaView>;
  if (!mode) return <ModeMenu onChoose={chooseMode} onSettings={() => setConfiguring(true)} />;
  if (mode === 'Volunteer' && !volunteerId) return <VolunteerLoginScreen onLogin={(volunteer: Resource) => {
    setVolunteerId(volunteer.id);
    setVolunteerName(volunteer.name);
    void AsyncStorage.setItem(volunteerKey, JSON.stringify({ base: url, id: volunteer.id, name: volunteer.name })).catch(() => {});
  }} onBack={() => void returnToMenu()} onSettings={() => setConfiguring(true)} />;
  const pages = mode === 'Manager'
    ? [<BoardScreen key={`board-${url}`} onOpen={setIncidentId} hiddenResolvedBefore={resolvedClearedAt} />, <TeamScreen key={`team-${url}`} onOpen={setIncidentId} />,
      <MapScreen key={`map-${url}`} onOpen={setIncidentId} />, <ConnectionScreen key="connection" managerMode managerDuty={duty} onClearResolvedFromApp={clearResolvedFromApp} onReturnToMenu={() => void returnToMenu()} />]
    : [<ReportScreen key={`report-${url}-${volunteerId}`} active={tab === 0 && !incidentId && !inbox.current} onOpen={setIncidentId} volunteerId={volunteerId!} volunteerName={volunteerName} />,
      <VolunteerAlertsScreen key={`alerts-${url}`} volunteerId={volunteerId!} onOpen={setIncidentId} inbox={inbox} duty={duty} />,
      <ConnectionScreen key="connection" onReturnToMenu={() => void returnToMenu()} />];
  return <SafeAreaView style={styles.root}>
    <StatusBar style="dark" />
    {!url && tab !== connectionTab && <Pressable accessibilityRole="button" onPress={() => setTab(connectionTab)} style={styles.setup}><Text style={{ color: palette.green }}>Connect to your Python server →</Text></Pressable>}
    {mode === 'Manager' && <ManagerUpdates key={url} base={url} duty={duty} onOpen={setIncidentId} />}
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {pages.map((page, index) => <View key={index} style={{ flex: 1, display: !incidentId && tab === index ? 'flex' : 'none' }}
        accessibilityElementsHidden={!!incidentId || tab !== index} importantForAccessibility={!incidentId && tab === index ? 'auto' : 'no-hide-descendants'}>{page}</View>)}
      {incidentId && <IncidentScreen key={`${mode}-${incidentId}`} id={incidentId} canManage={mode === 'Manager'}
        reportedBy={mode === 'Volunteer' ? volunteerId! : 'Safety lead'} onBack={() => setIncidentId(null)} />}
    </KeyboardAvoidingView>
    <View style={styles.tabs}>{tabs.map((item, index) => <Pressable key={item.label} accessibilityRole="tab" accessibilityLabel={item.label}
      accessibilityState={{ selected: tab === index && !incidentId }} onPress={() => { setIncidentId(null); setTab(index); }}
      style={[styles.tab, tab === index && !incidentId && { backgroundColor: '#eaf1df' }]}>
      <Icon name={item.icon} size={23} color={tab === index ? palette.green : palette.muted} /><Text style={styles.tabText}>{item.label}</Text>
    </Pressable>)}</View>
    {mode === 'Volunteer' && <EmergencyAlert key={`${url}-${volunteerId}`} inbox={inbox} onOpen={setIncidentId} />}
  </SafeAreaView>;
}

function ModeMenu({ onChoose, onSettings }: { onChoose: (mode: Mode) => void; onSettings: () => void }) {
  return <SafeAreaView style={styles.root}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={s.screen}>
      <View style={styles.menuBrand}><Icon name="pulse" size={34} /><Text style={styles.wordmark}>pulse<Text style={{ color: '#8dac68' }}>.</Text></Text></View>
      <Heading kicker="RIVERSIDE INCIDENT COORDINATION" title="Choose your mode." />
      <Card>
        <Icon name="grid-outline" size={30} />
        <Text style={s.h2}>Manager</Text>
        <Text style={s.body}>Review all reports, assign responders, and send alerts to volunteers.</Text>
        <Button title="Continue as manager" icon="arrow-forward" onPress={() => void onChoose('Manager')} />
      </Card>
      <Card>
        <Icon name="people-outline" size={30} />
        <Text style={s.h2}>Volunteer</Text>
        <Text style={s.body}>Report situations and see incident assignments and manager alerts.</Text>
        <Button title="Continue as volunteer" icon="arrow-forward" onPress={() => void onChoose('Volunteer')} />
      </Card>
      <Button title="Connection settings" secondary icon="settings-outline" onPress={onSettings} />
      <Text style={s.small}>Your choice is saved on this phone. You can return here from Settings.</Text>
    </ScrollView>
  </SafeAreaView>;
}

export default function App() {
  return <SafeAreaProvider><ConnectionProvider><Workspace /></ConnectionProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  menuBrand: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 24 },
  wordmark: { fontSize: 32, fontWeight: '800', letterSpacing: -1.5, color: palette.green },
  tabs: { flexDirection: 'row', gap: 4, padding: 8, backgroundColor: '#fff', borderTopWidth: 1, borderColor: palette.line },
  tab: { flex: 1, minHeight: 60, justifyContent: 'center', alignItems: 'center', gap: 5, paddingVertical: 8, borderRadius: 10 },
  tabText: { fontSize: 11, fontWeight: '600', color: palette.green },
  setup: { padding: 16, backgroundColor: '#eaf1df' },
});
