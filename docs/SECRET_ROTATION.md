# Secret Rotation Runbook (SEC-01)

This runbook covers rotating the **leaked** RunPod API key and Vercel Blob
read-write token, plus the verification proving the old credentials are dead and
no secret literal survives in the tracked tree.

> **Why manual:** Rotating a RunPod API key or a Vercel Blob token is a dashboard
> action — there is no CLI/API that can mint-and-revoke these for you headlessly.
> All application code already reads secrets from the environment
> (`lib/runpod.ts` → `process.env.RUNPOD_API_KEY`; `@vercel/blob` →
> `BLOB_READ_WRITE_TOKEN`), so rotation requires **no code change** — only new
> values in the three environments below.

## What leaked

| Secret | Pattern | Where it lives (gitignored) | Consumed by |
|--------|---------|-----------------------------|-------------|
| `RUNPOD_API_KEY` | `rpa_…` | `.env`, `.env.local` | `lib/runpod.ts` (GPU job submit/status), RunPod worker container |
| `BLOB_READ_WRITE_TOKEN` | `vercel_blob_rw_…` | `.env`, `.env.local` | `@vercel/blob` `put`/`get` (upload route, `/api/file` proxy), worker uploads |

Both values were committed/observed in plaintext per
`.planning/codebase/CONCERNS.md` and must be treated as compromised.

## The three places every secret must be set

1. **Local** — `.env.local` (developer machine; gitignored, never committed).
2. **Vercel** — `vercel env add <NAME>` for Production (and Preview/Dev as needed).
3. **RunPod worker** — the serverless endpoint's container environment
   (endpoint `ubntulu9k28suy`).

A rotation is only complete when the **new** value is live in all three and the
**old** value is revoked at the source.

## Rotation steps (operator)

### A. RunPod API key (`RUNPOD_API_KEY`)

1. RunPod dashboard → **Settings → API Keys** → **revoke** the exposed key
   (`rpa_PZ7KGGSJ…`).
2. **Create** a new API key; copy it once (it is not shown again).
3. Confirm the OLD key is dead — it must `401`:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" \
     -H "Authorization: Bearer <OLD_KEY>" \
     "https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/status/x"
   # expect: 401
   ```
4. Set the NEW key in all three places:
   - `.env.local`: `RUNPOD_API_KEY=rpa_<new>`
   - Vercel: `vercel env add RUNPOD_API_KEY` (Production)
   - RunPod worker container env: update `RUNPOD_API_KEY`
5. Smoke-check the NEW key returns non-401 against the same status endpoint.

### B. Vercel Blob token (`BLOB_READ_WRITE_TOKEN`)

1. Vercel dashboard → **Storage → (Blob store) → Tokens** → revoke the exposed
   `vercel_blob_rw_u6oaq5…` token.
2. Generate a new read-write token.
3. Set the NEW token in all three places (local / Vercel env / RunPod worker).
4. Smoke-check an authenticated upload + a `/api/file?pathname=…` fetch succeed.

> **Blob store privacy note:** SEC-02 switches NEW writes to a **private** store
> (`putPrivate` → `access:'private'`) delivered via the auth-gated `/api/file`
> proxy. The legacy `BLOB_ACCESS=public` store and any already-public blobs are
> **accepted-as-burned for Phase 1**; re-uploading legacy assets as private is a
> Phase-8 concern (Open Question 3). Ensure the rotated token targets the
> intended (private) store.

## Verification checklist

- [ ] OLD RunPod key returns `401` against `…/status/x`.
- [ ] OLD Blob token rejected (upload/list fails).
- [ ] NEW keys set in **local**, **Vercel**, and **RunPod worker** (all three).
- [ ] No secret literal in tracked files:
  ```bash
  git grep -nE 'rpa_[A-Za-z0-9]|vercel_blob_rw_[A-Za-z0-9]' -- ':!*.example' ':!.planning/*'
  # expect: no output
  ```
  (The `.planning/` docs reference the **truncated** leaked patterns by design as
  an audit trail; they contain no full live secret.)
- [ ] All secrets read from the environment only — no Phase-1 task hardcoded a
  secret (confirmed: `lib/runpod.ts` and `@vercel/blob` read `process.env`).
- [ ] `.env` / `.env.local` remain gitignored (`git check-ignore .env .env.local`).

## Attestation

> **STATUS: PENDING OPERATOR ACTION.**
>
> The code-side hardening (locked upload route, private-blob proxy, no secret
> literals in tracked source) is complete and committed in Plan 01-04. The
> **rotation itself is a manual dashboard action** that cannot be performed
> headlessly and is therefore recorded as a pending attestation rather than
> blocking the phase.
>
> Operator: once the checklist above passes, sign off here:
>
> - [ ] RunPod key rotated, old key 401s, new key in all three places — _name / date_
> - [ ] Blob token rotated, old token dead, new token in all three places — _name / date_
> - [ ] `git grep` finds no secret literal in tracked source — _name / date_
