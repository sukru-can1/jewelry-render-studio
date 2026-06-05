import { Box } from "lucide-react";

// Authenticated Products landing placeholder (the route `/` redirects signed-in
// users to). Generic empty state per the Copywriting Contract — the real
// product workspace ships in a later phase.
export default function ProductsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold leading-tight text-foreground">
        Products
      </h1>

      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Box className="size-5" strokeWidth={1.75} />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-foreground">
            Nothing here yet
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            When you create your first product, it&apos;ll show up here.
          </p>
        </div>
      </div>
    </div>
  );
}
