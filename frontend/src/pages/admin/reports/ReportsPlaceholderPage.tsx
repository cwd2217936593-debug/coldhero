/**
 * P2 数据报表占位页（提示词 Step 9）
 * 文件名避免与客户端 ReportsPage 混淆。
 */

import P2ModulePlaceholder from "@/pages/admin/shared/P2ModulePlaceholder";

export default function ReportsPlaceholderPage() {
  return (
    <P2ModulePlaceholder
      title="数据报表"
      apiPrefix="/api/admin/reports/*"
      bullets={[
        "后端计划：库区/能耗/告警等聚合、导出与大屏数据源（routes/admin/reports.ts）",
        "客户侧已有「检测报告」`/reports`，请勿混淆本占位页文件名",
      ]}
    />
  );
}
