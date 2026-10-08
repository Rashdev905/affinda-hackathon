import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { usePolling } from '../api';
import { useConnection } from '../connection';
import { Badge, Button, Card, Empty, Heading, IncidentBadges, Notice, palette, s, timestamp, typeLabels } from '../ui';
import type { Incident, Resource } from '../types';
import { testVibration, type AlertInbox, type DutyAlerts } from '../alerts';

export function VolunteerAlertsScreen({ volunteerId, onOpen, inbox, duty }: {
  volunteerId: string; onOpen: (id: string) => void; inbox: AlertInbox; duty: DutyAlerts;
}) {
  const { url } = useConnection();
  const incidents = usePolling<Incident[]>(url, '/api/incidents');
  const resources = usePolling<Resource[]>(url, '/api/resources');
  const volunteer = resources.data?.find(item => item.id === volunteerId);
  const assigned = incidents.data?.filter(item => item.status !== 'resolved' && item.assigned_responders.includes(volunteerId)) ?? [];
  return <ScrollView contentContainerStyle={s.screen}
    refreshControl={<RefreshControl refreshing={false} onRefresh={() => { void incidents.refresh(); void resources.refresh(); void inbox.refresh(); }} tintColor={palette.green} />}>
    <Heading kicker="VOLUNTEER MODE" title="My alerts." />
    <Notice text={inbox.error || incidents.error || resources.error || duty.error} kind="error" />
    <Card>
      <Text style={s.label}>Signed in as {volunteer?.name ?? volunteerId}</Text>
      <Text style={s.h3}>{duty.status?.enabled ? 'On duty · background alerts active' : 'Background alerts are off'}</Text>
      <Text style={s.body}>Keep this phone connected to the laptop’s Wi-Fi. Emergency alerts vibrate and show instructions, including while Pulse is off-screen.</Text>
      {duty.supported ? <>
        <Button title={duty.status?.enabled ? 'Stop background alerts' : 'Enable background alerts'} secondary
          onPress={() => void (duty.status?.enabled ? duty.stop() : duty.start())} />
        {duty.status && (!duty.status.notificationsAllowed || !duty.status.vibrationEnabled) && <Notice kind="error" text="Turn on notifications and vibration for Pulse’s Emergency alerts channel." />}
        <Button title="Notification & vibration settings" secondary onPress={() => void duty.settings()} />
        {!duty.status?.fullScreenAllowed ? <>
          <Notice text="Allow full-screen alerts so a new emergency can wake the screen and display the red alarm while locked." />
          <Button title="Allow lock-screen wake-up" secondary onPress={() => void duty.wakeSettings()} />
        </> : <Text style={s.small}>Lock-screen wake-up permission enabled.</Text>}
        {!duty.status?.batteryAllowed && <>
          <Notice text="Allow background activity so Android does not pause alerts while the phone is locked. This uses extra battery while on duty." />
          <Button title="Allow background activity" secondary onPress={() => void duty.settings(true)} />
        </>}
      </> : <Notice text="Install the latest Android APK to enable locked-screen alerts. This preview receives alerts only while open." />}
      <Button title="Test vibration" secondary icon="phone-portrait-outline" onPress={testVibration} />
      <Text style={s.small}>Emergency vibration stays on continuously until you tap Stop alert in Pulse. Silent mode, Do Not Disturb, or force-stopping Pulse can block alerts. Stop background alerts when your shift ends.</Text>
    </Card>
    <Text style={s.h2}>Emergency inbox</Text>
    {!inbox.alerts.length && <Text style={s.body}>No emergency alerts yet.</Text>}
    {inbox.alerts.map(alert => <View key={alert.id} style={[s.card, { backgroundColor: '#fff1ef', borderColor: '#e7ada6' }]}>
      <Text style={[s.kicker, { color: '#b42318' }]}>{alert.source === 'manager' ? 'MANAGER ALERT' : 'EMERGENCY REPORTED'}</Text>
      <Text style={s.h2}>{alert.location}</Text><Text style={s.body}>{alert.message}</Text>
      {alert.instructions.map((instruction, index) => <Text key={index} style={s.body}>{index + 1}. {instruction}</Text>)}
      <Text style={s.small}>{timestamp(alert.created_at)} · {!alert.active ? 'Incident resolved' : alert.acknowledged_at ? 'Acknowledged' : 'Awaiting acknowledgement'}</Text>
      <Button title="View alert incident" secondary onPress={() => onOpen(alert.incident_id)} />
    </View>)}
    <Text style={s.h2}>Your assignments</Text>
    {!assigned.length && <Card><Empty title="No active assignments" body="When a manager assigns or alerts you, the incident will appear here." /></Card>}
    {assigned.map(incident => {
      const alerts = incident.timeline.filter(entry => entry.kind === 'volunteer_alert');
      return <Card key={incident.id}>
        <View style={s.row}><Badge text={typeLabels[incident.type]} /><Text style={s.small}>{timestamp(incident.updated_at)}</Text></View>
        <Text style={s.h2}>{incident.summary}</Text>
        <Text style={s.body}>{incident.location}</Text>
        <IncidentBadges status={incident.status} urgency={incident.urgency} priorityScore={incident.priority_score} />
        {alerts.map(alert => <Notice key={alert.id} text={`Manager alert - ${timestamp(alert.timestamp)}\n${alert.message}`} kind="info" />)}
        <Text style={s.h3}>Your response</Text>
        {incident.recommendation.actions.map((action, index) => <Text key={index} style={s.body}>{index + 1}. {action}</Text>)}
        <Button title="Open incident details" icon="arrow-forward" onPress={() => onOpen(incident.id)} />
      </Card>;
    })}
    <Text style={s.small}>Volunteer alerts are sent by a manager to responders assigned to the incident.</Text>
  </ScrollView>;
}
