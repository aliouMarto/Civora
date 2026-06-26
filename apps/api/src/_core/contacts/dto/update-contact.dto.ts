import { PartialType } from '@nestjs/mapped-types';
import { CreateContactDto } from './create-contact.dto';

/**
 * Tous les champs deviennent optionnels.
 * L'invariant "au moins un canal" n'est pas re-vérifié à l'update :
 * il l'a été à la création, et un update ne peut pas vider les deux
 * champs (le service refuse explicitement si email=null ET telephone=null
 * sur le contact résultant).
 */
export class UpdateContactDto extends PartialType(CreateContactDto) {}
