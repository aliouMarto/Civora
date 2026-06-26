/**
 * Types des payloads par file BullMQ.
 * Convention : tout payload contient agence_id pour la propagation du contexte tenant.
 * Les workers rechargent les agrégats depuis la DB — le payload ne contient que les IDs nécessaires.
 */

export interface BaseJobPayload {
  agence_id: string | null;       // propagation tenant
  actor_id: string | null;        // utilisateur initiateur
  correlation_id: string;         // traçabilité
}

// ── pdf ──────────────────────────────────────────────────────────────────────
export interface PdfGeneratePayload extends BaseJobPayload {
  template: string;               // nom du template Gotenberg
  data: Record<string, unknown>;
  output_path: string;
}

export type PdfJobPayload = PdfGeneratePayload;

// ── ocr ──────────────────────────────────────────────────────────────────────
export interface OcrExtractPayload extends BaseJobPayload {
  document_id: string;
  storage_path: string;
}

export type OcrJobPayload = OcrExtractPayload;

// ── ai ───────────────────────────────────────────────────────────────────────
export interface AiAnalysePayload extends BaseJobPayload {
  document_id: string;
  prompt_key: string;
}

export type AiJobPayload = AiAnalysePayload;

// ── messaging ─────────────────────────────────────────────────────────────────
export interface MessagingSendEmailPayload extends BaseJobPayload {
  to: string[];
  template_key: string;
  template_vars: Record<string, unknown>;
}

export interface MessagingSendSmsPayload extends BaseJobPayload {
  to: string;
  message: string;
}

export type MessagingJobPayload = MessagingSendEmailPayload | MessagingSendSmsPayload;

// ── payments ──────────────────────────────────────────────────────────────────
export interface PaymentProcessPayload extends BaseJobPayload {
  paiement_id: string;
  montant_centimes: string;       // bigint sérialisé en string
  devise: string;
}

export type PaymentsJobPayload = PaymentProcessPayload;

// ── ota ───────────────────────────────────────────────────────────────────────
export interface OtaSyncPayload extends BaseJobPayload {
  bien_id: string;
  platform: 'airbnb' | 'booking' | 'expedia';
}

export type OtaJobPayload = OtaSyncPayload;

// ── reports ───────────────────────────────────────────────────────────────────
export interface ReportGeneratePayload extends BaseJobPayload {
  report_type: string;
  period_start: string;           // ISO date
  period_end: string;
  format: 'pdf' | 'xlsx';
}

export type ReportsJobPayload = ReportGeneratePayload;

// ── scheduled ─────────────────────────────────────────────────────────────────
export interface ScheduledTaskPayload extends BaseJobPayload {
  task_name: string;
  params: Record<string, unknown>;
}

export type ScheduledJobPayload = ScheduledTaskPayload;

// ── imports ──────────────────────────────────────────────────────────────────
export interface ImportContactsPayload extends BaseJobPayload {
  import_job_id: string;
  module: 'contacts';
  fichier_key: string;
  mapping: Record<string, string>;
  options: {
    skip_duplicates?: boolean;
    update_duplicates?: boolean;
    default_source?: string;
    default_roles?: string[];
  };
}
export type ImportsJobPayload = ImportContactsPayload;

// ── exports ──────────────────────────────────────────────────────────────────
export interface ExportContactsPayload extends BaseJobPayload {
  export_job_id: string;
  module: 'contacts';
  format: 'csv' | 'xlsx';
  filtres: Record<string, unknown>;
  columns?: string[];
}
export type ExportsJobPayload = ExportContactsPayload;

// ── demo (dev uniquement) ─────────────────────────────────────────────────────
export interface DemoPingPayload extends BaseJobPayload {
  message?: string;
}
