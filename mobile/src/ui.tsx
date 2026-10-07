import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { IncidentStatus, IncidentType, Urgency } from './types';

export const palette = { green: '#173d32', lime: '#d5ef96', bg: '#f5f7f1', text: '#243b32', muted: '#65745f', line: '#dde5d5', red: '#983f33' };
export const statusLabels: Record<IncidentStatus, string> = {
  reported: 'Reported', awaiting_clarification: 'Needs clarification', awaiting_approval: 'Awaiting approval',
  response_dispatched: 'Response dispatched', in_progress: 'In progress', resolved: 'Resolved',
};
export const typeLabels: Record<IncidentType, string> = { medical: 'Medical', lost_person: 'Lost person', security: 'Security', hazard: 'Site hazard', general: 'General' };
export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export function Icon({ name, size = 20, color = palette.green }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} accessible={false} />;
}
export function Button({ title, onPress, secondary = false, disabled = false, busy = false, icon }: {
  title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; busy?: boolean; icon?: IconName;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [s.button, secondary && s.secondary, (disabled || busy) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}>
    {busy ? <ActivityIndicator color={secondary ? palette.green : '#fff'} /> : icon && <Icon name={icon} color={secondary ? palette.green : '#fff'} />}
    <Text style={[s.buttonText, secondary && { color: palette.green }]}>{title}</Text>
  </Pressable>;
}
export function Card({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return <View style={[s.card, dark && { backgroundColor: palette.green, borderColor: palette.green }]}>{children}</View>;
}
export function Heading({ kicker, title, subtitle }: { kicker?: string; title: string; subtitle?: string }) {
  return <View style={s.heading}>{kicker && <Text style={s.kicker}>{kicker}</Text>}<Text accessibilityRole="header" style={s.title}>{title}</Text>{subtitle && <Text style={s.body}>{subtitle}</Text>}</View>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 8 }}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#85917b" textAlignVertical="top" style={[s.input, props.multiline && { minHeight: 104 }]} {...props} /></View>;
}
export function Notice({ text, kind = 'info' }: { text?: string; kind?: 'info' | 'error' | 'success' }) {
  if (!text) return null;
  return <View accessibilityRole={kind === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[s.notice, kind === 'error' && { backgroundColor: '#fff0eb' }]}>
    <Icon name={kind === 'error' ? 'alert-circle-outline' : kind === 'success' ? 'checkmark-circle-outline' : 'information-circle-outline'} color={kind === 'error' ? palette.red : palette.green} />
    <Text style={[s.noticeText, kind === 'error' && { color: palette.red }]}>{text}</Text>
  </View>;
}
export function Badge({ text, tone = 'neutral' }: { text: string; tone?: string }) {
  const urgent = ['critical', 'high'].includes(tone);
  return <View style={[s.badge, urgent && { backgroundColor: tone === 'critical' ? '#fbe7e4' : '#fbefdf' }]}><Text style={[s.badgeText, urgent && { color: '#92472b' }]}>{text}</Text></View>;
}
export function IncidentBadges({ status, urgency, priorityScore }: { status: IncidentStatus; urgency: Urgency; priorityScore?: number }) {
  const label = priorityScore !== undefined
    ? priorityScore >= 70 ? 'High' : priorityScore >= 35 ? 'Medium' : 'Low'
    : urgency === 'critical' ? 'High' : urgency[0].toUpperCase() + urgency.slice(1);
  return <View style={s.row}><Badge text={`${label} priority`} tone={label.toLowerCase()} /><Badge text={statusLabels[status]} /></View>;
}
export function Empty({ title, body }: { title: string; body: string }) {
  return <View style={s.empty}><Icon name="shield-checkmark-outline" size={40} /><Text style={s.h2}>{title}</Text><Text style={[s.body, { textAlign: 'center' }]}>{body}</Text></View>;
}
export function timestamp(value: string) {
  return new Date(value).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' });
}
export const s = StyleSheet.create({
  screen: { padding: 20, paddingBottom: 32, gap: 18, width: '100%', maxWidth: 760, alignSelf: 'center' },
  heading: { gap: 8, paddingVertical: 6 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: palette.muted },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -1, color: palette.text },
  h2: { fontSize: 19, fontWeight: '700', color: palette.text },
  h3: { fontSize: 16, fontWeight: '700', color: palette.text },
  body: { fontSize: 15, lineHeight: 23, color: palette.muted },
  small: { fontSize: 12, lineHeight: 18, color: palette.muted },
  card: { padding: 20, gap: 16, borderWidth: 1, borderColor: palette.line, borderRadius: 18, backgroundColor: '#fff' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  button: { minHeight: 50, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: palette.green, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, borderWidth: 1, borderColor: palette.green },
  secondary: { backgroundColor: '#fff', borderColor: palette.line },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  label: { fontSize: 15, fontWeight: '600', color: palette.text },
  input: { borderWidth: 1, borderColor: palette.line, borderRadius: 10, backgroundColor: '#fbfcf8', padding: 14, fontSize: 16, lineHeight: 24, color: palette.text, minHeight: 50 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, backgroundColor: '#eaf1df', borderRadius: 10, gap: 10 },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 21, color: '#496137' },
  badge: { borderRadius: 6, paddingVertical: 6, paddingHorizontal: 9, backgroundColor: '#edf2e6' },
  badgeText: { fontSize: 12, color: '#526b40', fontWeight: '600' },
  divider: { height: 1, backgroundColor: palette.line, marginVertical: 4 },
  empty: { alignItems: 'center', padding: 28, gap: 16 },
  chip: { paddingVertical: 12, paddingHorizontal: 13, minHeight: 44, borderWidth: 1, borderColor: palette.line, borderRadius: 9, backgroundColor: '#fff', justifyContent: 'center' },
  chipActive: { backgroundColor: '#e4edda', borderColor: '#aac193' },
});
