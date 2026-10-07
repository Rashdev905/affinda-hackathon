import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { usePolling } from '../api';
import { useConnection } from '../connection';
import { Badge, Card, Empty, Field, Heading, IncidentBadges, Notice, palette, s, timestamp, typeLabels } from '../ui';
import type { Incident, Resource } from '../types';

export function BoardScreen({ onOpen, hiddenResolvedBefore = null }: { onOpen: (id: string) => void; hiddenResolvedBefore?: string | null }) {
  const { url } = useConnection();
  const incidents = usePolling<Incident[]>(url, '/api/incidents');
  const resources = usePolling<Resource[]>(url, '/api/resources');
  const [filter, setFilter] = useState('Active');
  const [search, setSearch] = useState('');
  const visibleIncidents = incidents.data?.filter(item => {
    if (item.status !== 'resolved' || !hiddenResolvedBefore) return true;
    const resolvedAt = [...item.timeline].reverse().find(event => event.kind === 'resolved')?.timestamp ?? item.updated_at;
    return Date.parse(resolvedAt) > Date.parse(hiddenResolvedBefore);
  }) ?? [];
  const active = visibleIncidents.filter(item => item.status !== 'resolved');
  const waitingForVolunteer = active.filter(item => item.status === 'response_dispatched');
  const visible = visibleIncidents.filter(item => {
    const matches = filter === 'All' || (filter === 'Resolved' ? item.status === 'resolved' : filter === 'Volunteer update' ? waitingForVolunteer.includes(item) : item.status !== 'resolved');
    return matches && `${item.id} ${item.location} ${item.summary}`.toLowerCase().includes(search.toLowerCase());
  }) ?? [];
  return <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled"
    refreshControl={<RefreshControl refreshing={false} onRefresh={() => { void incidents.refresh(); void resources.refresh(); }} tintColor={palette.green} />}>
    <Heading kicker="SAFETY LEAD" title="Operations overview." subtitle="A shared picture. A clear next step." />
    <Notice text={incidents.error || resources.error} kind="error" />
    <View style={{ flexDirection: 'row', gap: 10 }}>{[
      [String(active.length), 'Active'], [String(waitingForVolunteer.length), 'Awaiting volunteer'],
      [String(resources.data?.filter(item => item.available).length ?? '—'), 'Available'],
    ].map(([value, label]) => <View key={label} style={{ flex: 1, padding: 14, backgroundColor: '#eaf1df', borderRadius: 12, gap: 4 }}>
      <Text style={s.title}>{incidents.data ? value : '—'}</Text><Text style={s.small}>{label}</Text>
    </View>)}</View>
    <View style={s.row}>{['Active', 'Volunteer update', 'Resolved', 'All'].map(item => <Pressable key={item} accessibilityRole="button"
      accessibilityState={{ selected: filter === item }} style={[s.chip, filter === item && s.chipActive]} onPress={() => setFilter(item)}>
      <Text style={s.small}>{item}</Text></Pressable>)}</View>
    <Field label="Search incidents" value={search} onChangeText={setSearch} placeholder="Location, summary, or ID" />
    {incidents.loading && <ActivityIndicator color={palette.green} />}
    {!incidents.loading && !visible.length && <Card><Empty title={search ? 'No matching incidents' : filter === 'Volunteer update' ? 'No volunteer updates pending' : 'Your incident board is clear'} body={filter === 'Volunteer update' ? 'Manager-approved responses will appear here until the assigned volunteer sends an update.' : 'Volunteer reports will appear here, ready for review.'} /></Card>}
    {visible.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open ${item.id}: ${item.summary}`} onPress={() => onOpen(item.id)}>
      <Card><View style={s.row}><Badge text={typeLabels[item.type]} /><Text style={s.small}>{timestamp(item.created_at)}</Text></View>
        <Text style={s.h2}>{item.summary}</Text><Text style={s.body}>{item.location}</Text>
        <IncidentBadges urgency={item.urgency} priorityScore={item.priority_score} status={item.status} /><Text style={s.small}>{item.id} →</Text>
      </Card>
    </Pressable>)}
    <Text style={s.small}>Updates every 5 seconds while the app is active. Times in Sydney.</Text>
  </ScrollView>;
}
