import { type ReferenceData, referenceResponseSchema } from '@acme/shared';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export async function fetchReference(): Promise<ReferenceData> {
  const { data } = await apiClient.request('/reference', { schema: referenceResponseSchema });
  return data;
}

/** Reference data only changes with a deploy, so it is cached for the whole session. */
export function useReference() {
  return useQuery({ queryKey: ['reference'], queryFn: fetchReference, staleTime: Infinity });
}

export function minorUnitOf(reference: ReferenceData, currencyCode: string): number {
  const country = reference.countries.find((candidate) => candidate.currency.code === currencyCode);
  return country?.currency.minorUnit ?? 2;
}

export function currencyOfCountry(reference: ReferenceData, countryCode: string) {
  return reference.countries.find((country) => country.code === countryCode)?.currency;
}
