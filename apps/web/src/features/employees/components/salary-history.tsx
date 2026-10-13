import type { ReferenceData, SalaryHistoryEntry } from '@acme/shared';
import { minorUnitOf } from '@/features/reference/hooks';
import { formatSalary, percentChange } from '@/lib/money';

export function SalaryHistory({
  entries,
  reference,
}: {
  entries: SalaryHistoryEntry[];
  reference: ReferenceData;
}) {
  const format = (money: SalaryHistoryEntry['new']) =>
    formatSalary(money, minorUnitOf(reference, money.currency));

  return (
    <ol aria-label="Salary history" className="relative space-y-4 border-l pl-6">
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            className="absolute top-1.5 -left-[1.8rem] size-2.5 rounded-full bg-primary"
            aria-hidden
          />
          <p className="text-sm font-medium">
            {entry.previous === null ? (
              <>Initial salary {format(entry.new)}</>
            ) : (
              <>
                {format(entry.previous)} → {format(entry.new)}
                {/* A percentage across currencies would be meaningless. */}
                {entry.previous.currency === entry.new.currency && (
                  <span className="ml-2 text-muted-foreground">
                    {percentChange(entry.previous.amountMinor, entry.new.amountMinor)}
                  </span>
                )}
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Effective {entry.effectiveDate}
            {entry.reason && entry.previous !== null && <> · {entry.reason}</>}
          </p>
        </li>
      ))}
    </ol>
  );
}
