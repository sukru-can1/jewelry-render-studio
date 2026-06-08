import Link from "next/link";
import { Layers } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/app/components/ui/tooltip";

// UI-SPEC §1 entry — the "Build batch" launch button on product detail. ENABLED only
// when the product status is "ready" (has a saved object→group assignment); otherwise
// rendered disabled with the inherited groups-first tooltip (Copywriting Contract).
// Server component (a plain Link) — no client state needed.
export function BuildBatchButton({
  productId,
  status,
}: {
  productId: string;
  status: string;
}) {
  const ready = status === "ready";

  if (ready) {
    return (
      <Button asChild>
        <Link href={`/products/${productId}/batches/new`}>
          <Layers className="size-4" /> Build batch
        </Link>
      </Button>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button can't fire pointer events; wrap in a span so the
              tooltip still opens on hover. */}
          <span tabIndex={0}>
            <Button disabled className="pointer-events-none">
              <Layers className="size-4" /> Build batch
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Assign this product&apos;s parts to groups first, then you can build a batch.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
