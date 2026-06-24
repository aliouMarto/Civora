import { SetMetadata } from '@nestjs/common';

import type { Permission } from '../../rbac/permissions.catalog';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (
  ...permissions: Permission[]
): ReturnType<typeof SetMetadata> => SetMetadata(PERMISSIONS_KEY, permissions);
