/**
 * AI 问答路由
 *  POST /api/chat/messages         同步问答（一次性返回 JSON）
 *  POST /api/chat/messages/stream  SSE 流式问答（前端打字机效果）
 *  GET  /api/chat/sessions         我的会话列表
 *  GET  /api/chat/sessions/:id/messages  指定会话历史
 *
 * 限流策略（双重保护）：
 *  - per-user 频率：60s 内最多 30 次（防误触发）
 *  - 每日配额：requireQuota('aiChat')，按会员等级限制
 */

import { Router } from "express";
import { requireAuth } from "@/middlewares/auth";
import { rateLimit } from "@/middlewares/rateLimit";
import { requireQuota } from "@/middlewares/quota";
import { askSchema, listMessagesParams, listMessagesQuery } from "@/modules/chat/chat.schema";
import { chatService } from "@/modules/chat/chat.service";
import {
  chatRepo,
  toPublicChatLog,
  toPublicSession,
} from "@/modules/chat/chat.repository";
import { quotaService } from "@/modules/quota/quota.service";
import { logger } from "@/utils/logger";

export const chatRouter = Router();

const userChatLimiter = rateLimit({
  name: "ai:chat",
  window: 60,
  max: 30,
  keyBy: "user",
  message: "AI 问答请求过于频繁，请稍后再试",
});

/** 同步问答 */
chatRouter.post(
  "/messages",
  requireAuth,
  userChatLimiter,
  requireQuota("aiChat"),
  async (req, res) => {
    const body = askSchema.parse(req.body);
    const result = await chatService.ask(
      { userId: req.user!.id, memberLevel: req.user!.memberLevel, role: req.user!.role },
      body,
    );
    res.json({ success: true, data: result });
  },
);

/**
 * SSE 流式问答
 * 输出格式（与 OpenAI 兼容，便于前端复用 ai-sdk / fetch-event-source）：
 *   data: {"sessionId":"...","logId":1,"delta":"..."}
 *   data: {"done":true,"sessionId":"...","logId":1}
 *   data: [DONE]
 *
 * 说明：每个事件单独一行 `data: <json>\n\n`；客户端按 `\n\n` 拆事件。
 */
chatRouter.post(
  "/messages/stream",
  requireAuth,
  userChatLimiter,
  requireQuota("aiChat"),
  async (req, res) => {
    const body = askSchema.parse(req.body);

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const write = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    const { sessionId, logId, tier, iterator, finalize } = await chatService.askStream(
      { userId: req.user!.id, memberLevel: req.user!.memberLevel, role: req.user!.role },
      body,
    );

    write({ sessionId, logId, tier, type: "start" });

    let fullText = "";
    let model = "";
    const startedAt = Date.now();
    let aborted = false;

    req.on("close", () => {
      aborted = true;
    });

    try {
      for await (const chunk of iterator) {
        if (aborted) break;
        if (chunk.done) break;
        fullText += chunk.content;
        model = chunk.model;
        write({ delta: chunk.content, type: "delta" });
      }

      const latencyMs = Date.now() - startedAt;
      if (aborted && !fullText) {
        await finalize({
          fullText: "",
          model,
          latencyMs,
          success: false,
          error: "client_aborted_before_first_token",
        });
        res.end();
        return;
      }

      await finalize({ fullText, model, latencyMs, success: true });
      write({ done: true, sessionId, logId, latencyMs, model, type: "end" });
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      await finalize({
        fullText,
        model,
        latencyMs,
        success: false,
        error: (err as Error).message,
      });
      // 退还配额（finalize 已退；这里仅兜底）
      await quotaService.refund(req.user!.id, "aiChat").catch(() => undefined);
      logger.error({ err, sessionId }, "SSE 推流失败");
      write({ type: "error", message: (err as Error).message ?? "stream_failed" });
      res.end();
    }
  },
);

chatRouter.get("/sessions", requireAuth, async (req, res) => {
  const sessions = await chatRepo.listSessions(req.user!.id);
  res.json({ success: true, data: sessions.map(toPublicSession) });
});

chatRouter.get("/sessions/:sessionId/messages", requireAuth, async (req, res) => {
  const { sessionId } = listMessagesParams.parse(req.params);
  const { limit } = listMessagesQuery.parse(req.query);
  const list = await chatRepo.listMessages(req.user!.id, sessionId, limit);
  res.json({ success: true, data: list.map(toPublicChatLog) });
});
