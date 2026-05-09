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

  const isPro =
    user?.role === "admin" ||
    user?.memberLevel === "pro" ||
    user?.memberLevel === "enterprise";

  useEffect(() => {
    const st = location.state as ChatEntryState | null;
    if (!st?.draftQuestion) return;
    setInput(st.draftQuestion);
    preferProPendingRef.current = !!st.preferProModel;
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (!preferProPendingRef.current || !user) return;
    if (user.role === "admin" || user.memberLevel === "pro" || user.memberLevel === "enterprise") {
      setModel("pro");
    }
    preferProPendingRef.current = false;
  }, [user]);

  // 加载历史会话
  useEffect(() => {
    listSessions().then(setSessions).catch(() => undefined);
  }, []);

  // 切换会话 → 加载历史消息
  useEffect(() => {
    if (sessions.find((s) => s.sessionId === activeSession)) {
      listMessages(activeSession)
        .then((logs: ChatLog[]) => {
          const ui: UiMsg[] = [];
          for (const l of logs) {
            ui.push({ role: "user", content: l.question });
            if (l.answer) ui.push({ role: "assistant", content: l.answer });
            else if (l.status === "failed") ui.push({ role: "assistant", content: "（这条提问未成功，请重试）", error: "failed" });
          }
          setMessages(ui);
        })
        .catch(() => undefined);
    } else {
      setMessages([]);
    }
  }, [activeSession]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function newSession() {
    abortRef.current?.abort();
    setActiveSession(uuidv4());
    setMessages([]);
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
    <div className="grid grid-cols-12 gap-5 h-[calc(100vh-7.5rem)]">
      {/* 会话列表 */}
      <aside className="col-span-12 md:col-span-3 bg-white rounded-2xl border border-slate-200 p-3 flex flex-col">
        <button
          onClick={newSession}
          className="w-full mb-3 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700 transition"
        >
          + 新建会话
        </button>
        <div className="text-[11px] text-slate-400 px-1 mb-1">最近会话</div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {sessions.length === 0 && (
            <div className="text-xs text-slate-400 p-3">暂无历史会话</div>
          )}
          {sessions.map((s) => (
            <button
              key={s.sessionId}
              onClick={() => setActiveSession(s.sessionId)}
              className={clsx(
                "w-full text-left rounded-md px-2.5 py-2 text-xs transition",
                s.sessionId === activeSession
                  ? "bg-brand-50 text-brand-800"
                  : "hover:bg-slate-50 text-slate-600",
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

      {/* 主对话 */}
      <section className="col-span-12 md:col-span-9 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-3">
          <div className="text-sm font-medium text-slate-800">AI 冷库助理</div>
          <span className="text-[11px] text-slate-400">
            DeepSeek / 通义千问 · 自动注入您库区配置
          </span>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="text-slate-500">模型</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as "fast" | "pro")}
              className="border border-slate-300 rounded px-2 py-1 bg-white"
            >
              <option value="fast">fast（极速）</option>
              <option value="pro" disabled={!isPro}>pro（推理强 · pro/enterprise 可用）</option>
            </select>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-slate-50/40">
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

        <div className="border-t border-slate-200 p-3 bg-white">
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
