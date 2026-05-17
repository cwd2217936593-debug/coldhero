/**
 * P2：FAQ 归因定时任务占位（提示词 Step 9；管理端问卷/报表为 P2 路由占位）
 */

import { logger } from "@/utils/logger";
import { env } from "@/config/env";

/**
 * Step 9：占位注册——启动时打一枪日志便于确认入口已挂载；真正实现后在此调度聚合 `ai_chat_logs` → `faq_topics`。
 * @returns 优雅退出用的 noop cleanup
 */
export function registerFaqMiningCronPlaceholder(): () => void {
  if (env.APP_ENV === "test") return () => {};
  logger.info({}, "P2 Step 9：FAQ 归因任务占位已注册（noop，见 jobs/faqMining.ts）");
  return () => {
    logger.debug({}, "P2 Step 9：FAQ 占位已卸载（noop）");
  };
}
