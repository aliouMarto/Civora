import { PartialType } from '@nestjs/mapped-types';
import { CreateBienDto } from './create-bien.dto';

/**
 * Update : tous les champs deviennent optionnels.
 *
 * agence_id et reference NE peuvent PAS être modifiés. Cette protection est
 * appliquée côté service (la modification de reference casserait l'historique
 * documentaire chez l'agence).
 */
export class UpdateBienDto extends PartialType(CreateBienDto) {}
