"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { createProduct } from "@/lib/products/actions";

import { ModelDropzone, type UploadedModel } from "./model-dropzone";

// UI-SPEC §2 — single-column new-product form: a required Product name field +
// the model dropzone. The "Create product" button is disabled until BOTH a
// non-empty name and a successful private upload exist. On success the action
// returns the new id and we route to the product detail (the action stays
// unit-testable by NOT redirecting server-side).
export function CreateProductForm() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [model, setModel] = React.useState<UploadedModel | null>(null);
  const [pending, setPending] = React.useState(false);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && model != null && !pending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setNameError(null);
    setFormError(null);

    if (!trimmedName) {
      setNameError("Enter a product name");
      return;
    }
    if (!model) return;

    setPending(true);
    try {
      const result = await createProduct({
        name: trimmedName,
        modelPathname: model.pathname,
        modelFormat: model.format,
      });

      if (result.ok) {
        router.push(`/products/${result.id}`);
        return;
      }

      // Surface zod field issues (name is the only user-editable field here).
      const fieldErrors = result.issues.fieldErrors;
      setNameError(fieldErrors.name?.[0] ?? null);
      if (!fieldErrors.name) {
        setFormError("Couldn't create the product. Try again.");
      }
    } catch {
      setFormError(
        "Couldn't create the product. Check your connection and try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-name">Product name</Label>
        <Input
          id="product-name"
          required
          autoComplete="off"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
          disabled={pending}
          aria-invalid={nameError ? true : undefined}
        />
        {nameError ? (
          <p className="text-sm text-destructive" role="alert">
            {nameError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Model</Label>
        <ModelDropzone onUploaded={setModel} disabled={pending} />
      </div>

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={!canSubmit}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {pending ? "Creating…" : "Create product"}
        </Button>
      </div>
    </form>
  );
}
