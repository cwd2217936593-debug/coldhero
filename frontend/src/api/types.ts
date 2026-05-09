/** 后端返回结构 */
export interface ApiResp<T> {
  success: boolean;
  data: T;
  code?: string;
  message?: string;
  details?: unknown;
}

export type MemberLevel = "free" | "basic" | "pro" | "enterprise";

export interface User {
  id: number;
  username: string;
  email: string;
  memberLevel: MemberLevel;
  displayName: string | null;
  avatarUrl: string | null;
  role: "admin" | "operator" | "viewer";
  status: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: User;
}

export interface MemberPlan {
  level: MemberLevel;
  aiChatPerDay: number;
  reportPerDay: number;
  historyRangeDays: number;
  allowDocxExport: boolean;
  priorityQueue: boolean;
  apiAccess: boolean;
}

export interface QuotaState {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
  type: "aiChat" | "report";
}

export interface Zone {
  id: number;
  code: string;
  name: string;
  tempMin: number;
  tempMax: number;
  humidityMin: number | null;
  humidityMax: number | null;
  co2Max: number | null;
  description: string | null;
  isPublic: boolean;
}

export interface SensorPoint {
  id: number;
  zoneId: number;
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
  doorStatus: "open" | "closed" | "unknown";
  isAnomaly: boolean;
  recordedAt: string;
}

export interface ZoneSnapshot {
  zone: Zone;
  latest: SensorPoint | null;
}

export interface AggregatedPoint {
  bucket: string;
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
  isAnomaly: boolean;
  sampleCount: number;
}

export interface HistoryResp {
  zone: Zone;
  from: string;
  to: string;
  bucket: "raw" | "5min" | "1h" | "1d";
  bucketSec: number;
  pointCount: number;
  raw?: SensorPoint[];
  aggregated?: AggregatedPoint[];
}

export interface CompareResp {
  zoneId: number;
  zoneCode: string;
  from: string;
  to: string;
  actual: { timestamp: string; temperature: number | null }[];
  predicted: { timestamp: string; temperature: number | null }[];
  metrics: {
    rmse: number | null;
    mae: number | null;
    mape: number | null;
    pairCount: number;
  };
  source: "csv" | "python";
}

export interface ChatLog {
  id: number;
  sessionId: string;
  question: string;
  answer: string | null;
  model: string | null;
  status: "pending" | "success" | "failed";
  createdAt: string;
}

export interface SessionSummary {
  sessionId: string;
  messageCount: number;
  lastMessageAt: string;
  firstQuestion: string;
}

export interface NotificationItem {
  id: number;
  userId: number;
  type: string;
  title: string;
  content: string | null;
  payload: unknown;
  isRead: boolean;
  createdAt: string;
}

// =============================================================
// 阶段 7：故障报告
// =============================================================

export type FaultStatus = "pending" | "processing" | "closed";
export type FaultSeverity = "low" | "medium" | "high" | "critical";
export const FAULT_TYPES = ["制冷", "电气", "门禁", "传感器", "控制", "其他"] as const;
export type FaultType = (typeof FAULT_TYPES)[number];

export interface FaultImage {
  key: string;
  url: string;
  size?: number;
  contentType?: string;
}

export interface FaultReport {
  id: number;
  userId: number;
  zoneId: number | null;
  faultType: string;
  title: string;
  description: string;
  imageUrls: FaultImage[];
  status: FaultStatus;
  severity: FaultSeverity;
  aiAnalysis: string | null;
  handlerId: number | null;
  handlerNote: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  zoneName?: string | null;
  zoneCode?: string | null;
  reporterName?: string | null;
}

export interface FaultListResp {
  items: FaultReport[];
  total: number;
  page: number;
  pageSize: number;
}

// =============================================================
// 阶段 8：AI 检测报告
// =============================================================

export type ReportType = "daily" | "weekly" | "latest";
export type ReportStatus = "queued" | "processing" | "done" | "failed";
export type ReportFormat = "pdf" | "docx";

export interface ReportTimeRange { start: string; end: string }

export interface ReportContentZone {
  zone: { id: number; code: string; name: string; tempMin: number; tempMax: number };
  stats: {
    sampleCount: number;
    minTemp: number | null;
    maxTemp: number | null;
    avgTemp: number | null;
    anomalyCount: number;
    anomalyRate: number;
    overLimitMinutes: number;
  };
  dailySeries: { date: string; avg: number | null; min: number | null; max: number | null; anomaly: number }[];
  faults: { id: number; title: string; severity: string; status: string; createdAt: string }[];
}

export interface ReportContent {
  meta: {
    reportNo: string;
    reportType: ReportType;
    timeRange: ReportTimeRange;
    generatedAt: string;
    user: { id: number; displayName: string };
  };
  zones: ReportContentZone[];
  aiSummary: string;
  recommendations: string[];
  overall: { totalSamples: number; totalAnomalies: number; anomalyRate: number };
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

export interface ReportListResp {
  items: GeneratedReport[];
  total: number;
  page: number;
  pageSize: number;
}

// =============================================================
// 阶段 9：问卷调查
// =============================================================

export type SurveyStatus = "draft" | "published" | "closed";
export type SurveyQuestionType = "text" | "single" | "multiple";

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  title: string;
  options?: string[];
}

export interface Survey {
  id: number;
  title: string;
  description: string | null;
  questions: SurveyQuestion[];
  status: SurveyStatus;
  creatorId: number;
  createdAt: string;
  updatedAt: string;
  responseCount?: number;
}

export type SurveyAnswers = Record<string, string | string[]>;

export interface SurveyResponseRow {
  id: number;
  surveyId: number;
  userId: number | null;
  answers: SurveyAnswers;
  createdAt: string;
}

export interface SurveyAdminListResp {
  items: Survey[];
  total: number;
}

export interface SurveyResponseListResp {
  items: SurveyResponseRow[];
  total: number;
}

export interface SurveySummaryResp {
  surveyId: number;
  totalResponses: number;
  choiceStats: Record<string, Record<string, number>>;
}
