import type { Resource } from './types';
import type { IconName } from './ui';

// Schematic coordinates in percent, not latitude/longitude. Both roles use the
// same layout and the server's Resource.zone as the source of responder location.
export const festivalZones: { name: string; x: number; y: number; icon: IconName; tint: string }[] = [
  { name: 'North Gate', x: 52, y: 9, icon: 'enter-outline', tint: '#e8e4d7' },
  { name: 'Lawn Stage', x: 4, y: 9, icon: 'musical-notes-outline', tint: '#d8e5bb' },
  { name: 'Food Village', x: 4, y: 39, icon: 'restaurant-outline', tint: '#f3dfb8' },
  { name: 'River Stage', x: 52, y: 39, icon: 'musical-notes-outline', tint: '#dce9dc' },
  { name: 'South Gate', x: 4, y: 69, icon: 'enter-outline', tint: '#e8e4d7' },
  { name: 'Medical Tent', x: 52, y: 69, icon: 'medkit-outline', tint: '#f2ded6' },
];

export function locationZone(location: string): string | undefined {
  return festivalZones.find(zone => location.toLowerCase().includes(zone.name.toLowerCase()))?.name;
}

export const responderKinds = {
  volunteer: { label: 'Volunteer', color: '#315945', icon: 'person-outline' as IconName },
  medical: { label: 'Medical', color: '#ab473e', icon: 'medkit-outline' as IconName },
  security: { label: 'Security', color: '#536397', icon: 'shield-outline' as IconName },
  operations: { label: 'Site ops', color: '#956127', icon: 'construct-outline' as IconName },
};

export function responderKind(resource: Resource) {
  if (resource.skills.some(skill => skill === 'first_aid' || skill === 'paramedic')) return responderKinds.medical;
  if (resource.skills.includes('security')) return responderKinds.security;
  if (resource.skills.includes('site_operations')) return responderKinds.operations;
  return responderKinds.volunteer;
}

export function responderPositions(resources: Resource[]) {
  return festivalZones.flatMap(zone => {
    const members = resources.filter(resource => resource.zone === zone.name).sort((a, b) => a.id.localeCompare(b.id));
    const rows = Math.ceil(members.length / 3);
    return members.map((resource, index) => ({
      resource,
      x: zone.x + 8 + (index % 3) * 12,
      y: zone.y + 12 + Math.floor(index / 3) * Math.min(8, 10 / Math.max(1, rows - 1)),
    }));
  });
}

export function markerLabel(resource: Resource) {
  if (resource.id.startsWith('VOL-')) return String(Number(resource.id.slice(4))).padStart(2, '0');
  if (resource.id.startsWith('SEC-')) return `S${Number(resource.id.slice(4))}`;
  if (resource.id.startsWith('OPS-')) return 'OP';
  return resource.name.endsWith(' A') ? 'A' : resource.name.endsWith(' B') ? 'B' : '+';
}
