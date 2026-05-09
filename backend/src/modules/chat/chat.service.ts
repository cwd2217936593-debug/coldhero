/**
 * AI 问答业务服务
 * --------------------------------
 * 关键流程：
 *   1. 生成 / 复用 sessionId
 *   2. 写一行 ai_chat_logs（status=pending）
 *   3. 拉取最近 N 条同会话历史 → 拼 messages
 *   4. 调 aiClient（同步或流式）
 *   5. 成功 → fillAnswer；失败 → markFailed + quotaService.refund
 *
 * 注意：配额扣减发生在中间件层（路由会用 requireQuota('aiChat')），
 *      service 层只负责"业务彻底失败时的退款"，避免重复扣 / 重复退。
 */

import { v4 as uuidv4 } from "uuid";
import type { MemberLevel } from "@/config/memberPlans";
import type { UserRole } from "@/modules/users/users.repository";
import { logger } from "@/utils/logger";
import { quotaService } from "@/modules/quota/quota.service";
import { chatRepo } from "@/modules/chat/chat.repository";
import { aiClient, type AiTier, type ChatMessage } from "@/services/aiClient";
import { buildSystemPromptForUser } from "@/services/coldStoragePrompt";

const HISTORY_TURNS = 10;
const HISTORY_TRUNCATE = 800;

function resolveTier(requested: AiTier | undefined, level: MemberLevel, role?: UserRole): AiTier {
  if (requested !== "pro") return "fast";
  // 管理员始终可用 pro（推理）模型；其它账号按会员等级
  if (role === "admin") return "pro";
  return level === "pro" || level === "enterprise" ? "pro" : "fast";
}

async function buildMessages(
  userId: number,
  sessionId: string,
  question: string,
  memberLevel: MemberLevel,
): Promise<ChatMessage[]> {
  const system = await buildSystemPromptForUser(memberLevel);
  const history = await chatRepo.loadRecentMessages(userId, sessionId, HISTORY_TURNS);
  const messages: ChatMessage[] = [{ role: "system", content: system }];
  for (const h of history) {
    messages.push({ role: "user", content: truncate(h.question, HISTORY_TRUNCATE) });
    if (h.answer) {
      messages.push({ role: "assistant", content: truncate(h.answer, HISTORY_TRUNCATE) });
    }
  }
  messages.push({ role: "user", content: question });
  return messages;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export interface AskContext {
  userId: number;
  memberLevel: MemberLevel;
  role?: UserRole;
}

export interface AskInput {
  sessionId?: string;
  question: string;
  model?: AiTier;
}

export interface AskResult {
  sessionId: string;
  logId: number;
  question: string;
  answer: string;
  model: string;
  tier: AiTier;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs: number;
}

export const chatService = {
  /** 同步问答：等模型返回完整答案后一次性回包 */
  async ask(ctx: AskContext, input: AskInput): Promise<AskResult> {
    const sessionId = input.sessionId ?? uuidv4();
    const tier = resolveTier(input.model, ctx.memberLevel, ctx.role);
    const startedAt = Date.now();
    const logId = await chatRepo.insertPending({
      userId: ctx.userId,
      sessionId,
      question: input.question,
    });

    try {
      const messages = await buildMessages(
        ctx.userId,
        sessionId,
        input.question,
        ctx.memberLevel,
      );
      const result = await aiClient.chat(messages, tier);
      const latencyMs = Date.now() - startedAt;
      await chatRepo.fillAnswer(logId, {
        answer: result.content,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        latencyMs,
      });
      return {
        sessionId,
        logId,
        question: input.question,
        answer: result.content,
        model: result.model,
        tier,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        latencyMs,
      };
    } catch (err) {
      logger.error({ err, userId: ctx.userId, sessionId }, "AI 问答失败，配额已退还");
      await chatRepo.markFailed(logId, (err as Error).message ?? "ai_call_failed");
      await quotaService.refund(ctx.userId, "aiChat");
      throw err;
    }
  },

  /**
   * 流式问答：返回 (sessionId, logId, async iterator)
   * 路由层把 iterator 写入 SSE，结束时落库（成功）或退款（失败）。
   */
  async askStream(
    ctx: AskContext,
    input: AskInput,
  ): Promise<{
    sessionId: string;
    logId: number;
    tier: AiTier;
    iterator: AsyncGenerator<{ content: string; done: boolean; model: string }, void, void>;
    finalize: (
      result: { fullText: string; model: string; latencyMs: number; success: boolean; error?: string },
    ) => Promise<void>;
  }> {
    const sessionId = input.sessionId ?? uuidv4();
    const tier = resolveTier(input.model, ctx.memberLevel, ctx.role);
    const logId = await chatRepo.insertPending({
      userId: ctx.userId,
      sessionId,
      question: input.question,
    });
    const messages = await buildMessages(
      ctx.userId,
      sessionId,
      input.question,
      ctx.memberLevel,
    );

    const iterator = aiClient.chatStream(messages, tier);

    const finalize = async (r: {
      fullText: string;
      model: string;
      latencyMs: number;
      success: boolean;
      error?: string;
    }) => {
      if (r.success) {
        await chatRepo.fillAnswer(logId, {
          answer: r.fullText,
          model: r.model,
          latencyMs: r.latencyMs,
        });
      } else {
        await chatRepo.markFailed(logId, r.error ?? "stream_failed");
        await quotaService.refund(ctx.userId, "aiChat");
      }
    };

    return { sessionId, logId, tier, iterator, finalize };
  },
};
