export type FaultStatus = "pending" | "processing" | "closed";
export type FaultSeverity = "low" | "medium" | "high" | "critical";

export interface FaultImage {
  /** 存储 key（OSS object key 或本地相对路径） */
  key: string;
  /** 公网可访问 URL，前端直接使用 */
  url: string;
  /** 字节数 */
  size?: number;
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
  /** 仅列表/详情中由 service 拼接 */
  zoneName?: string | null;
  zoneCode?: string | null;
  reporterName?: string | null;
}
