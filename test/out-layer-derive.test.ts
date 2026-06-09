// OUT-01 (RED scaffold) — deriveLayerFromResult maps a worker output object into a
// Layer and upserts it idempotently by jobId. RED today: @/lib/orchestration/layers
// does not exist yet (Plan 02/W2 creates it).
//
// Mapping contract (handler.py:181-188 + expand.ts Combo):
//   image_blob.pathname        -> Layer.url   (pathname, never the public url — SEC-02)
//   metadata_key               -> Layer.metadataUrl
//   combo.pass                 -> Layer.pass
//   combo.stoneGroup           -> carried for grouping
//   image_blob.content_type    -> Layer.format ("image/png" -> "png", NOT hardcoded)
// Idempotency: a duplicate call for the same jobId issues another upsert with the
// SAME where:{jobId} — never a second insert key (Layer.jobId is @unique).
import { beforeEach, describe, expect, it, vi } from "vitest";

const layerMock = vi.hoisted(() => ({
  upsert: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { layer: layerMock },
}));

import { deriveLayerFromResult } from "@/lib/orchestration/layers";

const workerResult = {
  job_id: "job-abc",
  image_key: "outputs/ring99/job-abc.png",
  image_url: "https://blob.public/should-not-be-used.png",
  image_blob: {
    url: "https://blob.public/should-not-be-used.png",
    pathname: "outputs/ring99/job-abc.png",
    content_type: "image/png",
  },
  metadata_key: "outputs/ring99/job-abc.json",
  metadata_blob: {
    url: "https://blob.public/meta.json",
    pathname: "outputs/ring99/job-abc.json",
  },
};

const combo = {
  angleKey: "hero",
  metalKey: "white",
  pass: "stone",
  stoneGroup: "diamond",
} as const;

beforeEach(() => {
  layerMock.upsert.mockReset();
  layerMock.upsert.mockResolvedValue({ id: "layer-1" });
});

describe("deriveLayerFromResult (OUT-01)", () => {
  it("upserts exactly one Layer mapping pathname/metadata/pass/format from the worker output", async () => {
    await deriveLayerFromResult("job-abc", combo, workerResult);

    expect(layerMock.upsert).toHaveBeenCalledTimes(1);
    const arg = layerMock.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ jobId: "job-abc" });

    // url must be the private pathname, never the public url (SEC-02).
    const created = arg.create;
    expect(created.url).toBe("outputs/ring99/job-abc.png");
    expect(created.url).not.toBe(workerResult.image_url);
    expect(created.metadataUrl).toBe("outputs/ring99/job-abc.json");
    expect(created.pass).toBe("stone");
    // format derived from content_type, not hardcoded.
    expect(created.format).toBe("png");
  });

  it("is idempotent: a duplicate call issues another upsert with the SAME where:{jobId}", async () => {
    await deriveLayerFromResult("job-abc", combo, workerResult);
    await deriveLayerFromResult("job-abc", combo, workerResult);

    expect(layerMock.upsert).toHaveBeenCalledTimes(2);
    expect(layerMock.upsert.mock.calls[0][0].where).toEqual({ jobId: "job-abc" });
    expect(layerMock.upsert.mock.calls[1][0].where).toEqual({ jobId: "job-abc" });
    // No second distinct insert key — both writes target the same unique row.
  });
});
