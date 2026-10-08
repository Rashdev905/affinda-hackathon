import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { client, errorMessage } from '../api';
import { useConnection } from '../connection';
import { Button, Card, Field, Heading, Icon, Notice, s } from '../ui';
import type { Resource } from '../types';

export function VolunteerLoginScreen({ onLogin, onBack, onSettings }: {
  onLogin: (volunteer: Resource) => void; onBack: () => void; onSettings?: () => void;
}) {
  const { url } = useConnection();
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signIn() {
    setBusy(true);
    setError('');
    try {
      const volunteer = await client(url).volunteerLogin(identifier);
      onLogin(volunteer);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.screen}>
    <Icon name="people-outline" size={34} />
    <Heading kicker="VOLUNTEER MODE" title="Volunteer login." />
    <Notice text={!url ? 'Connect to the Pulse server in Settings before logging in.' : error} kind="error" />
    <Card>
      <Field label="4-digit volunteer ID" value={identifier} onChangeText={value => setIdentifier(value.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad" maxLength={4} autoFocus placeholder="0001" />
      <Button title="Log in" icon="arrow-forward" busy={busy} disabled={!url || identifier.length !== 4} onPress={() => void signIn()} />
      <Text style={s.small}>Demo IDs 0001 to 0016 map to the 16 seeded volunteers.</Text>
    </Card>
    {onSettings && <Button title="Connection settings" secondary icon="settings-outline" onPress={onSettings} />}
    <Button title="Back to role selection" secondary onPress={onBack} />
  </ScrollView>;
}
