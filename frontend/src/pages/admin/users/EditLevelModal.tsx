/**
 * 客户会员等级 / 冷库上限调整，对应 `PATCH /api/admin/users/:id/level`。
 */

import { useEffect, useState } from "react";
import clsx from "clsx";
import type { MemberLevel } from "@/api/types";
import { adminApi } from "@/api/admin";
import { errMessage } from "@/api/client";
import { MEMBER_LEVEL_CONFIG, MEMBER_LEVEL_ORDER } from "@/constants/memberLevels";

const LEVEL_BADGE: Record<string, string> = {
  free: "bg-slate-200 text-slate-800",
  basic: "bg-sky-100 text-sky-900",
  professional: "bg-violet-100 text-violet-900",
  enterprise: "bg-amber-100 text-amber-950",
};

export default function EditLevelModal({
  open,
  userId,
  username,
  currentLevel,
  zoneLimit,
  boundZoneCount,
  onClose,
  onSaved,
}: {
  open: boolean;
  userId: number;
  username: string;
  currentLevel: MemberLevel;
  zoneLimit: number;
  boundZoneCount: number;
  onClose: () => void;
  onSaved: (warning?: string) => void | Promise<void>;
}) {
  const [memberLevel, setMemberLevel] = useState<MemberLevel>(currentLevel);
  const [limitInput, setLimitInput] = useState(String(zoneLimit));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMemberLevel(currentLevel);
    setLimitInput(String(zoneLimit));
    setReason("");
    setErr(null);
  }, [open, currentLevel, zoneLimit]);

  const cfg = MEMBER_LEVEL_CONFIG[memberLevel];
  const defaultLimit = cfg.zoneLimit;
  const parsedLimit = Number(limitInput.trim());
  const limitOk =
    limitInput.trim() === "" ||
    (Number.isFinite(parsedLimit) && Number.isInteger(parsedLimit) && parsedLimit >= -1);

  async function submit() {
    if (!limitOk) {
      setErr("冷库上限须为整数，且 ≥ -1（-1 表示不限）");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const zoneLimitPayload =
        limitInput.trim() === "" ? undefined : parsedLimit === defaultLimit ? undefined : parsedLimit;
      const { warning } = await adminApi.updateUserLevel(userId, {
        memberLevel,
        ...(zoneLimitPayload !== undefined ? { zoneLimit: zoneLimitPayload } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      await onSaved(warning);
      onClose();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const downgrade =
    MEMBER_LEVEL_ORDER.indexOf(memberLevel) < MEMBER_LEVEL_ORDER.indexOf(currentLevel);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-level-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="edit-level-title" className="text-sm font-semibold text-slate-900">
          调整会员等级 · {username}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          当前已绑冷库 {boundZoneCount} 台；套餐默认上限 {defaultLimit < 0 ? "不限" : `${defaultLimit} 台`}。
        </p>
        {err ? <div className="mt-2 text-sm text-rose-600">{err}</div> : null}

        <div className="mt-4 space-y-3 text-sm">
          <div>
            <div className="text-xs text-slate-500">目标等级</div>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={memberLevel}
              onChange={(e) => {
                const nl = e.target.value as MemberLevel;
                setMemberLevel(nl);
                setLimitInput(String(MEMBER_LEVEL_CONFIG[nl].zoneLimit));
              }}
            >
              {MEMBER_LEVEL_ORDER.map((l) => (
                <option key={l} value={l}>
                  {MEMBER_LEVEL_CONFIG[l].label}（{l}）
                </option>
              ))}
            </select>
            <div className="mt-1 flex flex-wrap gap-1">
              <span
                className={clsx(
                  "rounded px-2 py-0.5 text-[11px] font-medium",
                  LEVEL_BADGE[currentLevel] ?? "bg-slate-100",
                )}
              >
                当前 {MEMBER_LEVEL_CONFIG[currentLevel].label}
              </span>
              {downgrade ? (
                <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900">
                  下调可能影响已绑冷库数量，请确认配额
                </span>
              ) : null}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500">
              冷库上限（留空沿用套餐默认；可直接填 -1 表示不限）
            </div>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              placeholder={String(defaultLimit)}
            />
          </div>

          <div>
            <div className="text-xs text-slate-500">变更说明（可选）</div>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如：合同续约升级专业版"
              maxLength={256}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="rounded-lg border px-4 py-2" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            disabled={busy || !limitOk}
            className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
            onClick={() => void submit()}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
