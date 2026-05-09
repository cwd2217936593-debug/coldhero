/**
 * 会员等级配置
 * --------------------------------
 * 与产品文档一致，集中维护各等级的配额与权限，
 * 后续限流、报告生成、数据查询范围都从此处取值。
 */

export type MemberLevel = "free" | "basic" | "pro" | "enterprise";

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
  /** 是否拥有报告优先生成权 */
  priorityQueue: boolean;
  /** 是否开放 API 接入 */
  apiAccess: boolean;
}

export const MEMBER_PLANS: Record<MemberLevel, MemberPlan> = {
  free: {
    level: "free",
    aiChatPerDay: 5,
    reportPerDay: 1,
    historyRangeDays: 7,
    allowDocxExport: false,
    priorityQueue: false,
    apiAccess: false,
  },
  basic: {
    level: "basic",
    aiChatPerDay: 30,
    reportPerDay: 5,
    historyRangeDays: 30,
    allowDocxExport: true,
    priorityQueue: false,
    apiAccess: false,
  },
  pro: {
    level: "pro",
    aiChatPerDay: 100,
    reportPerDay: 20,
    historyRangeDays: 365,
    allowDocxExport: true,
    priorityQueue: true,
    apiAccess: false,
  },
  enterprise: {
    level: "enterprise",
    aiChatPerDay: -1,
    reportPerDay: -1,
    historyRangeDays: -1,
    allowDocxExport: true,
    priorityQueue: true,
    apiAccess: true,
  },
};

export function getPlan(level: MemberLevel): MemberPlan {
  return MEMBER_PLANS[level] ?? MEMBER_PLANS.free;
}
