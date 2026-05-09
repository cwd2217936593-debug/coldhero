export type ReportType = "daily" | "weekly" | "latest";
export type ReportStatus = "queued" | "processing" | "done" | "failed";
export type ReportFormat = "pdf" | "docx";

export interface ReportTimeRange {
  start: string; // ISO
  end: string;   // ISO
}

/** 报告内容结构（生成 PDF / Word 都用它） */
export interface ReportContent {
  meta: {
    reportNo: string;
    reportType: ReportType;
    timeRange: ReportTimeRange;
    generatedAt: string;
    user: { id: number; displayName: string };
  };
  zones: ZoneReport[];
  /** 由 AI 输出的整体总结（markdown 文本） */
  aiSummary: string;
  /** AI 给出的整体建议清单 */
  recommendations: string[];
  /** 全局统计 */
  overall: {
    totalSamples: number;
    totalAnomalies: number;
    anomalyRate: number; // %
  };
}

export interface ZoneReport {
  zone: {
    id: number;
    code: string;
    name: string;
    tempMin: number;
    tempMax: number;
  };
  stats: {
    sampleCount: number;
    minTemp: number | null;
    maxTemp: number | null;
    avgTemp: number | null;
    anomalyCount: number;
    anomalyRate: number; // %
    overLimitMinutes: number; // 累计超限分钟数（粗估）
  };
  /** 每日聚合用于报告里的图表 */
  dailySeries: { date: string; avg: number | null; min: number | null; max: number | null; anomaly: number }[];
  /** 故障报告快照（同期内提交的） */
  faults: { id: number; title: string; severity: string; status: string; createdAt: string }[];
}

export interface GeneratedReport {
  id: number;
  userId: number;
  reportNo: string;
  reportType: ReportType;
  timeRange: ReportTimeRange;
  zoneIds: number[] | null;
  summary: string | null;
  contentJson: ReportContent | null;
  fileUrlPdf: string | null;
  fileUrlDocx: string | null;
  status: ReportStatus;
  errorMsg: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportListFilter {
  userId?: number;
  status?: ReportStatus;
  reportType?: ReportType;
  limit?: number;
  offset?: number;
}
