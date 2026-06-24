import { z } from 'zod';

export const CursorPaginationInputSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export type CursorPaginationInput = z.infer<typeof CursorPaginationInputSchema>;

export interface CursorPaginationResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export const OffsetPaginationInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export type OffsetPaginationInput = z.infer<typeof OffsetPaginationInputSchema>;

export interface OffsetPaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
