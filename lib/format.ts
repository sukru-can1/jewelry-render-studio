// Shared date formatting for the operator UI. The ONE place relativeTime() and
// formatDateTime() live — previously duplicated per-surface (product cards,
// batches list) or inlined as raw ISO/locale strings. formatDateTime pins an
// explicit locale + options + UTC time zone so server and client always render
// identical strings (deterministic output, no hydration drift).

// Date and time halves are formatted separately and joined with a literal ", "
// so the separator never varies across ICU versions.
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

// "just now" / "5m ago" / "3h ago" / "2d ago" / "4mo ago" / "1y ago".
export function relativeTime(value: string | number | Date): string {
  const then = new Date(value).getTime();
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.round(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.round(mon / 12)}y ago`;
}

// Deterministic absolute timestamp, e.g. "12 Jun 2026, 14:05" (always UTC).
export function formatDateTime(value: string | number | Date): string {
  const date = new Date(value);
  return `${DATE_FORMAT.format(date)}, ${TIME_FORMAT.format(date)}`;
}
