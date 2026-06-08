// PROD-05: products list + product card. Mocks the Prisma singleton + the RBAC
// boundary exactly like user-admin.test.ts so the page runs without a live DB or
// session. Asserts:
//  - requireSession() runs first (auth boundary to browse).
//  - prisma.product.findMany is called with orderBy createdAt desc AND includes
//    the assignment _count (the recency-sorted list that drives later phases).
//  - the rendered list contains a ProductCard per product.
//  - the product-card status-pill mapping covers the schema default ('draft'):
//    it renders a (neutral) pill label rather than an empty/unmapped one, and the
//    whole card links to /products/[id] (reopen).
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSession } from "./setup";

const requireSessionMock = vi.hoisted(() =>
  vi.fn(async () => fakeSession("Operator")),
);
vi.mock("@/lib/auth/rbac", () => ({
  requireSession: requireSessionMock,
  requireRole: vi.fn(async () => fakeSession("Admin")),
}));

const productMock = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { product: productMock },
}));

import ProductsPage from "@/app/(app)/products/page";
import { ProductCard } from "@/app/(app)/products/product-card";

// Collect every child element of a given type from a React tree (server
// component output) without needing a DOM.
function collectByType(node: unknown, type: unknown, acc: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) collectByType(child, type, acc);
    return acc;
  }
  if (!isValidElement(node)) return acc;
  const el = node as ReactElement<{ children?: unknown }>;
  if (el.type === type) acc.push(el);
  if (el.props?.children) collectByType(el.props.children, type, acc);
  return acc;
}

const products = [
  {
    id: "p-draft",
    name: "Fresh Ring",
    modelUrl: "models/fresh.glb",
    status: "draft",
    createdAt: new Date("2026-06-08T12:00:00Z"),
    _count: { assignments: 0 },
  },
  {
    id: "p-ready",
    name: "Done Ring",
    modelUrl: "models/done.glb",
    status: "ready",
    createdAt: new Date("2026-06-07T12:00:00Z"),
    _count: { assignments: 2 },
  },
];

beforeEach(() => {
  productMock.findMany.mockReset();
  requireSessionMock.mockReset();
  requireSessionMock.mockResolvedValue(fakeSession("Operator"));
});

describe("ProductsPage (PROD-05)", () => {
  it("queries findMany with orderBy createdAt desc and includes the assignment count", async () => {
    productMock.findMany.mockResolvedValue(products);

    const tree = await ProductsPage();

    expect(requireSessionMock).toHaveBeenCalled();
    expect(productMock.findMany).toHaveBeenCalledTimes(1);
    const arg = productMock.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
    expect(arg.include._count.select.assignments).toBe(true);

    // One ProductCard per product, in the recency order returned.
    const cards = collectByType(tree, ProductCard) as ReactElement<{
      product: { id: string };
    }>[];
    expect(cards).toHaveLength(2);
    expect(cards[0].props.product.id).toBe("p-draft");
  });

  it("renders the empty state when there are no products", async () => {
    productMock.findMany.mockResolvedValue([]);
    const tree = (await ProductsPage()) as ReactElement;
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("No products yet");
  });
});

describe("ProductCard status-pill mapping", () => {
  it("maps 'draft' to a neutral (non-empty) pill, not an unmapped/blank one", () => {
    const html = renderToStaticMarkup(
      ProductCard({
        product: {
          id: "p-draft",
          name: "Fresh Ring",
          modelUrl: "models/fresh.glb",
          status: "draft",
          createdAt: new Date("2026-06-08T12:00:00Z"),
        },
      }) as ReactElement,
    );
    // draft is mapped (UI-SPEC §1): a freshly-created product still shows a pill.
    expect(html).toContain("needs inspection");
    // whole card links to the detail page (reopen).
    expect(html).toContain('href="/products/p-draft"');
    // mono filename shown.
    expect(html).toContain("fresh.glb");
  });

  it("falls back to a neutral pill for an unknown status (never blank)", () => {
    const html = renderToStaticMarkup(
      ProductCard({
        product: {
          id: "p-x",
          name: "X",
          modelUrl: null,
          status: "some_future_status",
          createdAt: new Date("2026-06-08T12:00:00Z"),
        },
      }) as ReactElement,
    );
    expect(html).toContain("some_future_status");
  });
});
