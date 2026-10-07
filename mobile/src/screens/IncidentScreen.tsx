import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { client, errorMessage, usePolling } from '../api';
import { useConnection } from '../connection';
import { Button, Card, Field, Heading, Icon, IncidentBadges, Notice, palette, s, timestamp, typeLabels } from '../ui';
import type { Incident, Resource } from '../types';

type Action = 'modify' | 'reject' | 'resolve';

function DecisionSheet({ action, incident, resources, busy, error, onClose, onSubmit }: {
  action: Action; incident: Incident; resources: Resource[]; busy: boolean; error: string;
  onClose: () => void; onSubmit: (note: string, ids: string[], actions: string[]) => void;
}) {
  const [note, setNote] = useState('');
  const [ids, setIds] = useState(incident.recommendation.recommended_responders);
  const [actions, setActions] = useState(incident.recommendation.actions.join('\n'));
  const eligible = resources.filter(item => item.available || item.current_assignment === incident.id);
  const zones = [...new Set(resources.filter(item => ids.includes(item.id)).map(item => item.zone))];
  const gaps = zones.filter(zone => !resources.some(item => item.zone === zone && item.available && !ids.includes(item.id)));
  function toggle(id: string) {
    const next = ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id];
    setIds(next);
    setActions(resources.filter(item => next.includes(item.id)).map(item => `Assign ${item.name} to attend ${incident.location}.`).join('\n'));
  }
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.screen}>
          <Heading title={action === 'modify' ? 'Modify response.' : action === 'reject' ? 'Reject suggestion.' : 'Resolve incident.'} subtitle={incident.id} />
          <Notice text={error} kind="error" />
          {action === 'modify' && <Card>
            <Text style={s.h3}>Select responders</Text>
            {eligible.map(item => <Pressable key={item.id} accessibilityRole="checkbox" accessibilityLabel={item.name}
              accessibilityState={{ checked: ids.includes(item.id) }} onPress={() => toggle(item.id)}
              style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, alignItems: 'center' }}>
              <Icon name={ids.includes(item.id) ? 'checkbox' : 'square-outline'} />
              <View style={{ flex: 1 }}><Text style={s.label}>{item.name}</Text><Text style={s.small}>{item.zone} · {item.skills.map(skill => skill.replaceAll('_', ' ')).join(', ')}</Text></View>
            </Pressable>)}
            {gaps.map(zone => <Notice key={zone} text={`Coverage check: no available resources will remain at ${zone}.`} />)}
            <Field label="Response actions (one per line)" multiline value={actions} onChangeText={setActions} maxLength={5000} />
          </Card>}
          <Card><Field label={action === 'resolve' ? 'Resolution note' : 'Reason for this decision'} multiline value={note} onChangeText={setNote} maxLength={2000} placeholder="Add context for the team…" />
            {action === 'modify' && <Text style={s.small}>Confirming approves this edited response and assigns the selected resources.</Text>}
            <Button title={action === 'modify' ? 'Approve modified response' : action === 'reject' ? 'Confirm rejection' : 'Confirm resolution'}
              busy={busy} disabled={!note.trim() || (action === 'modify' && (!ids.length || !actions.trim()))}
              onPress={() => onSubmit(note, ids, actions.split('\n').map(item => item.trim()).filter(Boolean))} />
            <Button title="Cancel" secondary disabled={busy} onPress={onClose} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

export function IncidentScreen({ id, onBack, canManage = true, reportedBy = 'Safety lead' }: {
  id: string; onBack: () => void; canManage?: boolean; reportedBy?: string;
}) {
  const { url } = useConnection();
  const { data: incident, error: loadError, loading, refresh } = usePolling<Incident>(url, `/api/incidents/${id}`);
  const resources = usePolling<Resource[]>(url, '/api/resources');
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [update, setUpdate] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  async function perform(work: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try { await work(); setAction(null); setMessage(success); await Promise.all([refresh(), resources.refresh()]); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  if (!incident) return <ScrollView contentContainerStyle={s.screen}><Button title="Back" secondary onPress={onBack} />
    {loading ? <ActivityIndicator color={palette.green} /> : <Notice text={loadError || 'Incident not found.'} kind="error" />}</ScrollView>;
  const canDecide = ['reported', 'awaiting_clarification', 'awaiting_approval'].includes(incident.status);
  const resolved = incident.status === 'resolved';
  const recommendation = incident.recommendation;
  return <>
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => { void refresh(); void resources.refresh(); }} tintColor={palette.green} />}>
      <Button title="Back to workspace" icon="arrow-back" secondary onPress={onBack} />
      <Heading kicker={`${incident.id} · ${typeLabels[incident.type]}`} title={incident.summary} subtitle={incident.location} />
      <IncidentBadges status={incident.status} urgency={incident.urgency} />
      <Notice text={error || loadError || resources.error} kind="error" /><Notice text={message} kind="success" />
      {!!incident.missing_information.length && <Notice text={`Information to confirm: ${incident.follow_up_question ?? incident.missing_information.join(', ')}`} />}
      <Card>
        <Text accessibilityRole="header" style={s.h2}>{resolved ? 'Recorded response' : canDecide ? 'Suggested response' : 'Approved response'}</Text>
        <Text style={s.small}>{canDecide ? 'Awaiting safety lead approval' : 'Reviewed by the safety lead'} · Demo</Text>
        {incident.last_decision === 'reject' && <Notice text="The previous suggestion was rejected. Review or modify before approving." />}
        {recommendation.recommended_responders.map(resourceId => {
          const resource = resources.data?.find(item => item.id === resourceId);
          return <View key={resourceId} style={{ gap: 4 }}><Text style={s.h3}>{resource?.name ?? resourceId}</Text><Text style={s.small}>{resource?.role} · {resource?.zone}</Text></View>;
        })}
        {!recommendation.recommended_responders.length && <Notice text="No suitable responder is currently available. Review the resource roster." />}
        <View style={s.divider} />
        <Text style={s.h3}>Response actions</Text>
        {recommendation.actions.map((item, index) => <Text key={index} style={s.body}>{index + 1}. {item}</Text>)}
        <Text style={s.h3}>Why this response?</Text>
        {recommendation.reasoning.map((item, index) => <Text key={index} style={s.body}>{item}</Text>)}
        {recommendation.conflicts.map((item, index) => <Notice key={index} text={item} />)}
        {canManage && canDecide && <>
          <Button title="Approve response" icon="checkmark" busy={busy} disabled={!recommendation.recommended_responders.length}
            onPress={() => void perform(() => client(url).decide(id, { decision: 'approve', responder_ids: recommendation.recommended_responders }), 'Response approved. Demo resources assigned.')} />
          <Button title="Modify response" secondary icon="create-outline" disabled={busy} onPress={() => { setError(''); setAction('modify'); }} />
          <Button title="Reject suggestion" secondary icon="close" disabled={busy} onPress={() => { setError(''); setAction('reject'); }} />
        </>}
        <Text style={s.small}>{canManage ? 'Pulse suggests. You decide. Only your approval assigns resources.' : 'Your manager reviews and approves the response.'}</Text>
      </Card>
      {canManage && !resolved && <Button title="Resolve incident" icon="checkmark-done" secondary disabled={busy} onPress={() => { setError(''); setAction('resolve'); }} />}
      <Card><Text style={s.h2}>Incident brief</Text>{incident.observations.map((item, index) => <Text key={index} style={s.body}>• {item}</Text>)}
        <Text style={s.small}>Reported by {incident.reported_by} · {timestamp(incident.created_at)}</Text>
      </Card>
      {!resolved && <Card><Field label="Add an incident update" multiline value={update} onChangeText={setUpdate} maxLength={5000} placeholder="What has changed?" />
        <Button title="Add update" secondary busy={busy} disabled={!update.trim()} onPress={() => void perform(async () => {
          await client(url).update(id, update, reportedBy); setUpdate('');
        }, 'Update added to the timeline.')} />
      </Card>}
      {canManage && !resolved && incident.assigned_responders.length > 0 && <Card>
        <Text style={s.h2}>Alert assigned volunteers</Text>
        <Text style={s.small}>In-app alert for {incident.assigned_responders.length} assigned responder{incident.assigned_responders.length === 1 ? '' : 's'}.</Text>
        <Field label="Message to responders" multiline value={alertMessage} onChangeText={setAlertMessage} maxLength={500} placeholder="Please confirm when you arrive." />
        <Button title="Send volunteer alert" icon="notifications-outline" busy={busy} disabled={alertMessage.trim().length < 3}
          onPress={() => void perform(() => client(url).alert(id, alertMessage.trim()).then(() => setAlertMessage('')), 'Alert sent to assigned volunteers.')} />
      </Card>}
      <Card><Text style={s.h2}>Incident timeline</Text>{incident.timeline.map(entry => <View key={entry.id} style={{ borderLeftWidth: 2, borderLeftColor: '#bfd1aa', paddingLeft: 14, gap: 6 }}>
        <Text style={s.label}>{entry.actor}</Text><Text style={s.small}>{timestamp(entry.timestamp)}</Text><Text style={s.body}>{entry.message}</Text>
      </View>)}</Card>
      {incident.draft_report && <Card><Text style={s.h2}>Draft incident report</Text><Text selectable style={s.small}>{incident.draft_report}</Text>
        <Button title="Share draft report" icon="share-outline" secondary onPress={() => {
          void Share.share({ title: `${id} draft report`, message: incident.draft_report! }).catch(err => setError(errorMessage(err)));
        }} />
      </Card>}
    </ScrollView>
    {canManage && action && <DecisionSheet key={action} action={action} incident={incident} resources={resources.data ?? []} busy={busy} error={error} onClose={() => setAction(null)}
      onSubmit={(note, ids, actions) => void perform(() => action === 'resolve' ? client(url).resolve(id, note)
        : client(url).decide(id, { decision: action, note, ...(action === 'modify' ? { responder_ids: ids, actions } : {}) }),
      action === 'resolve' ? 'Incident resolved. Assigned resources released.' : action === 'reject' ? 'Suggestion rejected. No new resources assigned.' : 'Modified response approved.')} />}
  </>;
}
