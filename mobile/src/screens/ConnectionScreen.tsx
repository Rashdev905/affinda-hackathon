import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { errorMessage } from '../api';
import { useConnection } from '../connection';
import { Button, Card, Field, Heading, Notice, s } from '../ui';

export function ConnectionScreen({ onReturnToMenu, returnLabel = 'Return to main menu' }: { onReturnToMenu?: () => void; returnLabel?: string }) {
  const { url, save } = useConnection();
  const [value, setValue] = useState(url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { setValue(url); }, [url]);
  async function connect() {
    setBusy(true); setError(''); setMessage('');
    try { await save(value); setMessage('Connected to Pulse. You can now report and review incidents.'); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.screen}>
    <Heading kicker="PHONE ↔ PYTHON" title="Connection." subtitle="Connect the app to your festival server." />
    <Notice text={error} kind="error" /><Notice text={message} kind="success" />
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
