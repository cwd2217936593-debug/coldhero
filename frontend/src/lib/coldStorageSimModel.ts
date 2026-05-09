/**
 * 智能冷库 · GBR Stacking 演示近似模型
 * --------------------------------
 * 自 `4_27_1智能冷库 · AI预测监控系统.html` 剥离：无 pkl，用与原文一致的统计公式
 * + 原页中的特征重要性 / 残差分布等展示用常量。
 */

export interface ColdStorageSimInputs {
  /** 库内相对湿度 % */
  humidityPct: number;
  /** false = 停机（对应 HTML 中 comp===0 时 +2.5°C） */
  compressorRunning: boolean;
  /** 除霜进行中 */
  defrostActive: boolean;
  /** 库门显著漏冷 */
  doorOpen: boolean;
  /** 室外温度 °C */
  ambientTempC: number;
  /** 能耗相关指标（任意刻度，基准 8.5） */
  energyKw: number;
  /** 0–23 */
  hourOfDay: number;
}

export type ColdStorageSimStatus = "过冷" | "过暖" | "偏高" | "正常";

export interface ColdStorageSimResult {
  predictedC: number;
  status: ColdStorageSimStatus;
  /** 展示用 ± 区间半宽（与 HTML 固定文案一致） */
  ciHalfWidthC: number;
  /** 展示用样本误差（HTML 为随机 0~0.1） */
  sampleErrorC: number;
}

/** 与 HTML 中 `runPrediction` 一致（噪声可注入 rng 便于测试） */
export function predictColdStorageTemp(
  input: ColdStorageSimInputs,
  rng: () => number = Math.random,
): ColdStorageSimResult {
  const {
    humidityPct,
    compressorRunning,
    defrostActive,
    doorOpen,
    ambientTempC,
    energyKw,
    hourOfDay,
  } = input;

  let pred = -18.0;
  pred += (humidityPct - 45) * -0.04;
  if (!compressorRunning) pred += 2.5;
  if (defrostActive) pred += 4.2;
  if (doorOpen) pred += 1.8;
  pred += (ambientTempC - 28) * 0.06;
  pred += (energyKw - 8.5) * -0.12;
  const hr = ((hourOfDay % 24) + 24) % 24;
  pred += Math.sin(((hr - 6) * Math.PI) / 12) * 0.4;
  const noise = (rng() - 0.5) * 0.115;
  pred = Number((pred + noise).toFixed(3));

  let status: ColdStorageSimStatus;
  if (pred < -22) status = "过冷";
  else if (pred > -15) status = "过暖";
  else if (pred > -16) status = "偏高";
  else status = "正常";

  return {
    predictedC: pred,
    status,
    ciHalfWidthC: 0.057,
    sampleErrorC: Number((rng() * 0.1).toFixed(3)),
  };
}

/** HTML 页「模型信息」中的特征重要性 Top（Gain） */
export const GBR_DEMO_FEATURE_IMPORTANCE: { name: string; gain: number }[] = [
  { name: "temp_humidity_interact", gain: 0.2126 },
  { name: "temperature_ma_6", gain: 0.1227 },
  { name: "temperature_lag_1", gain: 0.1089 },
  { name: "temperature_lag_2", gain: 0.0877 },
  { name: "temperature_lag_6", gain: 0.0449 },
  { name: "temperature_diff_6", gain: 0.0327 },
  { name: "temperature_lag_3", gain: 0.0322 },
  { name: "temp_ambient_diff", gain: 0.0316 },
  { name: "temperature_ma_12", gain: 0.0313 },
  { name: "humidity_diff_6", gain: 0.0254 },
];

/** 残差直方图： [残差 bin 中心 °C, 频次] */
export const GBR_DEMO_RESIDUAL_HIST: [number, number][] = [
  [-0.28, 3],
  [-0.24, 1],
  [-0.2, 5],
  [-0.16, 27],
  [-0.12, 125],
  [-0.08, 392],
  [-0.04, 1120],
  [0.0, 1712],
  [0.04, 1045],
  [0.08, 397],
  [0.12, 121],
  [0.16, 31],
  [0.2, 11],
  [0.24, 6],
  [0.28, 2],
  [0.32, 1],
  [0.4, 1],
];

/** 与 HTML 表格一致的展示指标（非计算得出） */
export const GBR_DEMO_METRICS_INLINE = {
  rmse: 0.0574,
  mae: 0.044,
  r2: 0.9987,
  mape: 0.26,
  samples: 105_240,
  features: 77,
} as const;
