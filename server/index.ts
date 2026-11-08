import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  API_SHARED_TOKEN: z.string().min(32),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
});

const config = configSchema.parse(process.env);
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 20, fileSize: config.MAX_UPLOAD_BYTES },
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character] || character));
}

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '256mb' }));

function isAuthorized(request: express.Request): boolean {
  const provided = request.header('x-api-token');
  if (!provided || provided.length !== config.API_SHARED_TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(config.API_SHARED_TOKEN));
}

app.get('/health', (_request, response) => {
  response.json({ status: 'Backend SHT Photo mail opérationnel.' });
});

app.post('/api/email/send-photos', upload.array('files', 20), async (request, response) => {
  if (!isAuthorized(request)) {
    response.status(401).json({ error: 'Non autorisé.' });
    return;
  }

  const payload = z.object({
    type: z.enum(['RECEPTION', 'CONTENEUR']),
    reference: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
    recipient: z.string().email(),
    subject: z.string().trim().min(1).max(200),
    createdAt: z.string().datetime(),
    reserved: z.enum(['true', 'false']).optional(),
    photos: z.array(z.object({
      filename: z.string().trim().min(1).max(255),
      contentType: z.string().trim().min(1).max(100),
      content: z.string().min(1),
    })).max(20).optional(),
  }).safeParse(request.body);

  const files = (request.files ?? []) as Express.Multer.File[];
  if (!payload.success || (files.length === 0 && (!payload.data.photos || payload.data.photos.length === 0))) {
    response.status(400).json({ error: 'Données ou photos invalides.' });
    return;
  }

  try {
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.RESEND_FROM_EMAIL,
        to: [payload.data.recipient],
        subject: payload.data.subject,
        text: payload.data.description || `Opération ${payload.data.reference}`,
        html: `<p>Opération <strong>${escapeHtml(payload.data.reference)}</strong></p><p>Type : ${escapeHtml(payload.data.type)}</p><p>Date : ${escapeHtml(payload.data.createdAt)}</p><p>Réservée : ${payload.data.reserved === 'true' ? 'Oui' : 'Non'}</p>${payload.data.description ? `<p>${escapeHtml(payload.data.description)}</p>` : ''}`,
        attachments: [
          ...files.map(file => ({
            filename: file.originalname,
            content: file.buffer.toString('base64'),
          })),
          ...(payload.data.photos ?? []).map(photo => ({
            filename: photo.filename,
            content: photo.content,
            contentType: photo.contentType,
          })),
        ],
      }),
    });

    if (!resendResponse.ok) {
      console.error('Resend send failed', resendResponse.status, await resendResponse.text());
      response.status(502).json({ error: 'Resend n’a pas accepté le message.' });
      return;
    }

    const result = await resendResponse.json() as { id?: string };
    response.status(202).json({ status: 'sent', id: result.id });
  } catch (error) {
    console.error('Resend send error', error);
    response.status(502).json({ error: 'Le service Resend est indisponible.' });
  }
});

app.listen(config.PORT, () => {
  console.log(`SHT Photo mail backend listening on port ${config.PORT}`);
});
