import type { Metadata } from "next";

import { requireSession } from "@/lib/auth/rbac";
import { PageBreadcrumb } from "@/app/components/app-shell/page-breadcrumb";

import { CreateProductForm } from "../create-product-form";

// UI-SPEC §2 — the /products/new surface. Server Component: requireSession() as
// the first line (deny-by-default belt-and-suspenders alongside middleware +
// layout), then renders the "New product" heading and the client form. The
// model itself uploads direct-to-PRIVATE-Blob from the form's dropzone.
export const runtime = "nodejs";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireSession();

  return (
    <div className="flex flex-col gap-6">
      <PageBreadcrumb
        items={[{ label: "Products", href: "/products" }, { label: "New" }]}
      />
      <h1 className="text-xl font-semibold leading-tight text-foreground">
        New product
      </h1>
      <CreateProductForm />
    </div>
  );
}
