import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Contact } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventBusService } from '../events/event-bus.service';
import { createDomainEvent } from '../events/domain-event';
import { TenantContextService } from '../tenancy/tenant-context.service';

import { ContactsRepository, type ContactListFilters } from './contacts.repository';
import { ContactsDedupService, type DuplicateMatch } from './contacts-dedup.service';
import { normalizeEmail } from './normalizers/email.normalizer';
import { tryNormalizePhone, normalizePhone } from './normalizers/phone.normalizer';
import {
  ContactEventType,
  type ContactCreatedPayload,
  type ContactUpdatedPayload,
  type ContactArchivedPayload,
  type ContactMergedPayload,
} from './events/contact-events';

import type { CreateContactDto } from './dto/create-contact.dto';
import type { UpdateContactDto } from './dto/update-contact.dto';
import type { MergeContactsDto } from './dto/merge-contacts.dto';
import type { ListContactsQueryDto } from './dto/list-contacts.query.dto';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

const DEFAULT_LIMIT = 50;

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ContactsRepository,
    private readonly dedup: ContactsDedupService,
    private readonly eventBus: EventBusService,
    private readonly tenantCtx: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  // ─── Read ──────────────────────────────────────────────────────────────────

  async list(query: ListContactsQueryDto): Promise<{
    items: Contact[];
    next_cursor: string | null;
  }> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const filters: ContactListFilters = {
      agence_id,
      cursor: query.cursor,
      limit: query.limit ?? DEFAULT_LIMIT,
      q: query.q,
      role: query.role,
      ville: query.ville,
      commune: query.commune,
      pays: query.pays,
      source: query.source,
      tags: query.tags,
      segments_ia: query.segments_ia,
      score_min: query.score_min,
      score_max: query.score_max,
      score_categorie: query.score_categorie,
      whatsapp_opt_in: query.whatsapp_opt_in,
      created_after: query.created_after,
      created_before: query.created_before,
      include_archived: query.include_archived ?? false,
      sort: query.sort ?? 'created_at_desc',
    };
    const { items, nextCursor } = await this.repo.list(filters);
    return { items, next_cursor: nextCursor };
  }

  async getByIdOrThrow(id: string): Promise<Contact> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const contact = await this.repo.findById(id);
    if (!contact || contact.agence_id !== agence_id) {
      throw new NotFoundException(`Contact ${id} introuvable`);
    }
    return contact;
  }

  async getFiche360(id: string) {
    const agence_id = this.tenantCtx.requireAgenceId();
    const contact = await this.repo.findByIdWithRelations(id);
    if (!contact || contact.agence_id !== agence_id) {
      throw new NotFoundException(`Contact ${id} introuvable`);
    }
    return contact;
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  async create(dto: CreateContactDto, user: JwtPayload): Promise<Contact> {
    const agence_id = this.tenantCtx.requireAgenceId();

    // Invariant : au moins un canal (email OU telephone)
    if (!dto.email && !dto.telephone) {
      throw new BadRequestException('email OU telephone est requis');
    }

    // Normalisation des canaux
    const email = normalizeEmail(dto.email);
    const telephone = dto.telephone ? normalizePhone(dto.telephone) : null;
    const whatsapp = dto.whatsapp ? normalizePhone(dto.whatsapp) : null;

    // Anti-doublon "dur"
    const conflict = await this.dedup.findHardConflict({
      agence_id,
      email: email ?? undefined,
      telephone: telephone ?? undefined,
    });
    if (conflict) {
      throw new ConflictException({
        message: 'Un contact avec ce même email/téléphone existe déjà dans cette agence',
        conflict: {
          id: conflict.id,
          nom: conflict.nom,
          prenom: conflict.prenom,
          email: conflict.email,
          telephone: conflict.telephone,
          archived: conflict.archived_at !== null,
          matched_on: conflict.matched_on,
        },
      });
    }

    const created = await this.prisma.withTenant(agence_id, (tx) =>
      tx.contact.create({
        data: {
          agence_id,
          nom: dto.nom.trim(),
          prenom: dto.prenom?.trim() ?? null,
          genre: dto.genre ?? null,
          langue: dto.langue ?? 'fr',
          email,
          telephone,
          whatsapp,
          whatsapp_opt_in: dto.whatsapp_opt_in ?? false,
          adresse_ligne1: dto.adresse_ligne1 ?? null,
          adresse_ligne2: dto.adresse_ligne2 ?? null,
          ville: dto.ville ?? null,
          commune: dto.commune ?? null,
          pays: dto.pays ?? 'CI',
          roles: dto.roles ?? [],
          source: dto.source ?? null,
          tags: dto.tags ?? [],
          created_by: user.sub,
        },
      }),
    );

    // Émettre l'événement dans une nouvelle transaction tenant-pinned
    await this.emitContactEvent(ContactEventType.Created, {
      contact_id: created.id,
      agence_id,
      actor_id: user.sub,
      roles: created.roles,
      source: created.source,
      email_present: Boolean(created.email),
      telephone_present: Boolean(created.telephone),
    } satisfies ContactCreatedPayload, created.id);

    return created;
  }

  async update(id: string, dto: UpdateContactDto, user: JwtPayload): Promise<Contact> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const before = await this.getByIdOrThrow(id);

    const data: Record<string, unknown> = {};
    const changes: ContactUpdatedPayload['changes'] = {};

    const setIfChanged = <K extends keyof Contact>(
      key: K,
      newValue: Contact[K] | undefined,
    ): void => {
      if (newValue === undefined) return;
      if (before[key] === newValue) return;
      data[key as string] = newValue;
      changes[key as string] = { before: before[key], after: newValue };
    };

    if (dto.nom !== undefined) setIfChanged('nom', dto.nom.trim() as Contact['nom']);
    if (dto.prenom !== undefined) setIfChanged('prenom', (dto.prenom?.trim() ?? null) as Contact['prenom']);
    if (dto.genre !== undefined) setIfChanged('genre', dto.genre as Contact['genre']);
    if (dto.langue !== undefined) setIfChanged('langue', dto.langue as Contact['langue']);

    if (dto.email !== undefined) {
      const normalized = normalizeEmail(dto.email);
      setIfChanged('email', normalized as Contact['email']);
    }
    if (dto.telephone !== undefined) {
      const normalized = dto.telephone ? normalizePhone(dto.telephone) : null;
      setIfChanged('telephone', normalized as Contact['telephone']);
    }
    if (dto.whatsapp !== undefined) {
      const normalized = dto.whatsapp ? normalizePhone(dto.whatsapp) : null;
      setIfChanged('whatsapp', normalized as Contact['whatsapp']);
    }
    if (dto.whatsapp_opt_in !== undefined) setIfChanged('whatsapp_opt_in', dto.whatsapp_opt_in);

    if (dto.adresse_ligne1 !== undefined) setIfChanged('adresse_ligne1', (dto.adresse_ligne1 ?? null) as Contact['adresse_ligne1']);
    if (dto.adresse_ligne2 !== undefined) setIfChanged('adresse_ligne2', (dto.adresse_ligne2 ?? null) as Contact['adresse_ligne2']);
    if (dto.ville !== undefined) setIfChanged('ville', (dto.ville ?? null) as Contact['ville']);
    if (dto.commune !== undefined) setIfChanged('commune', (dto.commune ?? null) as Contact['commune']);
    if (dto.pays !== undefined) setIfChanged('pays', dto.pays);
    if (dto.roles !== undefined) setIfChanged('roles', dto.roles as Contact['roles']);
    if (dto.source !== undefined) setIfChanged('source', (dto.source ?? null) as Contact['source']);
    if (dto.tags !== undefined) setIfChanged('tags', dto.tags as Contact['tags']);

    if (Object.keys(data).length === 0) return before;

    // Invariant : on garde au moins un canal après update
    const futureEmail = 'email' in data ? (data['email'] as string | null) : before.email;
    const futureTel = 'telephone' in data ? (data['telephone'] as string | null) : before.telephone;
    if (!futureEmail && !futureTel) {
      throw new BadRequestException('Au moins email OU telephone doit rester renseigné');
    }

    // Anti-doublon si email/téléphone modifiés
    if ('email' in data || 'telephone' in data) {
      const conflict = await this.dedup.findHardConflict({
        agence_id,
        email: futureEmail ?? undefined,
        telephone: futureTel ?? undefined,
        excludeId: id,
      });
      if (conflict) {
        throw new ConflictException({
          message: 'Un autre contact avec ce même email/téléphone existe déjà',
          conflict: { id: conflict.id, nom: conflict.nom, email: conflict.email, telephone: conflict.telephone },
        });
      }
    }

    const result = await this.repo.update(id, agence_id, data);
    if (result.count === 0) {
      throw new NotFoundException(`Contact ${id} introuvable ou non modifiable`);
    }

    const updated = await this.repo.findById(id);
    if (!updated) throw new NotFoundException(`Contact ${id} introuvable après update`);

    await this.emitContactEvent(ContactEventType.Updated, {
      contact_id: id,
      agence_id,
      actor_id: user.sub,
      changes,
    } satisfies ContactUpdatedPayload, id);

    return updated;
  }

  async archive(id: string, user: JwtPayload): Promise<void> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const before = await this.getByIdOrThrow(id);
    if (before.archived_at) {
      return; // déjà archivé : idempotent
    }
    const result = await this.repo.archive(id, agence_id);
    if (result.count === 0) {
      throw new NotFoundException(`Contact ${id} introuvable`);
    }

    await this.emitContactEvent(ContactEventType.Archived, {
      contact_id: id,
      agence_id,
      actor_id: user.sub,
      archived_at: new Date().toISOString(),
    } satisfies ContactArchivedPayload, id);
  }

  // ─── Merge ─────────────────────────────────────────────────────────────────

  async merge(dto: MergeContactsDto, user: JwtPayload): Promise<{
    master: Contact;
    interactions_moved: number;
    segments_moved: number;
  }> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const strategy = dto.strategy ?? 'keep_master';

    // Vérifications préalables
    const master = await this.getByIdOrThrow(dto.master_id);
    const sources = await Promise.all(
      dto.source_ids.map((id) => this.getByIdOrThrow(id)),
    );

    // Toutes les agences doivent matcher (la getByIdOrThrow le garantit déjà,
    // mais on refuse explicitement si master archivé)
    if (master.archived_at) {
      throw new BadRequestException('Le master ne doit pas être archivé');
    }
    for (const s of sources) {
      if (s.id === master.id) {
        throw new BadRequestException('master_id ne peut pas être dans source_ids');
      }
    }

    const result = await this.prisma.withTenant(agence_id, async (tx) => {
      // 1. Move interactions
      const interactionsMoved = await tx.interaction.updateMany({
        where: { agence_id, contact_id: { in: sources.map((s) => s.id) } },
        data: { contact_id: master.id },
      });

      // 2. Move segment memberships (dédupliqués via upsert sur PK composite)
      const sourceMemberships = await tx.segmentMembre.findMany({
        where: { contact_id: { in: sources.map((s) => s.id) } },
      });
      let segmentsMoved = 0;
      for (const m of sourceMemberships) {
        try {
          await tx.segmentMembre.create({
            data: { segment_id: m.segment_id, contact_id: master.id, added_at: m.added_at },
          });
          segmentsMoved++;
        } catch {
          // PK déjà présente (master déjà membre du segment) → skip
        }
      }
      // Supprimer les anciennes appartenances (cascade le fera aussi via delete contact)
      await tx.segmentMembre.deleteMany({
        where: { contact_id: { in: sources.map((s) => s.id) } },
      });

      // 3. Merger les champs selon la stratégie
      const mergedData = this.computeMergedFields(master, sources, strategy);
      const updatedMaster = await tx.contact.update({
        where: { id: master.id },
        data: mergedData,
      });

      // 4. Soft-delete des sources
      await tx.contact.updateMany({
        where: { id: { in: sources.map((s) => s.id) } },
        data: { archived_at: new Date() },
      });

      return {
        master: updatedMaster,
        interactions_moved: interactionsMoved.count,
        segments_moved: segmentsMoved,
      };
    });

    await this.emitContactEvent(ContactEventType.Merged, {
      master_id: master.id,
      source_ids: sources.map((s) => s.id),
      agence_id,
      actor_id: user.sub,
      strategy,
      interactions_moved: result.interactions_moved,
      segments_moved: result.segments_moved,
    } satisfies ContactMergedPayload, master.id);

    // Audit fin : avant/après dans audit_log
    await this.audit.log({
      action: 'contacts:merge',
      actorId: user.sub,
      entityType: 'Contact',
      entityId: master.id,
      before: {
        master: this.pickAuditable(master),
        sources: sources.map((s) => this.pickAuditable(s)),
      },
      after: {
        master: this.pickAuditable(result.master),
        archived_sources: sources.map((s) => s.id),
        strategy,
        interactions_moved: result.interactions_moved,
        segments_moved: result.segments_moved,
      },
    });

    return result;
  }

  // ─── Helpers privés ────────────────────────────────────────────────────────

  /**
   * Calcule les champs résultants du merge selon la stratégie.
   * - keep_master : conserve master sauf si master a NULL et source a une valeur
   * - prefer_source : prend la 1ère source qui a une valeur, sinon master
   * - most_recent : prend la version la plus récente (basé sur updated_at)
   *
   * Les champs "additifs" (roles, tags, segments_ia) sont TOUJOURS fusionnés
   * en union, peu importe la stratégie.
   */
  private computeMergedFields(
    master: Contact,
    sources: Contact[],
    strategy: 'keep_master' | 'prefer_source' | 'most_recent',
  ): Record<string, unknown> {
    type ScalarKey = 'prenom' | 'genre' | 'email' | 'telephone' | 'whatsapp'
      | 'adresse_ligne1' | 'adresse_ligne2' | 'ville' | 'commune' | 'pays'
      | 'source' | 'score_ia' | 'score_categorie';
    const scalarKeys: ScalarKey[] = [
      'prenom', 'genre', 'email', 'telephone', 'whatsapp',
      'adresse_ligne1', 'adresse_ligne2', 'ville', 'commune', 'pays',
      'source', 'score_ia', 'score_categorie',
    ];

    const data: Record<string, unknown> = {};

    for (const key of scalarKeys) {
      const masterVal = master[key];
      let chosen: unknown = masterVal;

      if (strategy === 'keep_master') {
        if (masterVal === null || masterVal === undefined) {
          const fromSource = sources.find((s) => s[key] !== null && s[key] !== undefined)?.[key];
          if (fromSource !== undefined) chosen = fromSource;
        }
      } else if (strategy === 'prefer_source') {
        const fromSource = sources.find((s) => s[key] !== null && s[key] !== undefined)?.[key];
        if (fromSource !== undefined) chosen = fromSource;
      } else if (strategy === 'most_recent') {
        const all = [master, ...sources]
          .filter((c) => c[key] !== null && c[key] !== undefined)
          .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
        if (all.length > 0) chosen = all[0]![key];
      }

      if (chosen !== masterVal) data[key] = chosen;
    }

    // Toujours fusionner additifs (union sans doublons)
    const allRoles = new Set([...master.roles, ...sources.flatMap((s) => s.roles)]);
    const allTags = new Set([...master.tags, ...sources.flatMap((s) => s.tags)]);
    const allSegments = new Set([...master.segments_ia, ...sources.flatMap((s) => s.segments_ia)]);

    if (allRoles.size !== master.roles.length) data['roles'] = [...allRoles];
    if (allTags.size !== master.tags.length) data['tags'] = [...allTags];
    if (allSegments.size !== master.segments_ia.length) data['segments_ia'] = [...allSegments];

    // whatsapp_opt_in : true gagne (consentement maximal)
    if (!master.whatsapp_opt_in && sources.some((s) => s.whatsapp_opt_in)) {
      data['whatsapp_opt_in'] = true;
    }

    return data;
  }

  private pickAuditable(c: Contact): Record<string, unknown> {
    return {
      id: c.id,
      nom: c.nom,
      prenom: c.prenom,
      email: c.email,
      telephone: c.telephone,
      roles: c.roles,
      ville: c.ville,
      score_ia: c.score_ia,
      archived_at: c.archived_at,
    };
  }

  private async emitContactEvent(
    type: string,
    payload: unknown,
    aggregate_id: string,
  ): Promise<void> {
    const event = createDomainEvent({
      agence_id: this.tenantCtx.getAgenceId(),
      type,
      aggregate_type: 'Contact',
      aggregate_id,
      payload,
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
