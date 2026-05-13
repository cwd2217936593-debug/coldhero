/**
 * 全局配置加载
 * --------------------------------
 * - 通过 dotenv 读取 .env
 * - 用 zod 做运行期校验，启动前缺关键变量直接 fail-fast
 * - 其它模块统一从 `env` 对象获取配置，避免散落 process.env
 */

import path from "node:path";
import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_PORT: z.coerce.number().int().positive().default(4000),
  APP_NAME: z.string().default("coldhero"),
  APP_CORS_ORIGINS: z.string().default("http://localhost:5173"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET 至少 16 位"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  MYSQL_HOST: z.string().default("127.0.0.1"),
  MYSQL_PORT: z.coerce.number().int().default(3306),
  MYSQL_USER: z.string().default("coldhero"),
  MYSQL_PASSWORD: z.string().default("coldhero_pwd"),
  MYSQL_DATABASE: z.string().default("coldhero"),
  MYSQL_CONNECTION_LIMIT: z.coerce.number().int().default(10),

  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().default(6379),
  REDIS_PASSWORD: z.string().optional().default(""),
  REDIS_DB: z.coerce.number().int().default(0),

  AI_PROVIDER: z.enum(["deepseek", "qwen", "openai"]).default("deepseek"),
  AI_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  AI_API_KEY: z.string().min(1, "AI_API_KEY 不能为空"),
  AI_MODEL_FAST: z.string().default("deepseek-chat"),
  AI_MODEL_PRO: z.string().default("deepseek-reasoner"),
  AI_TIMEOUT_MS: z.coerce.number().int().default(60000),

  ALI_OSS_REGION: z.string().optional().default(""),
  ALI_OSS_BUCKET: z.string().optional().default(""),
  ALI_OSS_ACCESS_KEY_ID: z.string().optional().default(""),
  ALI_OSS_ACCESS_KEY_SECRET: z.string().optional().default(""),
  ALI_OSS_ENDPOINT: z.string().optional().default(""),
  ALI_OSS_PUBLIC_BASE_URL: z.string().optional().default(""),

  ALI_RDS_HOST: z.string().optional().default(""),
  ALI_RDS_PORT: z.coerce.number().int().default(3306),
  ALI_RDS_USER: z.string().optional().default(""),
  ALI_RDS_PASSWORD: z.string().optional().default(""),
  ALI_RDS_DATABASE: z.string().optional().default(""),

  RATE_LIMIT_TIMEZONE: z.string().default("Asia/Shanghai"),
  QUEUE_CONCURRENCY: z.coerce.number().int().default(2),

  /** 预测 CSV 兜底目录，文件名 = {zone_code}.csv（默认相对后端进程工作目录，Docker WORKDIR=/app 时等同 /app/storage/forecasts） */
  FORECAST_CSV_DIR: z.string().default(() => path.resolve(process.cwd(), "storage/forecasts")),
  /** 可选：Python 预测微服务（FastAPI 等），为空时仅使用 CSV */
  PYTHON_FORECAST_URL: z.string().optional().default(""),

  /** 报告 PDF 中文字体路径；为空时按预定义路径表搜索 */
  REPORT_FONT_PATH: z.string().optional().default(""),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("❌ 环境变量校验失败：", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  /** 当前是否生产环境 */
  isProd: parsed.data.APP_ENV === "production",
  /** 解析后的 CORS 白名单数组 */
  corsOrigins: parsed.data.APP_CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
});

export type AppEnv = typeof env;
