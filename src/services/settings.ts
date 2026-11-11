import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_RECIPIENT_EMAIL } from '../constants';

const RECIPIENT_EMAIL_KEY = 'sht-photo-recipient-email-v1';

export async function loadRecipientEmail(): Promise<string> {
  return (await AsyncStorage.getItem(RECIPIENT_EMAIL_KEY)) || DEFAULT_RECIPIENT_EMAIL;
}

export async function persistRecipientEmail(email: string): Promise<void> {
  await AsyncStorage.setItem(RECIPIENT_EMAIL_KEY, email);
}
