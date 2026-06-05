---
phase: 01-secure-foundation-secrets-db-auth
plan: 01b
type: execute
wave: 0
depends_on: []
files_modified:
  - components.json
  - app/globals.css
  - app/layout.tsx
  - postcss.config.mjs
  - lib/utils.ts
autonomous: true
requirements: [UI-02]
must_haves:
  truths:
    - "shadcn/Tailwind v4 token layer + Geist fonts load through a single reconciled global stylesheet"
    - "globals.css carries the UI-SPEC semantic teal token layer for :root (light) and .dark with no purple"
    - "The 16-component shadcn set the later UI plans consume exists under app/components/ui"
    - "layout.tsx imports only globals.css (styles.css is no longer imported) — no two competing global stylesheets"
  artifacts:
    - path: "app/globals.css"
      provides: "UI-SPEC token CSS variables (:root + .dark)"
      contains: "--primary"
    - path: "components.json"
      provides: "shadcn config (new-york / neutral / cssVars)"
    - path: "lib/utils.ts"
      provides: "cn() class-merge helper for shadcn components"
      contains: "clsx"
  key_links:
    - from: "app/layout.tsx"
      to: "app/globals.css"
      via: "single global stylesheet import + Geist fonts"
      pattern: "globals.css"
---

<objective>
Stand up the design-token layer of the Walking Skeleton: run `shadcn init` on Tailwind v4, reconcile the existing
`app/styles.css` into a single `app/globals.css`, seed the exact UI-SPEC semantic teal token layer (`:root` + `.dark`,
no purple), load Geist Sans/Mono, and add the shadcn component set the later UI plans (01-05, 01-06) consume. Split
out of 01-01 so the design-token layer does not compete with the Prisma/env contracts (RESEARCH Pitfall #7).

Purpose: Plans 01-05 (login + app shell) and 01-06 (admin surfaces) import shadcn components and read the teal token
layer. Defining the design system first prevents downstream scavenger hunts and keeps the foundation install plan focused.
Output: components.json, reconciled app/globals.css with the teal token layer, app/layout.tsx with Geist + dark theme,
postcss.config.mjs, lib/utils.ts, and the shadcn component set under app/components/ui.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-secure-foundation-secrets-db-auth/01-RESEARCH.md
@.planning/phases/01-secure-foundation-secrets-db-auth/01-UI-SPEC.md
@.planning/phases/01-secure-foundation-secrets-db-auth/SKELETON.md

<interfaces>
<!-- Existing app contracts the executor must NOT break. Extend, do not restructure. -->
From tsconfig.json: path alias `@/*` → `./*` (baseUrl "."). moduleResolution "bundler", jsx "preserve", strict true.
From app/layout.tsx: currently imports "./styles.css" and renders <html lang="en"><body>{children}</body>. This plan
reconciles styles.css → globals.css and adds Geist fonts + theme class.
From package.json (installed by 01-01): next ^15.1.4, react ^19, geist (latest). Tailwind v4 + tailwind-merge/clsx are
added by `shadcn init` in THIS plan — they are not hand-added in 01-01.
NOTE: 01-01 owns package.json/deps and does NOT touch components.json, app/globals.css, app/layout.tsx, postcss.config.mjs,
or lib/utils.ts — those five files are owned exclusively by this plan (no file overlap, both are wave 0).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: shadcn/Tailwind v4 init + UI-SPEC token layer + Geist fonts (reconcile single stylesheet)</name>
  <read_first>.planning/phases/01-secure-foundation-secrets-db-auth/01-UI-SPEC.md (shadcn Setup, Token Architecture, Color, Typography), app/layout.tsx, app/styles.css</read_first>
  <files>components.json, app/globals.css, app/layout.tsx, postcss.config.mjs, lib/utils.ts</files>
  <action>
    Run `npx shadcn@latest init` with: style `new-york`, base color `neutral`, CSS variables `yes`, RSC `yes`,
    aliases `@/components` and `@/lib/utils`. This adds Tailwind v4, `tailwind-merge`/`clsx`, `lib/utils.ts`,
    `components.json`, and a `globals.css`. Add the shadcn component set the later UI plans consume:
    `npx shadcn@latest add button input label table badge dialog card dropdown-menu sonner form select switch skeleton avatar tooltip separator`.
    RECONCILE the two stylesheets (RESEARCH PITFALL #7): migrate any needed rules from existing `app/styles.css`
    into `app/globals.css`, point `components.json` `tailwind.css` at `app/globals.css`, import only `globals.css`
    in layout.tsx, and stop importing `styles.css`. Do NOT leave two competing global stylesheets.
    Seed the EXACT semantic CSS-variable token layer from UI-SPEC into `globals.css` `:root` (light) and `.dark`:
    map `--background`, `--foreground`, `--card`, `--muted(-foreground)`, `--border`, `--ring`, `--primary`
    (teal — dark `#14B8A6`, light `#0D9488`), `--destructive`, plus `--success`, `--warning`, `--info`,
    `--accent` per the dark/light tables and the status-pill colors. NO purple anywhere.
    In `layout.tsx`: load Geist Sans + Geist Mono via `next/font` (or the `geist` package's `GeistSans`/`GeistMono`),
    apply their CSS variables + `className="dark"` on `<html>` (dark is the default ops-console theme), keep `lang="en"`.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const c=fs.readFileSync('app/globals.css','utf8');if(!/--primary/.test(c)||!/\.dark/.test(c))throw new Error('tokens missing');if(/#8b5cf6|#a855f7|purple|indigo/i.test(c))throw new Error('purple found');if(fs.existsSync('app/styles.css')&&fs.readFileSync('app/layout.tsx','utf8').includes('styles.css'))throw new Error('two stylesheets');console.log('OK')"</automated>
  </verify>
  <done>components.json present (new-york/neutral/cssVars), globals.css holds the semantic teal token layer for :root + .dark with no purple, layout.tsx imports only globals.css and loads Geist + dark theme, the 16-component shadcn set exists under app/components/ui.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| design tokens → rendered UI | Tokens are the only color source; raw purple hex must never reach a brand/accent surface |
| shadcn registry → app | Only the official shadcn/ui registry is used (UI-SPEC: no third-party registries) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-1-UI-TOKEN | Tampering | token stylesheet | mitigate | Single reconciled globals.css; verify gate rejects purple; tokens copied exactly from UI-SPEC |
| T-1-SC | Tampering | shadcn/Tailwind installs | mitigate | Official shadcn/ui + Tailwind v4 only; no third-party registries (UI-SPEC §shadcn Setup) |
</threat_model>

<verification>
- `app/globals.css` is the only global stylesheet imported and contains the teal token layer with no purple.
- `components.json` exists (new-york / neutral / cssVars).
- The 16-component shadcn set exists under `app/components/ui`.
</verification>

<success_criteria>
The shadcn/Tailwind v4 design-token layer + Geist fonts load through one reconciled stylesheet with the exact
UI-SPEC teal tokens (no purple); the shadcn component set is present. Downstream UI plans (01-05, 01-06) can import
every component and read every token this plan defines.
</success_criteria>

<output>
Create `.planning/phases/01-secure-foundation-secrets-db-auth/01-01b-SUMMARY.md` when done.
</output>
