/**
 * 问卷 API
 *  GET  /api/surveys/published              已发布列表（无需登录）
 *  GET  /api/surveys/admin                   管理端列表（admin/operator）
 *  POST /api/surveys                         创建（admin/operator）
 *  GET  /api/surveys/:id                     详情（已发布任意人；草稿仅管理/创建人）
 *  PATCH /api/surveys/:id                    更新
 *  DELETE /api/surveys/:id                  删除
 *  POST /api/surveys/:id/responses          提交答卷（可选登录；登录用户每问卷限 1 次）
 *  GET  /api/surveys/:id/responses          答卷列表（admin/operator）
 *  GET  /api/surveys/:id/summary            选择题汇总（admin/operator）
 */

import { Router } from "express";
import { z } from "zod";
import { optionalAuth, requireAuth, requireRole } from "@/middlewares/auth";
import { rateLimit } from "@/middlewares/rateLimit";
import { BadRequestError } from "@/utils/errors";
import {
  createSurveySchema,
  listResponsesQuery,
  submitAnswersSchema,
  updateSurveySchema,
} from "@/modules/surveys/survey.schema";
import { surveyService } from "@/modules/surveys/survey.service";
import type { SurveyQuestion, SurveyStatus } from "@/modules/surveys/survey.types";

export const surveysRouter = Router();

const adminListQuery = z.object({
  status: z.enum(["draft", "published", "closed"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

surveysRouter.get("/published", async (_req, res) => {
  const data = await surveyService.listPublished();
  res.json({ success: true, data });
});

surveysRouter.get(
  "/admin",
  requireAuth,
  requireRole("admin", "operator"),
  async (req, res) => {
    const q = adminListQuery.parse(req.query);
    const data = await surveyService.listAdmin(req.user!, {
      status: q.status as SurveyStatus | undefined,
      page: q.page,
      pageSize: q.pageSize,
    });
    res.json({ success: true, data });
  },
);

surveysRouter.post(
  "/",
  requireAuth,
  requireRole("admin", "operator"),
  async (req, res) => {
    const dto = createSurveySchema.parse(req.body);
    const s = await surveyService.create(req.user!, {
      title: dto.title,
      description: dto.description ?? null,
      questions: dto.questions as SurveyQuestion[],
      status: dto.status,
    });
    res.status(201).json({ success: true, data: s });
  },
);

surveysRouter.get(
  "/:id/responses",
  requireAuth,
  requireRole("admin", "operator"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw new BadRequestError("非法 id");
    const q = listResponsesQuery.parse(req.query);
    const data = await surveyService.listResponses(req.user!, id, q.page, q.pageSize);
    res.json({ success: true, data });
  },
);

surveysRouter.get(
  "/:id/summary",
  requireAuth,
  requireRole("admin", "operator"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw new BadRequestError("非法 id");
    const data = await surveyService.summary(req.user!, id);
    res.json({ success: true, data });
  },
);

surveysRouter.post(
  "/:id/responses",
  optionalAuth,
  rateLimit({ keyBy: (r) => `survey:${r.params.id}:${r.user?.id ?? r.ip}`, window: 60, max: 15, name: "survey-submit" }),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw new BadRequestError("非法 id");
    const { answers } = submitAnswersSchema.parse(req.body);
    const data = await surveyService.submit(id, answers, req.user);
    res.status(201).json({ success: true, data });
  },
);

surveysRouter.get("/:id", optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new BadRequestError("非法 id");
  const data = await surveyService.getForReader(id, req.user);
  res.json({ success: true, data });
});

surveysRouter.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "operator"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw new BadRequestError("非法 id");
    const patch = updateSurveySchema.parse(req.body);
    const data = await surveyService.update(req.user!, id, {
      ...patch,
      questions: patch.questions as SurveyQuestion[] | undefined,
    });
    res.json({ success: true, data });
  },
);

surveysRouter.delete(
  "/:id",
  requireAuth,
  requireRole("admin", "operator"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw new BadRequestError("非法 id");
    await surveyService.remove(req.user!, id);
    res.json({ success: true, data: null });
  },
);
