import { z } from "zod";

export const zoneCreateSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "code 仅支持字母、数字、_ 和 -"),
  name: z.string().min(1).max(128),
  tempMin: z.number().min(-100).max(100),
  tempMax: z.number().min(-100).max(100),
  humidityMin: z.number().min(0).max(100).nullable().optional(),
  humidityMax: z.number().min(0).max(100).nullable().optional(),
  co2Max: z.number().min(0).max(100000).nullable().optional(),
  description: z.string().max(512).nullable().optional(),
  isPublic: z.boolean().optional(),
});

export const zoneUpdateSchema = zoneCreateSchema.partial();

export type ZoneCreateBody = z.infer<typeof zoneCreateSchema>;
export type ZoneUpdateBody = z.infer<typeof zoneUpdateSchema>;
