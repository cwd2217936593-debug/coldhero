/**
 * 故障报告 AI 初步分析
 * --------------------------------
 * 流程：
 *   1) 收集上下文：库区配置 + 最近 30 分钟传感器数据 + 用户描述 + 图片 URL 列表
 *   2) 拼接成结构化 prompt 让模型给出 JSON：
 *        { severity, suspectedCauses[], urgency, immediateActions[], recommendedSpecialty }
 *   3) 解析失败时退回纯文本，标记 severity=medium
 *
 * 注意：
 *   - 暂未启用多模态视觉模型（需 vision-capable model）。
 *     若 AI_PROVIDER=qwen 且模型为 qwen-vl-plus，可在 buildMessages 中改用图片 URL；
 *     当前默认把图片以"用户已上传 N 张图（链接附后）"形式描述，由模型让用户结合图片自行确认。
 */

import { aiClient } from "@/services/aiClient";
import { sensorsRepo } from "@/modules/sensors/sensors.repository";
import { zonesRepo } from "@/modules/zones/zones.repository";
import { logger } from "@/utils/logger";
import type { FaultImage, FaultSeverity } from "@/modules/fault/fault.types";

export interface FaultAiResult {
  /** 原始 markdown 文本（写入数据库） */
  text: string;
  /** 模型推断出的严重程度，可能用于自动覆盖用户填写值 */
  severity: FaultSeverity | null;
  /** JSON 结构化字段（前端可结构化展示，写入 DB 仍以 text 形式） */
  structured?: {
    severity?: FaultSeverity;
    urgency?: "immediate" | "today" | "soon";
    suspectedCauses?: string[];
    immediateActions?: string[];
    recommendedSpecialty?: string;
  };
}

const SYSTEM_PROMPT = `你是一名拥有 15 年经验的冷库制冷与电气复合维修专家，正在协助一线值班员对故障进行 **初步分诊**。
- 必须输出严格的 Markdown 格式
- 同时在末尾追加一个 JSON 代码块，键固定为：severity、urgency、suspectedCauses、immediateActions、recommendedSpecialty
- severity 取值：low | medium | high | critical
- urgency  取值：immediate（≤1 小时）| today（当天）| soon（72 小时内）
- recommendedSpecialty：制冷 / 电气 / 控制 / 门禁 / 传感器 / 其它
- 不要发明数据，未知字段写 "未知"
- 中文回答`;

interface BuildContextOpts {
  zoneId: number | null;
  faultType: string;
  title: string;
  description: string;
  images: FaultImage[];
}

async function buildContext(opts: BuildContextOpts): Promise<string> {
  const lines: string[] = [];

  if (opts.zoneId) {
    const zone = await zonesRepo.findById(opts.zoneId);
    if (zone) {
      lines.push("【库区配置】");
      lines.push(`- 名称: ${zone.name}（编码 ${zone.code}）`);
      lines.push(`- 温度阈值: ${zone.temp_min}℃ ~ ${zone.temp_max}℃`);
      if (zone.humidity_min !== null && zone.humidity_max !== null) {
        lines.push(`- 湿度阈值: ${zone.humidity_min}% ~ ${zone.humidity_max}%`);
      }
      if (zone.co2_max !== null) lines.push(`- CO₂ 上限: ${zone.co2_max} ppm`);
      if (zone.description) lines.push(`- 备注: ${zone.description}`);
    }

    // 最近 30 分钟数据
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 60_000);
    const series = await sensorsRepo.seriesByZone(opts.zoneId, from, to);
    if (series.length) {
      const temps = series.map((p) => p.temperature).filter((v): v is number => typeof v === "number");
      const anomalies = series.filter((p) => p.is_anomaly).length;
      const min = temps.length ? Math.min(...temps).toFixed(2) : "-";
      const max = temps.length ? Math.max(...temps).toFixed(2) : "-";
      const last = series[series.length - 1];
      lines.push("");
      lines.push("【最近 30 分钟传感器数据】");
      lines.push(`- 样本数: ${series.length}, 异常点: ${anomalies}`);
      lines.push(`- 温度区间: ${min} ~ ${max} ℃`);
      if (last) {
        lines.push(`- 末点: ${new Date(last.recorded_at).toISOString()}, 温 ${last.temperature ?? "-"}, 湿 ${last.humidity ?? "-"}, CO₂ ${last.co2 ?? "-"}, 门 ${last.door_status}`);
      }
    }
  }

  lines.push("");
  lines.push("【值班员上报】");
  lines.push(`- 故障类型: ${opts.faultType}`);
  lines.push(`- 标题: ${opts.title}`);
  lines.push(`- 描述: ${opts.description}`);

  if (opts.images.length) {
    lines.push("");
    lines.push(`【现场照片】共 ${opts.images.length} 张（值班员已上传，链接附后；请基于描述给出推测，提醒查看图像确认）`);
    opts.images.slice(0, 6).forEach((img, i) => lines.push(`  ${i + 1}. ${img.url}`));
  }

  return lines.join("\n");
}

const JSON_BLOCK_RE = /```json\s*([\s\S]+?)\s*```/i;

function parseStructured(text: string): FaultAiResult["structured"] {
  const m = JSON_BLOCK_RE.exec(text);
  if (!m) return undefined;
  try {
    const obj = JSON.parse(m[1]);
    return {
      severity: obj.severity,
      urgency: obj.urgency,
      suspectedCauses: Array.isArray(obj.suspectedCauses) ? obj.suspectedCauses : undefined,
      immediateActions: Array.isArray(obj.immediateActions) ? obj.immediateActions : undefined,
      recommendedSpecialty: obj.recommendedSpecialty,
    };
  } catch {
    return undefined;
  }
}

const VALID_SEV = new Set<FaultSeverity>(["low", "medium", "high", "critical"]);

export const faultAi = {
  async analyze(opts: BuildContextOpts): Promise<FaultAiResult> {
    const userPrompt = await buildContext(opts);
    try {
      const result = await aiClient.chat(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        "fast",
      );
      const struct = parseStructured(result.content);
      const severity = struct?.severity && VALID_SEV.has(struct.severity) ? struct.severity : null;
      return { text: result.content, severity, structured: struct };
    } catch (err) {
      logger.error({ err }, "故障 AI 分析失败");
      return {
        text: `> AI 初步分析暂不可用（${(err as Error).message}）。\n请人工值班员根据描述与照片直接处理。`,
        severity: null,
      };
    }
  },
};
