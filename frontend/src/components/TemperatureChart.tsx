import ReactECharts from "echarts-for-react";
import dayjs from "dayjs";
import type { SensorPoint, Zone } from "@/api/types";

interface Props {
  zone: Zone | null;
  points: { time: string; value: number | null }[];
  height?: number;
}

export default function TemperatureChart({ zone, points, height = 280 }: Props) {
  const option = {
    grid: { top: 30, right: 16, bottom: 30, left: 50 },
    tooltip: {
      trigger: "axis",
      formatter: (p: { value: [string, number] }[]) => {
        if (!p.length) return "";
        const [t, v] = p[0].value;
        return `${dayjs(t).format("MM-DD HH:mm:ss")}<br/>温度：<b>${v?.toFixed?.(2) ?? "--"} ℃</b>`;
      },
    },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: { color: "#64748b", fontSize: 11 },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLine: { show: false },
      axisLabel: { color: "#64748b", fontSize: 11, formatter: "{value} ℃" },
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
    },
    series: [
      {
        name: "温度",
        type: "line",
        smooth: true,
        symbol: "none",
        data: points.map((p) => [p.time, p.value]),
        lineStyle: { color: "#1f72ee", width: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(31,114,238,0.25)" },
              { offset: 1, color: "rgba(31,114,238,0)" },
            ],
          },
        },
        markLine: zone
          ? {
              symbol: "none",
              silent: true,
              lineStyle: { color: "#f43f5e", width: 1, type: "dashed" },
              data: [
                { yAxis: zone.tempMax, label: { formatter: `上限 ${zone.tempMax}℃`, color: "#f43f5e" } },
                { yAxis: zone.tempMin, label: { formatter: `下限 ${zone.tempMin}℃`, color: "#f43f5e" } },
              ],
            }
          : undefined,
      },
    ],
  };
  return <ReactECharts option={option} style={{ height }} notMerge lazyUpdate />;
}

export function pointsFromSensors(rows: SensorPoint[]): { time: string; value: number | null }[] {
  return rows.map((r) => ({ time: r.recordedAt, value: r.temperature }));
}
