/**
 * 统一日志工具（pino）
 * --------------------------------
 * 开发环境使用 pino-pretty 友好输出（运行时按需引入，缺失则降级为标准 JSON 输出）
 */

import pino from "pino";
import { env } from "@/config/env";

const transport = env.isProd
  ? undefined
  : {
      target: "pino/file",
      options: { destination: 1 },
    };

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: env.APP_NAME },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport,
});
