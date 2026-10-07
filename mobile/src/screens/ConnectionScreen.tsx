import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { client, errorMessage } from '../api';
import { useConnection } from '../connection';
import { Button, Card, Field, Heading, Notice, s } from '../ui';

export function ConnectionScreen({ onReturnToMenu, returnLabel = 'Return to main menu', managerMode = false, onClearResolvedFromApp }: {
  onReturnToMenu?: () => void; returnLabel?: string; managerMode?: boolean; onClearResolvedFromApp?: () => Promise<void>;
}) {
  const { url, save } = useConnection();
  const [value, setValue] = useState(url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dataBusy, setDataBusy] = useState(false);
  useEffect(() => { setValue(url); }, [url]);
  async function connect() {
    setBusy(true); setError(''); setMessage('');
    try { await save(value); setMessage('Connected to Pulse. You can now report and review incidents.'); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function clearResolvedFromApp() {
    if (!onClearResolvedFromApp) return;
    setDataBusy(true); setError(''); setMessage('');
    try {
      await onClearResolvedFromApp();
      setMessage('Resolved incidents are hidden from this app. Their database records are unchanged.');
    } catch (err) { setError(errorMessage(err)); }
    finally { setDataBusy(false); }
  }
  function confirmClearAll() {
    Alert.alert('Delete every incident?', 'This permanently deletes every incident from the database and releases all assigned resources. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: () => void (async () => {
        setDataBusy(true); setError(''); setMessage('');
        try {
          const result = await client(url).clearAllIncidents();
          setMessage(`${result.deleted_count} incident${result.deleted_count === 1 ? '' : 's'} deleted from the database. Resources are available again.`);
        } catch (err) { setError(errorMessage(err)); }
        finally { setDataBusy(false); }
      })() },
    ]);
  }
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.screen}>
    <Heading kicker="PHONE ↔ PYTHON" title="Connection." subtitle="Connect the app to your festival server." />
    <Notice text={error} kind="error" /><Notice text={message} kind="success" />
    {managerMode && <Card>
      <Heading kicker="MANAGER CONTROLS" title="Incident data." subtitle="Clear incidents from this app or permanently remove them from the system." />
      <Button title="Clear resolved incidents from this app" secondary icon="close-circle-outline" busy={dataBusy}
        onPress={() => void clearResolvedFromApp()} />
      <Text style={s.small}>This hides resolved incidents on this phone. They remain in the database and can still be retrieved by the system.</Text>
      <Button title="Delete all incidents from database" icon="trash-outline" busy={dataBusy} onPress={confirmClearAll} />
      <Text style={s.small}>Manager mode only. This permanently deletes active and resolved incidents and releases assigned resources.</Text>
    </Card>}
    <Card>
      <Field label="Python server address" value={value} onChangeText={setValue} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="http://192.168.1.42:8000" />
      <Button title="Test & save connection" icon="link-outline" busy={busy} disabled={!value.trim()} onPress={() => void connect()} />
      <Text style={s.small}>Saved on this phone. The app checks the server before switching.</Text>
    </Card>
    <Card>
      <Text style={s.h2}>Testing over Wi-Fi</Text>
      <Text style={s.body}>1. Put your phone and computer on the same Wi-Fi.</Text>
      <Text style={s.body}>2. Start the Python backend with the LAN option. Use the address printed in that terminal.</Text>
      <Text style={s.body}>3. Allow local network access on your phone and Python through the computer’s private-network firewall if prompted.</Text>
      <Text style={s.body}>“localhost” on your phone means the phone itself. Use your computer’s network address instead.</Text>
    </Card>
    <Notice text="Away from this Wi-Fi, the app needs a deployed HTTPS backend. Installing the app does not put the Python server on your phone." />
    {onReturnToMenu && <Button title={returnLabel} secondary icon="arrow-back" onPress={onReturnToMenu} />}
    <Text style={s.small}>Pulse base · Native React Native app · Mock AI · Demo roles, no authentication</Text>
  </ScrollView>;
}
