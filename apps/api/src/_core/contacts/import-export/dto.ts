import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateImportUploadDto {
  @IsString()
  @MaxLength(10)
  @Matches(/^(csv|xlsx|xls)$/, { message: 'extension non supportée (csv, xlsx, xls)' })
  ext!: string;

  @IsString()
  @MaxLength(120)
  contentType!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sizeBytes?: number;
}

export class ImportPreviewDto {
  @IsString()
  file_key!: string;

  @IsOptional()
  @IsObject()
  mapping?: Record<string, string>;

  @IsOptional()
  @IsObject()
  options?: {
    skip_duplicates?: boolean;
    update_duplicates?: boolean;
    default_source?: string;
    default_roles?: string[];
  };
}

export class ImportExecuteDto {
  @IsString()
  file_key!: string;

  @IsObject()
  mapping!: Record<string, string>;

  @IsOptional()
  @IsObject()
  options?: {
    skip_duplicates?: boolean;
    update_duplicates?: boolean;
    default_source?: string;
    default_roles?: string[];
  };
}

export class ContactsExportDto {
  @IsIn(['csv', 'xlsx'])
  format!: 'csv' | 'xlsx';

  @IsOptional()
  @IsObject()
  filtres?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  columns?: string[];
}
