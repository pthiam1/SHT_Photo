import * as FileSystem from 'expo-file-system/legacy';
import { MAIL_API_TOKEN, MAIL_API_URL } from '../constants';
import { Operation } from '../types';

type EncodedPhoto = {
  filename: string;
  contentType: string;
  content: string;
};

export async function sendOperationByOutlook(operation: Operation): Promise<void> {
  if (!MAIL_API_TOKEN) throw new Error('Le jeton du service mail n’est pas configuré.');

  const photos: EncodedPhoto[] = await Promise.all(operation.photos.map(async photo => ({
    filename: photo.filename,
    contentType: 'image/jpeg',
    content: await FileSystem.readAsStringAsync(photo.uri, {
      encoding: FileSystem.EncodingType.Base64,
    }),
  })));

  const response = await fetch(`${MAIL_API_URL}/api/email/send-photos`, {
    method: 'POST',
    headers: {
      'x-api-token': MAIL_API_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: operation.type,
      reference: operation.reference,
      recipient: operation.recipientEmail,
      subject: `SHT Photo — ${operation.reference}`,
      createdAt: operation.createdAt,
      reserved: String(operation.reserved),
      photos,
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || `Le serveur mail a répondu ${response.status}.`);
  }
}
