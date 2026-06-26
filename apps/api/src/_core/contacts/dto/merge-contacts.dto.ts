import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';
import { MERGE_STRATEGIES, type MergeStrategy } from '@civora/shared-types';

export class MergeContactsDto {
  @IsUUID()
  master_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  source_ids!: string[];

  @IsOptional()
  @IsIn(MERGE_STRATEGIES)
  strategy?: MergeStrategy;
}
