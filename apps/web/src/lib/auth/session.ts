export const REFRESH_COOKIE = 'civora_refresh';
export const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

export interface TokenPayload {
  sub: string;
  email: string;
  nom: string;
  prenom: string;
  role: string;
  agence_id: string;
  agence_nom: string;
  permissions: string[];
}

export function decodeAccessToken(token: string): TokenPayload | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}
