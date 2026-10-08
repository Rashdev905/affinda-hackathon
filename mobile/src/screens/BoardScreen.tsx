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
  const [filter, setFilter] = useState('Pending');
  const [search, setSearch] = useState('');
  const visibleIncidents = incidents.data?.filter(item => {
    if (item.status !== 'resolved' || !hiddenResolvedBefore) return true;
    const resolvedAt = [...item.timeline].reverse().find(event => event.kind === 'resolved')?.timestamp ?? item.updated_at;
    return Date.parse(resolvedAt) > Date.parse(hiddenResolvedBefore);
  }) ?? [];
  const pending = visibleIncidents.filter(item => ['reported', 'awaiting_clarification', 'awaiting_approval'].includes(item.status));
  const active = visibleIncidents.filter(item => ['response_dispatched', 'in_progress'].includes(item.status));
  const visible = visibleIncidents.filter(item => {
    const matches = filter === 'Pending' ? pending.includes(item)
      : filter === 'Active' ? active.includes(item)
        : item.status === 'resolved';
    const searchableText = [item.id, item.location, item.summary, item.type, item.reported_by,
      ...item.observations, ...item.recommendation.actions].join(' ').toLowerCase();
    return matches && searchableText.includes(search.trim().toLowerCase());
  }) ?? [];
  return <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled"
    refreshControl={<RefreshControl refreshing={false} onRefresh={() => { void incidents.refresh(); void resources.refresh(); }} tintColor={palette.green} />}>
    <Heading kicker="SAFETY LEAD" title="Operations overview." />
    <Notice text={incidents.error || resources.error} kind="error" />
    <View style={{ flexDirection: 'row', gap: 10 }}>{[
      [String(pending.length), 'Pending'], [String(active.length), 'Active'],
      [String(resources.data?.filter(item => item.available).length ?? '—'), 'Available'],
    ].map(([value, label]) => <View key={label} style={{ flex: 1, padding: 14, backgroundColor: '#eaf1df', borderRadius: 12, gap: 4 }}>
      <Text style={s.title}>{incidents.data ? value : '—'}</Text><Text style={s.small}>{label}</Text>
    </View>)}</View>
    <View style={s.row}>{['Pending', 'Active', 'Resolved'].map(item => <Pressable key={item} accessibilityRole="button"
      accessibilityState={{ selected: filter === item }} style={[s.chip, filter === item && s.chipActive]} onPress={() => setFilter(item)}>
      <Text style={s.small}>{item}</Text></Pressable>)}</View>
    <Field label="Search incidents" value={search} onChangeText={setSearch} placeholder="ID, report, location, or volunteer" />
    {incidents.loading && <ActivityIndicator color={palette.green} />}
    {!incidents.loading && !visible.length && <Card><Empty title={search ? 'No matching incidents' : filter === 'Pending' ? 'No pending incidents' : filter === 'Active' ? 'No active responses' : 'No resolved incidents'} body={filter === 'Pending' ? 'New reports and responses awaiting manager review will appear here.' : filter === 'Active' ? 'Incidents with a dispatched or in-progress response will appear here.' : 'Resolved incidents will appear here.'} /></Card>}
    {visible.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open ${item.id}: ${item.summary}`} onPress={() => onOpen(item.id)}>
      <Card><View style={s.row}><Badge text={typeLabels[item.type]} /><Text style={s.small}>{timestamp(item.created_at)}</Text></View>
        <Text style={s.h2}>{item.summary}</Text><Text style={s.body}>{item.location}</Text>
        <IncidentBadges urgency={item.urgency} priorityScore={item.priority_score} status={item.status} /><Text style={s.small}>{item.id} →</Text>
      </Card>
    </Pressable>)}
    <Text style={s.small}>Updates every 5 seconds while the app is active. Times in Sydney.</Text>
  </ScrollView>;
}
