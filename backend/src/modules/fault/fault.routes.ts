import { Router } from "express";
import multer from "multer";
import { requireAuth } from "@/middlewares/auth";
import { rateLimit } from "@/middlewares/rateLimit";
import { getStorage } from "@/services/storage";
import { faultService } from "@/modules/fault/fault.service";
import { faultRepo } from "@/modules/fault/fault.repository";
import {
  createFaultSchema,
  listFaultQuerySchema,
  presignSchema,
  updateFaultStatusSchema,
} from "@/modules/fault/fault.schema";
import { BadRequestError } from "@/utils/errors";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 8 }, // 单图 10MB，最多 8 张
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|gif|bmp)$/i.test(file.mimetype)) {
      return cb(new BadRequestError("仅支持图片格式：png / jpg / webp / gif / bmp"));
    }
    cb(null, true);
  },
});

export const faultsRouter: Router = Router();

faultsRouter.use(requireAuth);

// =============================================================
// 上传 / 直传签名
// =============================================================

/**
 * POST /api/fault-reports/uploads
 * 后端代收 multipart 文件 → 转写到 OSS / 本地
 * 返回：{ uploads: [{ key, url, contentType, size }] }
 */
faultsRouter.post(
  "/uploads",
  rateLimit({ keyBy: "user", window: 60, max: 30, name: "fault-upload" }),
  upload.array("files", 8),
  async (req, res) => {
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) throw new BadRequestError("未收到文件");
    const storage = getStorage();
    const results = await Promise.all(
      files.map(async (f) => {
        const out = await storage.putBuffer({
          dir: `fault/${req.user!.id}`,
          filename: f.originalname,
          contentType: f.mimetype,
          buffer: f.buffer,
        });
        return out;
      }),
    );
    res.json({ success: true, data: { uploads: results, backend: storage.kind } });
  },
);

/**
 * POST /api/fault-reports/uploads/presign
 * 直传 OSS 签名（仅 OSS 模式可用）；本地后备会返回 null 让前端回落到 multipart
 */
faultsRouter.post("/uploads/presign", async (req, res) => {
  const dto = presignSchema.parse(req.body);
  const storage = getStorage();
  if (!storage.presignPut) {
    return res.json({ success: true, data: null });
  }
  const out = await storage.presignPut({
    dir: `fault/${req.user!.id}`,
    filename: dto.filename,
    contentType: dto.contentType,
    expiresSec: 600,
  });
  res.json({ success: true, data: out ? { ...out, publicUrl: storage.toUrl(out.key) } : null });
});

// =============================================================
// 业务接口
// =============================================================

faultsRouter.post(
  "/",
  rateLimit({ keyBy: "user", window: 60, max: 10, name: "fault-create" }),
  async (req, res) => {
    const dto = createFaultSchema.parse(req.body);
    const report = await faultService.submit(req.user!, {
      zoneId: dto.zoneId ?? null,
      faultType: dto.faultType,
      title: dto.title,
      description: dto.description,
      imageUrls: dto.imageUrls,
      severity: dto.severity,
    });
    res.status(201).json({ success: true, data: report });
  },
);

faultsRouter.get("/", async (req, res) => {
  const q = listFaultQuerySchema.parse(req.query);
  const result = await faultService.list(req.user!, q);
  res.json({ success: true, data: result });
});

faultsRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new BadRequestError("非法 id");
  const r = await faultService.detail(req.user!, id);
  res.json({ success: true, data: r });
});

faultsRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new BadRequestError("非法 id");
  const patch = updateFaultStatusSchema.parse(req.body);
  const r = await faultService.updateStatus(req.user!, id, patch);
  res.json({ success: true, data: r });
});

faultsRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new BadRequestError("非法 id");
  await faultService.remove(req.user!, id);
  res.json({ success: true, data: null });
});

/**
 * POST /api/fault-reports/:id/reanalyze
 * 重新触发 AI 分析（覆盖 ai_analysis 字段）
 */
faultsRouter.post("/:id/reanalyze", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new BadRequestError("非法 id");
  const r = await faultService.detail(req.user!, id);
  // 复用 service 的异步逻辑：直接 inline 触发
  const { faultAi } = await import("@/modules/fault/fault.ai");
  const ai = await faultAi.analyze({
    zoneId: r.zoneId,
    faultType: r.faultType,
    title: r.title,
    description: r.description,
    images: r.imageUrls,
  });
  await faultRepo.setAiAnalysis(id, ai.text, ai.severity ?? undefined);
  const updated = await faultService.detail(req.user!, id);
  res.json({ success: true, data: updated });
});
