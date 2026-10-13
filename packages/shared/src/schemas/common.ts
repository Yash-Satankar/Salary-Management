import { z } from 'zod';
import { ERROR_CODES } from '../enums';

/** A calendar date as `YYYY-MM-DD` (no time, no zone); impossible dates such as Feb 30 fail. */
export const isoDateSchema = z.iso.date();

export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/, 'Must be a 2-letter country code');
export const currencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Must be a 3-letter currency code');

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: currencyCodeSchema,
});
export type MoneyDto = z.infer<typeof moneySchema>;

export const fxMetaSchema = z.object({
  asOf: isoDateSchema,
  source: z.string(),
});
export type FxMeta = z.infer<typeof fxMetaSchema>;

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** Query strings send `?country=` for a cleared filter; treat it exactly like an absent parameter. */
export function optionalQueryParam<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}
