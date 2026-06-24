import { SetMetadata } from '@nestjs/common';

export const AUDITED_KEY = 'civora:audited';

export interface AuditedMeta {
  action: string;
}

/**
 * Marque un endpoint pour l'audit automatique.
 * L'AuditInterceptor lit ce metadata et insère une ligne après chaque appel réussi.
 *
 * @example
 * @Audited('biens:update')
 * @Patch(':id')
 * update(@Param('id') id: string, @Body() dto: UpdateBienDto) { ... }
 */
export const Audited = (action: string): MethodDecorator =>
  SetMetadata<string, AuditedMeta>(AUDITED_KEY, { action });
