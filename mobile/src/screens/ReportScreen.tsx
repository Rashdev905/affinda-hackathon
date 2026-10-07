import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { client, errorMessage, usePolling } from '../api';
import { useConnection } from '../connection';
import { Badge, Button, Card, Field, Heading, Icon, IncidentBadges, Notice, palette, s } from '../ui';
import type { Incident } from '../types';
import { VoiceRecorder } from '../VoiceRecorder';

const examples = [
  { label: 'Medical', text: "Someone collapsed near the Lawn Stage toilets. They're awake but really dizzy and a crowd is forming." },
  { label: 'Lost child', text: 'A lost child is at North Gate, separated from their parent. I am staying with them at the information point.' },
  { label: 'Site hazard', text: 'There is a broken cable cover at Food Village, beside the water station.' },
];

export function ReportScreen({ onOpen, active = true, volunteerId = 'VOL-014', volunteerName = 'Volunteer' }: {
  onOpen: (id: string) => void; active?: boolean; volunteerId?: string; volunteerName?: string;
}) {
  const { url } = useConnection();
  const volunteerCode = volunteerId.replace(/^VOL-/, '').padStart(4, '0');
  const reports = usePolling<Incident[]>(url, '/api/incidents');
  const [text, setText] = useState('');
  const [incident, setIncident] = useState<Incident | null>(null);
  const [update, setUpdate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showExisting, setShowExisting] = useState(false);
  const [showText, setShowText] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const current = reports.data?.find(item => item.id === incident?.id);
  const shown = current && incident && current.updated_at > incident.updated_at ? current : incident;
  const activeIncidents = reports.data?.filter(item => item.status !== 'resolved'
    && (item.reported_by === volunteerId || item.assigned_responders.includes(volunteerId))) ?? [];

  async function submit(isUpdate: boolean) {
    if (busy || voiceBusy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = isUpdate && shown ? await client(url).update(shown.id, update, volunteerId) : await client(url).report(text, volunteerId);
      setIncident(result); setText(''); setUpdate('');
      setMessage(isUpdate ? 'Update sent to the safety lead.' : 'Your report is with the safety lead.');
      void reports.refresh();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.screen}
    refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reports.refresh()} tintColor={palette.green} />}>
    <Heading kicker="ON THE GROUND. IN THE LOOP." title="Report incident." subtitle="Tell us what’s happening. We’ll help make it clear." />
    <Badge text={`${volunteerCode} · ${volunteerName}`} />
    <Notice text={error || reports.error} kind="error" />
    <Notice text={message} kind="success" />
    {!shown ? <>
      <Card>
        <VoiceRecorder base={url} active={active} disabled={busy} onBusyChange={setVoiceBusy}
          onTranscript={transcript => {
            setText(previous => previous ? `${previous}\n${transcript}` : transcript);
            setShowText(true);
          }} />
        {!showText && !text && <Button title="Type a report instead" secondary icon="create-outline" disabled={voiceBusy}
          onPress={() => setShowText(true)} />}
        {(showText || !!text) && <>
        <Field label="What’s happening?" multiline value={text} onChangeText={setText} maxLength={5000}
          placeholder="Someone needs help near the Lawn Stage toilets…" style={[s.input, { minHeight: 180 }]} />
        <Text style={s.small}>Include the festival zone, a landmark, and what you can see.</Text>
        <View style={s.row}>{examples.map(example => <Pressable key={example.label} accessibilityRole="button" disabled={voiceBusy || busy}
          onPress={() => setText(example.text)} style={s.chip}><Text style={s.small}>{example.label} +</Text></Pressable>)}</View>
        </>}
        {!!text && <Text style={s.small}>Check names, location, and key details before submitting.</Text>}
        {text.length > 5000 && <Notice text="Please shorten the report to 5,000 characters before submitting." kind="error" />}
        <Button title="Submit incident" icon="arrow-forward" busy={busy} disabled={voiceBusy || !url || text.trim().length < 3 || text.length > 5000} onPress={() => void submit(false)} />
        <Text style={s.small}>Emergency reports alert volunteers automatically. A manager approves responder assignments.</Text>
      </Card>
      <Button title="Update an existing incident" secondary icon="chatbubble-outline" disabled={voiceBusy || busy} onPress={() => setShowExisting(!showExisting)} />
      {showExisting && <Card>
        <Text style={s.h3}>Choose an active incident</Text>
        {!activeIncidents.length && <Text style={s.body}>No active incidents reported by or assigned to you.</Text>}
        {activeIncidents.map(item => <Pressable key={item.id} accessibilityRole="button"
          accessibilityLabel={`Update ${item.id}`} disabled={voiceBusy || busy} style={{ gap: 5, paddingVertical: 12 }}
          onPress={() => { setIncident(item); setMessage(''); setError(''); setShowExisting(false); }}>
          <Text style={s.small}>{item.id} · {item.location}</Text><Text style={s.h3}>{item.summary}</Text>
        </Pressable>)}
      </Card>}
      <Card dark><Icon name="pulse-outline" color={palette.lime} size={32} /><Text style={[s.h2, { color: '#fff' }]}>A clear report.
A coordinated response.</Text><Text style={[s.body, { color: '#cddfc0' }]}>You share what you see. Pulse suggests a response. Your safety lead makes the call.</Text></Card>
    </> : <>
      <Card>
        <Text selectable style={s.kicker}>{shown.id}</Text>
        <IncidentBadges status={shown.status} urgency={shown.urgency} />
        <Text accessibilityRole="header" style={s.h2}>{shown.summary}</Text>
        <Text style={s.body}>{shown.location}</Text>
        {shown.observations.map((item, index) => <Text key={index} style={s.body}>• {item}</Text>)}
        {shown.status !== 'resolved' ? <>
          <View style={s.divider} />
          <VoiceRecorder key={shown.id} base={url} active={active} disabled={busy} onBusyChange={setVoiceBusy}
            onTranscript={transcript => setUpdate(previous => previous ? `${previous}\n${transcript}` : transcript)} />
          <Field label={shown.follow_up_question ?? 'Anything changed?'} multiline value={update} onChangeText={setUpdate}
            maxLength={5000} placeholder="Share the latest information…" />
          <Button title="Send update" icon="arrow-forward" busy={busy} disabled={voiceBusy || !update.trim() || update.length > 5000} onPress={() => void submit(true)} />
        </> : <Notice text="This incident has been resolved by the safety lead." kind="success" />}
        <Button title="View incident" secondary onPress={() => onOpen(shown.id)} />
      </Card>
      <Button title="New report" icon="add" secondary disabled={busy || voiceBusy} onPress={() => { setIncident(null); setError(''); setMessage(''); setUpdate(''); setShowText(false); }} />
    </>}
    <Text style={s.small}>Demo mode · Mock parser · Simulated responders</Text>
  </ScrollView>;
}
