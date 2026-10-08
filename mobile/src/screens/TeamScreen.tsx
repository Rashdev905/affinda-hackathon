import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { usePolling } from '../api';
import { useConnection } from '../connection';
import { Badge, Card, Empty, Heading, Icon, Notice, palette, s } from '../ui';
import type { Resource } from '../types';

export function TeamScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const { url } = useConnection();
  const { data, error, refresh } = usePolling<Resource[]>(url, '/api/resources');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [zone, setZone] = useState('All zones');
  const zones = ['All zones', ...new Set(data?.map(item => item.zone))];
  const visible = data?.filter(item => (!availableOnly || item.available) && (zone === 'All zones' || item.zone === zone)) ?? [];
  return <ScrollView contentContainerStyle={s.screen}
    refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refresh()} tintColor={palette.green} />}>
    <Heading kicker="SAFETY LEAD" title="Team & resources." />
    <Notice text={error} kind="error" />
    <View style={s.row}><Switch accessibilityLabel="Available only" value={availableOnly} onValueChange={setAvailableOnly} trackColor={{ true: '#6e9660' }} /><Text style={s.body}>Available only</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {zones.map(item => <Pressable accessibilityRole="button" accessibilityState={{ selected: zone === item }} key={item} onPress={() => setZone(item)} style={[s.chip, zone === item && s.chipActive]}><Text style={s.small}>{item}</Text></Pressable>)}
    </ScrollView>
    {!visible.length && <Empty title="No resources to show" body="Check the connection or change your filters." />}
    {visible.map(item => <Card key={item.id}>
      <View style={s.row}><Icon name={item.skills.includes('first_aid') ? 'medkit-outline' : 'people-outline'} /><Badge text={item.status.replace('_', ' ')} /></View>
      <Text style={s.h2}>{item.name}</Text><Text style={s.body}>{item.role} · {item.zone}</Text>
      <View style={s.row}>{item.skills.map(skill => <Badge key={skill} text={skill.replaceAll('_', ' ')} />)}</View>
      {item.current_assignment ? <Pressable accessibilityRole="button" onPress={() => onOpen(item.current_assignment!)} style={{ paddingVertical: 12 }}>
        <Text style={[s.label, { color: palette.green }]}>Assigned to {item.current_assignment} →</Text>
      </Pressable> : <Text style={s.small}>{item.available ? 'Ready for assignment' : 'Currently on break'}</Text>}
    </Card>)}
  </ScrollView>;
}
