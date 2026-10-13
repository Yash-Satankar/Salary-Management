import type { FxMeta } from '@acme/shared';
import { Info } from 'lucide-react';

/** Every USD figure in the UI is approximate; this states the rates' date and source. */
export function FxDisclaimer({ fx }: { fx: FxMeta }) {
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        USD figures are approximate, for comparison only: converted with static reference rates as
        of {fx.asOf} ({fx.source}). Local-currency amounts are the source of truth.
      </span>
    </p>
  );
}
