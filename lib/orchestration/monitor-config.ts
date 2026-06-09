// UI-SPEC §"Freshness indicator" — the freshness poll interval is a single config
// value (not hardcoded in the component), ~5s while a batch is running. Env-tunable
// so ops can dial it without a code change; clamped to a sane floor.
const DEFAULT_MS = 5000;
const FLOOR_MS = 2000;

function parseInterval(): number {
  const raw = process.env.NEXT_PUBLIC_MONITOR_POLL_MS;
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MS;
  return Math.max(FLOOR_MS, Math.floor(n));
}

/** Freshness poll interval in ms while the batch is non-terminal (auto-stops terminal). */
export const MONITOR_POLL_MS = parseInterval();
