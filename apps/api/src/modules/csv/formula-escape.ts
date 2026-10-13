/** Leading characters that make spreadsheet apps evaluate a cell as a formula (SPEC §5). */
export const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Prefixes text that a spreadsheet would execute with an apostrophe, which Excel and Sheets show
 * as plain text. Import strips the same prefix, so values round-trip unchanged.
 */
export function escapeFormula(value: string): string {
  return FORMULA_TRIGGERS.includes(value.charAt(0)) ? `'${value}` : value;
}
