import {
  type EmployeeCreateInput,
  type EmployeeDetailResponse,
  employeeDetailResponseSchema,
  type EmployeeListQuery,
  type EmployeeListResponse,
  employeeListResponseSchema,
  type EmployeeUpdateInput,
  type TerminateEmployeeInput,
} from '@acme/shared';
import { apiClient, apiUrl } from '@/lib/api-client';

export function listEmployees(
  query: EmployeeListQuery,
  signal?: AbortSignal,
): Promise<EmployeeListResponse> {
  return apiClient.request('/employees', { query, schema: employeeListResponseSchema, signal });
}

export function getEmployee(id: number): Promise<EmployeeDetailResponse> {
  return apiClient.request(`/employees/${id}`, { schema: employeeDetailResponseSchema });
}

export function createEmployee(input: EmployeeCreateInput): Promise<EmployeeDetailResponse> {
  return apiClient.request('/employees', {
    method: 'POST',
    body: input,
    schema: employeeDetailResponseSchema,
  });
}

export function updateEmployee(
  id: number,
  input: EmployeeUpdateInput,
): Promise<EmployeeDetailResponse> {
  return apiClient.request(`/employees/${id}`, {
    method: 'PATCH',
    body: input,
    schema: employeeDetailResponseSchema,
  });
}

export function terminateEmployee(
  id: number,
  input: TerminateEmployeeInput,
): Promise<EmployeeDetailResponse> {
  return apiClient.request(`/employees/${id}/terminate`, {
    method: 'POST',
    body: input,
    schema: employeeDetailResponseSchema,
  });
}

/** A plain link: the browser downloads the CSV with the session cookie, honouring the filters. */
export function exportUrl(query: Omit<EmployeeListQuery, 'page' | 'pageSize'>): string {
  return apiUrl('/employees/export.csv', query);
}
