import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  CONTACT_GENRES,
  CONTACT_LANGUES,
  CONTACT_ROLES,
  CONTACT_SOURCES,
  type ContactGenre,
  type ContactLangue,
  type ContactRole,
  type ContactSource,
} from '@civora/shared-types';

const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * DTO de création d'un contact.
 * Note : la normalisation E.164 du téléphone et l'unicité conditionnelle
 * sont gérées dans ContactsService. Ce DTO valide uniquement le format brut.
 *
 * Au moins l'email ou le téléphone doit être renseigné — vérifié dans le service.
 * (Le décorateur @ValidateIf utilisé seul ne couvre pas le cas "au moins un
 * des deux", on le valide explicitement plus tard.)
 */
export class CreateContactDto {
  @IsString()
  @Length(1, 120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nom!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  prenom?: string;

  @IsOptional()
  @IsIn(CONTACT_GENRES)
  genre?: ContactGenre;

  @IsOptional()
  @IsIn(CONTACT_LANGUES)
  langue?: ContactLangue;

  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @IsOptional()
  @Matches(E164, { message: 'telephone doit être au format E.164 (ex: +2250707070707)' })
  telephone?: string;

  @IsOptional()
  @Matches(E164, { message: 'whatsapp doit être au format E.164 (ex: +2250707070707)' })
  whatsapp?: string;

  @IsOptional()
  @IsBoolean()
  whatsapp_opt_in?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  adresse_ligne1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  adresse_ligne2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ville?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  commune?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'pays doit être un code ISO 3166-1 alpha-2 (2 lettres majuscules)' })
  pays?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(CONTACT_ROLES.length)
  @IsEnum(CONTACT_ROLES, { each: true })
  roles?: ContactRole[];

  @IsOptional()
  @IsIn(CONTACT_SOURCES)
  source?: ContactSource;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  // L'invariant "au moins un canal (email OU téléphone)" est vérifié dans
  // ContactsService.create : on a besoin de l'accès aux deux champs simultanément
  // ce que les décorateurs class-validator individuels rendent verbeux.
}
