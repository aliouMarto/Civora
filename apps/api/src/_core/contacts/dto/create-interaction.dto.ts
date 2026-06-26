import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  INTERACTION_DIRECTIONS,
  INTERACTION_TYPES,
  type InteractionDirection,
  type InteractionType,
} from '@civora/shared-types';

export class CreateInteractionDto {
  @IsIn(INTERACTION_TYPES)
  type!: InteractionType;

  // direction obligatoire sauf pour les notes internes
  @ValidateIf((o: CreateInteractionDto) => o.type !== 'note')
  @IsIn(INTERACTION_DIRECTIONS)
  direction?: InteractionDirection;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sujet?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  contenu?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  occurred_at?: Date;
}
