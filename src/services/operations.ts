import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_RECIPIENT_EMAIL, DEFAULT_SENDER_EMAIL, STORAGE_KEY } from '../constants';
import { Operation } from '../types';

export async function loadOperations(): Promise<Operation[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Le format de l’historique local est invalide.');
  }
  return (parsed as Partial<Operation>[]).map((operation) => ({
    ...operation,
    senderEmail: operation.senderEmail || DEFAULT_SENDER_EMAIL,
    recipientEmail: operation.recipientEmail || DEFAULT_RECIPIENT_EMAIL,
    reserved: operation.reserved === true,
  })) as Operation[];
}

export async function persistOperations(operations: Operation[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(operations));
}
