---
phase: 01-secure-foundation-secrets-db-auth
plan: 05
subsystem: ui-login-app-shell
tags: [auth-js, login, app-shell, sidebar, rbac-ui, logout, route-redirect, teal-tokens, walking-skeleton]
requires:
  - "lib/auth/auth.ts (01-03) — auth()/signIn/signOut + session { user: { id, email, role } }"
  - "lib/auth/auth.config.ts (01-03) — pages.signIn=/login; deny-by-default authorized callback"
  - "app/components/ui/* (01-01b) — button, input, label, card, dropdown-menu, avatar, badge, skeleton"
  - "app/globals.css (01-01b) — teal semantic token layer (--primary, --accent, --sidebar), dark default"
provides:
  - "app/(auth)/login/page.tsx — AUTH-01 login surface (centered 400px card, Display wordmark, ?from= preserved)"
  - "app/(auth)/login/login-form.tsx — client credentials form (show/hide password, loading, calm generic error)"
  - "app/actions/auth.ts — signInWithCredentials (redirect:false, generic error) + signOutAction (redirectTo:/login)"
  - "app/(app)/layout.tsx — auth()-gated global app shell (topbar + sidebar + 1280px content column + skeleton)"
  - "app/(app)/products/page.tsx — authenticated Products landing placeholder ('Nothing here yet')"
  - "app/(app)/forbidden/page.tsx — calm Admin-only 403 inside the shell (Back to Products)"
  - "app/components/app-shell/{sidebar,topbar,user-menu,theme-toggle}.tsx — reusable global shell chrome"
  - "app/page.tsx — thin root redirect by auth state (no parallel-page collision)"
affects: ["01-06", "every later UI-bearing phase (reuses the app shell)"]
tech-stack:
  added: []
  patterns:
    - "Thin root redirect: app/page.tsx = await auth() -> redirect(session ? /products : /login); authenticated landing lives at app/(app)/products/page.tsx (NOT (app)/page.tsx) so / never collides"
    - "Server action sign-in: signIn('credentials', { redirect:false }) wrapped in try/catch on AuthError -> generic { ok:false, error:'invalid' } (no email-vs-password enumeration); client form owns the redirect"
    - "Belt-and-suspenders auth gate: (app)/layout.tsx re-checks auth() and redirects to /login even though middleware already denies by default"
    - "Admin nav gating is UI convenience only (role === 'Admin' in sidebar); the authoritative boundary is requireRole on the server (Plan 06)"
    - "Active sidebar item via usePathname: left 2px teal border + bg-accent tint + teal icon"
key-files:
  created:
    - app/actions/auth.ts
    - app/(auth)/login/page.tsx
    - app/(auth)/login/login-form.tsx
    - app/(app)/layout.tsx
    - app/(app)/products/page.tsx
    - app/(app)/forbidden/page.tsx
    - app/components/app-shell/sidebar.tsx
    - app/components/app-shell/topbar.tsx
    - app/components/app-shell/user-menu.tsx
    - app/components/app-shell/theme-toggle.tsx
  modified:
    - app/page.tsx
decisions:
  - "Root app/page.tsx repurposed to a thin auth-state redirect; legacy app/enterprise-app.tsx left intact on disk (now only imported by /lab and /rater legacy routes) — fixes the prior / parallel-page collision."
  - "Sign-in uses signIn(redirect:false) inside a server action and lets the client form push to from||/products, so the form can render the calm generic-error banner instead of a thrown redirect; non-AuthError throws are re-thrown."
  - "Open-redirect guard on ?from=: only relative in-app paths (start with / but not //) are honored, else /products."
  - "Admin role badge styled with a teal className override (border-primary/30 bg-primary/15 text-primary) rather than a new badge variant, since the 01-01b badge component has no accent variant — keeps the seed library untouched (no scope creep into Plan 06's component work)."
requirements-completed: [AUTH-01, AUTH-02]
metrics:
  duration_min: 25
  completed: 2026-06-05
---

# Phase 01 Plan 05: Login + App Shell + Route Topology Summary

The visible Walking-Skeleton login slice: a teal-on-dark `/login` credentials form that establishes the HTTP-only JWT cookie, a thin root `/` redirect by auth state (no route collision), the global app shell (sidebar + topbar + user menu with logout) that hosts every authenticated route, the authenticated Products landing placeholder, and the calm Admin-only 403 surface — all on the 01-01b teal design system and wired to the 01-03 auth core.

## What Was Built

- **AUTH-01 (login UI, visible side):** `app/(auth)/login/page.tsx` renders the centered 400px card with the Display-size "Jewelry Render Studio" wordmark and reads `?from=` (open-redirect-guarded). `login-form.tsx` (client) posts email + password (with a show/hide toggle) to the `signInWithCredentials` server action, shows the button spinner + "Signing in…" loading state with disabled fields, and on failure renders the single calm banner with the EXACT copy "We couldn't sign you in. Check your email and password and try again." — never revealing email-vs-password. On success it pushes to `from || "/products"` and refreshes.
- **AUTH-02 (logout everywhere):** `app/actions/auth.ts` exposes `signOutAction()` wrapping `signOut({ redirectTo: "/login" })`; the user menu (`app/components/app-shell/user-menu.tsx`) is in the topbar on every authenticated page and calls it from a destructive "Log out" item.
- **Route topology (fixes the `/` collision):** `app/page.tsx` is now a thin server component — `await auth()` then `redirect(session ? "/products" : "/login")`. It no longer imports/renders the legacy enterprise UI. The authenticated landing lives at `app/(app)/products/page.tsx`, NOT `app/(app)/page.tsx`, so `/` and the `(app)` group never resolve to the same path.
- **App shell (UI-SPEC §1):** `app/(app)/layout.tsx` (server) calls `auth()`, redirects unauthenticated users to `/login`, and renders the 56px `Topbar` (wordmark left; theme toggle + user menu right), the 240px `Sidebar`, and a 1280px max-width content column with 24px gutters wrapping `{children}` in a `Suspense` skeleton fallback.
- **Sidebar role gating (UI-SPEC §1, T-1-RBAC accept-as-UI):** MAIN nav (Products/Batches/Jobs/Gallery) always; the ADMIN section (Domain Settings/Users) renders ONLY when `role === "Admin"`; Settings is bottom-pinned. Active item = left 2px teal indicator + `bg-accent` tint + teal icon (via `usePathname`). 44px min hit area via `min-h-11`.
- **403 surface (UI-SPEC §5):** `app/(app)/forbidden/page.tsx` lives inside the `(app)` shell so a logged-in Operator still sees chrome + logout; shows the EXACT copy "You don't have access to this area. This section is Admin-only." + a "Back to Products" button.
- **Theme toggle:** `theme-toggle.tsx` flips `.dark` on `<html>` (dark default), respecting the token layer.

## Tasks Completed

| Task | Name | Commit |
|------|------|--------|
| 1 | Login page + Credentials sign-in form (AUTH-01) | e84e85b |
| 2 | Thin root redirect + app shell + Products placeholder + 403 surface (AUTH-02, UI-SPEC §1/§5) | cb02d52 |
| 3 | End-to-end login slice + UI-SPEC fidelity + no route collision (human-verify) | PENDING (manual — see below) |

## Verification

- **`npx next build` → succeeds, NO "two parallel pages resolve to the same path" error.** Route table shows `/` (ƒ dynamic redirect), `/login`, `/products`, `/forbidden` as distinct routes — the prior collision is resolved.
- **`npx tsc --noEmit` → exit 0.**
- **`npx vitest run` → 43 passed (8 files)** — the auth/RBAC/deny-default suites from 01-03/01-04 remain green; no regressions.
- Task 1 automated gate (Sign in CTA + generic error copy + signIn/signOut in actions) → OK.
- Task 2 automated gate (root is a redirect with no legacy-UI render; sidebar gates ADMIN on role; user menu has Log out; 403 copy present; products placeholder exists) → OK.

## Manual Checkpoint (Task 3) — PENDING operator visual sign-off

Per the plan (`autonomous: false`) and `workflow.human_verify_mode`, Task 3 is a human VISUAL/UX verification. All automated gates are green; the operator should eyeball the following when the dev server runs (`npm run dev`):

1. `/` unauthenticated → redirects to `/login`; `/` authenticated → redirects to `/products`.
2. Sign in with the seeded Admin (SEED_ADMIN_EMAIL/PASSWORD) → lands on the app shell (Products).
3. Teal accent (NOT purple), dark default theme, "Sign in" button loading state, wrong password shows the single calm banner (never says which field).
4. Browser refresh → still logged in (JWT HTTP-only cookie persists — AUTH-01).
5. User menu → Log out → returns to `/login` (AUTH-02).
6. (If an Operator account exists) Operator login → ADMIN nav section absent; deep-linking `/admin/users` shows the calm 403 inside the shell (server 403 verified in Plan 06).

Resume signal: type "approved" or describe any UI-SPEC / flow / route-topology mismatch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Admin role badge referenced a non-existent `accent` badge variant**
- **Found during:** Task 2 (user-menu)
- **Issue:** The plan implies a teal Admin role badge, but the 01-01b `Badge` component exposes no `accent` variant (only default/secondary/destructive/outline/ghost/link). Using `variant="accent"` would have failed typecheck.
- **Fix:** Used `variant="outline"` plus a teal className override (`border-primary/30 bg-primary/15 text-primary`) for Admin, `variant="secondary"` for Operator — matching the UI-SPEC accent intent without modifying the shared seed component.
- **Files modified:** app/components/app-shell/user-menu.tsx
- **Commit:** cb02d52

**2. [Rule 2 - Missing Critical] Open-redirect hardening on `?from=`**
- **Found during:** Task 1 (login page)
- **Issue:** Passing an attacker-controlled `?from=` straight into a post-login redirect is an open-redirect vector.
- **Fix:** `safeFrom` only honors relative in-app paths (must start with `/` and not `//`); anything else falls back to `/products`. Applied in both the login page (already-authenticated short-circuit) and the form.
- **Files modified:** app/(auth)/login/page.tsx
- **Commit:** e84e85b

**3. [Rule 3 - Blocking] Automated verifier substring sensitivity**
- **Found during:** Task 2 verify
- **Issue:** (a) The root-redirect verifier rejects any occurrence of the literal `EnterpriseApp`, which matched an explanatory code comment; (b) the 403 verifier requires the literal `don't have access`, but JSX-escaped `don&apos;t` does not contain that substring.
- **Fix:** (a) Reworded the `app/page.tsx` comment to say "legacy enterprise UI"; (b) rendered the 403 heading as a JS string literal `{"You don't have access to this area."}` so the file contains the exact phrase while staying valid JSX. No behavior change.
- **Files modified:** app/page.tsx, app/(app)/forbidden/page.tsx
- **Commit:** cb02d52

## Threat Surface

- **T-1-AUTH (mitigated):** generic error copy + `signIn` with no field-level failure; HTTP-only JWT cookie persistence (Auth.js default). No user enumeration path introduced.
- **T-1-RBAC (accept-as-UI):** sidebar hides ADMIN section for Operators; this is explicitly NOT the security boundary — `requireRole` on the server (Plan 06) is authoritative. The `(app)/forbidden` page is the friendly mirror of that server 403.
- **T-1-SESSION (mitigated):** `signOutAction` clears the session cookie and is reachable from the user menu on every authenticated page.
- No new network endpoints, file-access patterns, or schema changes were introduced beyond the plan's threat model.

## Known Stubs

- `app/(app)/products/page.tsx` is an intentional placeholder empty-state — the real Products workspace ships in a later phase. The plan scopes this surface to the Walking-Skeleton landing only; it is wired into the authenticated shell and is the documented redirect target of `/`.
- Sidebar nav targets `/batches`, `/jobs`, `/gallery`, `/settings`, `/admin/*` are links to routes that land in later plans/phases (they currently fall through to the deny-by-default / not-found behavior). This matches the phased roadmap; the active-state and gating logic is complete.

No data-rendering stubs that block the plan's goal were introduced.

## Self-Check: PASSED

- FOUND: app/actions/auth.ts
- FOUND: app/(auth)/login/page.tsx
- FOUND: app/(auth)/login/login-form.tsx
- FOUND: app/(app)/layout.tsx
- FOUND: app/(app)/products/page.tsx
- FOUND: app/(app)/forbidden/page.tsx
- FOUND: app/components/app-shell/{sidebar,topbar,user-menu,theme-toggle}.tsx
- FOUND: app/page.tsx (thin redirect, no legacy-UI import)
- FOUND: commit e84e85b (Task 1)
- FOUND: commit cb02d52 (Task 2)
- VERIFIED: `npx next build` (no route collision) + `npx tsc --noEmit` (exit 0) + `npx vitest run` (43 passed)

---
*Phase: 01-secure-foundation-secrets-db-auth*
*Completed: 2026-06-05 (Task 3 visual sign-off pending operator)*
