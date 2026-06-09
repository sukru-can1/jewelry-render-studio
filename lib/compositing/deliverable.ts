// COMP-02 / COMP-03 — the deterministic deliverable pathname. PURE: no I/O, no
// imports. Both the flatten route (Plan 01) and the batch-zip discovery (Plan 03)
// import this so they agree byte-for-byte on where a variant's deliverable lives.
//
// Convention (RESEARCH §Persistence): renders/<batchId>/deliverables/<angle>_<metal>.png
// — under the same renders/<batchId>/ namespace the worker uses, in a deliverables/
// subfolder so it never collides with raw layer outputs and is trivially listable
// by the `deliverables/` prefix (Plan 03 zip discovery, no DB row).

/** The prefix under which a batch's deliverables live — used by Plan 03 for
 *  list({prefix}) discovery (blob-only persistence, no isFlattened DB flag). */
export function deliverablePrefix(batchId: string): string {
  return `renders/${sanitizeStem(batchId)}/deliverables/`;
}

/**
 * Deterministic pathname for one variant's flattened deliverable. The
 * `<angle>_<metal>` stem is sanitized (CR/LF, quotes, path separators stripped)
 * so a hostile angle/metal can never escape the deliverables/ folder or inject a
 * header downstream (T-06-03).
 */
export function deliverablePathname(
  batchId: string,
  angle: string,
  metal: string,
): string {
  const stem = `${sanitizeStem(angle)}_${sanitizeStem(metal)}`;
  return `${deliverablePrefix(batchId)}${stem}.png`;
}

/** Strip CR/LF (header injection), quotes (value breakout) and path separators
 *  (traversal), collapse whitespace. Mirrors the download routes' sanitizer shape. */
function sanitizeStem(value: string): string {
  const cleaned = value
    .replace(/[\r\n"']/g, "")
    .replace(/[\\/]/g, "_")
    .replace(/\.\./g, "_")
    .trim()
    .replace(/\s+/g, "_");
  return cleaned.length > 0 ? cleaned : "unknown";
}
