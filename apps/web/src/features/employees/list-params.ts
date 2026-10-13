import {
  EMPLOYEE_SORT_FIELDS,
  EMPLOYMENT_TYPES,
  type EmployeeListQuery,
  SORT_ORDERS,
  STATUS_FILTERS,
} from '@acme/shared';
import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
  type Values,
} from 'nuqs';

/** The list view lives in the URL, so every filtered view can be shared and survives refresh. */
export const listParsers = {
  page: parseAsInteger.withDefault(1),
  pageSize: parseAsInteger.withDefault(25),
  search: parseAsString.withDefault(''),
  country: parseAsString.withDefault(''),
  departmentId: parseAsInteger,
  jobTitleId: parseAsInteger,
  employmentType: parseAsStringLiteral(EMPLOYMENT_TYPES),
  status: parseAsStringLiteral(STATUS_FILTERS).withDefault('active'),
  sort: parseAsStringLiteral(EMPLOYEE_SORT_FIELDS).withDefault('fullName'),
  order: parseAsStringLiteral(SORT_ORDERS).withDefault('asc'),
};

export type ListParams = Values<typeof listParsers>;

export function useEmployeeListParams() {
  return useQueryStates(listParsers);
}

export function toListQuery(params: ListParams): EmployeeListQuery {
  return {
    page: params.page,
    pageSize: params.pageSize,
    status: params.status,
    sort: params.sort,
    order: params.order,
    ...(params.search && { search: params.search }),
    ...(params.country && { country: params.country }),
    ...(params.departmentId !== null && { departmentId: params.departmentId }),
    ...(params.jobTitleId !== null && { jobTitleId: params.jobTitleId }),
    ...(params.employmentType !== null && { employmentType: params.employmentType }),
  };
}
