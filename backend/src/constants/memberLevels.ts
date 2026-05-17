/**
 * 会员等级 — 全项目单一数据源（配额、权益标签、导出形态等）
 * DB `users.member_level` 枚举须与此处键一致；客户端接口禁止下发档位字段。
 */

export const MEMBER_LEVEL_CONFIG = {
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
} as const;

export type MemberLevel = keyof typeof MEMBER_LEVEL_CONFIG;

export function getMemberLevelLabel(level: MemberLevel): string {
  return MEMBER_LEVEL_CONFIG[level].label;
}
