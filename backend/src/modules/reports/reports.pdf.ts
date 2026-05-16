/**
 * PDF 渲染器（pdfmake，无需 Chromium）
 * --------------------------------
 * pdfmake 默认字体不支持中文。这里注入「思源黑体 / Noto Sans SC / Noto CJK」等可变字体路径。
 *
 * 生产推荐（任选其一）：
 *   1) 将任意可用的 .otf / .ttf / .ttc 中文字体放到 backend/storage/fonts/（文件名不限，会自动扫描并优先常用名）
 *   2) 设置 env REPORT_FONT_PATH 指向绝对路径
 *
 * 不引入 vfs_fonts 大包，按需从磁盘加载。
 */

import fs from "node:fs";
import path from "node:path";
import PdfPrinter from "pdfmake";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import type { ReportContent, ZoneReport } from "@/modules/reports/reports.types";

// 因为我们用了运行期的 pdfmake 但只有最小自描述类型，这里定义局部宽松类型即可。
type PdfNode = Record<string, unknown> | unknown[] | string | number;
type PdfStyle = Record<string, unknown>;
type PdfDoc = {
  defaultStyle?: PdfStyle;
  pageSize?: string;
  pageMargins?: number[];
  header?: () => PdfNode;
  footer?: (page: number, total: number) => PdfNode;
  styles?: Record<string, PdfStyle>;
  content: PdfNode[];
};

// =============================================================
// 字体加载
// =============================================================

/** 扫描 storage/fonts：任意后缀为 otf/ttf/ttc 的字体都会参与候选（按优先级排序） */
function discoverStorageFonts(): string[] {
  const dir = path.resolve(process.cwd(), "storage/fonts");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const scored: { score: number; full: string }[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const name = e.name.toLowerCase();
    if (!/\.(otf|ttf|ttc)$/.test(name)) continue;
    const full = path.join(dir, e.name);
    let score = 90;
    if (name.includes("notosanssc") || name.includes("noto_sans_sc")) score = 0;
    else if (name.includes("notosanscjk") || name.includes("noto_sans_cjk")) score = 1;
    else if (name.includes("sourcehansans") || name.includes("source_han_sans")) score = 2;
    else if (name.includes("sourcehan") || name.includes("source_han")) score = 3;
    else if (name.includes("wqy") || name.includes("microhei")) score = 10;
    else if (name.includes("droidsansfallback") || (name.includes("droid") && name.includes("fallback"))) score = 20;
    else if (name.includes("noto")) score = 30;
    else if (name.includes("song") || name.includes("kai") || name.includes("fang") || name.includes("hei")) score = 70;
    scored.push({ score, full });
  }
  scored.sort((a, b) => a.score - b.score || a.full.localeCompare(b.full));
  return scored.map((s) => s.full);
}

/** 不包含 DejaVu 等「仅有拉丁文字形」的字体，避免误判为可用导致 PDF 中方块乱码却不报错 */
function buildFontCandidates(): string[] {
  const list: string[] = [];
  const add = (p?: string) => {
    const t = (p ?? "").trim();
    if (t && !list.includes(t)) list.push(t);
  };

  add(env.REPORT_FONT_PATH);
  for (const p of discoverStorageFonts()) add(p);

  add(path.resolve(process.cwd(), "storage/fonts/NotoSansSC-Regular.otf"));
  add(path.resolve(process.cwd(), "storage/fonts/SourceHanSansCN-Regular.otf"));

  // Windows 内置
  add("C:/Windows/Fonts/msyh.ttc");
  add("C:/Windows/Fonts/msyhbd.ttc");
  add("C:/Windows/Fonts/simhei.ttf");
  add("C:/Windows/Fonts/simsun.ttc");

  // Linux / 宝塔常见：wqy-noto、droid fallback、各发行版 Noto CJK 路径
  add("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc");
  add("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc");
  add("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc");
  add("/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf");
  add("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc");
  add("/usr/share/fonts/truetype/noto/NotoSansCJKsc-Regular.otf");
  add("/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc");
  add("/usr/share/fonts/google-noto-cjk-vf/NotoSansCJKsc-VF.ttf");
  add("/usr/share/fonts/chinese/SourceHanSansSC-Regular.otf");
  add("/usr/share/fonts/truetype/arphic/uming.ttc");

  return list;
}

/** 启动时自检：不向 pdfmake 注册，仅供日志与其它模块预览 */
export function peekResolvedReportFontPath(): string | null {
  for (const p of buildFontCandidates()) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

let _printer: PdfPrinter | null = null;

function getPrinter(): PdfPrinter {
  if (_printer) return _printer;
  const fontPath = peekResolvedReportFontPath();
  if (fontPath) {
    logger.info({ fontPath }, "📄 PDF 字体已加载");
    _printer = new PdfPrinter({
      ZH: { normal: fontPath, bold: fontPath, italics: fontPath, bolditalics: fontPath },
    });
  } else {
    logger.warn(
      "⚠️  未找到中文字体；请在 backend/storage/fonts/ 放置 .otf/.ttf/.ttc 任一中文字体，或设置 REPORT_FONT_PATH（勿依赖纯西文字体，否则将出现方块）。",
    );
    throw new Error(
      "没有可用的中文字体；请将字体放入 backend/storage/fonts/（任意常见中文 .otf/.ttf/.ttc 文件名均可）或设置 REPORT_FONT_PATH 为绝对路径",
    );
  }
  return _printer;
}

// =============================================================
// 渲染
// =============================================================

const COLORS = {
  primary: "#1f72ee",
  ink: "#0f172a",
  muted: "#64748b",
  ok: "#16a34a",
  warn: "#f59e0b",
  bad: "#dc2626",
  border: "#cbd5e1",
};

const STYLES: Record<string, PdfStyle> = {
  h1: { fontSize: 22, bold: true, color: COLORS.primary, margin: [0, 0, 0, 10] },
  h2: { fontSize: 14, bold: true, color: COLORS.ink, margin: [0, 14, 0, 6] },
  h3: { fontSize: 11, bold: true, color: COLORS.ink, margin: [0, 8, 0, 4] },
  meta: { fontSize: 9, color: COLORS.muted },
  small: { fontSize: 9, color: COLORS.muted },
  table: { fontSize: 9 },
  tableHeader: { bold: true, fillColor: "#f1f5f9", color: COLORS.ink },
  ok: { color: COLORS.ok, bold: true },
  warn: { color: COLORS.warn, bold: true },
  bad: { color: COLORS.bad, bold: true },
};

const TYPE_LABELS: Record<string, string> = {
  daily: "日检测报告",
  weekly: "周检测报告",
  latest: "最新检测报告",
};

export const reportPdf = {
  async render(content: ReportContent): Promise<Buffer> {
    const printer = getPrinter();
    const doc: PdfDoc = {
      defaultStyle: { font: "ZH", fontSize: 10, lineHeight: 1.35, color: COLORS.ink },
      pageSize: "A4",
      pageMargins: [40, 50, 40, 50],
      header: () => ({
        text: "ColdHero · 冷库智能监管平台",
        style: "small",
        margin: [40, 20, 40, 0],
        color: COLORS.muted,
      }),
      footer: (page: number, total: number) => ({
        columns: [
          { text: `报告编号 ${content.meta.reportNo}`, style: "small", margin: [40, 0, 0, 0] },
          { text: `第 ${page} / ${total} 页`, style: "small", alignment: "right", margin: [0, 0, 40, 0] },
        ],
      }),
      styles: STYLES,
      content: buildBody(content),
    };

    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const pdf = printer.createPdfKitDocument(doc as unknown as Parameters<typeof printer.createPdfKitDocument>[0]);
      pdf.on("data", (c: Buffer) => chunks.push(c));
      pdf.on("end", () => resolve(Buffer.concat(chunks)));
      pdf.on("error", reject);
      pdf.end();
    });
  },
};

function buildBody(c: ReportContent): PdfNode[] {
  const body: PdfNode[] = [];

  // 标题
  body.push({ text: `${TYPE_LABELS[c.meta.reportType] ?? "检测报告"}`, style: "h1" });
  body.push({
    text: [
      { text: `报告期：${fmt(c.meta.timeRange.start)} ~ ${fmt(c.meta.timeRange.end)}\n`, style: "meta" },
      { text: `生成时间：${fmt(c.meta.generatedAt)}\n`, style: "meta" },
      { text: `编制：${c.meta.user.displayName}\n`, style: "meta" },
      { text: `编号：${c.meta.reportNo}`, style: "meta" },
    ],
  });

  // 概览
  body.push({ text: "一、整体概览", style: "h2" });
  body.push(overviewTable(c));

  // AI 总结
  body.push({ text: "二、AI 智能总结", style: "h2" });
  body.push({
    text: c.aiSummary,
    color: COLORS.ink,
    margin: [0, 0, 0, 4],
  });

  if (c.recommendations.length > 0) {
    body.push({ text: "建议执行项：", style: "h3" });
    body.push({
      ul: c.recommendations.map((r) => ({ text: r, color: COLORS.ink })),
    });
  }

  // 分库区明细
  body.push({ text: "三、各库区运行明细", style: "h2" });
  for (const z of c.zones) {
    body.push(zoneSection(z));
  }

  // 末尾
  body.push({
    text: "—— 报告结束 ——",
    alignment: "center",
    color: COLORS.muted,
    margin: [0, 24, 0, 0],
    fontSize: 9,
  });
  return body;
}

function overviewTable(c: ReportContent): PdfNode {
  return {
    style: "table",
    table: {
      headerRows: 1,
      widths: ["*", "*", "*", "*"],
      body: [
        [
          { text: "总样本", style: "tableHeader" },
          { text: "异常点", style: "tableHeader" },
          { text: "异常率", style: "tableHeader" },
          { text: "覆盖库区", style: "tableHeader" },
        ],
        [
          String(c.overall.totalSamples),
          String(c.overall.totalAnomalies),
          { text: `${c.overall.anomalyRate}%`, style: pickRateStyle(c.overall.anomalyRate) },
          String(c.zones.length),
        ],
      ],
    },
    layout: lightLayout(),
  };
}

function zoneSection(z: ZoneReport): PdfNode {
  const lines: PdfNode[] = [
    { text: `${z.zone.code} · ${z.zone.name}`, style: "h3" },
    {
      text: [
        { text: `阈值：${z.zone.tempMin}℃ ~ ${z.zone.tempMax}℃   `, style: "small" },
        { text: `样本 ${z.stats.sampleCount}   `, style: "small" },
        { text: `极值 ${z.stats.minTemp ?? "-"} ~ ${z.stats.maxTemp ?? "-"} ℃   `, style: "small" },
        { text: `均值 ${z.stats.avgTemp ?? "-"} ℃   `, style: "small" },
        { text: `异常 ${z.stats.anomalyCount}（${z.stats.anomalyRate}%）   `, style: pickRateStyle(z.stats.anomalyRate) },
        { text: `超限累计 ${z.stats.overLimitMinutes} 分钟`, style: z.stats.overLimitMinutes > 60 ? "bad" : "small" },
      ],
      margin: [0, 0, 0, 4],
    },
  ];

  if (z.dailySeries.length > 0) {
    const tableBody: unknown[][] = [
      [
        { text: "日期", style: "tableHeader" },
        { text: "均温(℃)", style: "tableHeader" },
        { text: "极低(℃)", style: "tableHeader" },
        { text: "极高(℃)", style: "tableHeader" },
        { text: "异常点", style: "tableHeader" },
      ],
      ...z.dailySeries.map((d) => [
        d.date,
        d.avg ?? "-",
        d.min ?? "-",
        d.max ?? "-",
        d.anomaly,
      ]),
    ];
    lines.push({
      style: "table",
      table: { headerRows: 1, widths: ["auto", "*", "*", "*", "auto"], body: tableBody },
      layout: lightLayout(),
      margin: [0, 4, 0, 6],
    });
  }

  if (z.faults.length > 0) {
    lines.push({ text: "本期内关联故障：", style: "small", margin: [0, 4, 0, 2] });
    lines.push({
      ul: z.faults.map((f) => ({
        text: `[${severityCN(f.severity)}] ${fmt(f.createdAt)} · ${f.title}（${statusCN(f.status)}）`,
        fontSize: 9,
      })),
    });
  }

  return { stack: lines, margin: [0, 0, 0, 8] };
}

function pickRateStyle(rate: number): string {
  if (rate >= 5) return "bad";
  if (rate >= 1) return "warn";
  return "ok";
}

function lightLayout() {
  return {
    hLineColor: () => COLORS.border,
    vLineColor: () => COLORS.border,
    hLineWidth: () => 0.5,
    vLineWidth: () => 0.5,
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 4,
    paddingBottom: () => 4,
  };
}

function fmt(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const wall = new Date(d.getTime() + 8 * 3600_000);
  const mm = String(wall.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(wall.getUTCDate()).padStart(2, "0");
  const hh = String(wall.getUTCHours()).padStart(2, "0");
  const mi = String(wall.getUTCMinutes()).padStart(2, "0");
  return `${wall.getUTCFullYear()}-${mm}-${dd} ${hh}:${mi}`;
}

function severityCN(s: string) {
  return ({ low: "一般", medium: "中等", high: "较重", critical: "严重" } as Record<string, string>)[s] ?? s;
}
function statusCN(s: string) {
  return ({ pending: "待处理", processing: "处理中", closed: "已关闭" } as Record<string, string>)[s] ?? s;
}
