/**
 * 管理员 · 区域管理 API（提示词 Step 8）
 * --------------------------------
 * GET /api/admin/regions
 * POST /api/admin/regions       body: { name, description? }
 * PATCH /api/admin/regions/:id  body: { name?, description? }
 */

import { Router } from "express";
import { z } from "zod";
import { regionsRepo } from "@/modules/regions/regions.repository";
import { BadRequestError, ConflictError, NotFoundError } from "@/utils/errors";

function isMysqlDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "ER_DUP_ENTRY";
}

const router = Router();

const bodyCreate = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(256).optional(),
});

router.get("/", async (_req, res) => {
  const rows = await regionsRepo.list();
  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      createdAt: r.created_at,
    })),
  });
});

router.post("/", async (req, res) => {
  const dto = bodyCreate.parse(req.body);
  try {
    const id = await regionsRepo.create({ name: dto.name, description: dto.description });
    res.status(201).json({ success: true, data: { id } });
  } catch (e) {
    if (isMysqlDuplicateKey(e)) throw new ConflictError("区域名称已存在");
    throw e;
  }
});

const bodyPatch = z.object({
  name: z.string().min(1).max(64).optional(),
  description: z.string().max(256).nullable().optional(),
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw new BadRequestError("id 无效");
  const exists = await regionsRepo.findById(id);
  if (!exists) throw new NotFoundError("区域不存在");
  const dto = bodyPatch.parse(req.body);
  try {
    await regionsRepo.update(id, dto);
  } catch (e) {
    if (isMysqlDuplicateKey(e)) throw new ConflictError("区域名称已存在");
    throw e;
  }
  res.json({ success: true, data: null });
});

export default router;
