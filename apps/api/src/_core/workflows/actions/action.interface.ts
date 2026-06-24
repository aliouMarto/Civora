export type ActionKind = 'send-notification' | 'emit-event' | 'call-ai';

export interface SendNotificationActionConfig {
  kind: 'send-notification';
  channel: 'email' | 'sms' | 'whatsapp' | 'in-app';
  template: string;
  /** Mapping de vars : { nom: '{{payload.nom_locataire}}' } */
  vars: Record<string, string>;
  to_field?: string; // chemin dans le contexte pour résoudre l'adresse
}

export interface EmitEventActionConfig {
  kind: 'emit-event';
  event_type: string;
  payload_mapping: Record<string, string>; // { field: '{{context.field}}' }
}

export interface CallAiActionConfig {
  kind: 'call-ai';
  template: string;
  vars: Record<string, string>;
  output_field?: string; // où stocker le résultat dans le contexte
}

export type ActionConfig =
  | SendNotificationActionConfig
  | EmitEventActionConfig
  | CallAiActionConfig;

export interface ActionResult {
  kind: ActionKind;
  status: 'success' | 'failed' | 'skipped';
  output?: unknown;
  error?: string;
}
