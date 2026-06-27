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
  BienDto,
  BienFeatureCollection,
  BienHistoriqueDto,
  BienPhotoDto,
  BienPortefeuilleStat,
  BienRepartitionStat,
  BienScoreBreakdown,
  BienSort,
  BienStatut,
  BienType,
  BienUsage,
  CreateBienInput,
  InsightDto,
  ReorderPhotosInput,
  UpdateBienInput,
} from '@civora/shared-types';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface BiensListResponse {
  items: BienDto[];
  next_cursor: string | null;
}

export interface BiensFiltersInput {
  q?: string;
  statut?: BienStatut[];
  type?: BienType[];
  usage?: BienUsage[];
  ville?: string[];
  commune?: string[];
  proprietaire_id?: string;
  agent_responsable_id?: string;
  prix_vente_min?: string;
  prix_vente_max?: string;
  loyer_min?: string;
  loyer_max?: string;
  surface_min?: number;
  surface_max?: number;
  chambres_min?: number;
  amenities?: string[];
  tags?: string[];
  score_min?: number;
  score_max?: number;
  include_archived?: boolean;
  sort?: BienSort;
  limit?: number;
}

export interface SpatialSearchBody {
  mode: 'radius' | 'bbox' | 'polygon';
  center?: { lat: number; lng: number };
  radius_meters?: number;
  bbox?: [number, number, number, number];
  polygon?: Array<[number, number]>;
  filters?: { statut?: BienStatut[]; type?: BienType[]; usage?: BienUsage[] };
}

// ─── Clés de cache ─────────────────────────────────────────────────────────

export const biensKeys = {
  all: ['biens'] as const,
  lists: () => [...biensKeys.all, 'list'] as const,
  list: (f: BiensFiltersInput) => [...biensKeys.lists(), f] as const,
  detail: (id: string) => [...biensKeys.all, 'detail', id] as const,
  photos: (id: string) => [...biensKeys.all, 'photos', id] as const,
  historique: (id: string) => [...biensKeys.all, 'historique', id] as const,
  scoreExplanation: (id: string) => [...biensKeys.all, 'score-explanation', id] as const,
  stats: {
    repartition: () => [...biensKeys.all, 'stats', 'repartition'] as const,
    portefeuille: () => [...biensKeys.all, 'stats', 'portefeuille'] as const,
    communes: () => [...biensKeys.all, 'communes'] as const,
  },
  insights: (params: Record<string, unknown>) => [...biensKeys.all, 'insights', params] as const,
};

// ─── Query-string builder ──────────────────────────────────────────────────

function toQuery(f: BiensFiltersInput & { cursor?: string }): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.statut?.length) p.set('statut', f.statut.join(','));
  if (f.type?.length) p.set('type', f.type.join(','));
  if (f.usage?.length) p.set('usage', f.usage.join(','));
  if (f.ville?.length) p.set('ville', f.ville.join(','));
  if (f.commune?.length) p.set('commune', f.commune.join(','));
  if (f.proprietaire_id) p.set('proprietaire_id', f.proprietaire_id);
  if (f.agent_responsable_id) p.set('agent_responsable_id', f.agent_responsable_id);
  if (f.prix_vente_min) p.set('prix_vente_min', f.prix_vente_min);
  if (f.prix_vente_max) p.set('prix_vente_max', f.prix_vente_max);
  if (f.loyer_min) p.set('loyer_min', f.loyer_min);
  if (f.loyer_max) p.set('loyer_max', f.loyer_max);
  if (f.surface_min !== undefined) p.set('surface_min', String(f.surface_min));
  if (f.surface_max !== undefined) p.set('surface_max', String(f.surface_max));
  if (f.chambres_min !== undefined) p.set('chambres_min', String(f.chambres_min));
  if (f.amenities?.length) p.set('amenities', f.amenities.join(','));
  if (f.tags?.length) p.set('tags', f.tags.join(','));
  if (f.score_min !== undefined) p.set('score_min', String(f.score_min));
  if (f.score_max !== undefined) p.set('score_max', String(f.score_max));
  if (f.include_archived) p.set('include_archived', 'true');
  if (f.sort) p.set('sort', f.sort);
  if (f.limit) p.set('limit', String(f.limit));
  if (f.cursor) p.set('cursor', f.cursor);
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

// ─── Liste cursor ──────────────────────────────────────────────────────────

export function useBiens(
  filters: BiensFiltersInput,
): UseInfiniteQueryResult<{ pages: BiensListResponse[]; pageParams: (string | undefined)[] }> {
  return useInfiniteQuery({
    queryKey: biensKeys.list(filters),
    queryFn: ({ pageParam }) =>
      apiFetch<BiensListResponse>(`/biens${toQuery({ ...filters, cursor: pageParam as string | undefined })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

// ─── Détail ────────────────────────────────────────────────────────────────

export function useBien(id: string | null): UseQueryResult<BienDto & {
  photos: BienPhotoDto[];
  historique: BienHistoriqueDto[];
}> {
  return useQuery({
    queryKey: biensKeys.detail(id ?? '__none__'),
    queryFn: () =>
      apiFetch<BienDto & { photos: BienPhotoDto[]; historique: BienHistoriqueDto[] }>(`/biens/${id}`),
    enabled: Boolean(id),
  });
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export function useCreateBien(): UseMutationResult<BienDto, Error, CreateBienInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBienInput) =>
      apiFetch<BienDto>('/biens', {
        method: 'POST',
        body: JSON.stringify(serializeMoney(input)),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: biensKeys.lists() });
      void qc.invalidateQueries({ queryKey: biensKeys.stats.portefeuille() });
      void qc.invalidateQueries({ queryKey: biensKeys.stats.repartition() });
    },
  });
}

export function useUpdateBien(id: string): UseMutationResult<BienDto, Error, UpdateBienInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBienInput) =>
      apiFetch<BienDto>(`/biens/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(serializeMoney(input)),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: biensKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: biensKeys.lists() });
      void qc.invalidateQueries({ queryKey: biensKeys.scoreExplanation(id) });
    },
  });
}

export function useArchiveBien(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch<void>(`/biens/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: biensKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: biensKeys.lists() });
    },
  });
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export function usePortefeuilleStat(): UseQueryResult<BienPortefeuilleStat> {
  return useQuery({
    queryKey: biensKeys.stats.portefeuille(),
    queryFn: () => apiFetch<BienPortefeuilleStat>('/biens/stats/portefeuille'),
    staleTime: 60_000,
  });
}

export function useRepartitionStat(): UseQueryResult<BienRepartitionStat> {
  return useQuery({
    queryKey: biensKeys.stats.repartition(),
    queryFn: () => apiFetch<BienRepartitionStat>('/biens/stats/repartition'),
    staleTime: 60_000,
  });
}

// ─── Score ──────────────────────────────────────────────────────────────────

export function useScoreExplanation(id: string | null): UseQueryResult<BienScoreBreakdown> {
  return useQuery({
    queryKey: biensKeys.scoreExplanation(id ?? '__none__'),
    queryFn: () => apiFetch<BienScoreBreakdown>(`/biens/${id}/score-explanation`),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

// ─── Photos ─────────────────────────────────────────────────────────────────

export function useBienPhotos(id: string | null): UseQueryResult<BienPhotoDto[]> {
  return useQuery({
    queryKey: biensKeys.photos(id ?? '__none__'),
    queryFn: () => apiFetch<BienPhotoDto[]>(`/biens/${id}/photos`),
    enabled: Boolean(id),
  });
}

export function usePhotoUploadUrl(
  id: string,
): UseMutationResult<{ upload_url: string; storage_key: string; expires_at: string }, Error, {
  ext: string;
  contentType: string;
  sizeBytes?: number;
}> {
  return useMutation({
    mutationFn: (input) =>
      apiFetch<{ upload_url: string; storage_key: string; expires_at: string }>(
        `/biens/${id}/photos/upload-url`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
  });
}

export function useRegisterPhoto(id: string): UseMutationResult<
  BienPhotoDto,
  Error,
  { storage_key: string; caption?: string; ordre?: number }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiFetch<BienPhotoDto>(`/biens/${id}/photos`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: biensKeys.photos(id) });
      void qc.invalidateQueries({ queryKey: biensKeys.detail(id) });
    },
  });
}

export function useReorderPhotos(id: string): UseMutationResult<void, Error, ReorderPhotosInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiFetch<void>(`/biens/${id}/photos/reorder`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: biensKeys.photos(id) });
      void qc.invalidateQueries({ queryKey: biensKeys.detail(id) });
    },
  });
}

export function useDeletePhoto(id: string): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId) =>
      apiFetch<void>(`/biens/${id}/photos/${photoId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: biensKeys.photos(id) });
      void qc.invalidateQueries({ queryKey: biensKeys.detail(id) });
    },
  });
}

// ─── Spatial / Map ──────────────────────────────────────────────────────────

export function useSpatialSearch(): UseMutationResult<unknown, Error, SpatialSearchBody> {
  return useMutation({
    mutationFn: (body) =>
      apiFetch('/biens/spatial/search', { method: 'POST', body: JSON.stringify(body) }),
  });
}

export async function fetchMapGeojson(bbox: string): Promise<BienFeatureCollection> {
  return apiFetch<BienFeatureCollection>(`/biens/map?bbox=${encodeURIComponent(bbox)}`);
}

// ─── Insights ───────────────────────────────────────────────────────────────

export function useInsights(params: { module?: string; cible_id?: string; dismissed?: boolean; limit?: number } = {}): UseQueryResult<InsightDto[]> {
  const p = new URLSearchParams();
  if (params.module) p.set('module', params.module);
  if (params.cible_id) p.set('cible_id', params.cible_id);
  if (params.dismissed) p.set('dismissed', 'true');
  if (params.limit) p.set('limit', String(params.limit));
  const qs = p.toString();
  return useQuery({
    queryKey: biensKeys.insights(params),
    queryFn: () => apiFetch<InsightDto[]>(`/insights${qs ? `?${qs}` : ''}`),
    staleTime: 30_000,
  });
}

export function useDismissInsight(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch<void>(`/insights/${id}/dismiss`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: biensKeys.all });
    },
  });
}

export function useActedOnInsight(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch<void>(`/insights/${id}/acted-on`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: biensKeys.all });
    },
  });
}

// ─── Ask KURA Biens ─────────────────────────────────────────────────────────

export interface AskKuraBiensResponse {
  answer: string;
  biens: Array<{
    id: string; reference: string; nom: string; type: string; usage: string;
    statut: string; commune: string | null; ville: string;
    surface: string | null; chambres: number | null;
    loyer_mensuel_xof: string | null; prix_vente_xof: string | null;
    score_ia: number | null; similarity: number;
  }>;
  sources: Array<{ id: string; similarity: number }>;
  meta: { model: string; latency_ms: number; input_tokens: number; output_tokens: number; cost_cents: number };
}

export function useAskKuraBiens(): UseMutationResult<
  AskKuraBiensResponse,
  Error,
  { question: string; max_results?: number }
> {
  return useMutation({
    mutationFn: (input) =>
      apiFetch<AskKuraBiensResponse>('/biens/ask', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * BigInt n'est pas JSON.stringify-able. On convertit récursivement les bigints
 * du DTO en strings avant l'envoi réseau (le backend les re-parse).
 */
function serializeMoney<T>(input: T): T {
  return JSON.parse(
    JSON.stringify(input, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as T;
}
