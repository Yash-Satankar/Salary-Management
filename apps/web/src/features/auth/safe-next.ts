const DEFAULT_PAGE = '/employees';

/** Only same-site paths are allowed after login, so `?next=` cannot be used for phishing. */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return DEFAULT_PAGE;
  }
  return next;
}
