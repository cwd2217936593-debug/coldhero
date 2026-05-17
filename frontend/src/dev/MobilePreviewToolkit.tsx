import { useMemo, useState, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";

/** 仅在开发构建显示：用 iframe 固定约 390px 宽，Tailwind `sm`/`lg` 等按该视口计算，等同电脑端仿真手机布局 */
export function MobilePreviewToolkit() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  /** 每次点开预览递增，iframe key 变化 → 强制重挂，避免「退出后再打开」偶发不触发 onLoad / 沿用旧的 loaded 状态 */
  const [previewGeneration, setPreviewGeneration] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const isEmbed = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get("_embed") === "1";
    } catch {
      return false;
    }
  }, [location.search]);

  /** 使用完整 URL，避免个别环境下相对路径 iframe 加载异常；浅色衬底避免未绘制时被误认为「黑屏」 */
  const iframeSrc = useMemo(() => {
    const u = new URL(`${window.location.origin}${location.pathname}${location.search}${location.hash}`);
    u.searchParams.delete("_embed");
    u.searchParams.delete("simulateMobile");
    u.searchParams.set("_embed", "1");
    return u.toString();
  }, [location.pathname, location.search, location.hash]);

  useLayoutEffect(() => {
    if (!open) return;
    setIframeLoaded(false);
  }, [open, iframeSrc]);

  /** 外链直达：/?simulateMobile=1 打开本页后立即弹出手机预览（仅开发） */
  useEffect(() => {
    if (!import.meta.env.DEV || isEmbed) return;
    const params = new URLSearchParams(location.search);
    if (params.get("simulateMobile") !== "1") return;
    setPreviewGeneration((n) => n + 1);
    setOpen(true);
    params.delete("simulateMobile");
    const qs = params.toString();
    const clean = `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`;
    window.history.replaceState(null, "", clean);
  }, [location.pathname, location.search, location.hash, isEmbed]);

  if (!import.meta.env.DEV || isEmbed) return null;

  /** 必须低于管理端弹窗/抽屉（多为 z-50）及 z-40 的次级对话框，否则会盖住主按钮 */
  const fab = (
    <button
      type="button"
      title="在手机宽度 iframe 内打开当前路由；或在地址栏加 ?simulateMobile=1 自动弹出"
      onClick={() => {
        setPreviewGeneration((n) => n + 1);
        setOpen(true);
      }}
      className="fixed bottom-5 right-5 z-[35] rounded-full bg-slate-900/88 px-3 py-2.5 text-xs font-medium text-white shadow-lg backdrop-blur-sm ring-1 ring-white/15 transition hover:bg-slate-800"
    >
      手机预览
    </button>
  );

  if (!open) return fab;

  const overlay = (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-slate-950/90 backdrop-blur-[2px]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5 text-[11px] text-slate-200 sm:text-xs">
        <span className="min-w-0 leading-relaxed">
          电脑端仿真手机：<strong className="text-white">iframe 宽约 390px</strong>
          ，与真实窄屏一致的响应式规则；站内导航仅在框内跳转。
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] text-white hover:bg-white/18"
        >
          退出
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-6">
        <div
          className="relative w-[min(390px,calc(100vw-24px))] shrink-0 overflow-hidden rounded-[2.6rem] border-[12px] border-slate-800 bg-slate-900 shadow-[0_28px_100px_rgba(0,0,0,.5)] ring-1 ring-black/60"
          style={{ aspectRatio: "390 / 844", maxHeight: "calc(100dvh - 5rem)" }}
        >
          <div className="absolute inset-[10px] overflow-hidden rounded-[1.85rem] bg-slate-50 ring-1 ring-black/20">
            {!iframeLoaded ? (
              <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2 bg-slate-50 text-[11px] text-slate-500">
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" aria-hidden />
                <span>加载预览…</span>
              </div>
            ) : null}
            <iframe
              key={`${iframeSrc}::${previewGeneration}`}
              title="ColdHero 移动端预览"
              className="absolute inset-0 z-[1] box-border h-full w-full border-0 bg-white"
              src={iframeSrc}
              onLoad={() => setIframeLoaded(true)}
            />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
