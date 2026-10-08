import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { client, errorMessage, usePolling } from '../api';
import { useConnection } from '../connection';
import { Button, Card, Field, Heading, Icon, IncidentBadges, Notice, palette, s, timestamp, typeLabels } from '../ui';
import type { AlertDraft, Incident, Resource } from '../types';

type Action = 'modify' | 'reject' | 'resolve';

function DecisionSheet({ action, incident, resources, busy, error, onClose, onSubmit }: {
  action: Action; incident: Incident; resources: Resource[]; busy: boolean; error: string;
  onClose: () => void; onSubmit: (note: string, ids: string[], actions: string[]) => void;
}) {
  const [note, setNote] = useState('');
  const [responderSearch, setResponderSearch] = useState('');
  const [ids, setIds] = useState(incident.recommendation.recommended_responders);
  const [actions, setActions] = useState(incident.recommendation.actions.join('\n'));
  const eligible = resources.filter(item => item.available || item.current_assignment === incident.id);
  const matchingResponders = eligible.filter(item => `${item.name} ${item.id}`.toLowerCase().includes(responderSearch.trim().toLowerCase()));
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
            <Field label="Search volunteers by name or ID" value={responderSearch} onChangeText={setResponderSearch} placeholder="Name or volunteer ID" />
            {matchingResponders.length ? matchingResponders.map(item => <Pressable key={item.id} accessibilityRole="checkbox" accessibilityLabel={`${item.name}, ${item.id}`}
              accessibilityState={{ checked: ids.includes(item.id) }} onPress={() => toggle(item.id)}
              style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, alignItems: 'center' }}>
              <Icon name={ids.includes(item.id) ? 'checkbox' : 'square-outline'} />
              <View style={{ flex: 1 }}><Text style={s.label}>{item.name}</Text><Text style={s.small}>{item.id} · {item.zone} · {item.skills.map(skill => skill.replaceAll('_', ' ')).join(', ')}</Text></View>
            </Pressable>) : <Text style={s.small}>No available volunteers match that search.</Text>}
            {gaps.map(zone => <Notice key={zone} text={`Coverage check: no available resources will remain at ${zone}.`} />)}
            <Field label="Response actions (one per line)" multiline value={actions} onChangeText={setActions} maxLength={5000} />
          </Card>}
          <Card>{action !== 'modify' && <Field label={action === 'resolve' ? 'Resolution note' : 'Reason for this decision'} multiline value={note} onChangeText={setNote} maxLength={2000} placeholder="Add context for the team…" />}
            {action === 'modify' && <Text style={s.small}>Saving updates the suggested response only. Review it on the incident screen, then approve it separately when ready.</Text>}
            <Button title={action === 'modify' ? 'Save modified response' : action === 'reject' ? 'Confirm rejection' : 'Confirm resolution'}
              busy={busy} disabled={(action !== 'modify' && !note.trim()) || (action === 'modify' && (!ids.length || !actions.trim()))}
              onPress={() => onSubmit(action === 'modify' ? '' : note, ids, actions.split('\n').map(item => item.trim()).filter(Boolean))} />
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
  const [alertDrafts, setAlertDrafts] = useState<AlertDraft[]>([]);
  const [draftMode, setDraftMode] = useState<'gemini' | 'mock' | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState('');
  const generatedFor = useRef('');

  const assignedVolunteerIds = incident?.assigned_responders.filter(value => value.startsWith('VOL-')) ?? [];
  const responseApproved = incident ? ['response_dispatched', 'in_progress'].includes(incident.status) : false;
  const draftKey = incident ? [id, incident.summary, incident.location, ...assignedVolunteerIds,
    ...(incident.recommendation.assignments ?? []).map(item => `${item.resource_id}:${item.responsibility}`)].join('|') : '';

  useEffect(() => {
    if (!canManage || !incident || !assignedVolunteerIds.length || !responseApproved
      || generatedFor.current === draftKey) return;
    generatedFor.current = draftKey;
    const byId = new Map((incident.recommendation.assignments ?? []).map(item => [item.resource_id, item]));
    const fallback = assignedVolunteerIds.map(volunteerId => {
      const resource = resources.data?.find(item => item.id === volunteerId);
      const assignment = byId.get(volunteerId);
      const task = assignment?.responsibility ?? 'Attend the incident and assist as directed by the manager.';
      return { volunteer_id: volunteerId, volunteer_name: assignment?.resource_name ?? resource?.name ?? volunteerId,
        role: assignment?.resource_role ?? resource?.role ?? 'Volunteer', task,
        message: `${incident.summary} Location: ${incident.location}. Your task: ${task}` };
    });
    setAlertDrafts(fallback);
    setDraftMode(null);
    setDraftError('');
    setDraftLoading(true);
    void client(url).alertDrafts(id).then(result => {
      if (generatedFor.current !== draftKey) return;
      setAlertDrafts(result.drafts);
      setDraftMode(result.mode);
    }).catch(err => {
      if (generatedFor.current === draftKey) setDraftError(errorMessage(err));
    }).finally(() => {
      if (generatedFor.current === draftKey) setDraftLoading(false);
    });
  }, [url, id, draftKey, canManage, responseApproved]);

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
  const assignments = recommendation.assignments ?? [];
  const matchedResponderIds = [...new Set([...recommendation.recommended_responders, ...assignments.map(item => item.resource_id)])];
  const respondersNeeded = recommendation.responders_needed ?? matchedResponderIds.length;
  return <>
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => { void refresh(); void resources.refresh(); }} tintColor={palette.green} />}>
      <Button title="Back to workspace" icon="arrow-back" secondary onPress={onBack} />
      <Heading kicker={`${incident.id} · ${typeLabels[incident.type]}`} title={incident.summary} subtitle={incident.location} />
      <IncidentBadges status={incident.status} urgency={incident.urgency} priorityScore={incident.priority_score} />
      <Notice text={error || loadError || resources.error} kind="error" /><Notice text={message} kind="success" />
      {canManage && incident.timeline.filter(entry => entry.kind === 'update').slice(-1).map(entry => <Card key={entry.id}>
        <Text style={s.h2}>Latest update</Text>
        <Text style={s.small}>{resources.data?.find(resource => resource.id === entry.actor)?.name ?? entry.actor} · {timestamp(entry.timestamp)}</Text>
        <Text style={s.body}>{entry.message}</Text>
        <Text style={s.small}>Saved directly from the sender. Review this update alongside the existing priority and response plan.</Text>
      </Card>)}
      {!!incident.missing_information.length && <Notice text={`Information to confirm: ${incident.follow_up_question ?? incident.missing_information.join(', ')}`} />}
      <Card>
        <Text accessibilityRole="header" style={s.h2}>{resolved ? 'Recorded response' : canDecide ? 'Suggested response' : 'Approved response'}</Text>
        <Text style={s.small}>{canDecide ? 'Awaiting manager approval' : 'Reviewed by the manager'} · {incident.parser_mode === 'gemini' || incident.parser_mode === 'openai' ? 'AI analysis' : 'Mock analysis'}</Text>
        {incident.last_decision === 'reject' && <Notice text="The previous suggestion was rejected. Review or modify before approving." />}
        {recommendation.manager_edited && <Notice text="Modified response saved. Review the responder assignments and actions below; approval is still required." />}
        <Text style={s.h3}>Medical assistance: {(recommendation.medical_assistance_needed ?? (incident.type === 'medical')) ? 'Needed' : 'Not indicated'}</Text>
        <Text style={s.small}>Suggested team: {respondersNeeded} {respondersNeeded === 1 ? 'person' : 'people'} · {matchedResponderIds.length} matched to free responders</Text>
        {!!matchedResponderIds.length && <Text style={s.h3}>Matched responders</Text>}
        {matchedResponderIds.map(resourceId => {
          const resource = resources.data?.find(item => item.id === resourceId);
          const assignment = assignments.find(item => item.resource_id === resourceId);
          return <View key={resourceId} style={{ gap: 4 }}>
            <Text style={s.h3}>{assignment?.resource_name ?? resource?.name ?? resourceId}</Text>
            <Text style={s.small}>{assignment?.resource_role ?? resource?.role ?? 'Responder'} · {assignment?.resource_zone ?? resource?.zone ?? 'Zone to confirm'}{assignment?.required_skill ? ` / ${assignment.required_skill.replaceAll('_', ' ')}` : ''}</Text>
            {assignment?.responsibility && <Text style={s.body}>{assignment.responsibility}</Text>}
          </View>;
        })}
        {!matchedResponderIds.length && <Notice text="No suitable responder is currently available. Review the resource roster." />}
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
      {canManage && !resolved && responseApproved && assignedVolunteerIds.length > 0 && <Card>
        <Text style={s.h2}>Review volunteer alert messages</Text>
        <Text style={s.small}>This works the same for High, Medium, and Low priority incidents. Review and edit each assigned volunteer’s message before sending; no alert is sent until you press the button below.</Text>
        <Notice text={draftError} kind="error" />
        <Notice text={draftLoading ? 'Generating individual message suggestions…' : draftMode === 'gemini' ? 'Suggested by Gemini. Edit any message before sending.' : draftMode === 'mock' ? 'Template suggestions shown. Configure Gemini for generated wording.' : undefined} />
        {alertDrafts.map((draft, index) => <View key={draft.volunteer_id} style={{ gap: 8 }}>
          <Text style={s.h3}>{draft.volunteer_name} · {draft.role}</Text>
          <Text style={s.small}>Assigned task: {draft.task}</Text>
          <Field label={`Alert message for ${draft.volunteer_name}`} multiline value={draft.message}
            onChangeText={value => setAlertDrafts(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, message: value } : item))}
            editable={!draftLoading} maxLength={500} placeholder="Situation, location, and your task" />
        </View>)}
        <Button title="Send reviewed alerts" icon="notifications-outline" busy={busy}
          disabled={draftLoading || alertDrafts.length !== assignedVolunteerIds.length || alertDrafts.some(item => item.message.trim().length < 3)}
          onPress={() => void perform(() => client(url).alert(id, alertDrafts.map(({ volunteer_id, message: text }) => ({ volunteer_id, message: text.trim() }))), 'Individual alerts sent to assigned volunteers.')} />
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
        : action === 'modify' ? client(url).modifySuggestion(id, ids, actions, note)
          : client(url).decide(id, { decision: 'reject', note }),
      action === 'resolve' ? 'Incident resolved. Assigned resources released.' : action === 'reject' ? 'Suggestion rejected. No new resources assigned.' : 'Modified suggestion saved. Review the updated response before approving.')} />}
  </>;
}
