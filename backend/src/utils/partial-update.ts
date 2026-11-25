import { z } from 'zod';

type WithoutDefault<T> = T extends z.ZodDefault<infer Inner> ? Inner : T;

/**
 * Like `schema.partial()`, but fields left out of the input stay left out.
 *
 * In Zod 4, `.partial()` still applies `.default()` values, so a PATCH that
 * omits a field would overwrite the stored value with the create-time default.
 * This strips top-level defaults before making every field optional.
 */
export function partialUpdate<Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const base = field instanceof z.ZodDefault ? field.unwrap() : field;
    shape[key] = (base as z.ZodType).optional();
  }
  return z.object(shape as { [K in keyof Shape]: z.ZodOptional<WithoutDefault<Shape[K]>> });
}
