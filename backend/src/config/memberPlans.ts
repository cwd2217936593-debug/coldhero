/**
 * 会员套餐视图（运行时代码友好字段名）
 * --------------------------------
 * 数值与权益以 `@/constants/memberLevels` 为唯一数据源，此处仅做映射，
 * 供配额中间件、历史范围、报告队列等沿用既有 MemberPlan 形状。
 *
 * DB `member_level` 使用 `professional`；遗留 JWT 可能出现 `pro`，统一走 normalizeMemberLevel。
 */

import {
  MEMBER_LEVEL_CONFIG,
  type MemberLevel,
} from "@/constants/memberLevels";

export type { MemberLevel };

export interface MemberPlan {
  level: MemberLevel;
  /** 每日 AI 问答次数；-1 表示不限 */
  aiChatPerDay: number;
  /** 每日报告生成份数；-1 表示不限 */
  reportPerDay: number;
  /** 历史数据查询天数；-1 表示全量 */
  historyRangeDays: number;
  /** 是否允许导出 Word */
  allowDocxExport: boolean;
  /** 是否拥有报告优先生成权（与档位 autoDispatch 对齐） */
  priorityQueue: boolean;
  /** 是否开放 API 接入（reportFormats 含 api） */
  apiAccess: boolean;
}

function buildPlan(level: MemberLevel): MemberPlan {
  const c = MEMBER_LEVEL_CONFIG[level];
  const formats = c.reportFormats as readonly string[];
  return {
    level,
    aiChatPerDay: c.aiChatDaily,
    reportPerDay: c.reportDaily,
    historyRangeDays: c.historyDays,
    allowDocxExport: formats.includes("docx"),
    priorityQueue: c.autoDispatch,
    apiAccess: formats.includes("api"),
  };
}

export const MEMBER_PLANS: Record<MemberLevel, MemberPlan> = {
  free: buildPlan("free"),
  basic: buildPlan("basic"),
  professional: buildPlan("professional"),
  enterprise: buildPlan("enterprise"),
};

/** 将 JWT / 外部遗留取值规范为 DB 与 MEMBER_LEVEL_CONFIG 使用的档位键 */
export function normalizeMemberLevel(raw: string): MemberLevel {
  if (raw === "pro") return "professional";
  if (raw === "free" || raw === "basic" || raw === "professional" || raw === "enterprise") {
    return raw;
  }
  return "free";
}

export function getPlan(level: MemberLevel | string): MemberPlan {
  return MEMBER_PLANS[normalizeMemberLevel(String(level))] ?? MEMBER_PLANS.free;
}
