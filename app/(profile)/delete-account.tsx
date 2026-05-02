// DeleteAccountScreen — type-to-confirm destructive flow.
// Calls the delete_user RPC which cascades all user data and removes auth.users row.

import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  BackButton,
  Body,
  ChapterLabel,
  Display,
  PrimaryButton,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';
import { deleteUserAccount } from '../../services/userService';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const isConfirmed = confirmText.trim().toUpperCase() === 'DELETE';

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteUserAccount();
      router.replace('/(auth)/splash');
    } catch {
      Alert.alert(
        'Could not delete',
        'Something went wrong. Please try again or contact support.',
      );
      setDeleting(false);
    }
  };

  const promptConfirm = () => {
    Alert.alert(
      'Delete account?',
      'This cannot be undone. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, delete', style: 'destructive', onPress: handleDelete },
      ],
      { cancelable: true },
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 28, paddingVertical: 8 }}>
          <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
        </View>

        <View style={{ paddingTop: 22, paddingHorizontal: 32 }}>
          <ChapterLabel>A permanent step</ChapterLabel>
          <Display style={{ marginTop: 14, fontSize: 32, lineHeight: 35 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>Delete</Text>
            {'\n'}your account?
          </Display>
        </View>

        <View style={{ paddingTop: 20, paddingHorizontal: 32 }}>
          <Body
            serif
            size={14}
            style={{ fontStyle: 'italic', lineHeight: 22, color: Palette.ink2 }}
          >
            This is permanent. Your scans, kit, ratings, and profile will all be removed.
            We can&apos;t restore them.
          </Body>
        </View>

        <View style={{ paddingTop: 36, paddingHorizontal: 32 }}>
          <ChapterLabel style={{ marginBottom: 14 }}>Type delete to confirm</ChapterLabel>
          <TextInput
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!deleting}
            style={{
              fontFamily:  'CormorantGaramond_400Regular_Italic',
              fontStyle:   'italic',
              fontSize:    18,
              color:       Palette.ink,
              borderBottomWidth: 1,
              borderBottomColor: Palette.rule,
              paddingVertical:   8,
              paddingHorizontal: 0,
            }}
          />
        </View>

        <View style={{ paddingTop: 36, paddingHorizontal: 32 }}>
          <PrimaryButton
            label={deleting ? 'Deleting…' : 'Delete my account'}
            onPress={promptConfirm}
            disabled={!isConfirmed || deleting}
            style={{ backgroundColor: Palette.accent }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
