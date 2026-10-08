import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePolling } from '../api';
import { useConnection } from '../connection';
import { festivalZones, locationZone, markerLabel, responderKind, responderKinds, responderPositions } from '../festivalMap';
import { Badge, Button, Card, Heading, Icon, IncidentBadges, Notice, palette, s } from '../ui';
import type { Incident, Resource } from '../types';

export function MapScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const { url } = useConnection();
  const roster = usePolling<Resource[]>(url, '/api/resources');
  const incidents = usePolling<Incident[]>(url, '/api/incidents');
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const resources = roster.data ?? [];
  const activeIncidents = (incidents.data ?? []).filter(incident => incident.status !== 'resolved');
  const selected = resources.find(resource => resource.id === selectedId);
  const visibleResources = resources.filter(resource => !selectedZone || resource.zone === selectedZone);
  const visibleIncidents = activeIncidents.filter(incident => !selectedZone || locationZone(incident.location) === selectedZone);
  const unmapped = resources.filter(resource => !festivalZones.some(zone => zone.name === resource.zone));
  const unmappedIncidents = activeIncidents.filter(incident => !locationZone(incident.location));

  function selectResource(resource: Resource) {
    setSelectedId(resource.id);
    setSelectedZone(resource.zone);
  }
  async function refresh() {
    setRefreshing(true);
    try { await Promise.all([roster.refresh(), incidents.refresh()]); }
    finally { setRefreshing(false); }
  }

  return <ScrollView contentContainerStyle={s.screen}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={palette.green} />}>
    <Heading kicker="RIVERSIDE · FESTIVAL GROUNDS" title="Festival map." subtitle="Your team, around the grounds." />
    <View style={s.row}><Badge text="Mock positions" /><Text style={s.small}>Illustrative layout · no GPS</Text></View>
    <Notice text={roster.error || incidents.error} kind="error" />
    {!!(roster.error || incidents.error) && <Text style={s.small}>Showing the last received information. Pull down to retry.</Text>}
    {(roster.loading || incidents.loading) && <ActivityIndicator accessibilityLabel="Loading festival map" color={palette.green} />}
    <View style={styles.map} testID="festival-map">
      <View pointerEvents="none" style={styles.river} />
      <View pointerEvents="none" style={styles.verticalPath} />
      <View pointerEvents="none" style={[styles.path, { top: '35%' }]} />
      <View pointerEvents="none" style={[styles.path, { top: '65%' }]} />
      <View pointerEvents="none" style={styles.mapCaption}><Icon name="leaf-outline" size={14} /><Text style={styles.mapCaptionText}>RIVERSIDE PARK</Text></View>
      <View pointerEvents="none" style={styles.north}><Icon name="navigate" size={12} /><Text style={styles.mapCaptionText}>N</Text></View>
      {festivalZones.map(zone => {
        const count = activeIncidents.filter(incident => locationZone(incident.location) === zone.name).length;
        return <View key={zone.name} style={[styles.zone, { left: `${zone.x}%`, top: `${zone.y}%`, backgroundColor: zone.tint }, selectedZone === zone.name && styles.selectedZone]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Show ${zone.name}`} accessibilityState={{ selected: selectedZone === zone.name }}
            onPress={() => { setSelectedZone(zone.name); setSelectedId(null); }} style={styles.zoneHeading}>
            <Icon name={zone.icon} size={16} /><Text style={styles.zoneName}>{zone.name}</Text>
          </Pressable>
          {!!count && <Pressable accessibilityRole="button" accessibilityLabel={`${count} active incidents at ${zone.name}`}
            onPress={() => { setSelectedZone(zone.name); setSelectedId(null); }} style={styles.incidentPin}>
            <Text style={styles.incidentPinText}>! {count}</Text>
          </Pressable>}
        </View>;
      })}
      {responderPositions(resources).map(({ resource, x, y }) => {
        const kind = responderKind(resource);
        return <Pressable key={resource.id} accessibilityRole="button"
          accessibilityLabel={`${resource.name}, ${resource.role}, ${resource.zone}, ${resource.status.replace('_', ' ')}`}
          accessibilityState={{ selected: resource.id === selectedId }} onPress={() => selectResource(resource)}
          style={[styles.markerTarget, { left: `${x}%`, top: `${y}%` }]}>
          <View style={[styles.marker, { backgroundColor: kind.color }, resource.status === 'on_break' && { opacity: 0.6 },
            resource.id === selectedId && styles.selectedMarker]}>
            <Text style={styles.markerText}>{markerLabel(resource)}</Text>
          </View>
        </Pressable>;
      })}
      <Text pointerEvents="none" style={styles.pathLabel}>FESTIVAL WALK</Text>
    </View>
    <View style={styles.legend}>{Object.values(responderKinds).map(kind => <View key={kind.label} style={s.row}>
      <View style={[styles.legendDot, { backgroundColor: kind.color }]} /><Text style={s.small}>{kind.label}</Text>
    </View>)}<View style={s.row}><Text style={styles.alertLegend}>!</Text><Text style={s.small}>Active incident</Text></View></View>
    <Text style={s.small}>Tap a numbered responder or a zone. Positions stay within each responder’s assigned zone; roster and incidents refresh every 5 seconds.</Text>
    <View style={s.row}><Badge text={`${resources.length} responders`} /><Badge text={`${activeIncidents.length} active incidents`} /></View>
    {(unmapped.length > 0 || unmappedIncidents.length > 0) && <Notice text={`${unmapped.length} responders and ${unmappedIncidents.length} incidents have locations outside this layout. Select All zones to see them in the lists.`} />}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {[null, ...festivalZones.map(zone => zone.name)].map(zone => <Pressable key={zone ?? 'all'} accessibilityRole="button"
        accessibilityLabel={`Filter ${zone ?? 'All zones'}`} accessibilityState={{ selected: zone === selectedZone }}
        onPress={() => { setSelectedZone(zone); setSelectedId(null); }} style={[s.chip, zone === selectedZone && s.chipActive]}>
        <Text style={s.small}>{zone ?? 'All zones'}</Text>
      </Pressable>)}
    </ScrollView>
    {selected && <Card>
      <View style={s.row}><Icon name={responderKind(selected).icon} /><Badge text="Selected responder" /></View>
      <Text style={s.h2}>{selected.name}</Text><Text style={s.body}>{selected.role} · {selected.zone}</Text>
      <Badge text={selected.status.replace('_', ' ')} />
      {selected.current_assignment && <Button title="View assigned incident" secondary onPress={() => onOpen(selected.current_assignment!)} />}
    </Card>}
    <Text style={s.h2}>{selectedZone ?? 'All zones'}</Text>
    <Text style={s.h3}>Active incidents</Text>
    {!visibleIncidents.length && <Text style={s.body}>{incidents.loading ? 'Loading incidents…' : incidents.error ? 'Incident information is unavailable.' : 'No active incidents in this area.'}</Text>}
    {visibleIncidents.map(incident => <Pressable key={incident.id} accessibilityRole="button" accessibilityLabel={`View map incident ${incident.id}`}
      onPress={() => onOpen(incident.id)} style={styles.incidentRow}>
      <View style={s.row}><Icon name="alert-circle" color={palette.red} /><Text style={s.label}>{incident.location}</Text></View>
      <Text style={s.h3}>{incident.summary}</Text>
      <IncidentBadges urgency={incident.urgency} priorityScore={incident.priority_score} status={incident.status} />
    </Pressable>)}
    <Text style={s.h3}>Responders in this area</Text>
    {!visibleResources.length && <Text style={s.body}>{roster.loading ? 'Loading responders…' : roster.error || !url ? 'Connect to the server to load responders.' : 'No responders assigned to this zone.'}</Text>}
    {visibleResources.map(resource => <Pressable key={resource.id} accessibilityRole="button" accessibilityLabel={`Select ${resource.name}`}
      onPress={() => selectResource(resource)} style={[styles.resourceRow, selectedId === resource.id && styles.selectedRow]}>
      <View style={[styles.listMarker, { backgroundColor: responderKind(resource).color }]}><Text style={styles.markerText}>{markerLabel(resource)}</Text></View>
      <View style={{ flex: 1 }}><Text style={s.label}>{resource.name}</Text>
        <Text style={s.small}>{resource.role} · {resource.zone}</Text><Text style={s.small}>{resource.status.replace('_', ' ')}</Text></View>
      <Icon name="chevron-forward" size={16} />
    </Pressable>)}
  </ScrollView>;
}

const styles = StyleSheet.create({
  map: { width: '100%', height: 490, backgroundColor: '#eef0da', borderWidth: 1, borderColor: '#d6dec8', borderRadius: 24, overflow: 'hidden' },
  river: { position: 'absolute', right: '-7%', top: '-10%', width: '12%', height: '125%', backgroundColor: '#c5e1e3', borderLeftWidth: 5, borderColor: '#b1d5d6', transform: [{ rotate: '-3deg' }] },
  verticalPath: { position: 'absolute', left: '45%', top: 0, bottom: 0, width: '7%', backgroundColor: '#fffaf0', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#e5ddcb' },
  path: { position: 'absolute', left: 0, right: '3%', height: '3%', backgroundColor: '#fffaf0', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e5ddcb' },
  mapCaption: { position: 'absolute', top: 12, left: 14, flexDirection: 'row', gap: 5, alignItems: 'center' },
  mapCaptionText: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: '#536649' },
  north: { position: 'absolute', right: 20, top: 12, flexDirection: 'row', gap: 3, alignItems: 'center' },
  zone: { position: 'absolute', width: '41%', height: '24%', borderWidth: 1, borderColor: '#becaa8', borderRadius: 17 },
  selectedZone: { borderColor: palette.green, borderWidth: 2 },
  zoneHeading: { minHeight: 40, paddingHorizontal: 6, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' },
  zoneName: { flexShrink: 1, fontSize: 11, fontWeight: '800', color: '#344a34' },
  incidentPin: { position: 'absolute', right: -5, top: -12, minWidth: 36, height: 28, backgroundColor: '#ae3f34', borderWidth: 2, borderColor: '#fff9f0', borderRadius: 14, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  incidentPinText: { fontSize: 11, color: '#fff', fontWeight: '800' },
  markerTarget: { position: 'absolute', width: 38, height: 38, marginLeft: -19, marginTop: -19, alignItems: 'center', justifyContent: 'center' },
  marker: { width: 29, height: 29, borderRadius: 15, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  selectedMarker: { borderColor: '#193d31', borderWidth: 3 },
  markerText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  pathLabel: { position: 'absolute', bottom: 11, alignSelf: 'center', color: '#677457', fontSize: 9, fontWeight: '700', letterSpacing: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  alertLegend: { width: 14, textAlign: 'center', fontWeight: '900', color: palette.red },
  resourceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 14, backgroundColor: '#fff' },
  selectedRow: { borderColor: palette.green, backgroundColor: '#edf3e5' },
  listMarker: { width: 33, height: 33, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  incidentRow: { padding: 16, borderWidth: 1, borderColor: '#ead5c9', borderRadius: 14, backgroundColor: '#fff8f2', gap: 10 },
});
