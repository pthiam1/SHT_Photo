export type OperationType = 'RECEPTION' | 'CONTENEUR';

export type PhotoItem = {
  uri: string;
  filename: string;
  capturedAt: string;
};

export type OperationStatus = 'BROUILLON' | 'EN_ATTENTE' | 'ENVOYE' | 'ECHEC';

export type Operation = {
  id: string;
  type: OperationType;
  reference: string;
  createdAt: string;
  photos: PhotoItem[];
  status: OperationStatus;
  senderEmail: string;
  recipientEmail: string;
  reserved: boolean;
  lastError?: string;
};

export type Screen = 'HOME' | 'FORM' | 'CAMERA' | 'REVIEW' | 'PREVIEW' | 'HISTORY' | 'DETAIL' | 'SETTINGS';
