import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BIEN_STATUTS,
  BIEN_TYPES,
  BIEN_USAGES,
  type BienStatut,
  type BienType,
  type BienUsage,
} from '@civora/shared-types';

/**
 * Accepte number | string | bigint et transforme en bigint.
 * Les valeurs sont en centimes FCFA.
 */
const toBigInt = ({ value }: { value: unknown }): bigint | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return undefined;
};

export class CreateBienDto {
  // Référence : auto-générée si absente côté service (format BIE-YYYY-NNNN).
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Z0-9\-_]+$/, { message: 'reference : alphanum + tirets uniquement' })
  reference?: string;

  @IsString()
  @Length(1, 180)
  nom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsEnum(BIEN_TYPES)
  type!: BienType;

  @IsOptional()
  @IsEnum(BIEN_USAGES)
  usage?: BienUsage;

  @IsOptional()
  @IsEnum(BIEN_STATUTS)
  statut?: BienStatut;

  // Caractéristiques
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  surface?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(50)
  pieces?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(50)
  chambres?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(50)
  salles_bain?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(-5) @Max(150)
  etage?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1800)
  annee_construction?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  amenities?: string[];

  // Localisation
  @IsString()
  @Length(1, 255)
  adresse_ligne1!: string;

  @IsOptional() @IsString() @MaxLength(255)
  adresse_ligne2?: string;

  @IsString()
  @Length(1, 120)
  ville!: string;

  @IsOptional() @IsString() @MaxLength(120)
  commune?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'pays = ISO 3166-1 alpha-2 (2 lettres majuscules)' })
  pays?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90)
  latitude?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180)
  longitude?: number;

  // Pricing — BigInt centimes FCFA
  @IsOptional()
  @Transform(toBigInt)
  prix_vente_xof?: bigint;

  @IsOptional()
  @Transform(toBigInt)
  loyer_mensuel_xof?: bigint;

  @IsOptional()
  @Transform(toBigInt)
  charges_xof?: bigint;

  @IsOptional()
  @Transform(toBigInt)
  caution_xof?: bigint;

  // Relations
  @IsOptional() @IsUUID()
  proprietaire_id?: string;

  @IsOptional() @IsUUID()
  agent_responsable_id?: string;

  @IsOptional() @IsUUID()
  entite_id?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}
