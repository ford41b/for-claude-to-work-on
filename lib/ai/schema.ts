import { z } from "zod";

/** Case/whitespace-tolerant enum: accepts "High" for "high", still advertises the enum. */
export function lenientEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z
    .string()
    .transform((s) => s.trim().toLowerCase().replace(/[\s-]+/g, "_"))
    .pipe(z.enum(values));
}

/** Same as lenientEnum but for UPPER_CASE enums. */
export function lenientUpperEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z
    .string()
    .transform((s) => s.trim().toUpperCase().replace(/[\s-]+/g, "_"))
    .pipe(z.enum(values));
}

export const confidenceSchema = lenientEnum(["high", "medium", "low"] as const);
export type ConfidenceLevel = z.infer<typeof confidenceSchema>;

/** Source keys the model may cite (validated against the catalog after parsing). */
export const sourceKeysSchema = z.array(z.string().max(24)).max(12).describe(
  "Keys of the provided evidence units that support this item, e.g. [\"V7\",\"N3\"]. Only use keys that appear in the input.",
);

const ALLOWED_KEYS = new Set([
  "type",
  "properties",
  "required",
  "items",
  "enum",
  "description",
  "anyOf",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "format",
  "title",
  "nullable",
  "propertyOrdering",
]);

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if ((key === "minimum" || key === "maximum") && typeof value === "number" && Math.abs(value) > 1e12) continue;
    if (key === "properties" && value && typeof value === "object") {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitize(v)]),
      );
      continue;
    }
    out[key] = sanitize(value);
  }
  return out;
}

/**
 * Converts a Zod schema to the JSON Schema subset structured-output providers accept.
 * Validation always happens again with Zod on the response — this schema only guides the model.
 */
export function toProviderSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "output", unrepresentable: "any", target: "draft-2020-12" });
  return sanitize(json) as Record<string, unknown>;
}
