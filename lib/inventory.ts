// PROD-02 — parser for the worker's inspect_materials.py output (the fixed shape,
// verified in workers/runpod-blender/inspect_materials.py).
//
// Two correctness rules carried from RESEARCH:
//  - Only MESH objects are render targets — non-MESH nodes (EMPTY/CAMERA/LIGHT)
//    are excluded from the assignable objects list (Pitfall 5).
//  - BSDF socket names drift across Blender versions ("Transmission" vs
//    "Transmission Weight"); read principled{} DEFENSIVELY by normalized
//    substring match, never a hard-required fixed key set (Pitfall 4).
//
// The object `signature` is computed exactly as render_scene.py object_signature
// (lowercased "<name> <space-joined non-null material slots>") so token-assist
// and the Phase-3 recipe builder match the same string.

export interface InventoryObject {
  name: string;
  type: string;
  materialSlots: (string | null)[];
  maxDimension: number | null;
  signature: string;
}

export interface InventoryMaterial {
  name: string;
  baseColor: number[] | null;
  metallic: number | null;
  roughness: number | null;
  transmission: number | null;
  ior: number | null;
}

export interface ParsedInventory {
  source: string | null;
  objects: InventoryObject[];
  materials: InventoryMaterial[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Compute the object signature exactly as the worker's render-time
 * object_signature: lowercased name + space-joined non-null material slot names.
 */
function computeSignature(name: string, slots: (string | null)[]): string {
  const parts = [name, ...slots.filter((s): s is string => typeof s === "string")];
  return parts.join(" ").toLowerCase().trim();
}

/**
 * Defensive numeric lookup over a principled{} socket map. Matches by normalized
 * (lowercased) substring so version-renamed sockets still resolve. Returns the
 * first scalar number found, else null.
 */
function findScalar(principled: Record<string, unknown>, needle: string): number | null {
  const target = needle.toLowerCase();
  for (const [key, value] of Object.entries(principled)) {
    if (key.toLowerCase().includes(target) && typeof value === "number") {
      return value;
    }
  }
  return null;
}

/**
 * Defensive vector (e.g. Base Color RGBA) lookup. Returns the first array-valued
 * socket whose normalized name matches, coerced to numbers; else null.
 */
function findVector(principled: Record<string, unknown>, needle: string): number[] | null {
  const target = needle.toLowerCase();
  for (const [key, value] of Object.entries(principled)) {
    if (key.toLowerCase().includes(target) && Array.isArray(value)) {
      return value.map((v) => (typeof v === "number" ? v : Number(v)));
    }
  }
  return null;
}

function parseObject(raw: unknown): InventoryObject | null {
  if (!isRecord(raw)) return null;
  if (raw.type !== "MESH") return null;

  const name = typeof raw.name === "string" ? raw.name : "";
  const materialSlots = asArray(raw.material_slots).map((s) =>
    typeof s === "string" ? s : null,
  );

  let maxDimension: number | null = null;
  if (isRecord(raw.bounds) && typeof raw.bounds.max_dimension === "number") {
    maxDimension = raw.bounds.max_dimension;
  }

  return {
    name,
    type: "MESH",
    materialSlots,
    maxDimension,
    signature: computeSignature(name, materialSlots),
  };
}

function parseMaterial(raw: unknown): InventoryMaterial | null {
  if (!isRecord(raw)) return null;
  const name = typeof raw.name === "string" ? raw.name : "";
  const principled = isRecord(raw.principled) ? raw.principled : {};

  return {
    name,
    baseColor: findVector(principled, "base color"),
    metallic: findScalar(principled, "metallic"),
    roughness: findScalar(principled, "roughness"),
    transmission: findScalar(principled, "transmission"),
    ior: findScalar(principled, "ior"),
  };
}

/**
 * Parse the raw inspect_materials.py JSON into a typed inventory: MESH-only
 * objects with computed signatures, and materials with defensively-extracted
 * BSDF values. Never throws on malformed input — missing/garbage shapes yield
 * empty lists.
 */
export function parseInventory(raw: unknown): ParsedInventory {
  if (!isRecord(raw)) {
    return { source: null, objects: [], materials: [] };
  }

  const objects = asArray(raw.objects)
    .map(parseObject)
    .filter((o): o is InventoryObject => o !== null);

  const materials = asArray(raw.materials)
    .map(parseMaterial)
    .filter((m): m is InventoryMaterial => m !== null);

  return {
    source: typeof raw.source === "string" ? raw.source : null,
    objects,
    materials,
  };
}
