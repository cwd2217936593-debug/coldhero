import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import { useAuthStore } from "@/store/authStore";
import { getExternalApiOrigin, isHybridMockWithBackend } from "@/lib/deepseekBridge";
import {
  formatSimContextForDeepseek,
  GBR_DEMO_FEATURE_IMPORTANCE,
  GBR_DEMO_METRICS_INLINE,
  predictColdStorageTemp,
} from "@/lib/coldStorageSimModel";
import type { ChatEntryState } from "@/types/chatEntry";

/**
 * 自单页 HTML 大屏剥离的 GBR 演示公式 + 特征重要性图（仅前端演算，不接 pkl）。
 */
export default function GbrDemoPredictor() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  const [humidityPct, setHumidityPct] = useState(45);
  const [compressorRunning, setCompressorRunning] = useState(true);
  const [defrostActive, setDefrostActive] = useState(false);
  const [doorOpen, setDoorOpen] = useState(false);
  const [ambientTempC, setAmbientTempC] = useState(28);
  const [energyKw, setEnergyKw] = useState(8.5);
  const [hourOfDay, setHourOfDay] = useState(14);

  const result = useMemo(
    () =>
      predictColdStorageTemp({
        humidityPct,
        compressorRunning,
        defrostActive,
        doorOpen,
        ambientTempC,
        energyKw,
        hourOfDay,
      }),
    [
      humidityPct,
      compressorRunning,
      defrostActive,
      doorOpen,
      ambientTempC,
      energyKw,
      hourOfDay,
    ],
  );

  const fiOption = useMemo(
    () => ({
      grid: { left: 150, right: 56, top: 8, bottom: 28 },
      tooltip: { trigger: "axis" as const },
      xAxis: {
        type: "value" as const,
        name: "重要性 (Gain)",
        nameTextStyle: { fontSize: 10 },
        splitLine: { lineStyle: { type: "dashed" as const } },
      },
      yAxis: {
        type: "category" as const,
        data: [...GBR_DEMO_FEATURE_IMPORTANCE].reverse().map((d) => d.name),
        axisLabel: { fontSize: 10 },
      },
      series: [
        {
          type: "bar" as const,
          data: [...GBR_DEMO_FEATURE_IMPORTANCE].reverse().map((d) => d.gain),
          itemStyle: { color: "#6366f1", borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: "right" as const, fontSize: 10, formatter: "{c}" },
        },
      ],
    }),
    [],
  );

  const statusCls =
    result.status === "正常"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : result.status === "偏高"
        ? "text-amber-700 bg-amber-50 border-amber-200"
        : "text-rose-700 bg-rose-50 border-rose-200";

  const simInput = {
    humidityPct,
    compressorRunning,
    defrostActive,
    doorOpen,
    ambientTempC,
    energyKw,
    hourOfDay,
  };

  function openAdminDeepseekEntry() {
    const draft = formatSimContextForDeepseek(simInput, result);
    const state: ChatEntryState = { draftQuestion: draft, preferProModel: true };
    navigate("/chat", { state });
  }

  const deepseekHint =
    import.meta.env.VITE_USE_MOCK === "1" && !getExternalApiOrigin()
      ? "请配置 VITE_API_BASE_URL 并以管理员登录：问答由后端直连 DeepSeek，已取消前端「模拟回答」。"
      : import.meta.env.VITE_USE_MOCK === "1" && isHybridMockWithBackend()
        ? "混合模式：管理员 JWT 下的问答走真实后端 DeepSeek（pro 模型）。"
        : "将打开 AI 助理并预填工况，后端使用 DeepSeek（pro）生成回答。";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">GBR Stacking 演示近似（来源：旧版大屏 HTML）</h2>
        <p className="text-[11px] text-slate-500 mt-1">
          与原始页面中「无 pkl、线性统计近似」一致；训练报告级指标 RMSE≈{GBR_DEMO_METRICS_INLINE.rmse}°C · R²≈
          {GBR_DEMO_METRICS_INLINE.r2}（展示用，非本表单实时校准）。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block text-xs text-slate-600">
          库内湿度 (%)
          <input
            type="number"
            className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            value={humidityPct}
            onChange={(e) => setHumidityPct(Number(e.target.value))}
          />
        </label>
        <label className="block text-xs text-slate-600">
          室外温度 (°C)
          <input
            type="number"
            className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            value={ambientTempC}
            onChange={(e) => setAmbientTempC(Number(e.target.value))}
          />
        </label>
        <label className="block text-xs text-slate-600">
          能耗指标（基准 8.5）
          <input
            type="number"
            step="0.1"
            className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            value={energyKw}
            onChange={(e) => setEnergyKw(Number(e.target.value))}
          />
        </label>
        <label className="block text-xs text-slate-600">
          当前小时 (0–23)
          <input
            type="number"
            min={0}
            max={23}
            className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            value={hourOfDay}
            onChange={(e) => setHourOfDay(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-6 text-xs text-slate-700">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={compressorRunning}
            onChange={(e) => setCompressorRunning(e.target.checked)}
          />
          压缩机运行中
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={defrostActive}
            onChange={(e) => setDefrostActive(e.target.checked)}
          />
          除霜进行中
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={doorOpen}
            onChange={(e) => setDoorOpen(e.target.checked)}
          />
          库门漏冷（等效开启）
        </label>
      </div>

      <div
        className={`rounded-xl border px-4 py-3 flex flex-wrap items-baseline gap-4 ${statusCls}`}
      >
        <div>
          <div className="text-[11px] opacity-80">预测库温</div>
          <div className="text-2xl font-semibold tabular-nums">{result.predictedC.toFixed(2)} °C</div>
        </div>
        <div>
          <div className="text-[11px] opacity-80">状态</div>
          <div className="text-sm font-medium">{result.status}</div>
        </div>
        <div>
          <div className="text-[11px] opacity-80">展示区间</div>
          <div className="text-sm tabular-nums">±{result.ciHalfWidthC.toFixed(3)} °C</div>
        </div>
        <div>
          <div className="text-[11px] opacity-80">样本误差（演示随机）</div>
          <div className="text-sm tabular-nums">{result.sampleErrorC.toFixed(3)} °C</div>
        </div>
      </div>

      {isAdmin && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/90 px-4 py-3 space-y-2">
          <div className="text-xs font-semibold text-indigo-950">管理员 · DeepSeek 解读入口</div>
          <p className="text-[11px] text-indigo-900/85 leading-relaxed">{deepseekHint}</p>
          <button
            type="button"
            onClick={openAdminDeepseekEntry}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
          >
            携带上述工况打开 AI 对话（管理员 · DeepSeek）
          </button>
        </div>
      )}

      <div>
        <div className="text-xs font-medium text-slate-700 mb-2">特征重要性 Top 10（原模型 Gain）</div>
        <ReactECharts option={fiOption} style={{ height: 320 }} notMerge lazyUpdate />
      </div>
    </div>
  );
}
