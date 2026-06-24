import type { StorageKind } from './object-key';

export interface KindPolicy {
  allowedContentTypes: string[];     // ex: ['image/jpeg', 'image/png', 'image/webp']
  maxSizeBytes: number;
}

/**
 * Politique de validation par kind.
 * Les contentType utilisent le préfixe glob (ex: 'image/*' → accepte tout image/).
 */
export const STORAGE_POLICIES: Record<StorageKind, KindPolicy> = {
  photo_bien: {
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxSizeBytes: 10 * 1024 * 1024,       // 10 Mo
  },
  document_bien: {
    allowedContentTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    maxSizeBytes: 20 * 1024 * 1024,       // 20 Mo
  },
  bail: {
    allowedContentTypes: ['application/pdf'],
    maxSizeBytes: 20 * 1024 * 1024,       // 20 Mo
  },
  quittance: {
    allowedContentTypes: ['application/pdf'],
    maxSizeBytes: 5 * 1024 * 1024,        // 5 Mo
  },
  releve: {
    allowedContentTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    maxSizeBytes: 10 * 1024 * 1024,       // 10 Mo
  },
  piece_identite: {
    allowedContentTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    maxSizeBytes: 5 * 1024 * 1024,        // 5 Mo
  },
  contrat: {
    allowedContentTypes: ['application/pdf'],
    maxSizeBytes: 20 * 1024 * 1024,       // 20 Mo
  },
  rapport: {
    allowedContentTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    maxSizeBytes: 50 * 1024 * 1024,       // 50 Mo
  },
  temp: {
    allowedContentTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 20 * 1024 * 1024,       // 20 Mo
  },
};

export function validateContentType(kind: StorageKind, contentType: string): boolean {
  const policy = STORAGE_POLICIES[kind];
  return policy.allowedContentTypes.includes(contentType);
}

export function validateFileSize(kind: StorageKind, sizeBytes: number): boolean {
  return sizeBytes <= STORAGE_POLICIES[kind].maxSizeBytes;
}
