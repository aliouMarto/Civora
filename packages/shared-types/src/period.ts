import { z } from 'zod';

export const PeriodSchema = z
  .object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  })
  .refine((p) => p.start <= p.end, {
    message: 'Period start must be before or equal to end',
    path: ['start'],
  });

export type Period = z.infer<typeof PeriodSchema>;

export function periodOverlaps(a: Period, b: Period): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export function periodContains(period: Period, date: Date): boolean {
  return date >= period.start && date <= period.end;
}

export function periodDurationDays(period: Period): number {
  const ms = period.end.getTime() - period.start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
