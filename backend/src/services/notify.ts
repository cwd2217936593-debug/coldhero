/**
 * 统一站内信发送服务（提示词 Step 4）
 * --------------------------------
 * 接口：`notify.send(payload: NotifyPayload): Promise<number>`，返回 `notifications.id`。
 *
 * - 写入 `notifications`：`type` 使用 v1 四分类（alert / fault / system / report）中的 `system`
 *   或 `fault`；细分业务类型固定写入 `payload.notifyType`，与 `NotifyType` 一致。
 * - 短信：`process.env.SMS_ENABLED === 'true'` 时进入阿里云短信分支（SDK 调用仅占位 + 结构化日志）；
 *   默认关闭，不发起外呼。
 */

import { env } from "@/config/env";
import { notificationsRepo, type CreateNotificationInput } from "@/modules/notifications/notifications.repository";
import { logger } from "@/utils/logger";

/**
 * 业务细分类型（存 JSON payload.notifyType）
 *
 * P1：`order_assigned` | `order_completed` | `order_rejected` | `fault_no_tech` | `fault_new` | `welcome`
 * P2：`member_expiring` | `member_followup`（cron 使用）
 */
export type NotifyType =
  | "order_assigned"
  | "order_completed"
  | "order_rejected"
  | "fault_no_tech"
  /** 免费/基础客户提交故障：不建工单，仅提醒管理员关注 */
  | "fault_new"
  | "member_expiring"
  | "member_followup"
  | "welcome"
  /** 等级变更等：对用户可见，不含档位明细 */
  | "service_updated"
  /** 某账号被禁用：提醒全体运维管理员关注工单 */
  | "admin_user_disabled_alert";

export interface NotifyPayload {
  /** 接收人 users.id；0 表示广播（沿用 DAO 约定） */
  userId: number;
  type: NotifyType;
  /** 标题（≤20 字，超出截断） */
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

function truncateTitle(title: string): string {
  return [...title].slice(0, 20).join("");
}

function dbTypeForNotify(t: NotifyType): CreateNotificationInput["type"] {
  if (t === "fault_no_tech" || t === "fault_new") return "fault";
  return "system";
}

function smsTemplateCodeForPayload(type: NotifyType): string {
  if (type === "member_expiring" || type === "member_followup") {
    return env.ALIYUN_SMS_TEMPLATE_CODE_EXPIRE;
  }
  return env.ALIYUN_SMS_TEMPLATE_CODE_ORDER;
}

/**
 * 预留阿里云短信（dysmsapi）。
 * 生产接入时在此组装 SendSmsRequest：SignName、TemplateCode、PhoneNumbers、TemplateParam。
 */
async function maybeSendAliyunSms(payload: NotifyPayload): Promise<void> {
  if (!env.SMS_ENABLED) return;
  try {
    const templateCode = smsTemplateCodeForPayload(payload.type);
    void env.ALIYUN_SMS_ACCESS_KEY;
    void env.ALIYUN_SMS_SECRET;
    // import Dysmsapi20170525 from '@alicloud/dysmsapi20170525';
    // const client = new Dysmsapi20170525({ ... });
    // await client.sendSms({ signName: env.ALIYUN_SMS_SIGN_NAME, templateCode, phoneNumbers, templateParam: ... });

    logger.info(
      {
        userId: payload.userId,
        notifyType: payload.type,
        signName: env.ALIYUN_SMS_SIGN_NAME,
        templateCode,
        title: truncateTitle(payload.title),
      },
      "SMS_ENABLED：将发送短信（阿里云 SMS SDK 仅占位，未实际调用 SendSms）",
    );
  } catch (e) {
    logger.warn({ err: e }, "短信发送分支异常（已忽略，不影响站内信）");
  }
}

export const notify = {
  /**
   * 发送站内信（INSERT notifications），并视配置尝试短信占位分支。
   */
  async send(payload: NotifyPayload): Promise<number> {
    await maybeSendAliyunSms(payload);
    const meta: Record<string, unknown> = { notifyType: payload.type, ...(payload.metadata ?? {}) };
    return notificationsRepo.create({
      userId: payload.userId,
      type: dbTypeForNotify(payload.type),
      title: truncateTitle(payload.title),
      content: payload.content,
      payload: meta,
    });
  },
};
