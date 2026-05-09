/**
 * AI 客户端统一封装
 * --------------------------------
 * - 复用 OpenAI SDK，把 BaseURL 切到 DeepSeek / 通义千问的兼容端点
 * - 暴露两组方法：chat（一次性返回） / chatStream（异步迭代器）
 * - 由调用方决定使用 fast / pro 模型；二者 model 名来自 env 配置
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";

const client = new OpenAI({
  apiKey: env.AI_API_KEY,
  baseURL: env.AI_BASE_URL,
  timeout: env.AI_TIMEOUT_MS,
});

export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type AiTier = "fast" | "pro";

function resolveModel(tier: AiTier): string {
  return tier === "pro" ? env.AI_MODEL_PRO : env.AI_MODEL_FAST;
}

export interface ChatResult {
  content: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
}

export interface ChatStreamChunk {
  content: string;
  done: boolean;
  model: string;
}

export const aiClient = {
  /** 同步调用：一次性返回完整答案 */
  async chat(messages: ChatMessage[], tier: AiTier = "fast"): Promise<ChatResult> {
    const model = resolveModel(tier);
    const completion = await client.chat.completions.create({
      model,
      messages: messages as ChatCompletionMessageParam[],
      stream: false,
    });
    const choice = completion.choices[0];
    return {
      content: choice?.message?.content ?? "",
      model,
      tokensIn: completion.usage?.prompt_tokens,
      tokensOut: completion.usage?.completion_tokens,
    };
  },

  /**
   * 流式调用：返回异步迭代器
   * 用法：
   *   for await (const chunk of aiClient.chatStream(messages)) { write(chunk.content) }
   */
  async *chatStream(
    messages: ChatMessage[],
    tier: AiTier = "fast",
  ): AsyncGenerator<ChatStreamChunk, void, void> {
    const model = resolveModel(tier);
    const stream = await client.chat.completions.create({
      model,
      messages: messages as ChatCompletionMessageParam[],
      stream: true,
    });
    try {
      for await (const part of stream) {
        const delta = part.choices[0]?.delta?.content ?? "";
        if (delta) yield { content: delta, done: false, model };
      }
      yield { content: "", done: true, model };
    } catch (err) {
      logger.error({ err, model }, "AI 流式推理失败");
      throw err;
    }
  },
};
