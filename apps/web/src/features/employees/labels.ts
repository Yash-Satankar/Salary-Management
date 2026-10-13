import type { EmployeeStatus, EmploymentType, StatusFilter } from '@acme/shared';

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
};

export const STATUS_LABELS: Record<StatusFilter | EmployeeStatus, string> = {
  active: 'Active',
  terminated: 'Terminated',
  all: 'All',
};
