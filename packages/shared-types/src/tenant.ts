import { z } from 'zod';

import { AgenceIdSchema, EntiteIdSchema } from './ids';

export const AgenceSchema = z.object({
  id: AgenceIdSchema,
  nom: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  pays: z.string().length(2),
  actif: z.boolean().default(true),
  createdAt: z.coerce.date(),
});

export type Agence = z.infer<typeof AgenceSchema>;

export const EntiteSchema = z.object({
  id: EntiteIdSchema,
  agenceId: AgenceIdSchema,
  nom: z.string().min(1),
  actif: z.boolean().default(true),
});

export type Entite = z.infer<typeof EntiteSchema>;
