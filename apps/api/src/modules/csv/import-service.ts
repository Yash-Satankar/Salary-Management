import type { ImportResult, ImportRowError } from '@acme/shared';
import type { Clock } from '../../lib/clock';
import type { EmployeeRecord, EmployeeRepository, EmployeeTransaction } from '../employees/types';
import type { ReferenceRepository } from '../reference/repository';
import {
  type ImportContext,
  parseImportFile,
  type ValidatedImportRow,
  validateImportRows,
} from './import-parser';

export const CSV_IMPORT_REASON = 'CSV import';

export interface ImportService {
  /** Throws ImportFileError when the file itself is unusable (missing headers, not CSV). */
  run(csvText: string, options: { dryRun: boolean }): Promise<ImportResult>;
}

export interface ImportServiceDeps {
  employeeRepository: EmployeeRepository;
  referenceRepository: ReferenceRepository;
  transaction: EmployeeTransaction;
  clock: Clock;
}

type PlannedRow =
  | { kind: 'create'; row: ValidatedImportRow }
  | { kind: 'update'; row: ValidatedImportRow; existing: EmployeeRecord }
  | { kind: 'unchanged' };

const COMPARED_FIELDS = [
  'fullName',
  'email',
  'jobTitleId',
  'countryCode',
  'currencyCode',
  'salaryMinor',
  'employmentType',
  'hireDate',
] as const;

function differs(row: ValidatedImportRow, existing: EmployeeRecord): boolean {
  return COMPARED_FIELDS.some((field) =>
    field === 'email' ? row.email !== existing.email.toLowerCase() : row[field] !== existing[field],
  );
}

export function createImportService({
  employeeRepository,
  referenceRepository,
  transaction,
  clock,
}: ImportServiceDeps): ImportService {
  async function loadContext(): Promise<ImportContext> {
    const reference = await referenceRepository.getReferenceData();
    const departmentNames = new Map(reference.departments.map((d) => [d.id, d.name]));
    return {
      today: clock.today(),
      jobTitles: reference.jobTitles.map((title) => ({
        id: title.id,
        name: title.name,
        departmentName: departmentNames.get(title.departmentId) ?? '',
      })),
      countries: reference.countries.map((country) => ({
        code: country.code,
        currencyCode: country.currency.code,
        minorUnit: country.currency.minorUnit,
        usdPerUnit: reference.fx.rates[country.currency.code] ?? '0',
      })),
    };
  }

  /** Checks that need the database: codes must exist and be active, emails must be free. */
  async function plan(rows: ValidatedImportRow[]) {
    const codes = rows.flatMap((row) => (row.employeeCode ? [row.employeeCode] : []));
    const [byCodeList, byEmailList] = await Promise.all([
      employeeRepository.findByCodes(codes),
      employeeRepository.findByEmails(rows.map((row) => row.email)),
    ]);
    const byCode = new Map(byCodeList.map((employee) => [employee.employeeCode, employee]));
    const byEmail = new Map(
      byEmailList.map((employee) => [employee.email.toLowerCase(), employee]),
    );

    const errors: ImportRowError[] = [];
    const planned: PlannedRow[] = [];
    for (const row of rows) {
      const existing = row.employeeCode ? byCode.get(row.employeeCode) : undefined;
      if (row.employeeCode && !existing) {
        errors.push({
          row: row.line,
          field: 'employee_code',
          message: `Unknown employee code ${row.employeeCode}`,
        });
        continue;
      }
      if (existing?.status === 'terminated' && differs(row, existing)) {
        errors.push({
          row: row.line,
          field: 'employee_code',
          message: 'Terminated employees cannot be updated',
        });
        continue;
      }
      const emailOwner = byEmail.get(row.email);
      if (emailOwner && emailOwner.id !== existing?.id) {
        errors.push({
          row: row.line,
          field: 'email',
          message: `Email already belongs to ${emailOwner.employeeCode}`,
        });
        continue;
      }
      if (!existing) {
        planned.push({ kind: 'create', row });
      } else if (differs(row, existing)) {
        planned.push({ kind: 'update', row, existing });
      } else {
        planned.push({ kind: 'unchanged' });
      }
    }
    return { planned, errors };
  }

  async function apply(planned: PlannedRow[]): Promise<void> {
    const today = clock.today();
    await transaction(async (repository) => {
      for (const step of planned) {
        if (step.kind === 'create') {
          const { line: _line, employeeCode: _code, ...employee } = step.row;
          const created = await repository.insert(employee);
          await repository.insertSalaryChange({
            employeeId: created.id,
            previousSalaryMinor: null,
            previousCurrencyCode: null,
            newSalaryMinor: created.salaryMinor,
            newCurrencyCode: created.currencyCode,
            effectiveDate: created.hireDate,
            reason: CSV_IMPORT_REASON,
          });
        } else if (step.kind === 'update') {
          const { line: _line, employeeCode: _code, ...changes } = step.row;
          await repository.update(step.existing.id, changes);
          const salaryChanged =
            changes.salaryMinor !== step.existing.salaryMinor ||
            changes.currencyCode !== step.existing.currencyCode;
          if (salaryChanged) {
            await repository.insertSalaryChange({
              employeeId: step.existing.id,
              previousSalaryMinor: step.existing.salaryMinor,
              previousCurrencyCode: step.existing.currencyCode,
              newSalaryMinor: changes.salaryMinor,
              newCurrencyCode: changes.currencyCode,
              effectiveDate: today,
              reason: CSV_IMPORT_REASON,
            });
          }
        }
      }
    });
  }

  return {
    async run(csvText, { dryRun }) {
      const file = parseImportFile(csvText);
      const validation = validateImportRows(file, await loadContext());
      const { planned, errors: databaseErrors } = await plan(validation.rows);
      const errors = [...validation.errors, ...databaseErrors].sort((a, b) => a.row - b.row);

      // All-or-nothing: a single bad row means nothing is written.
      if (!dryRun && errors.length === 0) {
        await apply(planned);
      }
      const count = (kind: PlannedRow['kind']) =>
        planned.filter((step) => step.kind === kind).length;
      return {
        dryRun,
        totalRows: file.rows.length,
        toCreate: count('create'),
        toUpdate: count('update'),
        unchanged: count('unchanged'),
        errors,
      };
    },
  };
}
