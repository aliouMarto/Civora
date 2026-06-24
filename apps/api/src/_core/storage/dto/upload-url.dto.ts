import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';

export class UploadUrlDto {
  @IsString()
  @IsNotEmpty()
  kind!: string;

  @IsString()
  @IsNotEmpty()
  ext!: string;

  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  entite_id?: string;
}

export class DownloadUrlDto {
  @IsString()
  @IsNotEmpty()
  key!: string;
}
