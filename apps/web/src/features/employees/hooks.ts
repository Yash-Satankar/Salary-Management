import type { EmployeeListQuery, EmployeeUpdateInput, TerminateEmployeeInput } from '@acme/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createEmployee,
  getEmployee,
  listEmployees,
  terminateEmployee,
  updateEmployee,
} from './api';

export const employeeKeys = {
  all: ['employees'] as const,
  list: (query: EmployeeListQuery) => ['employees', 'list', query] as const,
  detail: (id: number) => ['employees', 'detail', id] as const,
};

export function useEmployees(query: EmployeeListQuery) {
  return useQuery({
    queryKey: employeeKeys.list(query),
    queryFn: ({ signal }) => listEmployees(query, signal),
    // Keep showing the current page while the next one loads, instead of flashing skeletons.
    placeholderData: keepPreviousData,
  });
}

export function useEmployee(id: number) {
  return useQuery({ queryKey: employeeKeys.detail(id), queryFn: () => getEmployee(id) });
}

/** Any write can change lists, details and insights, so all of them are refreshed. */
function useInvalidateEmployeeData() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: employeeKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['insights'] }),
    ]);
}

export function useCreateEmployee() {
  const invalidate = useInvalidateEmployeeData();
  return useMutation({ mutationFn: createEmployee, onSuccess: invalidate });
}

export function useUpdateEmployee(id: number) {
  const invalidate = useInvalidateEmployeeData();
  return useMutation({
    mutationFn: (input: EmployeeUpdateInput) => updateEmployee(id, input),
    onSuccess: invalidate,
  });
}

export function useTerminateEmployee(id: number) {
  const invalidate = useInvalidateEmployeeData();
  return useMutation({
    mutationFn: (input: TerminateEmployeeInput) => terminateEmployee(id, input),
    onSuccess: invalidate,
  });
}
