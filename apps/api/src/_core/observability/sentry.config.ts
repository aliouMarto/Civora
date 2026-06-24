import * as Sentry from '@sentry/node';

const PII_FIELDS = new Set([
  'password',
  'mot_de_passe',
  'token',
  'refresh_token',
  'access_token',
  'authorization',
  'secret',
  'api_key',
  'credit_card',
  'cvv',
]);

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE_RE = /\+?[0-9]{8,15}/g;

function scrubObject(obj: unknown, depth = 0): unknown {
  if (depth > 8 || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => scrubObject(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (PII_FIELDS.has(k.toLowerCase())) {
      out[k] = '[SCRUBBED]';
    } else if (typeof v === 'string') {
      out[k] = v.replace(EMAIL_RE, '[email]').replace(PHONE_RE, '[phone]');
    } else {
      out[k] = scrubObject(v, depth + 1);
    }
  }
  return out;
}

export function initSentry(dsn: string | undefined, environment: string): void {
  if (!dsn) return; // Désactivé si pas de DSN (dev local)

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    beforeSend(event) {
      // Scrub PII dans les données de requête
      if (event.request) {
        if (event.request.data) {
          event.request.data = scrubObject(event.request.data);
        }
        if (event.request.headers) {
          const headers = event.request.headers as Record<string, string>;
          if (headers['authorization']) headers['authorization'] = '[SCRUBBED]';
          if (headers['cookie']) headers['cookie'] = '[SCRUBBED]';
        }
      }
      // Scrub dans les extra/contexts
      if (event.extra) {
        event.extra = scrubObject(event.extra) as Record<string, unknown>;
      }
      return event;
    },
  });
}

export { Sentry };
export { scrubObject };
