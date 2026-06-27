import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  Max,
} from 'class-validator';
import {
  BIEN_SORTS,
  BIEN_STATUTS,
  BIEN_TYPES,
  BIEN_USAGES,
  type BienSort,
  type BienStatut,
  type BienType,
  type BienUsage,
} from '@civora/shared-types';

const csvToArray = ({ value }: { value: unknown }): unknown => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
};

const toBool = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true' || value === '1';
  return undefined;
};

const toBigInt = ({ value }: { value: unknown }): bigint | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return undefined;
};

export class ListBiensQueryDto {
  @IsOptional() @IsUUID()
  cursor?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @IsOptional() @IsString() @Length(1, 100)
  q?: string;

  @IsOptional()
  @Transform(csvToArray)
  @IsArray() @ArrayMaxSize(BIEN_STATUTS.length)
  @IsEnum(BIEN_STATUTS, { each: true })
  statut?: BienStatut[];

  @IsOptional()
  @Transform(csvToArray)
  @IsArray() @ArrayMaxSize(BIEN_TYPES.length)
  @IsEnum(BIEN_TYPES, { each: true })
  type?: BienType[];

  @IsOptional()
  @Transform(csvToArray)
  @IsArray() @ArrayMaxSize(BIEN_USAGES.length)
  @IsEnum(BIEN_USAGES, { each: true })
  usage?: BienUsage[];

  @IsOptional()
  @Transform(csvToArray)
  @IsArray() @IsString({ each: true })
  ville?: string[];

  @IsOptional()
  @Transform(csvToArray)
  @IsArray() @IsString({ each: true })
  commune?: string[];

  @IsOptional() @IsUUID()
  proprietaire_id?: string;

  @IsOptional() @IsUUID()
  agent_responsable_id?: string;

  @IsOptional() @Transform(toBigInt)
  prix_vente_min?: bigint;

  @IsOptional() @Transform(toBigInt)
  prix_vente_max?: bigint;

  @IsOptional() @Transform(toBigInt)
  loyer_min?: bigint;

  @IsOptional() @Transform(toBigInt)
  loyer_max?: bigint;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  surface_min?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  surface_max?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  chambres_min?: number;

  @IsOptional()
  @Transform(csvToArray)
  @IsArray() @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @Transform(csvToArray)
  @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100)
  score_min?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100)
  score_max?: number;

  @IsOptional() @Transform(toBool) @IsBoolean()
  include_archived?: boolean;

  @IsOptional() @IsEnum(BIEN_SORTS)
  sort?: BienSort;
}
