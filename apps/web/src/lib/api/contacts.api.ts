'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiFetch } from '@/lib/auth/api-client';
import type {
  ContactDto,
  ContactRole,
  ContactScoreCategorie,
  ContactSource,
  CreateContactInput,
  DuplicateCandidate,
  InteractionDto,
  SegmentDto,
  SegmentFiltres,
  UpdateContactInput,
} from '@civora/shared-types';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ContactListItem extends ContactDto {}

export interface ContactListResponse {
  items: ContactListItem[];
  next_cursor: string | null;
}

export interface ContactFiltersInput {
  q?: string;
  role?: ContactRole[];
  ville?: string;
  commune?: string;
  source?: ContactSource;
  tags?: string[];
  segments_ia?: string[];
  score_min?: number;
  score_max?: number;
  score_categorie?: ContactScoreCategorie;
  whatsapp_opt_in?: boolean;
  include_archived?: boolean;
  sort?: 'created_at_desc' | 'nom_asc' | 'score_desc' | 'derniere_interaction_desc';
  limit?: number;
}

export interface CheckDuplicatesResponse {
  matches: Array<DuplicateCandidate & {
    id: string;
    nom: string;
    prenom: string | null;
    email: string | null;
    telephone: string | null;
    archived: boolean;
    isHardConflict?: boolean;
  }>;
}

export interface InteractionListResponse {
  items: InteractionDto[];
  total: number;
  page: number;
  limit: number;
}

export interface ScoreExplanationResponse {
  contact_id: string;
  score: number;
  category: ContactScoreCategorie;
  confidence: 'low' | 'medium' | 'high';
  factors: Array<{ code: string; label: string; contribution: number; category: string }>;
  computed_at: string;
  formula_doc: string;
  note?: string;
}

export interface AskKuraResponse {
  answer: string;
  contacts: Array<{
    id: string;
    nom: string;
    prenom: string | null;
    ville: string | null;
    commune: string | null;
    roles: string[];
    segments_ia: string[];
    score_ia: number | null;
    score_categorie: string | null;
    similarity: number;
  }>;
  sources: Array<{ id: string; similarity: number }>;
  meta: {
    model: string;
    latency_ms: number;
    input_tokens: number;
    output_tokens: number;
    cost_cents: number;
  };
}

// ─── Clés de cache ─────────────────────────────────────────────────────────

export const contactsKeys = {
  all: ['contacts'] as const,
  lists: () => [...contactsKeys.all, 'list'] as const,
  list: (filters: ContactFiltersInput) => [...contactsKeys.lists(), filters] as const,
  detail: (id: string) => [...contactsKeys.all, 'detail', id] as const,
  interactions: (id: string) => [...contactsKeys.all, 'interactions', id] as const,
  scoreExplanation: (id: string) => [...contactsKeys.all, 'score-explanation', id] as const,
  segments: () => ['segments'] as const,
  segmentMembers: (id: string) => ['segments', id, 'members'] as const,
};

// ─── Sérialisation des filtres → query string ──────────────────────────────

function toQuery(filters: ContactFiltersInput & { cursor?: string }): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.role && filters.role.length > 0) params.set('role', filters.role.join(','));
  if (filters.ville) params.set('ville', filters.ville);
  if (filters.commune) params.set('commune', filters.commune);
  if (filters.source) params.set('source', filters.source);
  if (filters.tags && filters.tags.length > 0) params.set('tags', filters.tags.join(','));
  if (filters.segments_ia && filters.segments_ia.length > 0)
    params.set('segments_ia', filters.segments_ia.join(','));
  if (filters.score_min !== undefined) params.set('score_min', String(filters.score_min));
  if (filters.score_max !== undefined) params.set('score_max', String(filters.score_max));
  if (filters.score_categorie) params.set('score_categorie', filters.score_categorie);
  if (filters.whatsapp_opt_in !== undefined)
    params.set('whatsapp_opt_in', String(filters.whatsapp_opt_in));
  if (filters.include_archived) params.set('include_archived', 'true');
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.cursor) params.set('cursor', filters.cursor);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ─── Liste paginée curseur ─────────────────────────────────────────────────

export function useContacts(
  filters: ContactFiltersInput,
): UseInfiniteQueryResult<{ pages: ContactListResponse[]; pageParams: (string | undefined)[] }> {
  return useInfiniteQuery({
    queryKey: contactsKeys.list(filters),
    queryFn: ({ pageParam }) =>
      apiFetch<ContactListResponse>(
        `/contacts${toQuery({ ...filters, cursor: pageParam as string | undefined })}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

// ─── Fiche 360° ────────────────────────────────────────────────────────────

export function useContact(id: string | null): UseQueryResult<ContactDto & { interactions: InteractionDto[]; segments_membre: Array<{ segment: SegmentDto }> }> {
  return useQuery({
    queryKey: contactsKeys.detail(id ?? '__none__'),
    queryFn: () =>
      apiFetch<ContactDto & { interactions: InteractionDto[]; segments_membre: Array<{ segment: SegmentDto }> }>(`/contacts/${id}`),
    enabled: Boolean(id),
  });
}

// ─── Score explanation ─────────────────────────────────────────────────────

export function useScoreExplanation(id: string | null): UseQueryResult<ScoreExplanationResponse> {
  return useQuery({
    queryKey: contactsKeys.scoreExplanation(id ?? '__none__'),
    queryFn: () => apiFetch<ScoreExplanationResponse>(`/contacts/${id}/score-explanation`),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

// ─── Interactions ──────────────────────────────────────────────────────────

export function useInteractions(
  id: string | null,
  page = 1,
  limit = 20,
): UseQueryResult<InteractionListResponse> {
  return useQuery({
    queryKey: [...contactsKeys.interactions(id ?? '__none__'), page, limit],
    queryFn: () =>
      apiFetch<InteractionListResponse>(`/contacts/${id}/interactions?page=${page}&limit=${limit}`),
    enabled: Boolean(id),
  });
}

// ─── Création ──────────────────────────────────────────────────────────────

export function useCreateContact(): UseMutationResult<ContactDto, Error, CreateContactInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContactInput) =>
      apiFetch<ContactDto>('/contacts', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contactsKeys.lists() });
    },
  });
}

// ─── Update ────────────────────────────────────────────────────────────────

export function useUpdateContact(id: string): UseMutationResult<ContactDto, Error, UpdateContactInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateContactInput) =>
      apiFetch<ContactDto>(`/contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contactsKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: contactsKeys.scoreExplanation(id) });
      void qc.invalidateQueries({ queryKey: contactsKeys.lists() });
    },
  });
}

// ─── Archive (soft delete) ─────────────────────────────────────────────────

export function useArchiveContact(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/contacts/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: contactsKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: contactsKeys.lists() });
    },
  });
}

// ─── Check duplicates ──────────────────────────────────────────────────────

export function useCheckDuplicates(): UseMutationResult<
  CheckDuplicatesResponse,
  Error,
  { email?: string; telephone?: string; nom?: string }
> {
  return useMutation({
    mutationFn: (input) =>
      apiFetch<CheckDuplicatesResponse>('/contacts/check-duplicates', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

// ─── Merge ─────────────────────────────────────────────────────────────────

export function useMergeContacts(): UseMutationResult<
  { master: ContactDto; interactions_moved: number; segments_moved: number },
  Error,
  { master_id: string; source_ids: string[]; strategy?: 'keep_master' | 'prefer_source' | 'most_recent' }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiFetch<{ master: ContactDto; interactions_moved: number; segments_moved: number }>(
        '/contacts/merge',
        { method: 'POST', body: JSON.stringify(input) },
      ),
    onSuccess: (_, input) => {
      void qc.invalidateQueries({ queryKey: contactsKeys.detail(input.master_id) });
      void qc.invalidateQueries({ queryKey: contactsKeys.lists() });
      for (const id of input.source_ids) {
        void qc.invalidateQueries({ queryKey: contactsKeys.detail(id) });
      }
    },
  });
}

// ─── Add interaction ───────────────────────────────────────────────────────

export function useAddInteraction(contactId: string): UseMutationResult<
  { id: string; occurred_at: string },
  Error,
  {
    type: 'email' | 'whatsapp' | 'sms' | 'appel' | 'visite' | 'note';
    direction?: 'sortant' | 'entrant';
    sujet?: string;
    contenu?: string;
    occurred_at?: Date;
  }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiFetch<{ id: string; occurred_at: string }>(`/contacts/${contactId}/interactions`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contactsKeys.interactions(contactId) });
      void qc.invalidateQueries({ queryKey: contactsKeys.detail(contactId) });
      void qc.invalidateQueries({ queryKey: contactsKeys.scoreExplanation(contactId) });
    },
  });
}

// ─── Segments ──────────────────────────────────────────────────────────────

export function useSegments(): UseQueryResult<SegmentDto[]> {
  return useQuery({
    queryKey: contactsKeys.segments(),
    queryFn: () => apiFetch<SegmentDto[]>('/segments'),
  });
}

export function useCreateSegment(): UseMutationResult<
  SegmentDto,
  Error,
  { nom: string; description?: string; filtres: SegmentFiltres }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiFetch<SegmentDto>('/segments', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contactsKeys.segments() });
    },
  });
}

export function useDeleteSegment(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch<void>(`/segments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contactsKeys.segments() });
    },
  });
}

// ─── Import / Export ───────────────────────────────────────────────────────

export interface ImportUploadResponse {
  upload_url: string;
  file_key: string;
  expires_at: string;
}

export interface ImportPreviewResponse {
  headers: string[];
  suggested_mapping: Record<string, string>;
  preview_rows: Array<{ row: number; data: Record<string, unknown>; errors: string[] }>;
  total_rows_estimated: number;
}

export interface ImportJobStatus {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  total_rows: number;
  processed: number;
  imported: number;
  skipped: number;
  errors: number;
  errors_file_key: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export function useCreateImportUpload(): UseMutationResult<
  ImportUploadResponse,
  Error,
  { ext: string; contentType: string; sizeBytes?: number }
> {
  return useMutation({
    mutationFn: (input) =>
      apiFetch<ImportUploadResponse>('/contacts/import/upload', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

export function useImportPreview(): UseMutationResult<
  ImportPreviewResponse,
  Error,
  { file_key: string; mapping?: Record<string, string>; options?: Record<string, unknown> }
> {
  return useMutation({
    mutationFn: (input) =>
      apiFetch<ImportPreviewResponse>('/contacts/import/preview', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

export function useImportExecute(): UseMutationResult<
  { import_job_id: string },
  Error,
  { file_key: string; mapping: Record<string, string>; options?: Record<string, unknown> }
> {
  return useMutation({
    mutationFn: (input) =>
      apiFetch<{ import_job_id: string }>('/contacts/import/execute', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

export function useImportStatus(id: string | null): UseQueryResult<ImportJobStatus> {
  return useQuery({
    queryKey: ['contacts', 'import', id ?? '__none__'],
    queryFn: () => apiFetch<ImportJobStatus>(`/contacts/import/${id}`),
    enabled: Boolean(id),
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return 2_000;
      return d.status === 'queued' || d.status === 'running' ? 2_000 : false;
    },
  });
}

export function useImportErrorsUrl(): UseMutationResult<{ url: string; expires_at: string }, Error, string> {
  return useMutation({
    mutationFn: (id) =>
      apiFetch<{ url: string; expires_at: string }>(`/contacts/import/${id}/errors`),
  });
}

// ─── Ask KURA ──────────────────────────────────────────────────────────────

export function useAskKura(): UseMutationResult<AskKuraResponse, Error, { question: string; max_results?: number }> {
  return useMutation({
    mutationFn: (input) =>
      apiFetch<AskKuraResponse>('/contacts/ask', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}
