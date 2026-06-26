import { Injectable } from '@nestjs/common';
import { ContactsRepository, type DuplicateRow } from './contacts.repository';
import { normalizeEmail } from './normalizers/email.normalizer';
import { tryNormalizePhone } from './normalizers/phone.normalizer';

export interface CheckDuplicatesInput {
  agence_id: string;
  email?: string;
  telephone?: string;
  nom?: string;
  excludeId?: string;
}

export interface DuplicateMatch extends DuplicateRow {
  /** True si l'un des champs canal (email/telephone) matche exactement. */
  isHardConflict: boolean;
}

@Injectable()
export class ContactsDedupService {
  constructor(private readonly repo: ContactsRepository) {}

  /**
   * Détecte les doublons potentiels. La normalisation (email lowercase,
   * téléphone E.164) est appliquée avant la requête pour matcher les
   * lignes stockées sous forme normalisée.
   */
  async check(input: CheckDuplicatesInput): Promise<DuplicateMatch[]> {
    const email = normalizeEmail(input.email);
    const telephone = tryNormalizePhone(input.telephone);
    const nom = input.nom?.trim();

    if (!email && !telephone && !nom) return [];

    const rows = await this.repo.findDuplicates({
      agence_id: input.agence_id,
      email,
      telephone,
      nom,
      fuzzy: Boolean(nom),
      excludeId: input.excludeId,
    });

    return rows.map((r) => ({
      ...r,
      isHardConflict: r.matched_on.includes('email') || r.matched_on.includes('telephone'),
    }));
  }

  /**
   * Retourne le premier conflit "dur" (même email/téléphone), null sinon.
   * Utilisé à la création pour bloquer un doublon évident.
   */
  async findHardConflict(input: CheckDuplicatesInput): Promise<DuplicateMatch | null> {
    if (!input.email && !input.telephone) return null;
    const matches = await this.check({
      ...input,
      nom: undefined, // pas de fuzzy : on veut SEULEMENT les hard conflicts
    });
    return matches.find((m) => m.isHardConflict) ?? null;
  }
}
