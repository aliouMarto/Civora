import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Bien } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventBusService } from '../events/event-bus.service';
import { createDomainEvent } from '../events/domain-event';
import { TenantContextService } from '../tenancy/tenant-context.service';

import { BiensRepository, type BienListFilters } from './repositories/biens.repository';
import {
  BienEventType,
  type BienArchivedPayload,
  type BienCreatedPayload,
  type BienStatutChangedPayload,
  type BienUpdatedPayload,
} from './events/bien-events';
import { ReverseGeocodingService } from './geocoding/reverse-geocoding.service';

import type { CreateBienDto } from './dto/create-bien.dto';
import type { UpdateBienDto } from './dto/update-bien.dto';
import type { ListBiensQueryDto } from './dto/list-biens.query.dto';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

const DEFAULT_LIMIT = 50;
const REFERENCE_MAX_RETRIES = 5;

@Injectable()
export class BiensService {
  private readonly logger = new Logger(BiensService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: BiensRepository,
    private readonly tenantCtx: TenantContextService,
    private readonly eventBus: EventBusService,
    private readonly audit: AuditService,
    private readonly geocoding: ReverseGeocodingService,
  ) {}

  // ─── Read ────────────────────────────────────────────────────────────────

  async list(query: ListBiensQueryDto): Promise<{ items: Bien[]; next_cursor: string | null }> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const filters: BienListFilters = {
      agence_id,
      cursor: query.cursor,
      limit: query.limit ?? DEFAULT_LIMIT,
      q: query.q,
      statut: query.statut,
      type: query.type,
      usage: query.usage,
      ville: query.ville,
      commune: query.commune,
      proprietaire_id: query.proprietaire_id,
      agent_responsable_id: query.agent_responsable_id,
      prix_vente_min: query.prix_vente_min,
      prix_vente_max: query.prix_vente_max,
      loyer_min: query.loyer_min,
      loyer_max: query.loyer_max,
      surface_min: query.surface_min,
      surface_max: query.surface_max,
      chambres_min: query.chambres_min,
      amenities: query.amenities,
      tags: query.tags,
      score_min: query.score_min,
      score_max: query.score_max,
      include_archived: query.include_archived ?? false,
      sort: query.sort ?? 'created_desc',
    };
    const { items, nextCursor } = await this.repo.list(filters);
    return { items, next_cursor: nextCursor };
  }

  async getByIdOrThrow(id: string): Promise<Bien> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const bien = await this.repo.findById(id);
    if (!bien || bien.agence_id !== agence_id) {
      throw new NotFoundException(`Bien ${id} introuvable`);
    }
    return bien;
  }

  async getFiche360(id: string) {
    const agence_id = this.tenantCtx.requireAgenceId();
    const bien = await this.repo.findByIdWithRelations(id);
    if (!bien || bien.agence_id !== agence_id) {
      throw new NotFoundException(`Bien ${id} introuvable`);
    }
    return bien;
  }

  // ─── Write ───────────────────────────────────────────────────────────────

  async create(dto: CreateBienDto, user: JwtPayload): Promise<Bien> {
    const agence_id = this.tenantCtx.requireAgenceId();

    this.validateBusinessRules(dto);

    // Reverse-geocoding : si lat/lng fournis mais commune/ville absentes,
    // on enrichit via Mapbox. Best-effort (n'échoue pas la création si
    // Mapbox est down ou absent).
    let commune = dto.commune;
    let ville = dto.ville;
    if (dto.latitude !== undefined && dto.longitude !== undefined && (!commune || !ville)) {
      const geocoded = await this.geocoding.reverse(dto.latitude, dto.longitude);
      commune = commune ?? geocoded.commune ?? undefined;
      // ville reste obligatoire dans le DTO — si l'utilisateur l'a déjà
      // fournie, on respecte sa valeur. Sinon on prend celle de Mapbox.
      if (geocoded.ville) {
        ville = ville && ville.trim().length > 0 ? ville : geocoded.ville;
      }
    }

    const reference = dto.reference
      ? await this.assertReferenceFree(agence_id, dto.reference)
      : await this.generateReference(agence_id);

    let created: Bien | null = null;
    let attempts = 0;
    while (!created && attempts < REFERENCE_MAX_RETRIES) {
      attempts++;
      try {
        created = await this.prisma.withTenant(agence_id, (tx) =>
          tx.bien.create({
            data: {
              agence_id,
              reference,
              nom: dto.nom.trim(),
              description: dto.description ?? null,
              type: dto.type,
              usage: dto.usage ?? 'location_longue_duree',
              statut: dto.statut ?? 'disponible',
              statut_source: 'manuel',
              surface: dto.surface ?? null,
              pieces: dto.pieces ?? null,
              chambres: dto.chambres ?? null,
              salles_bain: dto.salles_bain ?? null,
              etage: dto.etage ?? null,
              annee_construction: dto.annee_construction ?? null,
              amenities: dto.amenities ?? [],
              adresse_ligne1: dto.adresse_ligne1.trim(),
              adresse_ligne2: dto.adresse_ligne2 ?? null,
              ville: (ville ?? dto.ville).trim(),
              commune: commune ?? null,
              pays: dto.pays ?? 'CI',
              latitude: dto.latitude ?? null,
              longitude: dto.longitude ?? null,
              prix_vente_xof: dto.prix_vente_xof ?? null,
              loyer_mensuel_xof: dto.loyer_mensuel_xof ?? null,
              charges_xof: dto.charges_xof ?? null,
              caution_xof: dto.caution_xof ?? null,
              proprietaire_id: dto.proprietaire_id ?? null,
              agent_responsable_id: dto.agent_responsable_id ?? null,
              entite_id: dto.entite_id ?? null,
              tags: dto.tags ?? [],
              created_by: user.sub,
            },
          }),
        );
      } catch (err) {
        // Collision sur (agence_id, reference) → regénère et retry
        if (this.isUniqueRefConflict(err)) {
          // eslint-disable-next-line no-await-in-loop
          const next = await this.generateReference(agence_id);
          this.logger.warn(`Collision référence — retry ${attempts}/${REFERENCE_MAX_RETRIES}, nouvelle ref = ${next}`);
          continue;
        }
        throw err;
      }
    }
    if (!created) {
      throw new ConflictException(`Impossible de générer une référence unique après ${REFERENCE_MAX_RETRIES} tentatives`);
    }

    await this.emitEvent(BienEventType.Created, {
      bien_id: created.id,
      agence_id,
      actor_id: user.sub,
      reference: created.reference,
      type: created.type,
      usage: created.usage,
      statut: created.statut,
      ville: created.ville,
      commune: created.commune,
    } satisfies BienCreatedPayload, created.id);

    return created;
  }

  async update(id: string, dto: UpdateBienDto, user: JwtPayload): Promise<Bien> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const before = await this.getByIdOrThrow(id);

    // reference + agence_id ne sont JAMAIS modifiables
    if ('reference' in dto && dto.reference && dto.reference !== before.reference) {
      throw new BadRequestException('La référence est immuable après création');
    }

    // Valider règles métier sur le merge before+dto
    const usage = dto.usage ?? before.usage;
    const prix = dto.prix_vente_xof ?? before.prix_vente_xof;
    const loyer = dto.loyer_mensuel_xof ?? before.loyer_mensuel_xof;
    if ((usage === 'vente' || usage === 'mixte') && prix === null) {
      throw new BadRequestException('prix_vente_xof requis pour usage vente/mixte');
    }
    if ((usage === 'location_longue_duree' || usage === 'mixte') && loyer === null) {
      throw new BadRequestException('loyer_mensuel_xof requis pour usage location/mixte');
    }

    const data: Record<string, unknown> = {};
    const changes: BienUpdatedPayload['changes'] = {};
    let statutChange: { from: Bien['statut']; to: Bien['statut'] } | null = null;

    const set = <K extends keyof Bien>(key: K, val: Bien[K] | undefined): void => {
      if (val === undefined) return;
      if (before[key] === val) return;
      data[key as string] = val;
      changes[key as string] = {
        before: this.serializeAuditValue(before[key]),
        after: this.serializeAuditValue(val),
      };
    };

    if (dto.nom !== undefined) set('nom', dto.nom.trim() as Bien['nom']);
    if (dto.description !== undefined) set('description', (dto.description ?? null) as Bien['description']);
    if (dto.type !== undefined) set('type', dto.type as Bien['type']);
    if (dto.usage !== undefined) set('usage', dto.usage as Bien['usage']);
    if (dto.statut !== undefined) {
      if (before.statut !== dto.statut) {
        statutChange = { from: before.statut, to: dto.statut };
      }
      set('statut', dto.statut as Bien['statut']);
    }
    if (dto.surface !== undefined) set('surface', dto.surface as unknown as Bien['surface']);
    if (dto.pieces !== undefined) set('pieces', dto.pieces ?? null);
    if (dto.chambres !== undefined) set('chambres', dto.chambres ?? null);
    if (dto.salles_bain !== undefined) set('salles_bain', dto.salles_bain ?? null);
    if (dto.etage !== undefined) set('etage', dto.etage ?? null);
    if (dto.annee_construction !== undefined) set('annee_construction', dto.annee_construction ?? null);
    if (dto.amenities !== undefined) set('amenities', dto.amenities as Bien['amenities']);

    if (dto.adresse_ligne1 !== undefined) set('adresse_ligne1', dto.adresse_ligne1.trim() as Bien['adresse_ligne1']);
    if (dto.adresse_ligne2 !== undefined) set('adresse_ligne2', (dto.adresse_ligne2 ?? null) as Bien['adresse_ligne2']);
    if (dto.ville !== undefined) set('ville', dto.ville.trim() as Bien['ville']);
    if (dto.commune !== undefined) set('commune', (dto.commune ?? null) as Bien['commune']);
    if (dto.pays !== undefined) set('pays', dto.pays);
    if (dto.latitude !== undefined) set('latitude', dto.latitude as unknown as Bien['latitude']);
    if (dto.longitude !== undefined) set('longitude', dto.longitude as unknown as Bien['longitude']);

    if (dto.prix_vente_xof !== undefined) set('prix_vente_xof', dto.prix_vente_xof);
    if (dto.loyer_mensuel_xof !== undefined) set('loyer_mensuel_xof', dto.loyer_mensuel_xof);
    if (dto.charges_xof !== undefined) set('charges_xof', dto.charges_xof);
    if (dto.caution_xof !== undefined) set('caution_xof', dto.caution_xof);

    if (dto.proprietaire_id !== undefined) set('proprietaire_id', (dto.proprietaire_id ?? null) as Bien['proprietaire_id']);
    if (dto.agent_responsable_id !== undefined) set('agent_responsable_id', (dto.agent_responsable_id ?? null) as Bien['agent_responsable_id']);
    if (dto.entite_id !== undefined) set('entite_id', (dto.entite_id ?? null) as Bien['entite_id']);
    if (dto.tags !== undefined) set('tags', dto.tags as Bien['tags']);

    if (Object.keys(data).length === 0) return before;

    const result = await this.repo.update(id, agence_id, data);
    if (result.count === 0) {
      throw new NotFoundException(`Bien ${id} introuvable ou archivé`);
    }
    const updated = await this.repo.findById(id);
    if (!updated) throw new NotFoundException(`Bien ${id} disparu après update`);

    await this.emitEvent(BienEventType.Updated, {
      bien_id: id,
      agence_id,
      actor_id: user.sub,
      changes,
    } satisfies BienUpdatedPayload, id);

    if (statutChange) {
      await this.emitEvent(BienEventType.StatutChanged, {
        bien_id: id,
        agence_id,
        actor_id: user.sub,
        statut_before: statutChange.from,
        statut_after: statutChange.to,
        source: 'manuel',
      } satisfies BienStatutChangedPayload, id);
    }

    return updated;
  }

  async archive(id: string, user: JwtPayload): Promise<void> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const before = await this.getByIdOrThrow(id);
    if (before.archived_at) return; // idempotent
    const result = await this.repo.archive(id, agence_id);
    if (result.count === 0) {
      throw new NotFoundException(`Bien ${id} introuvable`);
    }
    await this.emitEvent(BienEventType.Archived, {
      bien_id: id,
      agence_id,
      actor_id: user.sub,
      archived_at: new Date().toISOString(),
    } satisfies BienArchivedPayload, id);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Génération de référence : BIE-YYYY-NNNN, séquentielle par agence.
   *
   * Race condition possible si deux créations simultanées : on encadre par
   * un retry dans `create()` qui régénère sur conflit @@unique.
   */
  private async generateReference(agence_id: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.repo.countByAgence(agence_id, year);
    const seq = count + 1;
    return `BIE-${year}-${String(seq).padStart(4, '0')}`;
  }

  private async assertReferenceFree(agence_id: string, reference: string): Promise<string> {
    const existing = await this.prisma.bien.findUnique({
      where: { agence_id_reference: { agence_id, reference } },
    });
    if (existing) {
      throw new ConflictException(`La référence ${reference} est déjà utilisée dans cette agence`);
    }
    return reference;
  }

  private validateBusinessRules(dto: CreateBienDto): void {
    const usage = dto.usage ?? 'location_longue_duree';
    if ((usage === 'vente' || usage === 'mixte') && dto.prix_vente_xof === undefined) {
      throw new BadRequestException('prix_vente_xof est requis quand usage in [vente, mixte]');
    }
    if (
      (usage === 'location_longue_duree' || usage === 'mixte') &&
      dto.loyer_mensuel_xof === undefined
    ) {
      throw new BadRequestException('loyer_mensuel_xof est requis quand usage in [location_longue_duree, mixte]');
    }
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
      throw new BadRequestException('latitude et longitude doivent être fournies ensemble');
    }
  }

  private isUniqueRefConflict(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    );
  }

  /** Sérialise BigInt en string pour l'audit (JSON-safe). */
  private serializeAuditValue(v: unknown): unknown {
    if (typeof v === 'bigint') return v.toString();
    if (Array.isArray(v)) return v.map((x) => this.serializeAuditValue(x));
    return v;
  }

  private async emitEvent(type: string, payload: unknown, aggregate_id: string): Promise<void> {
    const event = createDomainEvent({
      agence_id: this.tenantCtx.getAgenceId(),
      type,
      aggregate_type: 'Bien',
      aggregate_id,
      payload: JSON.parse(
        JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
      ),
      metadata: {
        actor_id: null,
        correlation_id: randomUUID(),
        causation_id: null,
        ip: null,
        user_agent: null,
      },
    });
    await this.eventBus.emitInTx(event);
  }
}
