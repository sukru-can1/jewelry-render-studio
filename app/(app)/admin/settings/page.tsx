import Link from "next/link";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/app/components/ui/button";

import { SettingsForms, type SettingsData } from "./settings-forms";

// UI-SPEC §5 — Domain Settings EDIT (DATA-04). Admin-gated, hosted in the (app)
// shell. requireRole("Admin") runs FIRST (AUTH-05); an Operator deep-link 403s to
// the calm /forbidden surface — but the page redirect is NOT the security
// boundary: each save Server Action re-checks requireRole("Admin") (defense in
// depth). This page reads the four domain tables and hands them to the editable
// <SettingsForms/> client component. Node runtime (Prisma).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  try {
    await requireRole("Admin");
  } catch (err) {
    if (err instanceof Response && err.status === 403) {
      redirect("/forbidden");
    }
    throw err;
  }

  let data: SettingsData | null = null;
  let loadError = false;
  try {
    const [cameraViews, metals, stoneTypes, qualityPresets] =
      await Promise.all([
        prisma.cameraView.findMany({ orderBy: { key: "asc" } }),
        prisma.metal.findMany({ orderBy: { key: "asc" } }),
        prisma.stoneType.findMany({ orderBy: { key: "asc" } }),
        prisma.qualityPreset.findMany({ orderBy: { samples: "asc" } }),
      ]);
    data = {
      cameraViews,
      metals,
      stoneTypes: stoneTypes.map((s) => ({
        id: s.id,
        key: s.key,
        label: s.label,
      })),
      qualityPresets,
    };
  } catch {
    loadError = true;
  }

  if (loadError || !data) {
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">
            Domain settings
          </h1>
        </header>
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-foreground">
            Couldn&apos;t load settings. Check your connection and try again.
          </p>
          <Button variant="secondary" className="mt-4" asChild>
            <Link href="/admin/settings">Retry</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">
          Domain settings
        </h1>
        <p className="text-sm text-muted-foreground">
          The rendering team&apos;s catalog defaults. Edits apply to new batches,
          not to renders already created. Default resolution{" "}
          <span className="font-mono tabular-nums">1920×1920</span>.
        </p>
      </header>

      <SettingsForms data={data} />
    </div>
  );
}
