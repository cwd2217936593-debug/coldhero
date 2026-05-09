import { z } from "zod";

const FAULT_TYPES = ["制冷", "电气", "门禁", "传感器", "控制", "其他"] as const;
const SEVERITY = ["low", "medium", "high", "critical"] as const;
const STATUS = ["pending", "processing", "closed"] as const;

export const faultImageSchema = z.object({
  key: z.string().min(1),
  url: z.string().min(1),
  size: z.number().int().nonnegative().optional(),
});

export const createFaultSchema = z.object({
  zoneId: z.coerce.number().int().positive().nullable().optional(),
  faultType: z.enum(FAULT_TYPES),
  title: z.string().min(2).max(200),
  description: z.string().min(5).max(4000),
  imageUrls: z.array(faultImageSchema).max(8).optional().default([]),
  severity: z.enum(SEVERITY).optional(),
});

export const listFaultQuerySchema = z.object({
  status: z.enum(STATUS).optional(),
  severity: z.enum(SEVERITY).optional(),
  zoneId: z.coerce.number().int().positive().optional(),
  keyword: z.string().max(120).optional(),
  mine: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateFaultStatusSchema = z.object({
  status: z.enum(STATUS).optional(),
  severity: z.enum(SEVERITY).optional(),
  handlerId: z.coerce.number().int().positive().nullable().optional(),
  handlerNote: z.string().max(2000).nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "至少更新一个字段" });

export const presignSchema = z.object({
  filename: z.string().min(1).max(160),
  contentType: z.string().min(3).max(120),
});
