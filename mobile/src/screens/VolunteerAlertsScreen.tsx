import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { usePolling } from '../api';
import { useConnection } from '../connection';
import { Badge, Button, Card, Empty, Heading, IncidentBadges, Notice, palette, s, timestamp, typeLabels } from '../ui';
import type { Incident, Resource } from '../types';

export function VolunteerAlertsScreen({ volunteerId, onOpen }: {
  volunteerId: string; onOpen: (id: string) => void;
}) {
  const { url } = useConnection();
  const incidents = usePolling<Incident[]>(url, '/api/incidents');
  const resources = usePolling<Resource[]>(url, '/api/resources');
  const volunteer = resources.data?.find(item => item.id === volunteerId);
  const assigned = incidents.data?.filter(item => item.status !== 'resolved' && item.assigned_responders.includes(volunteerId)) ?? [];
  return <ScrollView contentContainerStyle={s.screen}
    refreshControl={<RefreshControl refreshing={false} onRefresh={() => { void incidents.refresh(); void resources.refresh(); }} tintColor={palette.green} />}>
    <Heading kicker="VOLUNTEER MODE" title="My alerts." subtitle="Manager assignments and incident details for your shift." />
    <Notice text={incidents.error || resources.error} kind="error" />
    <Card>
      <Text style={s.label}>Signed in as {volunteer?.name ?? volunteerId}</Text>
      <Text style={s.small}>Alerts refresh while the app is open.</Text>
    </Card>
    {!assigned.length && <Card><Empty title="No active assignments" body="When a manager assigns or alerts you, the incident will appear here." /></Card>}
    {assigned.map(incident => {
      const alerts = incident.timeline.filter(entry => entry.kind === 'volunteer_alert');
      return <Card key={incident.id}>
        <View style={s.row}><Badge text={typeLabels[incident.type]} /><Text style={s.small}>{timestamp(incident.updated_at)}</Text></View>
        <Text style={s.h2}>{incident.summary}</Text>
        <Text style={s.body}>{incident.location}</Text>
        <IncidentBadges status={incident.status} urgency={incident.urgency} />
        {alerts.map(alert => <Notice key={alert.id} text={`Manager alert - ${timestamp(alert.timestamp)}\n${alert.message}`} kind="info" />)}
        <Text style={s.h3}>Your response</Text>
        {incident.recommendation.actions.map((action, index) => <Text key={index} style={s.body}>{index + 1}. {action}</Text>)}
        <Button title="Open incident details" icon="arrow-forward" onPress={() => onOpen(incident.id)} />
      </Card>;
    })}
    <Text style={s.small}>In-app alerts are visible when your app is connected and open.</Text>
  </ScrollView>;
}
