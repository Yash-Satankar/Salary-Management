import { type ImportResult, importResultResponseSchema } from '@acme/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export async function runImport(file: File, dryRun: boolean): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.request('/employees/import', {
    method: 'POST',
    body: form,
    query: { dryRun },
    schema: importResultResponseSchema,
  });
  return data;
}

export function useImportPreview() {
  return useMutation({ mutationFn: (file: File) => runImport(file, true) });
}

export function useApplyImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => runImport(file, false),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['employees'] }),
        queryClient.invalidateQueries({ queryKey: ['insights'] }),
      ]),
  });
}
