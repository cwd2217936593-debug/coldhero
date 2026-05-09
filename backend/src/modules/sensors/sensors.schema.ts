import { z } from "zod";

export const sensorIngestSchema = z.object({
  zoneId: z.number().int().positive(),
  temperature: z.number().min(-100).max(100).optional(),
  humidity: z.number().min(0).max(100).optional(),
  co2: z.number().min(0).max(100000).optional(),
  doorStatus: z.enum(["open", "closed", "unknown"]).optional(),
  recordedAt: z.coerce.date().optional(),
});

export const sensorBatchIngestSchema = z.object({
  items: z.array(sensorIngestSchema).min(1).max(200),
});

export const sensorSeriesQuerySchema = z.object({
  /** 形如 '2h' / '24h' / '7d'，默认 2h */
  window: z.string().regex(/^\d+[hd]$/).optional(),
  /** 或显式 from/to（ISO） */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(20000).optional(),
});

export type SensorIngestBody = z.infer<typeof sensorIngestSchema>;
export type SensorSeriesQuery = z.infer<typeof sensorSeriesQuerySchema>;
