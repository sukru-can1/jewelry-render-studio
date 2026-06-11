// INTEL-02 (Phase 9, T-09-05) — previewDataUrl fetches the PRIVATE preview blob
// bytes and downscales them for the vision call. Mocks @vercel/blob + sharp
// (mirrors test/comp-flatten-route.test.ts) so the suite runs with no network and
// no native libvips decode. Asserts:
//  - get() is called with (pathname, { access: "private" }) — NEVER public;
//  - the sharp resize(768, fit:"inside") -> png() -> toBuffer() chain runs;
//  - the return value is a base64 PNG data URL of the downscaled bytes;
//  - a missing blob (null / non-200) throws "preview blob missing";
//  - SOURCE GUARD: the module never routes through the /api/file proxy.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.hoisted(() => vi.fn());
vi.mock("@vercel/blob", () => ({ get: (...a: unknown[]) => getMock(...a) }));

// Controllable sharp double: factory(raw) -> chain.resize().png().toBuffer().
const sharpChain = vi.hoisted(() => ({
  resize: vi.fn(),
  png: vi.fn(),
  toBuffer: vi.fn(),
}));
const sharpFactory = vi.hoisted(() => vi.fn());
vi.mock("sharp", () => ({ default: (...a: unknown[]) => sharpFactory(...a) }));

import { previewDataUrl } from "@/lib/intelligence/preview-image";

function blobStream(bytes = "raw-preview-bytes") {
  return {
    statusCode: 200,
    blob: { contentType: "image/png" },
    stream: new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(bytes));
        c.close();
      },
    }),
  };
}

beforeEach(() => {
  getMock.mockReset();
  sharpFactory.mockReset();
  sharpChain.resize.mockReset();
  sharpChain.png.mockReset();
  sharpChain.toBuffer.mockReset();

  getMock.mockImplementation(async () => blobStream());
  sharpFactory.mockReturnValue(sharpChain);
  sharpChain.resize.mockReturnValue(sharpChain);
  sharpChain.png.mockReturnValue(sharpChain);
  sharpChain.toBuffer.mockResolvedValue(Buffer.from("tiny-downscaled-png"));
});

describe("previewDataUrl (INTEL-02 — private fetch + sharp downscale)", () => {
  it("reads the blob PRIVATELY: get(pathname, { access: 'private' })", async () => {
    await previewDataUrl("renders/job-1/preview.png");
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith("renders/job-1/preview.png", {
      access: "private",
    });
  });

  it("downscales via sharp resize(768, fit:'inside') -> png() -> toBuffer()", async () => {
    await previewDataUrl("renders/job-1/preview.png");

    // The raw private bytes reach sharp as a Buffer.
    expect(sharpFactory).toHaveBeenCalledTimes(1);
    const raw = sharpFactory.mock.calls[0][0] as Buffer;
    expect(Buffer.isBuffer(raw)).toBe(true);
    expect(raw.toString()).toBe("raw-preview-bytes");

    expect(sharpChain.resize).toHaveBeenCalledWith({
      width: 768,
      height: 768,
      fit: "inside",
    });
    expect(sharpChain.png).toHaveBeenCalledTimes(1);
    expect(sharpChain.toBuffer).toHaveBeenCalledTimes(1);
  });

  it("returns a base64 PNG data URL of the DOWNSCALED bytes", async () => {
    const url = await previewDataUrl("renders/job-1/preview.png");
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    const b64 = url.slice("data:image/png;base64,".length);
    expect(Buffer.from(b64, "base64").toString()).toBe("tiny-downscaled-png");
  });

  it("throws 'preview blob missing' when get() returns null", async () => {
    getMock.mockResolvedValueOnce(null);
    await expect(previewDataUrl("renders/missing.png")).rejects.toThrow(
      "preview blob missing",
    );
    expect(sharpFactory).not.toHaveBeenCalled();
  });

  it("throws 'preview blob missing' on a non-200 statusCode", async () => {
    getMock.mockResolvedValueOnce({ statusCode: 304 });
    await expect(previewDataUrl("renders/cached.png")).rejects.toThrow(
      "preview blob missing",
    );
  });

  it("SOURCE GUARD: never routes through /api/file and never reads public", () => {
    const src = readFileSync(
      resolve(process.cwd(), "lib/intelligence/preview-image.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\/api\/file/);
    expect(src).not.toMatch(/access:\s*["']public["']/);
    expect(src).toMatch(/access:\s*["']private["']/);
  });
});
