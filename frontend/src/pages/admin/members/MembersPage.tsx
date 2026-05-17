/**
 * P2 会员提醒占位页（提示词 Step 9）
 */

import P2ModulePlaceholder from "@/pages/admin/shared/P2ModulePlaceholder";

export default function MembersPage() {
  return (
    <P2ModulePlaceholder
      title="会员到期提醒"
      apiPrefix="/api/admin/members/*"
      bullets={[
        "会员字段维护已在「用户管理」`/admin/users`（P1）完成",
        "本路由计划承载：到期策略模板、试运行提醒、站内信模版等（routes/admin/members.ts）",
      ]}
      jobNotes={[
        "backend/src/jobs/memberExpire.ts：周期性扫描 member_expire_at 并通知（P2 实现；当前占位 noop）",
      ]}
    />
  );
}
