import { Router } from "express";
import { requireAuth } from "@/middlewares/auth";
import { requireQuota } from "@/middlewares/quota";
import { rateLimit } from "@/middlewares/rateLimit";
import { reportsService } from "@/modules/reports/reports.service";
import { quotaService } from "@/modules/quota/quota.service";
import { createReportSchema, listReportsQuery } from "@/modules/reports/reports.schema";
import { BadRequestError } from "@/utils/errors";

export const reportsRouter: Router = Router();
reportsRouter.use(requireAuth);

// 提交：消耗 report 配额（中间件已计数；失败时退还）
reportsRouter.post(
  "/",
  rateLimit({ keyBy: "user", window: 60, max: 10, name: "report-create" }),
  requireQuota("report"),
  async (req, res) => {
    const dto = createReportSchema.parse(req.body);
    try {
      const report = await reportsService.submit(req.user!, dto);
      res.status(201).json({ success: true, data: report });
    } catch (err) {
      // 退还配额：业务侧失败（如 docx 套餐不允许），由 quota service 把刚刚消耗的 1 次还回去
      await quotaService.refund(req.user!.id, "report").catch(() => {});
      throw err;
    }
  },
);

reportsRouter.get("/", async (req, res) => {
  const q = listReportsQuery.parse(req.query);
  const result = await reportsService.list(req.user!, q);
  res.json({ success: true, data: result });
});

reportsRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new BadRequestError("非法 id");
  const r = await reportsService.detail(req.user!, id);
  res.json({ success: true, data: r });
});

reportsRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new BadRequestError("非法 id");
  await reportsService.remove(req.user!, id);
  res.json({ success: true, data: null });
});
