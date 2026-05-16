/**
 * 后端入口
 * --------------------------------
 * 启动顺序：
 *   1. 校验环境变量（env.ts 内 fail-fast）
 *   2. 连接 MySQL / Redis
 *   3. 启动事件总线（订阅 Redis Pub/Sub）
 *   4. 创建 HTTP Server，挂载 Express + WebSocket
 *   5. 监听端口
 *   6. SIGTERM / SIGINT 优雅退出
 */

import http from "node:http";
import { createApp } from "@/app";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { closeMysql, pingMysql } from "@/db/mysql";
import { closeRedis, pingRedis } from "@/db/redis";
import { eventBus } from "@/realtime/eventBus";
import { attachWsServer } from "@/realtime/wsServer";
import { peekResolvedReportFontPath } from "@/modules/reports/reports.pdf";
import { startReportWorker, stopReportWorker } from "@/modules/reports/reports.queue";

async function bootstrap() {
  await pingMysql();
  await pingRedis();
  await eventBus.start();
  startReportWorker();

  const app = createApp();
  const server = http.createServer(app);
  attachWsServer(server);

  server.listen(env.APP_PORT, () => {
    logger.info(
      `🚀 ${env.APP_NAME} listening on http://0.0.0.0:${env.APP_PORT} (ws path: /ws/sensors) [${env.APP_ENV}]`,
    );
    const reportFont = peekResolvedReportFontPath();
    if (reportFont) {
      logger.info({ fontPath: reportFont }, "报告 PDF：中文字体已就绪");
    } else {
      logger.warn(
        "报告 PDF：未检测到中文字体，首次导出将失败。请将 NotoSansSC-Regular.otf 等放入 storage/fonts/ 或设置 REPORT_FONT_PATH（详见 reports.pdf.ts 注释）。",
      );
    }
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "收到退出信号，开始优雅关闭");
    server.close(async () => {
      await stopReportWorker();
      await eventBus.stop();
      await closeMysql();
      await closeRedis();
      logger.info("已关闭所有依赖，进程退出");
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("强制退出（10s 超时）");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "unhandledRejection");
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaughtException，进程退出");
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, "启动失败");
  process.exit(1);
});
