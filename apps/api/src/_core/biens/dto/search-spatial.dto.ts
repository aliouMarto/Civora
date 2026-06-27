import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  BIEN_STATUTS,
  BIEN_TYPES,
  BIEN_USAGES,
  type BienStatut,
  type BienType,
  type BienUsage,
} from '@civora/shared-types';

export class SpatialCenterDto {
  @IsNumber() @Min(-90) @Max(90)
  lat!: number;

  @IsNumber() @Min(-180) @Max(180)
  lng!: number;
}

export class SpatialFiltersDto {
  @IsOptional() @IsArray() @IsEnum(BIEN_STATUTS, { each: true })
  statut?: BienStatut[];

  @IsOptional() @IsArray() @IsEnum(BIEN_TYPES, { each: true })
  type?: BienType[];

  @IsOptional() @IsArray() @IsEnum(BIEN_USAGES, { each: true })
  usage?: BienUsage[];
}

/**
 * Discriminated union mode: radius | bbox | polygon.
 *
 * class-validator ne sait pas faire de discriminated union nativement —
 * on déclare tous les champs comme optionnels et on valide la cohérence
 * dans le service.
 */
export class SearchSpatialDto {
  @IsIn(['radius', 'bbox', 'polygon'])
  mode!: 'radius' | 'bbox' | 'polygon';

  // mode = 'radius'
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SpatialCenterDto)
  center?: SpatialCenterDto;

  @IsOptional() @IsInt() @Min(1) @Max(100_000)
  radius_meters?: number;

  // mode = 'bbox' : [minLng, minLat, maxLng, maxLat]
  @IsOptional()
  @IsArray()
  @ArrayMinSize(4)
  @IsNumber({}, { each: true })
  bbox?: [number, number, number, number];

  // mode = 'polygon' : [[lng, lat], [lng, lat], ...]
  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  polygon?: Array<[number, number]>;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SpatialFiltersDto)
  filters?: SpatialFiltersDto;
}
