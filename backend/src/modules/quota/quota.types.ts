/**
 * 配额类型定义
 * --------------------------------
 * 集中维护类型枚举，避免 magic string 散落多处。
 */

import type { MemberPlan } from "@/config/memberPlans";

export type QuotaType = "aiChat" | "report";

export interface QuotaCheckResult {
  /** 本次是否允许通过（peek 时表示"目前还有余额"） */
  allowed: boolean;
  /** 已使用次数（含本次） */
  used: number;
  /** 上限；-1 表示不限 */
  limit: number;
  /** 剩余次数；不限时返回 -1 */
  remaining: number;
  /** 当日重置时间（下一个 UTC+8 00:00） */
  resetAt: Date;
  /** 配额类型 */
  type: QuotaType;
}

/** 从套餐里读取指定配额类型的上限 */
export function getLimit(plan: MemberPlan, type: QuotaType): number {
  return type === "aiChat" ? plan.aiChatPerDay : plan.reportPerDay;
}
