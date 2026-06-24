import { z } from 'zod';

// Branded types — empêchent de mélanger deux types d'ID au compile time
type Brand<T, B extends string> = T & { readonly __brand: B };

export type AgenceId = Brand<string, 'AgenceId'>;
export type EntiteId = Brand<string, 'EntiteId'>;
export type UserId = Brand<string, 'UserId'>;
export type BiensId = Brand<string, 'BiensId'>;
export type BailId = Brand<string, 'BailId'>;
export type ContactId = Brand<string, 'ContactId'>;
export type PaiementId = Brand<string, 'PaiementId'>;

// Zod schemas (runtime validation)
const uuidSchema = z.string().uuid();

export const AgenceIdSchema = uuidSchema.brand<'AgenceId'>();
export const EntiteIdSchema = uuidSchema.brand<'EntiteId'>();
export const UserIdSchema = uuidSchema.brand<'UserId'>();
export const BiensIdSchema = uuidSchema.brand<'BiensId'>();
export const BailIdSchema = uuidSchema.brand<'BailId'>();
export const ContactIdSchema = uuidSchema.brand<'ContactId'>();
export const PaiementIdSchema = uuidSchema.brand<'PaiementId'>();
