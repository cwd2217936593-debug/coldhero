/**
 * 模拟传感器数据生成器
 * --------------------------------
 * 用法（开发环境）：
 *   npm run mock:sensors
 *
 * 行为：
 *  1. 用 admin / Coldhero@123 登录（环境变量可覆盖）拿 JWT
 *  2. 拉取所有库区
 *  3. 每 INTERVAL_MS 毫秒为每个库区推送一条数据
 *     - 大部分时间在阈值内随机游走（OU 过程，避免突变）
 *     - 5% 概率制造一个超限点用于触发告警（演示）
 *
 * 该脚本通过 HTTP 调用 /api/sensors/ingest，与真实 IoT 设备路径一致。
 */

import "dotenv/config";

const API_BASE = process.env.MOCK_API_BASE ?? "http://localhost:4000";
const USERNAME = process.env.MOCK_USER ?? "admin";
const PASSWORD = process.env.MOCK_PASSWORD ?? "Coldhero@123";
const INTERVAL_MS = Number(process.env.MOCK_INTERVAL_MS ?? 5000);
const ANOMALY_RATE = Number(process.env.MOCK_ANOMALY_RATE ?? 0.05);

interface ZoneDto {
  id: number;
  code: string;
  name: string;
  tempMin: number;
  tempMax: number;
  humidityMin: number | null;
  humidityMax: number | null;
  co2Max: number | null;
}

interface ZoneState {
  zone: ZoneDto;
  temperature: number;
  humidity: number;
  co2: number;
  doorStatus: "open" | "closed";
}

const log = (...args: unknown[]) =>
  console.log(`[${new Date().toISOString()}]`, ...args);

async function api<T>(
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} → ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

async function login(): Promise<string> {
  const r = await api<{ data: { token: string } }>("/api/auth/login", {
    method: "POST",
    body: { identifier: USERNAME, password: PASSWORD },
  });
  return r.data.token;
}

async function loadZones(token: string): Promise<ZoneDto[]> {
  const r = await api<{ data: ZoneDto[] }>("/api/zones", { token });
  return r.data;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 在阈值范围内的"舒适区" */
function comfortRange(min: number, max: number): [number, number] {
  const span = max - min;
  return [min + span * 0.2, max - span * 0.2];
}

function nextValue(
  prev: number,
  range: [number, number],
  noise: number,
  forceAnomaly?: { side: "low" | "high"; bound: number },
): number {
  if (forceAnomaly) {
    return forceAnomaly.side === "low"
      ? forceAnomaly.bound - rand(0.5, 2.5)
      : forceAnomaly.bound + rand(0.5, 2.5);
  }
  // OU 风格回归到舒适区中心
  const center = (range[0] + range[1]) / 2;
  const drift = (center - prev) * 0.15;
  return clamp(prev + drift + rand(-noise, noise), range[0] - 5, range[1] + 5);
}

function initState(zone: ZoneDto): ZoneState {
  const [tLo, tHi] = comfortRange(zone.tempMin, zone.tempMax);
  const hLo = zone.humidityMin ?? 60;
  const hHi = zone.humidityMax ?? 90;
  const co2Hi = zone.co2Max ?? 800;
  return {
    zone,
    temperature: rand(tLo, tHi),
    humidity: rand(hLo, hHi),
    co2: rand(300, Math.max(400, co2Hi - 100)),
    doorStatus: "closed",
  };
}

function step(state: ZoneState): ZoneState {
  const z = state.zone;
  const [tLo, tHi] = comfortRange(z.tempMin, z.tempMax);
  const hLo = z.humidityMin ?? 60;
  const hHi = z.humidityMax ?? 90;
  const co2Hi = z.co2Max ?? 800;

  const anomaly = Math.random() < ANOMALY_RATE;
  let forceTemp: { side: "low" | "high"; bound: number } | undefined;
  if (anomaly) {
    forceTemp =
      Math.random() < 0.5
        ? { side: "low", bound: z.tempMin }
        : { side: "high", bound: z.tempMax };
  }

  return {
    zone: z,
    temperature: Number(nextValue(state.temperature, [tLo, tHi], 0.3, forceTemp).toFixed(2)),
    humidity: Number(
      clamp(nextValue(state.humidity, [hLo, hHi], 1.0), 0, 100).toFixed(2),
    ),
    co2: Number(clamp(nextValue(state.co2, [400, co2Hi - 100], 10), 0, 100000).toFixed(2)),
    doorStatus: Math.random() < 0.02 ? "open" : "closed",
  };
}

async function main() {
  log(`mock:sensors 启动 → ${API_BASE}, 用户=${USERNAME}, 间隔=${INTERVAL_MS}ms, 异常率=${ANOMALY_RATE}`);
  const token = await login();
  log("✅ 登录成功");
  const zones = await loadZones(token);
  if (!zones.length) {
    log("⚠️  数据库无库区，请先创建（或确认种子数据已加载）");
    process.exit(1);
  }
  log(`✅ 加载到 ${zones.length} 个库区`);
  let states = zones.map(initState);

  const tick = async () => {
    states = states.map(step);
    await Promise.all(
      states.map((s) =>
        api("/api/sensors/ingest", {
          method: "POST",
          token,
          body: {
            zoneId: s.zone.id,
            temperature: s.temperature,
            humidity: s.humidity,
            co2: s.co2,
            doorStatus: s.doorStatus,
          },
        }).catch((err) => log(`✗ ingest ${s.zone.code} 失败:`, err.message)),
      ),
    );
    process.stdout.write(".");
  };

  await tick();
  setInterval(() => {
    tick().catch((e) => log("tick 错误:", e));
  }, INTERVAL_MS);
}

main().catch((e) => {
  console.error("mock:sensors 启动失败:", e);
  process.exit(1);
});
