import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class UploadPhotoDto {
  @IsString()
  @Matches(/^(jpg|jpeg|png|webp|heic)$/i, { message: 'extension non supportée (jpg, jpeg, png, webp, heic)' })
  ext!: string;

  @IsString() @MaxLength(80)
  contentType!: string;

  @IsOptional() @IsInt() @Min(1)
  sizeBytes?: number;

  @IsOptional() @IsString() @MaxLength(255)
  caption?: string;
}

export class RegisterPhotoDto {
  @IsString() @MaxLength(500)
  storage_key!: string;

  @IsOptional() @IsString() @MaxLength(255)
  caption?: string;

  @IsOptional() @IsInt() @Min(0)
  ordre?: number;
}

class PhotoOrderEntryDto {
  @IsUUID()
  id!: string;

  @IsInt() @Min(0)
  ordre!: number;
}

export class ReorderPhotosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PhotoOrderEntryDto)
  order!: PhotoOrderEntryDto[];
}
