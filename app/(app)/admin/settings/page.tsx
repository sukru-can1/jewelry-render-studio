import Link from "next/link";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";

// UI-SPEC §4 — Domain Settings VIEW. Admin-gated, hosted in the (app) shell.
// requireRole("Admin") runs FIRST (AUTH-05); an Operator deep-link 403s to the
// calm /forbidden surface. This is VIEW-ONLY for Phase 1 — editing is
// DATA-04/Phase 2 (RESEARCH Open Q4/A5), so there are intentionally NO edit
// fields, pinned action bar, or persistence handlers here. Node runtime (Prisma).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DomainData = {
  cameraViews: {
    id: string;
    key: string;
    label: string;
    azimuth: number;
    elevation: number;
    focalMm: number;
    fStop: number;
  }[];
  metals: { id: string; key: string; label: string; hex: string | null }[];
  objectGroups: { id: string; key: string; label: string; sortOrder: number }[];
  qualityPresets: {
    id: string;
    key: string;
    label: string;
    samples: number;
    width: number;
    height: number;
  }[];
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="rounded-lg border border-border bg-card">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  try {
    await requireRole("Admin");
  } catch (err) {
    if (err instanceof Response && err.status === 403) {
      redirect("/forbidden");
    }
    throw err;
  }

  let data: DomainData | null = null;
  let loadError = false;
  try {
    const [cameraViews, metals, objectGroups, qualityPresets] =
      await Promise.all([
        prisma.cameraView.findMany({ orderBy: { key: "asc" } }),
        prisma.metal.findMany({ orderBy: { key: "asc" } }),
        prisma.objectGroup.findMany({ orderBy: { sortOrder: "asc" } }),
        prisma.qualityPreset.findMany({ orderBy: { samples: "asc" } }),
      ]);
    data = { cameraViews, metals, objectGroups, qualityPresets };
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
          The rendering team&apos;s catalog defaults. Read-only for now — editing
          arrives in a later phase. Default resolution{" "}
          <span className="font-mono tabular-nums">1920×1920</span>.
        </p>
      </header>

      <Section
        title="Camera views"
        description="Angle, elevation, focal length, and aperture per catalog view."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>View</TableHead>
              <TableHead className="text-right">Azimuth</TableHead>
              <TableHead className="text-right">Elevation</TableHead>
              <TableHead className="text-right">Focal (mm)</TableHead>
              <TableHead className="text-right">f-stop</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.cameraViews.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{v.label}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {v.azimuth}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {v.elevation}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {v.focalMm}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  f/{v.fStop}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Metals"
        description="Catalog metal colors with their swatch hex."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metal</TableHead>
              <TableHead>Swatch</TableHead>
              <TableHead>Hex</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.metals.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.label}</TableCell>
                <TableCell>
                  <span
                    className="inline-block size-4 rounded border border-border align-middle"
                    style={{ backgroundColor: m.hex ?? "transparent" }}
                    aria-hidden
                  />
                </TableCell>
                <TableCell className="font-mono tabular-nums text-muted-foreground">
                  {m.hex ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Object groups"
        description="The metal/stone groups detected models are classified into."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Identifier</TableHead>
              <TableHead>Label</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.objectGroups.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-mono text-muted-foreground">
                  {g.key}
                </TableCell>
                <TableCell className="font-medium">{g.label}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Quality presets"
        description="Cycles sample counts per preset. All presets render at 1920×1920."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Preset</TableHead>
              <TableHead className="text-right">Samples</TableHead>
              <TableHead className="text-right">Resolution</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.qualityPresets.map((q) => (
              <TableRow key={q.id}>
                <TableCell className="font-medium">{q.label}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {q.samples}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {q.width}×{q.height}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Badge variant="secondary" className="w-fit">
        View-only · editing in a later phase
      </Badge>
    </div>
  );
}
