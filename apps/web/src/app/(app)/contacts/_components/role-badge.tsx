import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import {
  ROLE_COLORS,
  ROLE_LABELS,
  ROLE_SHORT,
} from '@/lib/contacts/role-labels';
import type { ContactRole } from '@civora/shared-types';

interface RoleBadgeProps {
  role: ContactRole;
  short?: boolean;
}

export function RoleBadge({ role, short = false }: RoleBadgeProps): React.ReactElement {
  return (
    <Badge variant={ROLE_COLORS[role]} aria-label={ROLE_LABELS[role]}>
      {short ? ROLE_SHORT[role] : ROLE_LABELS[role]}
    </Badge>
  );
}
