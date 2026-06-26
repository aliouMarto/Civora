import { Type } from 'class-transformer';
import { IsObject, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { CONTACT_ROLES, CONTACT_SCORE_CATEGORIES, CONTACT_SOURCES, type SegmentFiltres } from '@civora/shared-types';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class SegmentFiltresDto implements Partial<SegmentFiltres> {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CONTACT_ROLES.length)
  @IsEnum(CONTACT_ROLES, { each: true })
  roles?: SegmentFiltres['roles'];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  segments_ia?: string[];

  @IsOptional()
  @IsString()
  ville?: string;

  @IsOptional()
  @IsString()
  commune?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  pays?: string;

  @IsOptional()
  @IsIn(CONTACT_SOURCES)
  source?: SegmentFiltres['source'];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  score_min?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  score_max?: number;

  @IsOptional()
  @IsIn(CONTACT_SCORE_CATEGORIES)
  score_categorie?: SegmentFiltres['score_categorie'];

  @IsOptional()
  @IsBoolean()
  whatsapp_opt_in?: boolean;
}

export class CreateSegmentDto {
  @IsString()
  @Length(1, 120)
  nom!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => SegmentFiltresDto)
  filtres!: SegmentFiltresDto;
}
