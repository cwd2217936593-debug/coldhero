/**
 * Word（.docx）渲染器
 * --------------------------------
 * 用 docx 库直接构造 OOXML，无需 LibreOffice / Office；
 * 仅 basic+ 套餐可生成（路由层会校验 plan.allowDocxExport）。
 */

import {
  AlignmentType,
  Document, HeadingLevel, Packer, Paragraph, TextRun,
  Table, TableCell, TableRow, WidthType, BorderStyle, ShadingType,
  Footer, PageNumber,
} from "docx";
import type { ReportContent, ZoneReport } from "@/modules/reports/reports.types";

export const reportDocx = {
  async render(content: ReportContent): Promise<Buffer> {
    const doc = new Document({
      creator: "ColdHero",
      title: content.meta.reportNo,
      styles: {
        default: {
          document: {
            run: { font: "微软雅黑", size: 22 }, // 22 半磅 = 11pt
            paragraph: { spacing: { line: 320 } },
          },
        },
      },
      sections: [
        {
          properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
          footers: {
            default: new Footer({
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: `报告编号 ${content.meta.reportNo}    第 `, size: 18, color: "94a3b8" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "94a3b8" }),
                  new TextRun({ text: " / ", size: 18, color: "94a3b8" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: "94a3b8" }),
                  new TextRun({ text: " 页", size: 18, color: "94a3b8" }),
                ],
              })],
            }),
          },
          children: buildBody(content),
        },
      ],
    });

    return Packer.toBuffer(doc);
  },
};

const TYPE_LABELS: Record<string, string> = {
  daily: "日检测报告",
  weekly: "周检测报告",
  latest: "最新检测报告",
};

function buildBody(c: ReportContent): Paragraph[] | (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = [];

  // 标题
  blocks.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    heading: HeadingLevel.TITLE,
    children: [new TextRun({ text: TYPE_LABELS[c.meta.reportType] ?? "检测报告", bold: true, size: 44, color: "1f72ee" })],
  }));
  blocks.push(metaPara(`报告期：${fmt(c.meta.timeRange.start)} ~ ${fmt(c.meta.timeRange.end)}`));
  blocks.push(metaPara(`生成时间：${fmt(c.meta.generatedAt)}`));
  blocks.push(metaPara(`编制：${c.meta.user.displayName}`));
  blocks.push(metaPara(`编号：${c.meta.reportNo}`));

  blocks.push(emptyPara());
  blocks.push(h2("一、整体概览"));
  blocks.push(overviewTable(c));

  blocks.push(emptyPara());
  blocks.push(h2("二、AI 智能总结"));
  for (const line of c.aiSummary.split(/\n+/)) {
    if (line.trim()) blocks.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }));
  }
  if (c.recommendations.length) {
    blocks.push(h3("建议执行项："));
    for (const r of c.recommendations) {
      blocks.push(new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: r, size: 22 })],
      }));
    }
  }

  blocks.push(emptyPara());
  blocks.push(h2("三、各库区运行明细"));
  for (const z of c.zones) {
    blocks.push(...zoneSection(z));
    blocks.push(emptyPara());
  }

  blocks.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "—— 报告结束 ——", color: "94a3b8", size: 18 })],
  }));

  return blocks;
}

function overviewTable(c: ReportContent): Table {
  const headers = ["总样本", "异常点", "异常率", "覆盖库区"];
  const cells = [
    String(c.overall.totalSamples),
    String(c.overall.totalAnomalies),
    `${c.overall.anomalyRate}%`,
    String(c.zones.length),
  ];
  return makeTable(headers, [cells]);
}

function zoneSection(z: ZoneReport): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = [];
  blocks.push(h3(`${z.zone.code} · ${z.zone.name}`));
  blocks.push(new Paragraph({
    children: [
      new TextRun({ text: `阈值 ${z.zone.tempMin}℃ ~ ${z.zone.tempMax}℃    `, size: 20, color: "475569" }),
      new TextRun({ text: `样本 ${z.stats.sampleCount}    `, size: 20, color: "475569" }),
      new TextRun({ text: `极值 ${z.stats.minTemp ?? "-"} ~ ${z.stats.maxTemp ?? "-"} ℃    `, size: 20, color: "475569" }),
      new TextRun({ text: `均值 ${z.stats.avgTemp ?? "-"} ℃    `, size: 20, color: "475569" }),
      new TextRun({ text: `异常 ${z.stats.anomalyCount}（${z.stats.anomalyRate}%）    `, size: 20, color: rateColor(z.stats.anomalyRate) }),
      new TextRun({ text: `超限累计 ${z.stats.overLimitMinutes} 分钟`, size: 20, color: z.stats.overLimitMinutes > 60 ? "dc2626" : "475569" }),
    ],
  }));

  if (z.dailySeries.length) {
    blocks.push(makeTable(
      ["日期", "均温(℃)", "极低(℃)", "极高(℃)", "异常点"],
      z.dailySeries.map((d) => [d.date, String(d.avg ?? "-"), String(d.min ?? "-"), String(d.max ?? "-"), String(d.anomaly)]),
    ));
  }

  if (z.faults.length) {
    blocks.push(new Paragraph({
      children: [new TextRun({ text: "本期内关联故障：", bold: true, size: 22 })],
      spacing: { before: 100 },
    }));
    for (const f of z.faults) {
      blocks.push(new Paragraph({
        bullet: { level: 0 },
        children: [
          new TextRun({ text: `[${severityCN(f.severity)}] `, bold: true, size: 20, color: rateColor(f.severity === "critical" ? 100 : f.severity === "high" ? 5 : 1) }),
          new TextRun({ text: `${fmt(f.createdAt)} · ${f.title}（${statusCN(f.status)}）`, size: 20 }),
        ],
      }));
    }
  }
  return blocks;
}

// =============================================================
// helpers
// =============================================================

function makeTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h) => new TableCell({
          shading: { type: ShadingType.CLEAR, color: "auto", fill: "F1F5F9" },
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20, color: "0f172a" })] })],
        })),
      }),
      ...rows.map((cells) => new TableRow({
        children: cells.map((c) => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: String(c), size: 20 })] })],
        })),
      })),
    ],
    borders: borderSet("CBD5E1"),
  });
}

function borderSet(color: string) {
  const b = { style: BorderStyle.SINGLE, size: 4, color };
  return { top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b };
}

function h2(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 28, color: "0f172a" })],
  });
}
function h3(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, color: "0f172a" })],
  });
}
function metaPara(text: string) {
  return new Paragraph({ children: [new TextRun({ text, size: 18, color: "64748b" })] });
}
function emptyPara() { return new Paragraph({ children: [new TextRun({ text: "" })] }); }

function rateColor(rate: number): string {
  if (rate >= 5) return "dc2626";
  if (rate >= 1) return "f59e0b";
  return "16a34a";
}

function fmt(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const wall = new Date(d.getTime() + 8 * 3600_000);
  return `${wall.getUTCFullYear()}-${String(wall.getUTCMonth() + 1).padStart(2, "0")}-${String(wall.getUTCDate()).padStart(2, "0")} ${String(wall.getUTCHours()).padStart(2, "0")}:${String(wall.getUTCMinutes()).padStart(2, "0")}`;
}

function severityCN(s: string) { return ({ low: "一般", medium: "中等", high: "较重", critical: "严重" } as Record<string, string>)[s] ?? s; }
function statusCN(s: string) { return ({ pending: "待处理", processing: "处理中", closed: "已关闭" } as Record<string, string>)[s] ?? s; }
