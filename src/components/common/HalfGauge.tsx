'use client';
// ARCH-M05 F005 — 半环仪表：ApexCharts radialBar（-90°→90° 半环 · stroke 圆头 ·
// 中央大读数 + 副读数插槽）。对照原型 `gauge()`（230×130 · stroke 18 · 圆头）与
// `.gauge .gv` 读数叠层（V4 Brief 目标健康度）。
// SSR 安全：沿模板 charts/ 做法 dynamic import react-apexcharts（ssr:false）。
// 形态说明：Apex radialBar 画布为正方形，半环占上半——以 width×(130/230) 高度的
// overflow-hidden 容器裁出原型的 230×130 形态。

import React from 'react';
import dynamic from 'next/dynamic';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

// 图表库需要具体色值（SVG 渲染管线不解析 Tailwind class）。
// 环色默认在挂载后读运行时品牌变量 --color-500（AppWrappers 注入，换肤跟随）；
// fallback 与轨道色分别为 brand-500 默认紫、原型 --line（模板 charts/CircularProgress
// trailColor 同值 #E9EDF7），非新引入色值。
const BRAND_CSS_VAR = '--color-500';
const BRAND_FALLBACK = '#422AFB';
const TRACK_COLOR = '#E9EDF7';

/** 原型形态 230×130 */
const DEFAULT_WIDTH = 230;
const HEIGHT_RATIO = 130 / 230;

export interface HalfGaugeProps {
  /** 达成百分比 0-100（越界自动钳制） */
  percent: number;
  /** 中央大读数（默认 `${percent}%`） */
  value?: React.ReactNode;
  /** 副读数插槽（如「192万 / 300万 曝光」） */
  subValue?: React.ReactNode;
  /** 环色（默认运行时 brand-500） */
  color?: string;
  /** 轨道色 */
  trackColor?: string;
  /** 整体宽度 px（高度按 230:130 等比） */
  width?: number;
  className?: string;
}

export default function HalfGauge({
  percent,
  value,
  subValue,
  color,
  trackColor = TRACK_COLOR,
  width = DEFAULT_WIDTH,
  className,
}: HalfGaugeProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const [brandColor, setBrandColor] = React.useState(BRAND_FALLBACK);

  React.useEffect(() => {
    if (color) return;
    const resolved = getComputedStyle(document.documentElement)
      .getPropertyValue(BRAND_CSS_VAR)
      .trim();
    if (resolved) setBrandColor(resolved);
  }, [color]);

  const barColor = color ?? brandColor;
  const height = Math.round(width * HEIGHT_RATIO);

  const options = {
    chart: {
      type: 'radialBar' as const,
      sparkline: { enabled: true },
    },
    plotOptions: {
      radialBar: {
        startAngle: -90,
        endAngle: 90,
        hollow: { size: '60%' },
        track: { background: trackColor, strokeWidth: '100%' },
        dataLabels: { show: false },
      },
    },
    fill: { type: 'solid', colors: [barColor] },
    stroke: { lineCap: 'round' as const },
    states: {
      hover: { filter: { type: 'none' } },
      active: { filter: { type: 'none' } },
    },
    tooltip: { enabled: false },
  };

  return (
    <div
      role="img"
      aria-label={`达成 ${clamped}%`}
      className={`relative overflow-hidden${className ? ` ${className}` : ''}`}
      style={{ width, height }}
    >
      <div className="absolute inset-x-0 top-0" style={{ height: width }}>
        <Chart
          options={options}
          series={[clamped]}
          type="radialBar"
          width={width}
          height={width}
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <b className="block text-[32px] font-extrabold leading-none text-navy-700 dark:text-white">
          {value ?? `${Math.round(clamped)}%`}
        </b>
        {subValue != null && (
          <small className="block text-xs text-gray-700 dark:text-gray-400">
            {subValue}
          </small>
        )}
      </div>
    </div>
  );
}
