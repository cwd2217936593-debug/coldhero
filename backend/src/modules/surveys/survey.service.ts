/**
 * 问卷业务：权限裁剪 + 答案校验
 */

import { surveysRepo } from "@/modules/surveys/survey.repository";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/utils/errors";
import type { AuthUser } from "@/types/express";
import type {
  Survey,
  SurveyAnswers,
  SurveyQuestion,
  SurveyResponse,
  SurveyStatus,
} from "@/modules/surveys/survey.types";

function canManage(user: AuthUser): boolean {
  return user.role === "admin" || user.role === "operator";
}

export function validateAnswers(questions: SurveyQuestion[], raw: SurveyAnswers): SurveyAnswers {
  const out: SurveyAnswers = {};
  for (const q of questions) {
    const v = raw[q.id];
    if (v === undefined || v === null) {
      throw new BadRequestError(`题目「${q.title}」未填写`);
    }
    if (q.type === "text") {
      if (typeof v !== "string") throw new BadRequestError(`题目「${q.title}」格式错误（应为文本）`);
      const s = v.trim();
      if (!s) throw new BadRequestError(`题目「${q.title}」不能为空`);
      if (s.length > 4000) throw new BadRequestError(`题目「${q.title}」过长（≤4000 字）`);
      out[q.id] = s;
    } else if (q.type === "single") {
      if (typeof v !== "string") throw new BadRequestError(`题目「${q.title}」格式错误（应为单选）`);
      if (!q.options!.includes(v)) throw new BadRequestError(`题目「${q.title}」选项非法`);
      out[q.id] = v;
    } else {
      if (!Array.isArray(v) || v.length === 0) throw new BadRequestError(`题目「${q.title}」请至少选择一项`);
      const set = new Set<string>();
      for (const x of v) {
        if (typeof x !== "string" || !q.options!.includes(x)) {
          throw new BadRequestError(`题目「${q.title}」包含非法选项`);
        }
        set.add(x);
      }
      out[q.id] = [...set];
    }
  }
  const extra = Object.keys(raw).filter((k) => !questions.some((q) => q.id === k));
  if (extra.length) throw new BadRequestError(`存在多余答案字段：${extra.join(", ")}`);
  return out;
}

export const surveyService = {
  listPublished(): Promise<Survey[]> {
    return surveysRepo.listPublished();
  },

  async getForReader(id: number, user?: AuthUser): Promise<Survey> {
    const s = await surveysRepo.findById(id);
    if (!s) throw new NotFoundError("问卷不存在");
    if (s.status === "published") return s;
    if (user && canManage(user)) return s;
    if (user && s.creatorId === user.id) return s;
    throw new ForbiddenError("问卷未发布或无权查看");
  },

  async listAdmin(user: AuthUser, opts: { status?: SurveyStatus; page: number; pageSize: number }) {
    if (!canManage(user)) throw new ForbiddenError("需要管理员/运维权限");
    const offset = (opts.page - 1) * opts.pageSize;
    return surveysRepo.listAdmin({ status: opts.status, limit: opts.pageSize, offset });
  },

  async create(user: AuthUser, input: {
    title: string;
    description: string | null;
    questions: SurveyQuestion[];
    status: SurveyStatus;
  }): Promise<Survey> {
    if (!canManage(user)) throw new ForbiddenError("需要管理员/运维权限");
    const id = await surveysRepo.create({ ...input, creatorId: user.id });
    return (await surveysRepo.findById(id))!;
  },

  async update(user: AuthUser, id: number, patch: Partial<{
    title: string;
    description: string | null;
    questions: SurveyQuestion[];
    status: SurveyStatus;
  }>): Promise<Survey> {
    if (!canManage(user)) throw new ForbiddenError("需要管理员/运维权限");
    const s = await surveysRepo.findById(id);
    if (!s) throw new NotFoundError("问卷不存在");
    await surveysRepo.update(id, patch);
    return (await surveysRepo.findById(id))!;
  },

  async remove(user: AuthUser, id: number): Promise<void> {
    if (!canManage(user)) throw new ForbiddenError("需要管理员/运维权限");
    await surveysRepo.remove(id);
  },

  async submit(
    surveyId: number,
    answers: SurveyAnswers,
    user: AuthUser | undefined,
  ): Promise<SurveyResponse> {
    const s = await surveysRepo.findById(surveyId);
    if (!s) throw new NotFoundError("问卷不存在");
    if (s.status !== "published") throw new BadRequestError("问卷未开放填写");
    const clean = validateAnswers(s.questions, answers);
    const userId = user?.id ?? null;
    if (userId !== null) {
      const n = await surveysRepo.countUserResponses(surveyId, userId);
      if (n > 0) throw new BadRequestError("您已提交过本问卷，每个账号仅可提交一次");
    }
    const rid = await surveysRepo.insertResponse(surveyId, userId, clean);
    return {
      id: rid,
      surveyId,
      userId,
      answers: clean,
      createdAt: new Date().toISOString(),
    };
  },

  async listResponses(user: AuthUser, surveyId: number, page: number, pageSize: number) {
    if (!canManage(user)) throw new ForbiddenError("需要管理员/运维权限");
    const s = await surveysRepo.findById(surveyId);
    if (!s) throw new NotFoundError("问卷不存在");
    return surveysRepo.listResponses(surveyId, page, pageSize);
  },

  /** 选择类题目简单汇总（频次） */
  async summary(user: AuthUser, surveyId: number) {
    if (!canManage(user)) throw new ForbiddenError("需要管理员/运维权限");
    const s = await surveysRepo.findById(surveyId);
    if (!s) throw new NotFoundError("问卷不存在");
    const total = await surveysRepo.countResponses(surveyId);
    const pageSize = Math.min(total, 10_000);
    const { items } = await surveysRepo.listResponses(surveyId, 1, pageSize || 1);
    const result: Record<string, Record<string, number>> = {};
    for (const q of s.questions) {
      if (q.type === "text") continue;
      result[q.id] = {};
      if (q.options) for (const o of q.options) result[q.id][o] = 0;
    }
    for (const row of items) {
      for (const q of s.questions) {
        if (q.type === "text") continue;
        const ans = row.answers[q.id];
        if (q.type === "single" && typeof ans === "string") {
          result[q.id][ans] = (result[q.id][ans] ?? 0) + 1;
        }
        if (q.type === "multiple" && Array.isArray(ans)) {
          for (const a of ans) {
            result[q.id][a] = (result[q.id][a] ?? 0) + 1;
          }
        }
      }
    }
    return { surveyId, totalResponses: total, choiceStats: result };
  },
};
