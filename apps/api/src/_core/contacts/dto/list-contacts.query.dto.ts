import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  CONTACT_ROLES,
  CONTACT_SCORE_CATEGORIES,
  CONTACT_SORTS,
  CONTACT_SOURCES,
  type ContactRole,
  type ContactScoreCategorie,
  type ContactSort,
  type ContactSource,
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

export class ListContactsQueryDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  q?: string;

  @IsOptional()
  @Transform(csvToArray)
  @IsArray()
  @ArrayMaxSize(CONTACT_ROLES.length)
  @IsEnum(CONTACT_ROLES, { each: true })
  role?: ContactRole[];

  @IsOptional()
  @IsString()
  @Length(1, 120)
  ville?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  commune?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'pays = ISO 3166-1 alpha-2 (2 lettres)' })
  pays?: string;

  @IsOptional()
  @IsIn(CONTACT_SOURCES)
  source?: ContactSource;

  @IsOptional()
  @Transform(csvToArray)
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @Transform(csvToArray)
  @IsArray()
  @IsString({ each: true })
  segments_ia?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  score_min?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  score_max?: number;

  @IsOptional()
  @IsIn(CONTACT_SCORE_CATEGORIES)
  score_categorie?: ContactScoreCategorie;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  whatsapp_opt_in?: boolean;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  created_after?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  created_before?: Date;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  include_archived?: boolean;

  @IsOptional()
  @IsIn(CONTACT_SORTS)
  sort?: ContactSort;
}
