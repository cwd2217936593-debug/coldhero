/**
 * 生成示例预测 CSV（开发演示用）
 * --------------------------------
 * 用法：
 *   npm run gen:forecasts
 *
 * 行为：
 *  1. 读取所有库区
 *  2. 从 sensor_history 取最近 7 天的实际数据
 *  3. 对实际曲线做"轻微噪声 + 平滑"，模拟预测模型输出
 *  4. 写入 FORECAST_CSV_DIR/{zone_code}.csv
 *
 * 真实环境用 LSTM/Prophet 等模型替换本脚本，但 CSV 列约定不变。
 */

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/config/env";
import { pool, closeMysql } from "@/db/mysql";
import { logger } from "@/utils/logger";
import { zonesRepo } from "@/modules/zones/zones.repository";
import { sensorsRepo } from "@/modules/sensors/sensors.repository";

function fmtUtc8(d: Date): string {
  // 'YYYY-MM-DD HH:mm:ss'，按 UTC+8 显示（forecast.service.ts 解析时按 UTC+8 处理）
  const wall = new Date(d.getTime() + 8 * 3600 * 1000);
  const iso = wall.toISOString();
  return iso.slice(0, 10) + " " + iso.slice(11, 19);
}

async function main() {
  const outDir = env.FORECAST_CSV_DIR;
  await fs.mkdir(outDir, { recursive: true });

  const zones = await zonesRepo.list();
  if (!zones.length) {
    logger.warn("没有任何库区，请先建库区或加载种子数据");
    return;
  }
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 86400 * 1000);

  for (const z of zones) {
    const rows = await sensorsRepo.seriesByZone(z.id, from, now, 20000);
    if (!rows.length) {
      logger.warn({ zone: z.code }, "无传感器历史，跳过");
      continue;
    }

    // 对温度做平滑 + 0.3℃ 标准差噪声，模拟"模型预测"
    const window = 5;
    const tempBuf: number[] = [];
    const lines: string[] = ["timestamp,temperature_predicted,humidity_predicted,co2_predicted"];
    for (const r of rows) {
      const t = r.temperature !== null ? Number(r.temperature) : null;
      if (t !== null) {
        tempBuf.push(t);
        if (tempBuf.length > window) tempBuf.shift();
      }
      const sm = tempBuf.length
        ? tempBuf.reduce((a, b) => a + b, 0) / tempBuf.length
        : null;
      const noise = (Math.random() - 0.5) * 0.6;
      const tempPred = sm !== null ? Number((sm + noise).toFixed(2)) : "";
      const hPred = r.humidity !== null ? Number((Number(r.humidity) + (Math.random() - 0.5) * 1.5).toFixed(2)) : "";
      const cPred = r.co2 !== null ? Number((Number(r.co2) + (Math.random() - 0.5) * 8).toFixed(2)) : "";
      lines.push(`${fmtUtc8(r.recorded_at)},${tempPred},${hPred},${cPred}`);
    }

    const file = path.join(outDir, `${z.code}.csv`);
    await fs.writeFile(file, lines.join("\n") + "\n", "utf8");
    logger.info({ zone: z.code, rows: rows.length, file }, "✅ 已写入预测 CSV");
  }
}

main()
  .catch((err) => {
    logger.error({ err }, "生成预测 CSV 失败");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMysql();
    await pool.end().catch(() => undefined);
  });
