/**
 * 编辑账号（管理端）：资料 / 区域 / 到期 / 备注显示名 / 重置密码。
 * 会员等级请使用「调整等级」入口（PATCH /level）。
 */

import { useEffect, useState } from "react";
import { adminApi } from "@/api/admin";
import { errMessage } from "@/api/client";

const ROLES = [
  { v: "ops_admin" as const, label: "管理员" },
  { v: "customer" as const, label: "客户" },
  { v: "technician" as const, label: "维修人员" },
];

type ExtRole = (typeof ROLES)[number]["v"];

/** 与 PATCH displayName 规则一致：`用户名（备注）` ⇄ remark */
export function composeDisplayName(username: string, remarkTrimmedOrRaw: string): string {
  const t = remarkTrimmedOrRaw.trim();
  if (!username) return t ? `…（${t}）` : "…";
  return t ? `${username}（${t}）` : username;
}

export function remarkFromDisplayName(username: string, displayName: string | null | undefined): string {
  if (!displayName || displayName === username) return "";
  const open = `${username}（`;
  if (displayName.startsWith(open) && displayName.endsWith("）")) {
    return displayName.slice(open.length, -1);
  }
  return displayName;
}

export default function UserFormModal({
  open,
  defaultRole,
  editId,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  defaultRole: ExtRole;
  editId: number;
  initial: {
    username: string;
    displayName: string | null;
    phone: string | null;
    role: string;
    regionId: number | null;
    memberExpireAt: string | null;
    remark?: string;
  };
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<ExtRole>(defaultRole);
  const [regionId, setRegionId] = useState<number | "">("");
  const [remark, setRemark] = useState("");
  const [memberExpireAt, setMemberExpireAt] = useState("");
  const [resetPwd, setResetPwd] = useState(false);
  const [regions, setRegions] = useState<Array<{ id: number; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    adminApi
      .regions()
      .then((r) => setRegions(r.map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setUsername(initial.username);
    setPhone(initial.phone ?? "");
    setRole((initial.role as ExtRole) ?? defaultRole);
    setRegionId(initial.regionId ?? "");
    setRemark(initial.remark ?? remarkFromDisplayName(initial.username, initial.displayName));
    setMemberExpireAt(initial.memberExpireAt ?? "");
    setResetPwd(false);
  }, [open, defaultRole, initial]);

  async function submit() {
    setBusy(true);
    setErr(null);
    const isCustomer = role === "customer";
    try {
      const body: Record<string, unknown> = {
        regionId: regionId === "" ? null : regionId,
        phone: phone.trim() || null,
        remark: remark.trim(),
        resetPassword: resetPwd,
      };
      if (isCustomer) {
        body.memberExpireAt = memberExpireAt.trim() ? memberExpireAt.trim().slice(0, 10) : null;
      }
      const { warning } = await adminApi.patchUser(editId, body);
      if (warning) window.alert(warning);
      await onSaved();
      onClose();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const showMemberFields = role === "customer";
  const displayPreview = composeDisplayName(username.trim(), remark);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="user-form-title" className="text-sm font-semibold text-slate-900">
          编辑账号
        </div>
        {err ? <div className="mt-2 text-sm text-rose-600">{err}</div> : null}
        <div className="mt-4 space-y-3 text-sm">
          <Field label="用户名">
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={username}
              disabled
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="手机号">
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          <Field label="角色">
            <div className="mt-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-slate-800">
              {ROLES.find((r) => r.v === role)?.label ?? role}
              <span className="mt-1 block text-[11px] font-normal leading-snug text-slate-400">
                编辑时不可改角色；会员等级请在列表「调整等级」中修改。
              </span>
            </div>
          </Field>
          {showMemberFields ? (
            <Field label="会员到期（留空表示清空）">
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={memberExpireAt}
                onChange={(e) => setMemberExpireAt(e.target.value)}
              />
            </Field>
          ) : null}
          <Field label="所属区域">
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={regionId}
              onChange={(e) => setRegionId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">—</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="备注（写入显示名后缀）">
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="如：张江店店长"
            />
            <p className="mt-1 break-all text-[11px] text-slate-500">
              展示名将保存为：<span className="font-medium text-slate-700">{displayPreview}</span>
            </p>
          </Field>
          <label className="flex items-center gap-2 text-slate-700">
            <input type="checkbox" checked={resetPwd} onChange={(e) => setResetPwd(e.target.checked)} />
            随机重置密码并站内信通知
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="rounded-lg border px-4 py-2" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            disabled={busy}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      {children}
    </div>
  );
}
