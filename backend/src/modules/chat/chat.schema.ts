import { z } from "zod";

export const askSchema = z.object({
  /** 客户端生成的会话 ID（uuid 推荐）；省略则后端自动生成 */
  sessionId: z.string().min(8).max(64).optional(),
  question: z.string().min(1, "问题不能为空").max(4000, "问题最长 4000 字"),
  /** fast = 默认；pro 仅 pro/enterprise 可用，其它套餐自动降级 */
  model: z.enum(["fast", "pro"]).optional(),
});

export const listMessagesParams = z.object({
  sessionId: z.string().min(8).max(64),
});

export const listMessagesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type AskBody = z.infer<typeof askSchema>;
