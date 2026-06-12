import type { Metadata } from "next";
import Link from "next/link";
import { Box, Plus } from "lucide-react";

import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/app/components/ui/button";

import { ProductCard } from "./product-card";

// UI-SPEC §1 — Products list (PROD-05). Async Server Component, Node runtime
// (Prisma), force-dynamic so the grid always reflects the latest state.
// requireSession() runs FIRST (an Operator must be authenticated to browse).
//
// Sort: most-recent first. There is NO updatedAt column on Product — order by
// createdAt desc (do NOT add a migration here). Single-tenant: every product is
// listed (T-02-19 IDOR accepted — per-workspace ownership is a v2 concern;
// requireSession is still required).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Products" };

const EMPTY_BODY =
  "Upload your first jewelry model to inspect it and assign its parts to render groups.";

export default async function ProductsPage() {
  await requireSession();

  let products: Awaited<ReturnType<typeof loadProducts>> | null = null;
  let loadError = false;
  try {
    products = await loadProducts();
  } catch {
    loadError = true;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold leading-tight text-foreground">
            Products
          </h1>
          {products ? (
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {products.length}
            </span>
          ) : null}
        </div>
        <Button asChild>
          <Link href="/products/new">
            <Plus className="size-4" strokeWidth={2} />
            New product
          </Link>
        </Button>
      </header>

      {loadError ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-foreground">
            Couldn&apos;t load products. Check your connection and try again.
          </p>
          <Button variant="secondary" className="mt-4" asChild>
            <Link href="/products">Retry</Link>
          </Button>
        </div>
      ) : products && products.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Box className="size-5" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-foreground">No products yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">{EMPTY_BODY}</p>
          </div>
          <Button asChild className="mt-2">
            <Link href="/products/new">
              <Plus className="size-4" strokeWidth={2} />
              New product
            </Link>
          </Button>
        </div>
      ) : products ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={{
                id: product.id,
                name: product.name,
                modelUrl: product.modelUrl,
                status: product.status,
                createdAt: product.createdAt,
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// recency-sorted product list with the assignment count (drives later phases).
async function loadProducts() {
  return prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { assignments: true } } },
  });
}
