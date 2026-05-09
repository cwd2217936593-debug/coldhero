/**
 * 前端 Mock 层（仅在 VITE_USE_MOCK='1' 时启用）
 * --------------------------------
 * 拦截 axios（业务接口）+ fetch（SSE 流式）+ WebSocket（实时推送），
 * 让前端无需后端即可全功能运行。
 *
 * 入口：在 main.tsx 顶部 import 一次即可。
 */

import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { v4 as uuidv4 } from "uuid";
import { api } from "@/api/client";
import type {
  ApiResp,
  ChatLog,
  CompareResp,
  FaultImage,
  FaultListResp,
  FaultReport,
  FaultSeverity,
  FaultStatus,
  GeneratedReport,
  HistoryResp,
  MemberPlan,
  NotificationItem,
  QuotaState,
  ReportContent,
  ReportFormat,
  ReportListResp,
  ReportType,
  SensorPoint,
  SessionSummary,
  Survey,
  SurveyAnswers,
  SurveyQuestion,
  SurveyResponseRow,
  SurveyStatus,
  SurveySummaryResp,
  User,
  Zone,
  ZoneSnapshot,
} from "@/api/types";

// =============================================================
// 数据世界
// =============================================================

const ZONES: Zone[] = [
  { id: 1, code: "A01", name: "A 区 - 速冻库",  tempMin: -25, tempMax: -18, humidityMin: 70, humidityMax: 90, co2Max: 1000, description: "速冻肉类、海产品",   isPublic: true },
  { id: 2, code: "B01", name: "B 区 - 冷藏库",  tempMin: 0,   tempMax: 4,   humidityMin: 75, humidityMax: 95, co2Max: 800,  description: "果蔬、乳制品",       isPublic: true },
  { id: 3, code: "C01", name: "C 区 - 恒温库",  tempMin: 12,  tempMax: 18,  humidityMin: 50, humidityMax: 70, co2Max: 600,  description: "酒类、巧克力",       isPublic: false },
];

const USERS: Record<string, { user: User; password: string }> = {
  admin:      { password: "Coldhero@123", user: makeUser(1, "admin",      "enterprise", "admin",    "系统管理员") },
  demo_free:  { password: "Coldhero@123", user: makeUser(2, "demo_free",  "free",       "viewer",   "免费用户") },
  demo_basic: { password: "Coldhero@123", user: makeUser(3, "demo_basic", "basic",      "viewer",   "基础用户") },
  demo_pro:   { password: "Coldhero@123", user: makeUser(4, "demo_pro",   "pro",        "operator", "专业用户") },
  demo_ent:   { password: "Coldhero@123", user: makeUser(5, "demo_ent",   "enterprise", "operator", "企业用户") },
};

const PLANS: Record<string, MemberPlan> = {
  free:       { level: "free",       aiChatPerDay: 5,   reportPerDay: 1,  historyRangeDays: 7,   allowDocxExport: false, priorityQueue: false, apiAccess: false },
  basic:      { level: "basic",      aiChatPerDay: 30,  reportPerDay: 5,  historyRangeDays: 30,  allowDocxExport: true,  priorityQueue: false, apiAccess: false },
  pro:        { level: "pro",        aiChatPerDay: 100, reportPerDay: 20, historyRangeDays: 365, allowDocxExport: true,  priorityQueue: true,  apiAccess: false },
  enterprise: { level: "enterprise", aiChatPerDay: -1,  reportPerDay: -1, historyRangeDays: -1,  allowDocxExport: true,  priorityQueue: true,  apiAccess: true  },
};

const ZONE_HISTORY = new Map<number, SensorPoint[]>();
const NOTIFICATIONS: NotificationItem[] = [];
const QUOTA = { aiChat: 0, report: 0 };
const CHAT_SESSIONS = new Map<string, { id: number; q: string; a: string; createdAt: string }[]>();
let CHAT_LOG_ID = 0;

const FAULTS: FaultReport[] = [];
let FAULT_ID = 0;

const REPORTS: GeneratedReport[] = [];
let REPORT_ID = 0;

/** 阶段 9：问卷 mock 数据 */
let SURVEY_ID = 2;
const SURVEYS: Survey[] = [
  {
    id: 1,
    title: "冷链设备满意度调研（演示）",
    description: "mock 已发布示例，可直接填写；管理员页可查看统计与答卷。",
    questions: [
      { id: "q1", type: "single", title: "整体满意度", options: ["满意", "一般", "不满意"] },
      {
        id: "q2",
        type: "multiple",
        title: "您关注的方面（可多选）",
        options: ["温度稳定", "能耗", "告警及时", "报表与导出"],
      },
      { id: "q3", type: "text", title: "其它建议" },
    ],
    status: "published",
    creatorId: 1,
    createdAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
    updatedAt: new Date(Date.now() - 86400_000).toISOString(),
  },
  {
    id: 2,
    title: "草稿：月度巡检反馈",
    description: "发布后出现在「参与调研」；当前仅管理员可见详情。",
    questions: [
      { id: "m1", type: "single", title: "是否完成本月巡检？", options: ["是", "否"] },
      { id: "m2", type: "text", title: "备注" },
    ],
    status: "draft",
    creatorId: 1,
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    updatedAt: new Date(Date.now() - 3600_000).toISOString(),
  },
];
const SURVEY_RESPONSES: SurveyResponseRow[] = [
  {
    id: 1,
    surveyId: 1,
    userId: 2,
    answers: { q1: "满意", q2: ["温度稳定", "报表与导出"], q3: "希望增加小程序端提醒" },
    createdAt: new Date(Date.now() - 7200_000).toISOString(),
  },
];
let SURVEY_RESP_ID = 1;

const startedAt = Date.now();
seedHistory();

const SAMPLE_AI_ANALYSIS = `## 故障初步研判

**最可能原因**
1. 蒸发器结霜过厚，导致换热效率下降。
2. 制冷剂泄漏（吸气压力低 + 温度回升常见组合）。
3. 膨胀阀开度异常，节流不足。

**应急建议**
- 立即转移高价值货物至备用库区；
- 进入手动化霜程序，化霜结束后观察 30 分钟温度变化；
- 用电子检漏仪沿铜管接头检查制冷剂泄漏；
- 若 1 小时内温度仍无法回到 -20℃ 以下，建议联系制冷厂家。

**建议派工**：制冷专业 · 紧迫度 today

\`\`\`json
{
  "severity": "high",
  "urgency": "today",
  "suspectedCauses": ["蒸发器结霜过厚", "制冷剂泄漏", "膨胀阀异常"],
  "immediateActions": ["转移高价值货物", "进入手动化霜", "电子检漏仪查泄漏"],
  "recommendedSpecialty": "制冷"
}
\`\`\`
`;

function makeUser(id: number, username: string, level: User["memberLevel"], role: User["role"], displayName: string): User {
  return {
    id, username, email: `${username}@coldhero.local`,
    memberLevel: level, displayName,
    avatarUrl: null, role, status: 1,
    lastLoginAt: null, createdAt: new Date().toISOString(),
  };
}

function ouSensor(zone: Zone, prev: SensorPoint | null, t: Date, anomaly = false): SensorPoint {
  const center = (zone.tempMin + zone.tempMax) / 2;
  const span = zone.tempMax - zone.tempMin;
  const lo = zone.tempMin + span * 0.2;
  const hi = zone.tempMax - span * 0.2;
  let temp: number;
  if (anomaly) {
    temp = Math.random() < 0.5 ? zone.tempMin - 0.5 - Math.random() * 2 : zone.tempMax + 0.5 + Math.random() * 2;
  } else {
    const last = prev?.temperature ?? center;
    const drift = (center - last) * 0.15;
    temp = clamp(last + drift + (Math.random() - 0.5) * 0.4, lo - 1, hi + 1);
  }
  const humidity = clamp((zone.humidityMin ?? 60) + (zone.humidityMax! - zone.humidityMin!) * Math.random(), 0, 100);
  const co2 = 400 + Math.random() * ((zone.co2Max ?? 800) - 500);
  return {
    id: Math.floor(t.getTime()),
    zoneId: zone.id,
    temperature: round(temp, 2),
    humidity: round(humidity, 2),
    co2: round(co2, 0),
    doorStatus: Math.random() < 0.02 ? "open" : "closed",
    isAnomaly: anomaly,
    recordedAt: t.toISOString(),
  };
}

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }
function round(v: number, d: number) { return Number(v.toFixed(d)); }

function seedHistory() {
  const now = Date.now();
  const intervalMs = 30_000; // 每 30 秒一个历史点
  const points = (7 * 24 * 3600 * 1000) / intervalMs;
  for (const z of ZONES) {
    const arr: SensorPoint[] = [];
    let prev: SensorPoint | null = null;
    for (let i = points; i >= 0; i--) {
      const t = new Date(now - i * intervalMs);
      const anomaly = Math.random() < 0.04;
      const p = ouSensor(z, prev, t, anomaly);
      arr.push(p);
      prev = p;
    }
    ZONE_HISTORY.set(z.id, arr);
  }
}

// =============================================================
// 实时滚动 + WebSocket 监听者
// =============================================================

type WsClient = { send: (data: string) => void };
const wsClients = new Set<WsClient>();
const alertDedup = new Map<string, number>();

setInterval(() => {
  const t = new Date();
  for (const z of ZONES) {
    const arr = ZONE_HISTORY.get(z.id)!;
    const prev = arr[arr.length - 1] ?? null;
    const anomaly = Math.random() < 0.07;
    const p = ouSensor(z, prev, t, anomaly);
    arr.push(p);
    if (arr.length > 20000) arr.splice(0, arr.length - 20000);

    const sensorMsg = JSON.stringify({
      type: "sensor",
      zoneId: z.id,
      zoneCode: z.code,
      data: p,
    });
    wsClients.forEach((c) => c.send(sensorMsg));

    if (p.isAnomaly) {
      const k = `${z.id}:${p.temperature! < z.tempMin ? "low" : "high"}`;
      const last = alertDedup.get(k) ?? 0;
      if (Date.now() - last > 90_000) {
        alertDedup.set(k, Date.now());
        const reasons = p.temperature! < z.tempMin
          ? [`温度过低：${p.temperature}℃ < 下限 ${z.tempMin}℃`]
          : [`温度过高：${p.temperature}℃ > 上限 ${z.tempMax}℃`];
        const level = "critical";
        const alertMsg = JSON.stringify({
          type: "alert", zoneId: z.id, zoneCode: z.code, zoneName: z.name,
          level, reasons, data: p,
        });
        wsClients.forEach((c) => c.send(alertMsg));
        NOTIFICATIONS.unshift({
          id: NOTIFICATIONS.length + 1,
          userId: 0,
          type: "alert",
          title: `${z.name} 出现严重异常`,
          content: reasons.join("；"),
          payload: { zoneId: z.id, level },
          isRead: false,
          createdAt: t.toISOString(),
        });
      }
    }
  }
}, 4000);

// 启动时塞几条欢迎通知
NOTIFICATIONS.push(
  { id: 1, userId: 0, type: "system", title: "欢迎使用 ColdHero 演示模式", content: "前端处于 mock 模式，所有数据在本地内存中模拟。", payload: null, isRead: false, createdAt: new Date(startedAt).toISOString() },
  { id: 2, userId: 0, type: "report", title: "示例：日报已生成", content: "这是一条 mock 通知，证明列表渲染正常。", payload: null, isRead: true, createdAt: new Date(startedAt - 3600_000).toISOString() },
);

// 塞两条历史故障让列表非空
seedFaults();
function seedFaults() {
  const samples: Array<Omit<FaultReport, "id" | "createdAt" | "updatedAt">> = [
    {
      userId: 1, zoneId: 1, faultType: "制冷",
      title: "A 区压缩机吸气压力异常",
      description: "夜班发现 A 区温度从 -22℃ 漂移到 -17℃，压缩机吸气压力低于正常值。已断电 5 分钟后复位仍无明显改善。",
      imageUrls: [], status: "processing", severity: "high",
      aiAnalysis: SAMPLE_AI_ANALYSIS,
      handlerId: null, handlerNote: "已联系厂家工程师明早 8 点到现场。",
      closedAt: null,
      zoneCode: "A01", zoneName: "A 区 - 速冻库", reporterName: "系统管理员",
    },
    {
      userId: 4, zoneId: 2, faultType: "门禁",
      title: "B 区库门密封条老化漏冷",
      description: "近一周白天高峰时段 B 区温度上限频繁告警，目视检查发现门下方密封条变形，闭合后能看到光线。",
      imageUrls: [], status: "closed", severity: "medium",
      aiAnalysis: "建议更换 EPDM 密封条；处理已闭环。",
      handlerId: 1, handlerNote: "已更换密封条；24 小时观察温度稳定。",
      closedAt: new Date(Date.now() - 86400_000).toISOString(),
      zoneCode: "B01", zoneName: "B 区 - 冷藏库", reporterName: "专业用户",
    },
  ];
  for (const s of samples) {
    FAULT_ID++;
    FAULTS.push({
      ...s, id: FAULT_ID,
      createdAt: new Date(Date.now() - FAULT_ID * 6 * 3600_000).toISOString(),
      updatedAt: new Date(Date.now() - FAULT_ID * 5.5 * 3600_000).toISOString(),
    });
  }
}

// =============================================================
// axios 拦截
// =============================================================

api.interceptors.request.use((cfg) => fakeRequest(cfg));

function ok<T>(data: T): AxiosResponse<ApiResp<T>> {
  return {
    data: { success: true, data },
    status: 200, statusText: "OK", headers: {}, config: {} as InternalAxiosRequestConfig,
  };
}
function fail(status: number, code: string, message: string): AxiosResponse<ApiResp<never>> {
  return {
    data: { success: false, code, message } as unknown as ApiResp<never>,
    status, statusText: code, headers: {}, config: {} as InternalAxiosRequestConfig,
  };
}

async function fakeRequest(cfg: AxiosRequestConfig): Promise<InternalAxiosRequestConfig> {
  // 短路：把 adapter 替换成自定义函数，跳过真实网络
  cfg.adapter = async (c) => {
    await delay(150 + Math.random() * 250);
    let url = String(c.url || "").replace(/^\/?api\//, "");
    url = url.replace(/^\/+/, "");
    const method = (c.method || "get").toLowerCase();
    return route(method, url, parseBody(c.data), c.params || {});
  };
  return cfg as InternalAxiosRequestConfig;
}

function parseBody(d: unknown): Record<string, unknown> {
  if (!d) return {};
  if (typeof d === "string") { try { return JSON.parse(d); } catch { return {}; } }
  return d as Record<string, unknown>;
}

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function withResponseCount(s: Survey): Survey {
  const n = SURVEY_RESPONSES.filter((r) => r.surveyId === s.id).length;
  return { ...s, responseCount: n };
}

function mockValidateAnswers(questions: SurveyQuestion[], raw: SurveyAnswers): SurveyAnswers {
  const out: SurveyAnswers = {};
  for (const q of questions) {
    const v = raw[q.id];
    if (v === undefined || v === null) throw new Error(`题目「${q.title}」未填写`);
    if (q.type === "text") {
      if (typeof v !== "string") throw new Error(`题目「${q.title}」格式错误（应为文本）`);
      const s = v.trim();
      if (!s) throw new Error(`题目「${q.title}」不能为空`);
      out[q.id] = s;
    } else if (q.type === "single") {
      if (typeof v !== "string") throw new Error(`题目「${q.title}」格式错误（应为单选）`);
      if (!q.options!.includes(v)) throw new Error(`题目「${q.title}」选项非法`);
      out[q.id] = v;
    } else {
      if (!Array.isArray(v) || v.length === 0) throw new Error(`题目「${q.title}」请至少选择一项`);
      const set = new Set<string>();
      for (const x of v) {
        if (typeof x !== "string" || !q.options!.includes(x)) throw new Error(`题目「${q.title}」包含非法选项`);
        set.add(x);
      }
      out[q.id] = [...set];
    }
  }
  const extra = Object.keys(raw).filter((k) => !questions.some((qq) => qq.id === k));
  if (extra.length) throw new Error(`存在多余答案字段：${extra.join(", ")}`);
  return out;
}

function buildSurveySummary(surveyId: number): SurveySummaryResp {
  const s = SURVEYS.find((x) => x.id === surveyId)!;
  const total = SURVEY_RESPONSES.filter((r) => r.surveyId === surveyId).length;
  const items = SURVEY_RESPONSES.filter((r) => r.surveyId === surveyId);
  const choiceStats: Record<string, Record<string, number>> = {};
  for (const q of s.questions) {
    if (q.type === "text") continue;
    choiceStats[q.id] = {};
    if (q.options) for (const o of q.options) choiceStats[q.id][o] = 0;
  }
  for (const row of items) {
    for (const q of s.questions) {
      if (q.type === "text") continue;
      const ans = row.answers[q.id];
      if (q.type === "single" && typeof ans === "string") {
        choiceStats[q.id][ans] = (choiceStats[q.id][ans] ?? 0) + 1;
      }
      if (q.type === "multiple" && Array.isArray(ans)) {
        for (const a of ans) {
          choiceStats[q.id][a] = (choiceStats[q.id][a] ?? 0) + 1;
        }
      }
    }
  }
  return { surveyId, totalResponses: total, choiceStats };
}

function route(method: string, url: string, body: Record<string, unknown>, params: Record<string, unknown>): AxiosResponse {
  // ---- auth ----
  if (method === "post" && url === "auth/login") {
    const id = String(body.identifier ?? "");
    const pwd = String(body.password ?? "");
    const u = USERS[id] ?? Object.values(USERS).find((x) => x.user.email === id);
    if (!u || u.password !== pwd) return fail(401, "UNAUTHORIZED", "用户名或密码错误");
    return ok({ token: `mock.${u.user.id}.${Date.now()}`, user: u.user });
  }
  if (method === "get" && url === "auth/me") return ok(currentUser());
  if (method === "post" && url === "auth/logout") return ok(null);

  // ---- users ----
  if (method === "get" && url === "users/me/plan") return ok(PLANS[currentUser().memberLevel]);
  if (method === "get" && url === "users/me/quota") {
    const plan = PLANS[currentUser().memberLevel];
    const reset = nextUtc8Midnight().toISOString();
    return ok({
      memberLevel: currentUser().memberLevel,
      aiChat: quotaState("aiChat", QUOTA.aiChat, plan.aiChatPerDay, reset),
      report: quotaState("report", QUOTA.report, plan.reportPerDay, reset),
    });
  }

  // ---- zones ----
  if (method === "get" && url === "zones") return ok(ZONES);
  if (method === "get" && url === "zones/public") return ok(ZONES.filter((z) => z.isPublic));

  // ---- sensors ----
  if (method === "get" && url === "sensors/zones") {
    const data: ZoneSnapshot[] = ZONES.map((z) => {
      const arr = ZONE_HISTORY.get(z.id)!;
      return { zone: z, latest: arr[arr.length - 1] ?? null };
    });
    return ok(data);
  }
  const seriesM = url.match(/^sensors\/zones\/(\d+)\/series$/);
  if (method === "get" && seriesM) {
    const zoneId = Number(seriesM[1]);
    const arr = ZONE_HISTORY.get(zoneId) ?? [];
    const window = String(params.window ?? "2h");
    const ms = parseWindow(window);
    const to = Date.now();
    const points = arr.filter((p) => new Date(p.recordedAt).getTime() >= to - ms);
    const zone = ZONES.find((z) => z.id === zoneId)!;
    return ok({ from: new Date(to - ms).toISOString(), to: new Date(to).toISOString(), points, zone });
  }
  const histM = url.match(/^sensors\/zones\/(\d+)\/history$/);
  if (method === "get" && histM) {
    const zoneId = Number(histM[1]);
    const zone = ZONES.find((z) => z.id === zoneId)!;
    const { fromAt, toAt, plan } = resolveHistoryRange(params);
    if (plan.historyRangeDays >= 0 && fromAt < new Date(Date.now() - plan.historyRangeDays * 86400 * 1000)) {
      return fail(403, "FORBIDDEN", `当前会员等级仅支持查询最近 ${plan.historyRangeDays} 天数据`);
    }
    const arr = ZONE_HISTORY.get(zoneId) ?? [];
    const filtered = arr.filter((p) => {
      const ts = new Date(p.recordedAt).getTime();
      return ts >= fromAt.getTime() && ts <= toAt.getTime();
    });
    const span = toAt.getTime() - fromAt.getTime();
    let bucket: HistoryResp["bucket"] = "raw";
    if (span > 14 * 86400 * 1000) bucket = "1d";
    else if (span > 2 * 86400 * 1000) bucket = "1h";
    else if (span > 4 * 3600 * 1000) bucket = "5min";
    const result: HistoryResp = { zone, from: fromAt.toISOString(), to: toAt.toISOString(), bucket, bucketSec: 0, pointCount: filtered.length };
    if (bucket === "raw") result.raw = filtered;
    else result.aggregated = aggregate(filtered, bucketSec(bucket));
    return ok(result);
  }
  const cmpM = url.match(/^sensors\/zones\/(\d+)\/compare$/);
  if (method === "get" && cmpM) {
    const zoneId = Number(cmpM[1]);
    const zone = ZONES.find((z) => z.id === zoneId)!;
    const { fromAt, toAt, plan } = resolveHistoryRange(params);
    if (plan.historyRangeDays >= 0 && fromAt < new Date(Date.now() - plan.historyRangeDays * 86400 * 1000)) {
      return fail(403, "FORBIDDEN", `当前会员等级仅支持查询最近 ${plan.historyRangeDays} 天数据`);
    }
    const arr = ZONE_HISTORY.get(zoneId) ?? [];
    const filtered = arr.filter((p) => {
      const ts = new Date(p.recordedAt).getTime();
      return ts >= fromAt.getTime() && ts <= toAt.getTime();
    });
    const actual = filtered.map((p) => ({ timestamp: p.recordedAt, temperature: p.temperature }));
    // 预测 = 实际 + 噪声 + 平滑
    const predicted = smooth(actual, 5).map((p) => ({
      timestamp: p.timestamp,
      temperature: p.temperature !== null ? round(p.temperature + (Math.random() - 0.5) * 0.6, 2) : null,
    }));
    const metrics = computeMetrics(actual, predicted);
    const cr: CompareResp = { zoneId, zoneCode: zone.code, from: fromAt.toISOString(), to: toAt.toISOString(), actual, predicted, metrics, source: "csv" };
    return ok(cr);
  }

  // ---- chat ----
  if (method === "get" && url === "chat/sessions") {
    const list: SessionSummary[] = [];
    for (const [sid, msgs] of CHAT_SESSIONS) {
      list.push({
        sessionId: sid,
        messageCount: msgs.length,
        lastMessageAt: msgs[msgs.length - 1].createdAt,
        firstQuestion: msgs[0].q,
      });
    }
    list.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    return ok(list);
  }
  const sessionMsgsM = url.match(/^chat\/sessions\/([^/]+)\/messages$/);
  if (method === "get" && sessionMsgsM) {
    const sid = sessionMsgsM[1];
    const msgs = CHAT_SESSIONS.get(sid) ?? [];
    const data: ChatLog[] = msgs.map((m) => ({
      id: m.id, sessionId: sid, question: m.q, answer: m.a,
      model: "deepseek-chat", status: "success", createdAt: m.createdAt,
    }));
    return ok(data);
  }
  if (method === "post" && url === "chat/messages") {
    const plan = PLANS[currentUser().memberLevel];
    if (plan.aiChatPerDay >= 0 && QUOTA.aiChat >= plan.aiChatPerDay) {
      return fail(429, "RATE_LIMITED", "当日 AI 问答次数已用完");
    }
    QUOTA.aiChat++;
    const sid = String(body.sessionId ?? uuidv4());
    const q = String(body.question ?? "");
    const a = mockAnswer(q);
    const item = { id: ++CHAT_LOG_ID, q, a, createdAt: new Date().toISOString() };
    if (!CHAT_SESSIONS.has(sid)) CHAT_SESSIONS.set(sid, []);
    CHAT_SESSIONS.get(sid)!.push(item);
    return ok({ sessionId: sid, logId: item.id, question: q, answer: a, model: "deepseek-chat", tier: "fast", latencyMs: 800 });
  }

  // ---- notifications ----
  if (method === "get" && url === "notifications") {
    const unreadOnly = params.unreadOnly === true || params.unreadOnly === "true";
    return ok(NOTIFICATIONS.filter((n) => (unreadOnly ? !n.isRead : true)));
  }
  if (method === "get" && url === "notifications/unread-count") {
    return ok({ count: NOTIFICATIONS.filter((n) => !n.isRead).length });
  }
  if (method === "post" && url === "notifications/mark-read") {
    const ids = (body.ids as number[]) ?? [];
    NOTIFICATIONS.forEach((n) => { if (ids.includes(n.id)) n.isRead = true; });
    return ok(null);
  }
  if (method === "post" && url === "notifications/mark-all-read") {
    NOTIFICATIONS.forEach((n) => (n.isRead = true));
    return ok(null);
  }

  // ---- fault reports ----
  if (method === "post" && url === "fault-reports/uploads") {
    // body 可能是 FormData 实例（multipart）或 普通 object
    let names: string[] = [];
    if (body instanceof FormData) {
      for (const f of body.getAll("files")) {
        if (f instanceof File) names.push(f.name);
      }
    }
    if (!names.length) names = ["placeholder.jpg"];
    const uploads: FaultImage[] = names.map((n) => ({
      key: `mock/fault/${uuidv4()}_${n}`,
      url: makePlaceholderImage(n),
      contentType: "image/png",
      size: 60 * 1024,
    }));
    return ok({ uploads, backend: "local" });
  }
  if (method === "post" && url === "fault-reports") {
    const dto = body as unknown as {
      zoneId?: number | null;
      faultType: string;
      title: string;
      description: string;
      imageUrls?: FaultImage[];
      severity?: FaultSeverity;
    };
    FAULT_ID++;
    const zone = dto.zoneId ? ZONES.find((z) => z.id === dto.zoneId) : null;
    const item: FaultReport = {
      id: FAULT_ID,
      userId: currentUser().id,
      zoneId: dto.zoneId ?? null,
      faultType: dto.faultType,
      title: dto.title,
      description: dto.description,
      imageUrls: dto.imageUrls ?? [],
      status: "pending",
      severity: dto.severity ?? "medium",
      aiAnalysis: null,
      handlerId: null,
      handlerNote: null,
      closedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      zoneCode: zone?.code ?? null,
      zoneName: zone?.name ?? null,
      reporterName: currentUser().displayName,
    };
    FAULTS.unshift(item);
    // 模拟异步 AI 分析（3s 后回填）
    setTimeout(() => {
      item.aiAnalysis = SAMPLE_AI_ANALYSIS;
      item.severity = sevMax(item.severity, "high");
      item.updatedAt = new Date().toISOString();
      NOTIFICATIONS.unshift({
        id: NOTIFICATIONS.length + 100,
        userId: currentUser().id,
        type: "fault",
        title: `故障报告 #${item.id} 已生成 AI 初步分析`,
        content: item.title,
        payload: { faultId: item.id, severity: item.severity },
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }, 2500);
    return ok(item);
  }
  if (method === "get" && url === "fault-reports") {
    const u = currentUser();
    const isAdmin = u.role === "admin" || u.role === "operator";
    const onlyMine = !isAdmin || params.mine === true || params.mine === "true";
    const status = params.status as FaultStatus | undefined;
    const severity = params.severity as FaultSeverity | undefined;
    const keyword = (params.keyword as string | undefined)?.trim();
    const page = Number(params.page ?? 1);
    const pageSize = Number(params.pageSize ?? 20);
    let arr = [...FAULTS];
    if (onlyMine) arr = arr.filter((r) => r.userId === u.id);
    if (status) arr = arr.filter((r) => r.status === status);
    if (severity) arr = arr.filter((r) => r.severity === severity);
    if (keyword) arr = arr.filter((r) => (r.title + r.description).includes(keyword));
    const total = arr.length;
    const items = arr.slice((page - 1) * pageSize, page * pageSize);
    const resp: FaultListResp = { items, total, page, pageSize };
    return ok(resp);
  }
  const frDetail = url.match(/^fault-reports\/(\d+)$/);
  if (method === "get" && frDetail) {
    const id = Number(frDetail[1]);
    const r = FAULTS.find((x) => x.id === id);
    if (!r) return fail(404, "NOT_FOUND", "故障报告不存在");
    return ok(r);
  }
  if (method === "patch" && frDetail) {
    const id = Number(frDetail[1]);
    const r = FAULTS.find((x) => x.id === id);
    if (!r) return fail(404, "NOT_FOUND", "故障报告不存在");
    const u = currentUser();
    if (u.role !== "admin" && u.role !== "operator") return fail(403, "FORBIDDEN", "仅管理员/运维可操作");
    const patch = body as Partial<FaultReport>;
    if (patch.status !== undefined) r.status = patch.status;
    if (patch.severity !== undefined) r.severity = patch.severity;
    if (patch.handlerNote !== undefined) r.handlerNote = patch.handlerNote ?? null;
    if (patch.handlerId !== undefined) r.handlerId = patch.handlerId ?? null;
    if (r.status === "closed") r.closedAt = new Date().toISOString();
    else r.closedAt = null;
    r.updatedAt = new Date().toISOString();
    return ok(r);
  }
  if (method === "delete" && frDetail) {
    const id = Number(frDetail[1]);
    const idx = FAULTS.findIndex((x) => x.id === id);
    if (idx < 0) return fail(404, "NOT_FOUND", "故障报告不存在");
    FAULTS.splice(idx, 1);
    return ok(null);
  }
  const frRe = url.match(/^fault-reports\/(\d+)\/reanalyze$/);
  if (method === "post" && frRe) {
    const id = Number(frRe[1]);
    const r = FAULTS.find((x) => x.id === id);
    if (!r) return fail(404, "NOT_FOUND", "故障报告不存在");
    r.aiAnalysis = SAMPLE_AI_ANALYSIS + `\n\n_(本次为重新分析，时间 ${new Date().toLocaleString()})_`;
    r.updatedAt = new Date().toISOString();
    return ok(r);
  }

  // ---- surveys (阶段 9) ----
  if (method === "get" && url === "surveys/published") {
    const data = SURVEYS.filter((s) => s.status === "published").map(withResponseCount);
    return ok(data);
  }
  if (method === "get" && url === "surveys/admin") {
    const u = currentUser();
    if (u.role !== "admin" && u.role !== "operator") return fail(403, "FORBIDDEN", "仅管理员/运维可操作");
    let arr = [...SURVEYS];
    const st = params.status as string | undefined;
    if (st && ["draft", "published", "closed"].includes(st)) {
      arr = arr.filter((s) => s.status === (st as SurveyStatus));
    }
    const page = Number(params.page ?? 1);
    const pageSize = Number(params.pageSize ?? 20);
    const total = arr.length;
    const items = arr.slice((page - 1) * pageSize, page * pageSize).map(withResponseCount);
    return ok({ items, total });
  }
  if (method === "post" && url === "surveys") {
    const u = currentUser();
    if (u.role !== "admin" && u.role !== "operator") return fail(403, "FORBIDDEN", "仅管理员/运维可操作");
    const dto = body as { title?: string; description?: string | null; questions?: SurveyQuestion[]; status?: SurveyStatus };
    if (!dto.title || dto.title.length < 2) return fail(400, "BAD_REQUEST", "标题至少 2 个字符");
    if (!dto.questions?.length) return fail(400, "BAD_REQUEST", "至少一道题");
    SURVEY_ID++;
    const now = new Date().toISOString();
    const s: Survey = {
      id: SURVEY_ID,
      title: dto.title,
      description: dto.description ?? null,
      questions: dto.questions,
      status: dto.status ?? "draft",
      creatorId: u.id,
      createdAt: now,
      updatedAt: now,
    };
    SURVEYS.unshift(s);
    return ok(withResponseCount(s));
  }

  const surveyResponsesPath = url.match(/^surveys\/(\d+)\/responses$/);
  if (surveyResponsesPath) {
    const sid = Number(surveyResponsesPath[1]);
    if (method === "get") {
      const u = currentUser();
      if (u.role !== "admin" && u.role !== "operator") return fail(403, "FORBIDDEN", "仅管理员/运维可操作");
      if (!SURVEYS.some((x) => x.id === sid)) return fail(404, "NOT_FOUND", "问卷不存在");
      const page = Number(params.page ?? 1);
      const pageSize = Number(params.pageSize ?? 20);
      const all = [...SURVEY_RESPONSES.filter((r) => r.surveyId === sid)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const total = all.length;
      const items = all.slice((page - 1) * pageSize, page * pageSize);
      return ok({ items, total });
    }
    if (method === "post") {
      const s = SURVEYS.find((x) => x.id === sid);
      if (!s) return fail(404, "NOT_FOUND", "问卷不存在");
      if (s.status !== "published") return fail(400, "BAD_REQUEST", "问卷未开放填写");
      const answersRaw = (body as { answers?: SurveyAnswers }).answers ?? {};
      let clean: SurveyAnswers;
      try {
        clean = mockValidateAnswers(s.questions, answersRaw);
      } catch (e) {
        return fail(400, "BAD_REQUEST", e instanceof Error ? e.message : "答案校验失败");
      }
      const u = currentUser();
      const userId = u.id;
      if (SURVEY_RESPONSES.some((r) => r.surveyId === sid && r.userId === userId)) {
        return fail(400, "BAD_REQUEST", "您已提交过本问卷，每个账号仅可提交一次");
      }
      SURVEY_RESP_ID++;
      const row: SurveyResponseRow = {
        id: SURVEY_RESP_ID,
        surveyId: sid,
        userId,
        answers: clean,
        createdAt: new Date().toISOString(),
      };
      SURVEY_RESPONSES.push(row);
      return ok(row);
    }
  }

  const surveySummaryM = url.match(/^surveys\/(\d+)\/summary$/);
  if (method === "get" && surveySummaryM) {
    const u = currentUser();
    if (u.role !== "admin" && u.role !== "operator") return fail(403, "FORBIDDEN", "仅管理员/运维可操作");
    const sid = Number(surveySummaryM[1]);
    if (!SURVEYS.some((x) => x.id === sid)) return fail(404, "NOT_FOUND", "问卷不存在");
    return ok(buildSurveySummary(sid));
  }

  const surveyIdM = url.match(/^surveys\/(\d+)$/);
  if (surveyIdM) {
    const id = Number(surveyIdM[1]);
    const s = SURVEYS.find((x) => x.id === id);
    if (!s) return fail(404, "NOT_FOUND", "问卷不存在");
    const u = currentUser();
    if (method === "get") {
      if (s.status === "published") return ok(withResponseCount(s));
      if (u.role === "admin" || u.role === "operator" || s.creatorId === u.id) return ok(withResponseCount(s));
      return fail(403, "FORBIDDEN", "问卷未发布或无权查看");
    }
    if (method === "patch") {
      if (u.role !== "admin" && u.role !== "operator") return fail(403, "FORBIDDEN", "仅管理员/运维可操作");
      const patch = body as Partial<{ title: string; description: string | null; questions: SurveyQuestion[]; status: SurveyStatus }>;
      if (patch.title !== undefined) {
        if (patch.title.length < 2) return fail(400, "BAD_REQUEST", "标题至少 2 个字符");
        s.title = patch.title;
      }
      if (patch.description !== undefined) s.description = patch.description;
      if (patch.questions !== undefined) {
        if (!patch.questions.length) return fail(400, "BAD_REQUEST", "至少一道题");
        s.questions = patch.questions;
      }
      if (patch.status !== undefined) s.status = patch.status;
      s.updatedAt = new Date().toISOString();
      return ok(withResponseCount(s));
    }
    if (method === "delete") {
      if (u.role !== "admin" && u.role !== "operator") return fail(403, "FORBIDDEN", "仅管理员/运维可操作");
      const idx = SURVEYS.findIndex((x) => x.id === id);
      if (idx >= 0) SURVEYS.splice(idx, 1);
      for (let i = SURVEY_RESPONSES.length - 1; i >= 0; i--) {
        if (SURVEY_RESPONSES[i].surveyId === id) SURVEY_RESPONSES.splice(i, 1);
      }
      return ok(null);
    }
  }

  // ---- reports (阶段 8) ----
  if (method === "post" && url === "reports") {
    const u = currentUser();
    const userPlan = PLANS[u.memberLevel];
    if (userPlan.reportPerDay >= 0 && QUOTA.report >= userPlan.reportPerDay) {
      return fail(429, "RATE_LIMITED", "当日检测报告配额已用完");
    }
    const dto = body as unknown as {
      reportType: ReportType;
      from?: string;
      to?: string;
      zoneIds?: number[] | null;
      formats: ReportFormat[];
    };
    if (dto.formats.includes("docx") && !userPlan.allowDocxExport) {
      return fail(403, "FORBIDDEN", "当前会员不支持 Word 导出");
    }
    QUOTA.report++;
    REPORT_ID++;

    const span = dto.reportType === "weekly" ? 7 * 86400_000 : 86400_000;
    const end = new Date(dto.to ?? Date.now());
    const start = new Date(dto.from ?? end.getTime() - span);
    const id = REPORT_ID;
    const reportNo = `RPT-MOCK-${id}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const item: GeneratedReport = {
      id,
      userId: u.id,
      reportNo,
      reportType: dto.reportType,
      timeRange: { start: start.toISOString(), end: end.toISOString() },
      zoneIds: dto.zoneIds && dto.zoneIds.length ? dto.zoneIds : null,
      summary: null, contentJson: null, fileUrlPdf: null, fileUrlDocx: null,
      status: "queued", errorMsg: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    REPORTS.unshift(item);

    // 模拟流转：1.5s 后进入 processing，再 3s 后 done，附 PDF/Word dataURL
    setTimeout(() => {
      item.status = "processing";
      item.updatedAt = new Date().toISOString();
    }, 1500);
    setTimeout(() => {
      const content = buildMockReportContent(item, dto.zoneIds ?? null);
      item.contentJson = content;
      item.summary = content.aiSummary;
      const pdfDataUrl = makeMockTextDataUrl(`${item.reportNo}.pdf`, "application/pdf", content);
      item.fileUrlPdf = pdfDataUrl;
      if (dto.formats.includes("docx") && userPlan.allowDocxExport) {
        item.fileUrlDocx = makeMockTextDataUrl(`${item.reportNo}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", content);
      }
      item.status = "done";
      item.updatedAt = new Date().toISOString();
      NOTIFICATIONS.unshift({
        id: NOTIFICATIONS.length + 200,
        userId: u.id,
        type: "report",
        title: `报告 ${item.reportNo} 已生成`,
        content: `${dto.reportType === "daily" ? "日" : dto.reportType === "weekly" ? "周" : "最新"}检测报告（${dto.formats.join("/")}）`,
        payload: { reportId: id },
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }, 4500);

    return ok(item);
  }
  if (method === "get" && url === "reports") {
    const u = currentUser();
    const isAdmin = u.role === "admin";
    let arr = isAdmin ? [...REPORTS] : REPORTS.filter((r) => r.userId === u.id);
    if (params.status) arr = arr.filter((r) => r.status === params.status);
    if (params.reportType) arr = arr.filter((r) => r.reportType === params.reportType);
    const page = Number(params.page ?? 1);
    const pageSize = Number(params.pageSize ?? 20);
    const total = arr.length;
    const items = arr.slice((page - 1) * pageSize, page * pageSize);
    const resp: ReportListResp = { items, total, page, pageSize };
    return ok(resp);
  }
  const repDetail = url.match(/^reports\/(\d+)$/);
  if (method === "get" && repDetail) {
    const id = Number(repDetail[1]);
    const r = REPORTS.find((x) => x.id === id);
    if (!r) return fail(404, "NOT_FOUND", "报告不存在");
    return ok(r);
  }
  if (method === "delete" && repDetail) {
    const id = Number(repDetail[1]);
    const idx = REPORTS.findIndex((x) => x.id === id);
    if (idx < 0) return fail(404, "NOT_FOUND", "报告不存在");
    REPORTS.splice(idx, 1);
    return ok(null);
  }

  return fail(404, "NOT_FOUND", `mock 未实现：${method.toUpperCase()} /api/${url}`);
}

function buildMockReportContent(item: GeneratedReport, zoneIds: number[] | null): ReportContent {
  const u = currentUser();
  const targetZones = zoneIds && zoneIds.length ? ZONES.filter((z) => zoneIds.includes(z.id)) : ZONES;
  const fromMs = new Date(item.timeRange.start).getTime();
  const toMs = new Date(item.timeRange.end).getTime();

  const zoneReports = targetZones.map((z) => {
    const arr = (ZONE_HISTORY.get(z.id) ?? []).filter((p) => {
      const t = new Date(p.recordedAt).getTime();
      return t >= fromMs && t <= toMs;
    });
    const temps = arr.map((p) => p.temperature).filter((v): v is number => typeof v === "number");
    const anomalyCount = arr.filter((p) => p.isAnomaly).length;
    const minTemp = temps.length ? round(Math.min(...temps), 2) : null;
    const maxTemp = temps.length ? round(Math.max(...temps), 2) : null;
    const avgTemp = temps.length ? round(temps.reduce((a, b) => a + b, 0) / temps.length, 2) : null;
    const overLimitMinutes = Math.round(arr.filter((p) => typeof p.temperature === "number" && (p.temperature! < z.tempMin || p.temperature! > z.tempMax)).length * 30 / 60);

    // 每日聚合
    const dayMap = new Map<string, { sum: number; n: number; min: number; max: number; anomaly: number }>();
    for (const p of arr) {
      const d = new Date(p.recordedAt);
      const key = d.toISOString().slice(0, 10);
      const e = dayMap.get(key) ?? { sum: 0, n: 0, min: Infinity, max: -Infinity, anomaly: 0 };
      if (typeof p.temperature === "number") {
        e.sum += p.temperature; e.n += 1;
        if (p.temperature < e.min) e.min = p.temperature;
        if (p.temperature > e.max) e.max = p.temperature;
      }
      if (p.isAnomaly) e.anomaly += 1;
      dayMap.set(key, e);
    }
    const dailySeries = [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, e]) => ({
      date, avg: e.n ? round(e.sum / e.n, 2) : null, min: e.n ? round(e.min, 2) : null, max: e.n ? round(e.max, 2) : null, anomaly: e.anomaly,
    }));

    const faults = FAULTS.filter((f) => f.zoneId === z.id).slice(0, 3).map((f) => ({
      id: f.id, title: f.title, severity: f.severity, status: f.status, createdAt: f.createdAt,
    }));

    return {
      zone: { id: z.id, code: z.code, name: z.name, tempMin: z.tempMin, tempMax: z.tempMax },
      stats: {
        sampleCount: arr.length,
        minTemp, maxTemp, avgTemp,
        anomalyCount,
        anomalyRate: arr.length ? round((anomalyCount / arr.length) * 100, 2) : 0,
        overLimitMinutes,
      },
      dailySeries,
      faults,
    };
  });

  const totalSamples = zoneReports.reduce((s, z) => s + z.stats.sampleCount, 0);
  const totalAnomalies = zoneReports.reduce((s, z) => s + z.stats.anomalyCount, 0);

  const recommendations: string[] = [];
  for (const z of zoneReports) {
    if (z.stats.anomalyRate > 5) recommendations.push(`重点关注 ${z.zone.code}（异常率 ${z.stats.anomalyRate}%），核查制冷机组与传感器。`);
    if (z.stats.overLimitMinutes > 60) recommendations.push(`${z.zone.code} 累计超限 ${z.stats.overLimitMinutes} 分钟，检查库门密封与化霜节奏。`);
  }
  if (!recommendations.length) recommendations.push("整体运行平稳，建议保持现有运维节奏并持续观察。");

  const aiSummary = `本报告期共采集 **${totalSamples}** 个传感器样本，异常 **${totalAnomalies}** 个（${round(totalSamples ? (totalAnomalies / totalSamples) * 100 : 0, 2)}%）。
${zoneReports.map((z) => `- ${z.zone.code} ${z.zone.name}：均温 ${z.stats.avgTemp ?? "-"}℃，超限累计 ${z.stats.overLimitMinutes} 分钟，关联故障 ${z.faults.length} 起。`).join("\n")}`;

  return {
    meta: {
      reportNo: item.reportNo,
      reportType: item.reportType,
      timeRange: item.timeRange,
      generatedAt: new Date().toISOString(),
      user: { id: u.id, displayName: u.displayName ?? u.username },
    },
    zones: zoneReports,
    aiSummary,
    recommendations,
    overall: {
      totalSamples, totalAnomalies,
      anomalyRate: totalSamples ? round((totalAnomalies / totalSamples) * 100, 2) : 0,
    },
  };
}

/** 演示用：用 dataURL 模拟一个可下载的"文件"，浏览器会触发下载并显示文本内容。 */
function makeMockTextDataUrl(filename: string, mime: string, content: ReportContent): string {
  const text = renderMockReportText(filename, content);
  // 用 base64 编码 UTF-8 字符串
  const utf8 = unescape(encodeURIComponent(text));
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const b64 = btoa(utf8);
  return `data:${mime};charset=utf-8;base64,${b64}`;
}

function renderMockReportText(filename: string, c: ReportContent): string {
  const lines: string[] = [];
  lines.push(`====== ColdHero · ${filename} ======`);
  lines.push(`报告编号：${c.meta.reportNo}`);
  lines.push(`报告期：${c.meta.timeRange.start} ~ ${c.meta.timeRange.end}`);
  lines.push(`生成时间：${c.meta.generatedAt}`);
  lines.push(`编制：${c.meta.user.displayName}`);
  lines.push("");
  lines.push("【整体概览】");
  lines.push(`总样本：${c.overall.totalSamples}`);
  lines.push(`异常点：${c.overall.totalAnomalies}（${c.overall.anomalyRate}%）`);
  lines.push("");
  lines.push("【AI 智能总结】");
  lines.push(c.aiSummary);
  lines.push("");
  lines.push("【建议执行项】");
  c.recommendations.forEach((r, i) => lines.push(`  ${i + 1}. ${r}`));
  lines.push("");
  lines.push("【各库区运行明细】");
  for (const z of c.zones) {
    lines.push(`- ${z.zone.code} ${z.zone.name}（阈值 ${z.zone.tempMin} ~ ${z.zone.tempMax} ℃）`);
    lines.push(`    样本 ${z.stats.sampleCount}，极值 ${z.stats.minTemp ?? "-"} ~ ${z.stats.maxTemp ?? "-"} ℃，均温 ${z.stats.avgTemp ?? "-"} ℃`);
    lines.push(`    异常 ${z.stats.anomalyCount}（${z.stats.anomalyRate}%），超限累计 ${z.stats.overLimitMinutes} 分钟`);
    if (z.faults.length) {
      lines.push("    本期内关联故障：");
      z.faults.forEach((f) => lines.push(`      · #${f.id} [${f.severity}] ${f.title}（${f.status}）`));
    }
  }
  lines.push("");
  lines.push("（本文件由前端 mock 模式生成；接入真实后端后将由 pdfmake / docx 生成正式 PDF/Word。）");
  return lines.join("\n");
}

function sevMax(a: FaultSeverity, b: FaultSeverity): FaultSeverity {
  const order: FaultSeverity[] = ["low", "medium", "high", "critical"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

/** 生成一个 SVG 占位图（dataURL）。文件名作为图上文字。 */
function makePlaceholderImage(name: string): string {
  const colors = ["#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6"];
  const c = colors[Math.floor(Math.random() * colors.length)];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'>
    <rect width='400' height='400' fill='${c}'/>
    <text x='50%' y='50%' fill='white' font-size='22' font-family='sans-serif'
      text-anchor='middle' dominant-baseline='middle'>${name.replace(/[<>]/g, "").slice(0, 24)}</text>
    <text x='50%' y='62%' fill='white' font-size='14' font-family='sans-serif'
      text-anchor='middle' dominant-baseline='middle' opacity='0.8'>mock 占位</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function quotaState(type: "aiChat" | "report", used: number, limit: number, resetAt: string): QuotaState {
  const unlimited = limit < 0;
  return {
    type, used, limit,
    remaining: unlimited ? -1 : Math.max(0, limit - used),
    allowed: unlimited || used < limit,
    resetAt,
  };
}

function nextUtc8Midnight(): Date {
  const now = new Date();
  const wall = new Date(now.getTime() + 8 * 3600 * 1000);
  wall.setUTCHours(0, 0, 0, 0); wall.setUTCDate(wall.getUTCDate() + 1);
  return new Date(wall.getTime() - 8 * 3600 * 1000);
}

function resolveHistoryRange(params: Record<string, unknown>) {
  const user = currentUser();
  const plan = PLANS[user.memberLevel];
  const now = Date.now();
  const allowedMs = plan.historyRangeDays < 0 ? Infinity : plan.historyRangeDays * 86400 * 1000;
  const earliest = plan.historyRangeDays < 0 ? new Date(0) : new Date(now - allowedMs);
  const toAt = params.to ? new Date(String(params.to)) : new Date(now);
  const fromAt = params.from ? new Date(String(params.from)) : earliest;
  return { fromAt, toAt, plan };
}

function parseWindow(s: string): number {
  const m = /^(\d+)([hd])$/.exec(s);
  if (!m) return 2 * 3600 * 1000;
  const n = parseInt(m[1], 10);
  return m[2] === "h" ? n * 3600 * 1000 : n * 86400 * 1000;
}

function bucketSec(b: HistoryResp["bucket"]): number {
  return b === "5min" ? 300 : b === "1h" ? 3600 : b === "1d" ? 86400 : 0;
}

function aggregate(rows: SensorPoint[], sec: number) {
  if (sec === 0) return [];
  const map = new Map<number, { t: number; temp: number[]; hum: number[]; co2: number[]; anom: boolean; n: number }>();
  for (const r of rows) {
    const ts = Math.floor(new Date(r.recordedAt).getTime() / 1000 / sec) * sec * 1000;
    const e = map.get(ts) ?? { t: ts, temp: [], hum: [], co2: [], anom: false, n: 0 };
    if (r.temperature !== null) e.temp.push(r.temperature);
    if (r.humidity !== null) e.hum.push(r.humidity);
    if (r.co2 !== null) e.co2.push(r.co2);
    e.anom = e.anom || r.isAnomaly;
    e.n++;
    map.set(ts, e);
  }
  return [...map.values()].sort((a, b) => a.t - b.t).map((e) => ({
    bucket: new Date(e.t).toISOString(),
    temperature: avg(e.temp),
    humidity: avg(e.hum),
    co2: avg(e.co2),
    isAnomaly: e.anom,
    sampleCount: e.n,
  }));
}
const avg = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length, 2) : null);

function smooth(arr: { timestamp: string; temperature: number | null }[], w: number) {
  const out: typeof arr = [];
  const buf: number[] = [];
  for (const p of arr) {
    if (p.temperature !== null) {
      buf.push(p.temperature);
      if (buf.length > w) buf.shift();
    }
    out.push({ timestamp: p.timestamp, temperature: buf.length ? avg(buf) : null });
  }
  return out;
}

function computeMetrics(actual: { timestamp: string; temperature: number | null }[], predicted: { timestamp: string; temperature: number | null }[]) {
  let sumSq = 0, sumAbs = 0, sumPct = 0, n = 0, pctN = 0;
  const m = new Map<string, number>();
  for (const p of predicted) if (p.temperature !== null) m.set(p.timestamp, p.temperature);
  for (const a of actual) {
    if (a.temperature === null) continue;
    const pv = m.get(a.timestamp);
    if (pv === undefined) continue;
    const d = a.temperature - pv;
    sumSq += d * d; sumAbs += Math.abs(d);
    if (Math.abs(a.temperature) >= 0.01) { sumPct += Math.abs(d / a.temperature); pctN++; }
    n++;
  }
  return {
    rmse: n ? round(Math.sqrt(sumSq / n), 4) : null,
    mae:  n ? round(sumAbs / n, 4) : null,
    mape: pctN ? round((sumPct / pctN) * 100, 4) : null,
    pairCount: n,
  };
}

function currentUser(): User {
  // 从 zustand 持久化里取
  try {
    const raw = localStorage.getItem("coldhero-auth");
    if (raw) return JSON.parse(raw).state.user as User;
  } catch { /* ignore */ }
  return USERS.admin.user;
}

function mockAnswer(q: string): string {
  return `（演示模式 · 模拟回答）针对您的问题"${q.slice(0, 40)}${q.length > 40 ? "…" : ""}"，初步分析如下：

1. **可能原因**：在冷藏库环境中，温度持续超出阈值往往与制冷机组负载、库门密封、化霜周期相关。
2. **现场排查建议**：
   - 检查机组运行状态与回气压力；
   - 查看库门是否长时间打开或密封条老化；
   - 核对最近化霜记录，蒸发器若结冰过厚会显著降低制冷效率。
3. **应急处理**：货物温度若已接近临界值，建议优先转移至备用库区，并尽快联系厂家技术支持。

⚠️ 本回答由前端 mock 模式生成，接入真实后端后将由 DeepSeek / 通义千问产生具体方案。`;
}

// =============================================================
// Mock SSE 流式（拦截 fetch）
// =============================================================

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes("/api/chat/messages/stream")) {
    return mockStream(init);
  }
  return realFetch(input as RequestInfo | URL, init);
};

function mockStream(init?: RequestInit): Response {
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const sid = body.sessionId ?? uuidv4();
  const q = String(body.question ?? "");

  const plan = PLANS[currentUser().memberLevel];
  if (plan.aiChatPerDay >= 0 && QUOTA.aiChat >= plan.aiChatPerDay) {
    return new Response(JSON.stringify({ success: false, message: "当日 AI 问答次数已用完" }), { status: 429 });
  }
  QUOTA.aiChat++;
  const answer = mockAnswer(q);
  const logId = ++CHAT_LOG_ID;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const write = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      write({ type: "start", sessionId: sid, logId, tier: "fast" });
      // 按 char 切片打字
      let acc = "";
      for (const ch of answer) {
        acc += ch;
        write({ type: "delta", delta: ch });
        await delay(8);
      }
      // 落库
      if (!CHAT_SESSIONS.has(sid)) CHAT_SESSIONS.set(sid, []);
      CHAT_SESSIONS.get(sid)!.push({ id: logId, q, a: acc, createdAt: new Date().toISOString() });
      write({ type: "end", done: true, sessionId: sid, logId, latencyMs: 0, model: "deepseek-chat" });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}

// =============================================================
// Mock WebSocket
// =============================================================

const RealWebSocket = window.WebSocket;

class MockWebSocket extends EventTarget {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  readyState = 0;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  private client: WsClient = { send: (data) => {
    const ev = new MessageEvent("message", { data });
    this.dispatchEvent(ev);
    this.onmessage?.(ev);
  }};
  constructor(public url: string) {
    super();
    setTimeout(() => {
      this.readyState = 1;
      const ev = new Event("open");
      this.onopen?.(ev);
      this.dispatchEvent(ev);
      wsClients.add(this.client);
      // 立即发个 welcome
      this.client.send(JSON.stringify({ type: "welcome", userId: currentUser().id, zones: "all" }));
    }, 50);
  }
  send(_data: string) { /* mock: ignore subscribe */ }
  close() {
    this.readyState = 3;
    wsClients.delete(this.client);
    const ev = new CloseEvent("close", { wasClean: true });
    this.onclose?.(ev);
    this.dispatchEvent(ev);
  }
  ping?(): void { /* noop */ }
}

(window as unknown as { WebSocket: typeof RealWebSocket }).WebSocket = MockWebSocket as unknown as typeof RealWebSocket;

// 运行标识
console.info("%c[coldhero] Mock 模式已启用", "color:#1f72ee;font-weight:bold");
