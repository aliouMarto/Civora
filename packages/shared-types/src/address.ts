import { z } from 'zod';

export const GeoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type GeoPoint = z.infer<typeof GeoPointSchema>;

export const AddressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  commune: z.string().optional(),
  country: z.string().length(2), // ISO 3166-1 alpha-2
  geo: GeoPointSchema.optional(),
});

export type Address = z.infer<typeof AddressSchema>;

export function validateGeoPoint(geo: unknown): GeoPoint {
  return GeoPointSchema.parse(geo);
}

export function validateAddress(address: unknown): Address {
  return AddressSchema.parse(address);
}
