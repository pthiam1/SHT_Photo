import * as FileSystem from 'expo-file-system/legacy';
import { PhotoItem } from '../types';

export function safePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function storePhoto(
  uri: string,
  reference: string,
  index: number,
): Promise<PhotoItem> {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const paddedIndex = String(index).padStart(2, '0');
  const filename = `${safePart(reference)}_${date}_${time}_${paddedIndex}.jpg`;
  const directory = `${FileSystem.documentDirectory}photos/`;

  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${Date.now()}_${filename}`;
  await FileSystem.copyAsync({ from: uri, to: destination });

  return { uri: destination, filename, capturedAt: now.toISOString() };
}

export async function removePhoto(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true });
}
