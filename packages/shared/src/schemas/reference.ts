import { z } from 'zod';
import { countryCodeSchema, currencyCodeSchema, fxMetaSchema, namedRefSchema } from './common';

export const currencySchema = z.object({
  code: currencyCodeSchema,
  name: z.string(),
  minorUnit: z.number().int().min(0).max(3),
});
export type Currency = z.infer<typeof currencySchema>;

export const referenceDataSchema = z.object({
  countries: z.array(
    z.object({ code: countryCodeSchema, name: z.string(), currency: currencySchema }),
  ),
  departments: z.array(namedRefSchema),
  jobTitles: z.array(namedRefSchema.extend({ departmentId: z.number().int() })),
  // Rates stay decimal strings end to end so they are never rounded through a float.
  fx: fxMetaSchema.extend({ rates: z.record(currencyCodeSchema, z.string()) }),
});
export type ReferenceData = z.infer<typeof referenceDataSchema>;

export const referenceResponseSchema = z.object({ data: referenceDataSchema });
export type ReferenceResponse = z.infer<typeof referenceResponseSchema>;
