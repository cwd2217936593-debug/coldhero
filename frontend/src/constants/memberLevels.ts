/** 与后端 `MEMBER_LEVEL_CONFIG` 对齐，用于管理端展示与向导对比表 */

import type { MemberLevel } from "@/api/types";

export const MEMBER_LEVEL_CONFIG: Record<
  MemberLevel,
  {
    label: string;
    aiChatDaily: number;
    reportDaily: number;
    historyDays: number;
    zoneLimit: number;
    autoDispatch: boolean;
    reportFormats: readonly string[];
  }
> = {
  free: {
    label: "免费版",
    aiChatDaily: 5,
    reportDaily: 1,
    historyDays: 7,
    zoneLimit: 1,
    autoDispatch: false,
    reportFormats: ["pdf"],
  },
  basic: {
    label: "基础版",
    aiChatDaily: 30,
    reportDaily: 5,
    historyDays: 30,
    zoneLimit: 3,
    autoDispatch: false,
    reportFormats: ["pdf", "docx"],
  },
  professional: {
    label: "专业版",
    aiChatDaily: 100,
    reportDaily: 20,
    historyDays: 365,
    zoneLimit: 10,
    autoDispatch: true,
    reportFormats: ["pdf", "docx"],
  },
  enterprise: {
    label: "企业版",
    aiChatDaily: -1,
    reportDaily: -1,
    historyDays: -1,
    zoneLimit: -1,
    autoDispatch: true,
    reportFormats: ["pdf", "docx", "api"],
  },
};

export const MEMBER_LEVEL_ORDER: MemberLevel[] = ["free", "basic", "professional", "enterprise"];

export function formatQuota(n: number): string {
  return n < 0 ? "不限" : String(n);
}
