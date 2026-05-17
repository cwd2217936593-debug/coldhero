/**
 * P2 问卷管理占位页（提示词 Step 9）
 */

import P2ModulePlaceholder from "@/pages/admin/shared/P2ModulePlaceholder";

export default function SurveysPage() {
  return (
    <P2ModulePlaceholder
      title="问卷管理"
      apiPrefix="/api/admin/surveys/*"
      bullets={[
        "后端计划：问卷 CRUD、答卷统计与导出（见 routes/admin/surveys.ts）",
        "与客户侧路由「问卷调查」`/surveys` 不同——本页仅在管理后台挂载",
      ]}
      jobNotes={["backend/src/jobs/faqMining.ts：FAQ 归因调度占位（与对话日志报表联动，P2 实现）"]}
    />
  );
}
