import bcrypt from "bcryptjs";

// Test data factories consumed by RBAC/admin tests in later waves. These return
// plain User-shaped objects (no DB write) — persistence is exercised in Plan 02
// integration tests. passwordHash is a real bcrypt hash of a known test password
// so `authorize()`-style comparisons can be asserted.

export const TEST_PASSWORD = "test-password-123";

const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 10);

export function adminUser(overrides: Partial<UserFactory> = {}): UserFactory {
  return {
    id: "test-admin-id",
    email: "admin@example.com",
    role: "Admin",
    disabled: false,
    passwordHash,
    ...overrides,
  };
}

export function operatorUser(overrides: Partial<UserFactory> = {}): UserFactory {
  return {
    id: "test-operator-id",
    email: "operator@example.com",
    role: "Operator",
    disabled: false,
    passwordHash,
    ...overrides,
  };
}

export interface UserFactory {
  id: string;
  email: string;
  role: "Admin" | "Operator";
  disabled: boolean;
  passwordHash: string;
}

// Phase 2 (PROD-02/03) — a representative inspect_materials.py JSON object.
// Deliberately includes: one non-MESH node (CAMERA, no bounds) to exercise the
// MESH filter; one glass MESH whose principled socket is named "Transmission
// Weight" (Blender-version drift) to exercise defensive BSDF lookup; one metal
// MESH. Mirrors workers/runpod-blender/inspect_materials.py output shape exactly.
export function inventoryFixture(): Record<string, unknown> {
  return {
    source: "/tmp/ring99.glb",
    objects: [
      {
        name: "InspectCamera",
        type: "CAMERA",
        material_slots: [],
        children: [],
        hide_render: false,
        hide_viewport: false,
        visible_get: true,
        // no bounds on non-MESH nodes
      },
      {
        name: "band_metal",
        type: "MESH",
        material_slots: ["Gold", null],
        children: [],
        hide_render: false,
        hide_viewport: false,
        visible_get: true,
        bounds: {
          min: [-5, -5, -1],
          max: [5, 5, 1],
          size: [10, 10, 2],
          max_dimension: 10,
        },
      },
      {
        name: "center_diamond",
        type: "MESH",
        material_slots: ["Glass"],
        children: [],
        hide_render: false,
        hide_viewport: false,
        visible_get: true,
        bounds: {
          min: [-1, -1, -1],
          max: [1, 1, 1],
          size: [2, 2, 2],
          max_dimension: 2,
        },
      },
    ],
    materials: [
      {
        name: "Gold",
        use_nodes: true,
        diffuse_color: [0.8, 0.6, 0.1, 1],
        principled: {
          "Base Color": [0.8, 0.6, 0.1, 1],
          Metallic: 1.0,
          Roughness: 0.2,
          IOR: 1.45,
        },
        nodes: [],
      },
      {
        name: "Glass",
        use_nodes: true,
        diffuse_color: [1, 1, 1, 1],
        principled: {
          "Base Color": [1, 1, 1, 1],
          Metallic: 0.0,
          Roughness: 0.0,
          // Blender-version-dependent socket name — parser must resolve it.
          "Transmission Weight": 1.0,
          IOR: 2.417,
        },
        nodes: [],
      },
    ],
  };
}

// One-row-per-group assignment data for later plans (PROD-03/04). objectTokens
// carry object signatures (not ids) so Phase 3 can match them as holdout `contains`.
export function assignmentFactory(productId = "test-product-id") {
  return [
    { productId, group: "alloycolour", objectTokens: ["band_metal gold"] },
    { productId, group: "diamond", objectTokens: ["center_diamond glass"] },
  ];
}
