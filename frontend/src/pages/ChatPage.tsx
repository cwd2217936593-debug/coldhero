import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import dayjs from "dayjs";
import clsx from "clsx";
import { askStream, listMessages, listSessions } from "@/api/chat";
import { useAuthStore } from "@/store/authStore";
import type { ChatLog, SessionSummary } from "@/api/types";
import type { ChatEntryState } from "@/types/chatEntry";

interface UiMsg {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: string;
}

const SUGGEST = [
  "A 区温度比上限高了 2 度，最可能是什么故障？",
  "蒸发器结冰怎么处理？需要停机吗？",
  "冷藏库湿度突然下降可能由什么原因引起？",
  "门长开 5 分钟会对货物质量有什么影响？",
];

export default function ChatPage() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();
  const preferProPendingRef = useRef(false);

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<string>(() => uuidv4());
  const [model, setModel] = useState<"fast" | "pro">("fast");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UiMsg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const immersiveShellRef = useRef<HTMLDivElement>(null);

  const [immersive, setImmersive] = useState(false);
  const [browserFullscreen, setBrowserFullscreen] = useState(false);

  const isPro = user?.role === "admin";

  useEffect(() => {
    const st = location.state as ChatEntryState | null;
    if (!st?.draftQuestion) return;
    setInput(st.draftQuestion);
    preferProPendingRef.current = !!st.preferProModel;
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (!preferProPendingRef.current || !user) return;
    if (user.role === "admin") {
      setModel("pro");
    }
    preferProPendingRef.current = false;
  }, [user]);

  useEffect(() => {
    listSessions().then(setSessions).catch(() => undefined);
  }, []);

  // 切换会话：拉取服务端消息（流式进行中不拉取，避免 onStart 改掉 sessionId 时覆盖打字内容）
  useEffect(() => {
    if (streaming) return;
    let cancelled = false;
    listMessages(activeSession)
      .then((logs: ChatLog[]) => {
        if (cancelled) return;
        const ui: UiMsg[] = [];
        for (const l of logs) {
          ui.push({ role: "user", content: l.question });
          if (l.answer) ui.push({ role: "assistant", content: l.answer });
          else if (l.status === "failed")
            ui.push({ role: "assistant", content: "（这条提问未成功，请重试）", error: "failed" });
        }
        setMessages(ui);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSession, streaming]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const onFs = () => setBrowserFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (!immersive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.fullscreenElement) {
        void exitBrowserFullscreen();
        return;
      }
      setImmersive(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [immersive]);

  async function enterBrowserFullscreen() {
    const el = immersiveShellRef.current;
    if (!el) return;
    try {
      await el.requestFullscreen({ navigationUI: "hide" });
    } catch {
      /* 部分浏览器/内嵌 WebView 不支持 */
    }
  }

  async function exitBrowserFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* ignore */
    }
  }

  async function toggleBrowserFullscreen() {
    if (document.fullscreenElement) await exitBrowserFullscreen();
    else await enterBrowserFullscreen();
  }

  async function exitImmersive() {
    await exitBrowserFullscreen();
    setImmersive(false);
  }

  function newSession() {
    abortRef.current?.abort();
    setActiveSession(uuidv4());
    setMessages([]);
    listSessions().then(setSessions).catch(() => undefined);
  }

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || streaming) return;
    setInput("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStreaming(true);

    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "", pending: true }]);

    try {
      await askStream({
        sessionId: activeSession,
        question: q,
        model,
        signal: ctrl.signal,
        onStart: ({ sessionId }) => {
          setActiveSession(sessionId);
        },
        onDelta: (delta) => {
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last && last.role === "assistant") {
              copy[copy.length - 1] = { ...last, content: last.content + delta, pending: true };
            }
            return copy;
          });
        },
        onEnd: () => {
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last && last.role === "assistant") {
              copy[copy.length - 1] = { ...last, pending: false };
            }
            return copy;
          });
          listSessions().then(setSessions).catch(() => undefined);
        },
        onError: (msg) => {
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last && last.role === "assistant") {
              copy[copy.length - 1] = { ...last, content: last.content || `(失败) ${msg}`, error: msg, pending: false };
            }
            return copy;
          });
        },
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function abort() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  return (
    <div
      ref={immersiveShellRef}
      className={clsx(
        "flex min-h-0 gap-4 md:gap-5",
        immersive ? "flex-col" : "flex-col md:flex-row",
        immersive
          ? "fixed inset-0 z-[300] box-border h-dvh max-h-dvh w-screen overflow-hidden bg-slate-100 p-3 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] sm:p-4"
          : "relative h-[calc(100dvh-13rem)] min-h-[360px] sm:h-[calc(100dvh-11rem)] md:h-[calc(100dvh-9rem)] md:min-h-[420px]",
      )}
    >
      {/* 最近会话：仅非大屏时显示；大屏专注对话但仍沿用当前 session，历史仍写入服务端 */}
      {!immersive && (
        <aside className="flex w-full min-h-0 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 max-md:max-h-[36%] md:h-auto md:max-h-none md:w-72 lg:w-80">
          <button
            type="button"
            onClick={newSession}
            className="mb-3 w-full shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-sm text-white transition hover:bg-brand-700"
          >
            + 新建会话
          </button>
          <div className="mb-1 shrink-0 px-1 text-[11px] text-slate-400">最近会话</div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain">
            {sessions.length === 0 && (
              <div className="p-3 text-xs text-slate-400">暂无历史会话</div>
            )}
            {sessions.map((s) => (
              <button
                key={s.sessionId}
                type="button"
                onClick={() => setActiveSession(s.sessionId)}
                className={clsx(
                  "w-full rounded-md px-2.5 py-2 text-left text-xs transition",
                  s.sessionId === activeSession
                    ? "bg-brand-50 text-brand-800"
                    : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <div className="line-clamp-2 leading-snug">{s.firstQuestion}</div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                  <span>{s.messageCount} 条</span>
                  <span>·</span>
                  <span>{dayjs(s.lastMessageAt).format("MM-DD HH:mm")}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>
      )}

      <section className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 md:gap-3 md:px-5">
          <div className="text-sm font-medium text-slate-800">AI 冷库助理</div>
          {immersive && (
            <button
              type="button"
              onClick={newSession}
              className="shrink-0 rounded-lg bg-brand-600 px-2.5 py-1 text-xs text-white hover:bg-brand-700"
              title="清空当前对话并开始新会话"
            >
              + 新建会话
            </button>
          )}
          <span className="hidden text-[11px] text-slate-400 sm:inline">
            DeepSeek / 通义千问 · 自动注入您库区配置
          </span>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            {!immersive ? (
              <>
                <button
                  type="button"
                  onClick={() => setImmersive(true)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  title="大屏：隐藏最近会话侧栏、助理铺满窗口；历史仍在服务端保存"
                >
                  大屏
                </button>
                <button
                  type="button"
                  onClick={() => void toggleBrowserFullscreen()}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  title="浏览器全屏当前问答区；Esc 退出"
                >
                  {browserFullscreen ? "退出全屏" : "全屏"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void toggleBrowserFullscreen()}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  title="系统全屏（浏览器内）；再点一次或 Esc 退出"
                >
                  {browserFullscreen ? "退出全屏" : "全屏"}
                </button>
                <button
                  type="button"
                  onClick={() => void exitImmersive()}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  退出大屏
                </button>
              </>
            )}
            <span className="text-slate-500 text-xs max-sm:sr-only">模型</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as "fast" | "pro")}
              className="border border-slate-300 rounded px-2 py-1 bg-white text-xs"
            >
              <option value="fast">fast（极速）</option>
              <option value="pro" disabled={!isPro}>pro（推理强 · pro/enterprise 可用）</option>
            </select>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-slate-50/40 px-4 py-4 md:px-5"
        >
          {messages.length === 0 && (
            <div className="text-center text-slate-400 py-10">
              <div className="text-3xl mb-2">🤖</div>
              <div className="text-sm">向我提问吧 — 试试这些：</div>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {SUGGEST.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-full hover:border-brand-300 hover:text-brand-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={clsx(
                  "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-brand-600 text-white rounded-tr-sm"
                    : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm ai-bubble",
                  m.error && "ring-1 ring-rose-300",
                )}
              >
                {m.content}
                {m.pending && <span className="inline-block w-1.5 h-4 ml-1 bg-slate-400 animate-pulse align-middle" />}
              </div>
            </div>
          ))}
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder="提问，例如：A 区温度持续高出阈值 1.5 度，可能是什么原因？"
              className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            {streaming ? (
              <button
                onClick={abort}
                className="h-10 px-4 rounded-lg bg-rose-600 text-white text-sm hover:bg-rose-700"
              >
                停止
              </button>
            ) : (
              <button
                onClick={() => send()}
                disabled={!input.trim()}
                className="h-10 px-5 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700 disabled:opacity-50"
              >
                发送 ↩
              </button>
            )}
          </div>
          <div className="text-[10.5px] text-slate-400 mt-1.5">
            提示：Enter 发送，Shift+Enter 换行；流式输出，超额时返回 429 + 升级提示。
          </div>
        </div>
      </section>
    </div>
  );
}
