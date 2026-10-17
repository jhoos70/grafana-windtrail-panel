import React, { useMemo, useState, useRef, useId } from 'react';
import { PanelProps, dateTimeFormat, DataFrame, Field, FieldType } from '@grafana/data';
import {
  WindTrailOptions,
  SpokeCount,
  SpeedUnit,
  DisplaySpeedUnit,
  LegendPosition,
  InfoPlacement,
  CurveMode,
  ColorPalette,
  SectorStyle,
} from '../types';
import { css } from '@emotion/css';
import { useStyles2, useTheme2 } from '@grafana/ui';

const normalizeUnit = (u?: string): string => {
  if (!u) {
    return '';
  }
  const s = u.trim().toLowerCase();
  if (s === 'km/h' || s === 'kmh' || s === 'kilometer/h' || s === 'velocitykmh') {
    return 'km/h';
  }
  if (s === 'knot' || s === 'knots' || s === 'kn' || s === 'velocityknot') {
    return 'knots';
  }
  if (s === 'mph' || s === 'velocitymph') {
    return 'mph';
  }
  if (s === 'bft' || s === 'beaufort') {
    return 'bft';
  }
  if (s === 'ft/s' || s === 'fps' || s === 'feet/s') {
    return 'ft/s';
  }
  if (s === 'm/s' || s === 'ms' || s === 'meter/s' || s === 'velocityms') {
    return 'm/s';
  }
  return s;
};

export const convertSpeed = (
  val: number,
  fromUnit: SpeedUnit | string = 'auto',
  toUnit: DisplaySpeedUnit | string = 'same',
  fieldUnit?: string
): { value: number; unitLabel: string } => {
  // Determine source unit
  let src = normalizeUnit(fromUnit);
  if (!src || src === 'auto') {
    src = fieldUnit ? normalizeUnit(fieldUnit) : 'm/s';
    if (!['km/h', 'knots', 'mph', 'bft', 'ft/s', 'm/s'].includes(src)) {
      src = 'm/s';
    }
  }

  const rawDst = normalizeUnit(toUnit);
  const dst = !rawDst || rawDst === 'same' ? src : rawDst;

  // 1. Convert source to base m/s
  let ms = val;
  switch (src) {
    case 'km/h':
      ms = val / 3.6;
      break;
    case 'knots':
      ms = val * 0.514444444;
      break;
    case 'mph':
      ms = val * 0.44704;
      break;
    case 'ft/s':
      ms = val * 0.3048;
      break;
    case 'm/s':
    default:
      ms = val;
      break;
  }

  // 2. Convert from m/s to target dst
  let result = ms;
  let unitLabel: string = dst;
  switch (dst) {
    case 'km/h':
      result = ms * 3.6;
      unitLabel = 'km/h';
      break;
    case 'knots':
      result = ms / 0.514444444;
      unitLabel = 'kn';
      break;
    case 'mph':
      result = ms / 0.44704;
      unitLabel = 'mph';
      break;
    case 'ft/s':
      result = ms / 0.3048;
      unitLabel = 'ft/s';
      break;
    case 'bft':
      if (ms < 0.3) {
        result = 0;
      } else if (ms < 1.6) {
        result = 1;
      } else if (ms < 3.4) {
        result = 2;
      } else if (ms < 5.5) {
        result = 3;
      } else if (ms < 8.0) {
        result = 4;
      } else if (ms < 10.8) {
        result = 5;
      } else if (ms < 13.9) {
        result = 6;
      } else if (ms < 17.2) {
        result = 7;
      } else if (ms < 20.8) {
        result = 8;
      } else if (ms < 24.5) {
        result = 9;
      } else if (ms < 28.5) {
        result = 10;
      } else if (ms < 32.7) {
        result = 11;
      } else {
        result = 12;
      }
      unitLabel = 'Bft';
      break;
    case 'm/s':
    default:
      result = ms;
      unitLabel = 'm/s';
      break;
  }

  return { value: result, unitLabel };
};

export const formatSpeed = (val: number, unitLabel: string, isBft: boolean): string => {
  if (isBft) {
    return `${Math.round(val)} Bft`;
  }
  return `${val.toFixed(1)} ${unitLabel}`;
};

export interface RawWindPoint {
  time: number;
  dir: number; // degrees 0-360
  speed: number;
}

/**
 * Computes the circular vector mean direction for an array of angles (in degrees 0-360).
 * Optionally weights each angle by its wind speed.
 * Accurately handles wrapping across North (e.g. 350° and 10° -> 0° North).
 */
export const computeVectorAverageDirection = (
  dirs: number[],
  speeds?: number[]
): number => {
  if (dirs.length === 0) {
    return 0;
  }
  let sumU = 0;
  let sumV = 0;
  for (let i = 0; i < dirs.length; i++) {
    const rad = (dirs[i] * Math.PI) / 180;
    const weight = speeds && speeds[i] != null && !isNaN(speeds[i]) && speeds[i] > 0 ? speeds[i] : 1;
    sumU += Math.sin(rad) * weight;
    sumV += Math.cos(rad) * weight;
  }

  if (Math.abs(sumU) < 1e-6 && Math.abs(sumV) < 1e-6) {
    // If vectors cancel out completely, default to the last observed direction
    return dirs[dirs.length - 1];
  }

  const rad = Math.atan2(sumU, sumV);
  return ((rad * 180) / Math.PI + 360) % 360;
};

/**
 * Downsamples an array of chronological wind observations into at most maxPoints buckets.
 * Employs meteorological vector averaging for direction and arithmetic mean for speed.
 * Guarantees that the final point in the returned array is the exact latest raw observation.
 */
export const downsamplePoints = (
  rawPoints: RawWindPoint[],
  maxPoints = 150
): RawWindPoint[] => {
  if (!maxPoints || maxPoints <= 0 || rawPoints.length <= maxPoints) {
    return rawPoints;
  }
  if (rawPoints.length <= 2) {
    return rawPoints;
  }

  const n = rawPoints.length;
  const lastPoint = rawPoints[n - 1];
  const firstPoint = rawPoints[0];
  const span = lastPoint.time - firstPoint.time;

  if (span <= 0) {
    return [lastPoint];
  }

  // Reserve 1 slot for the exact latest observation
  const targetBuckets = Math.max(1, maxPoints - 1);
  const bucketWidth = span / targetBuckets;

  const buckets: Array<{
    times: number[];
    dirs: number[];
    speeds: number[];
  }> = Array.from({ length: targetBuckets }, () => ({
    times: [],
    dirs: [],
    speeds: [],
  }));

  // Bin all observations except the very last one
  for (let i = 0; i < n - 1; i++) {
    const p = rawPoints[i];
    const bIdx = Math.min(
      targetBuckets - 1,
      Math.max(0, Math.floor((p.time - firstPoint.time) / bucketWidth))
    );
    buckets[bIdx].times.push(p.time);
    buckets[bIdx].dirs.push(p.dir);
    buckets[bIdx].speeds.push(p.speed);
  }

  const result: RawWindPoint[] = [];

  for (const b of buckets) {
    if (b.times.length === 0) {
      continue;
    }
    const avgTime = Math.round(b.times.reduce((sum, t) => sum + t, 0) / b.times.length);
    const avgSpeed = b.speeds.reduce((sum, s) => sum + s, 0) / b.speeds.length;
    const avgDir = computeVectorAverageDirection(b.dirs, b.speeds);

    result.push({
      time: avgTime,
      dir: avgDir,
      speed: avgSpeed,
    });
  }

  // Always append the exact latest observation
  result.push(lastPoint);

  return result;
};

interface Props extends PanelProps<WindTrailOptions> {}

export interface WindPoint {
  index: number;
  time: number;
  dir: number; // degrees 0-360
  speed: number;
  r: number;
  x: number;
  y: number;
  progress: number; // 0 (start) to 1 (end)
}

/**
 * Generates an SVG path data string connecting two trajectory points.
 * In 'polar' mode (default), it follows the circular compass arc using the shortest angular distance,
 * while smoothly interpolating the radius to represent the drift of time.
 * In 'linear' mode, it falls back to a straight Euclidean chord.
 */
export const buildSegmentPath = (
  p1: { x: number; y: number; r: number; dir: number },
  p2: { x: number; y: number; r: number; dir: number },
  cx: number,
  cy: number,
  curveMode: CurveMode = 'polar'
): string => {
  if (curveMode === 'linear') {
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  // Calculate shortest angular difference on the compass (-180° to +180°)
  let dDir = ((p2.dir - p1.dir + 180) % 360 + 360) % 360 - 180;
  const absAngle = Math.abs(dDir);

  // If points have almost identical angles (< 1°), a direct line segment is completely fine
  if (absAngle < 1) {
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  // Sub-segment smooth steps: ~3° per step, minimum 3 steps, maximum 60 steps
  const steps = Math.max(3, Math.min(60, Math.ceil(absAngle / 3)));
  const parts: string[] = [`M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`];

  for (let s = 1; s <= steps; s++) {
    const fraction = s / steps;
    const curDir = p1.dir + dDir * fraction;
    const curR = p1.r + (p2.r - p1.r) * fraction;
    const rad = (curDir * Math.PI) / 180;
    const x = cx + curR * Math.sin(rad);
    const y = cy - curR * Math.cos(rad);
    parts.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  return parts.join(' ');
};

export interface DirectionSector {
  startDir: number;
  endDir: number;
  spanDeg: number;
}

export interface RawDirectionPoint {
  dir: number;
  speed?: number;
}

/**
 * Computes the angular turning corridor / sector (min/max range) for wind observations.
 * Uses continuous phase unwrapping along the chronological trajectory to accurately
 * follow how the wind physically turned (e.g. 270° through North to 100°).
 * Filters out calm observations (speed <= 0 or < 0.2) which lack meaningful direction.
 * If the wind completed a full rotation across all directions (span >= 360°),
 * it returns a full 360° sector.
 */
export const computeDirectionSector = (
  points: Array<RawDirectionPoint | number>,
  speeds?: number[],
  hasSpeed = true
): DirectionSector => {
  if (!points || points.length === 0) {
    return { startDir: 0, endDir: 0, spanDeg: 0 };
  }

  // Normalize points into an array of { dir, speed }
  const raw: Array<{ dir: number; speed?: number }> = [];
  for (let i = 0; i < points.length; i++) {
    const item = points[i];
    if (typeof item === 'number') {
      const spd = speeds && i < speeds.length ? speeds[i] : undefined;
      raw.push({ dir: item, speed: spd });
    } else if (item && typeof item.dir === 'number') {
      raw.push({ dir: item.dir, speed: item.speed });
    }
  }

  if (raw.length === 0) {
    return { startDir: 0, endDir: 0, spanDeg: 0 };
  }

  // Filter calm points if speeds are present
  const anyPositiveSpeed = raw.some((p) => p.speed != null && !isNaN(p.speed) && p.speed > 0);
  let filtered: number[];

  if (anyPositiveSpeed) {
    // Discard calm readings (speed <= 0 or < 0.2) where wind direction is undefined or artificial 0°
    filtered = raw
      .filter((p) => p.speed != null && !isNaN(p.speed) && p.speed >= 0.2)
      .map((p) => p.dir);
    // If threshold 0.2 filtered everything, fallback to speed > 0
    if (filtered.length === 0) {
      filtered = raw
        .filter((p) => p.speed != null && !isNaN(p.speed) && p.speed > 0)
        .map((p) => p.dir);
    }
  } else if (hasSpeed && raw.every((p) => p.speed != null && !isNaN(p.speed) && p.speed <= 0)) {
    // All observations are dead calm (speed == 0)
    return { startDir: 0, endDir: 0, spanDeg: 0 };
  } else {
    // No speed measurements available: use all directions
    filtered = raw.map((p) => p.dir);
  }

  if (filtered.length === 0) {
    return { startDir: 0, endDir: 0, spanDeg: 0 };
  }

  const k = filtered.length;
  if (k === 1) {
    const norm = ((filtered[0] % 360) + 360) % 360;
    return {
      startDir: norm,
      endDir: norm,
      spanDeg: 0,
    };
  }

  // Continuous phase unwrapping along the chronological trajectory
  const first = ((filtered[0] % 360) + 360) % 360;
  const unwrapped: number[] = [first];
  let uMin = first;
  let uMax = first;

  for (let i = 1; i < k; i++) {
    const cur = ((filtered[i] % 360) + 360) % 360;
    const prevUnwrapped = unwrapped[unwrapped.length - 1];
    // Shortest angular difference (-180° to +180°)
    const diff = ((((cur - prevUnwrapped + 180) % 360) + 360) % 360) - 180;
    const nextUnwrapped = prevUnwrapped + diff;
    unwrapped.push(nextUnwrapped);

    if (nextUnwrapped < uMin) {
      uMin = nextUnwrapped;
    }
    if (nextUnwrapped > uMax) {
      uMax = nextUnwrapped;
    }
  }

  const totalSpan = uMax - uMin;
  if (totalSpan >= 359.9) {
    // Full 360° compass circle covered
    return {
      startDir: 0,
      endDir: 360,
      spanDeg: 360,
    };
  }

  const startDir = ((uMin % 360) + 360) % 360;
  const endDir = ((uMax % 360) + 360) % 360;

  return {
    startDir,
    endDir,
    spanDeg: totalSpan,
  };
};

/**
 * Generates an SVG path for an annular sector or radial wedge.
 * Compass coordinates: 0° is North (top), 90° is East (right), clockwise.
 */
export const buildSectorPath = (
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDir: number,
  endDir: number,
  spanDeg: number
): string => {
  if (spanDeg <= 0) {
    return '';
  }
  if (spanDeg >= 359.9) {
    const cxF = cx.toFixed(2);
    const topOuter = (cy - rOuter).toFixed(2);
    const botOuter = (cy + rOuter).toFixed(2);
    if (rInner <= 0) {
      // Full circle wedge / disk
      return `M ${cxF} ${topOuter} A ${rOuter} ${rOuter} 0 1 0 ${cxF} ${botOuter} A ${rOuter} ${rOuter} 0 1 0 ${cxF} ${topOuter} Z`;
    }
    // Full circle annular ring
    const topInner = (cy - rInner).toFixed(2);
    const botInner = (cy + rInner).toFixed(2);
    return `M ${cxF} ${topOuter} A ${rOuter} ${rOuter} 0 1 0 ${cxF} ${botOuter} A ${rOuter} ${rOuter} 0 1 0 ${cxF} ${topOuter} M ${cxF} ${topInner} A ${rInner} ${rInner} 0 1 1 ${cxF} ${botInner} A ${rInner} ${rInner} 0 1 1 ${cxF} ${topInner} Z`;
  }

  const radStart = (startDir * Math.PI) / 180;
  const radEnd = (endDir * Math.PI) / 180;

  const x1Outer = (cx + rOuter * Math.sin(radStart)).toFixed(2);
  const y1Outer = (cy - rOuter * Math.cos(radStart)).toFixed(2);
  const x2Outer = (cx + rOuter * Math.sin(radEnd)).toFixed(2);
  const y2Outer = (cy - rOuter * Math.cos(radEnd)).toFixed(2);

  const largeArc = spanDeg > 180 ? 1 : 0;

  if (rInner <= 0) {
    return `M ${cx.toFixed(2)} ${cy.toFixed(2)} L ${x1Outer} ${y1Outer} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2Outer} ${y2Outer} Z`;
  }

  const x1Inner = (cx + rInner * Math.sin(radStart)).toFixed(2);
  const y1Inner = (cy - rInner * Math.cos(radStart)).toFixed(2);
  const x2Inner = (cx + rInner * Math.sin(radEnd)).toFixed(2);
  const y2Inner = (cy - rInner * Math.cos(radEnd)).toFixed(2);

  return `M ${x1Inner} ${y1Inner} L ${x1Outer} ${y1Outer} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2Outer} ${y2Outer} L ${x2Inner} ${y2Inner} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x1Inner} ${y1Inner} Z`;
};

const CARDINALS_16 = [
  { label: 'N', deg: 0 },
  { label: 'NNE', deg: 22.5 },
  { label: 'NE', deg: 45 },
  { label: 'ENE', deg: 67.5 },
  { label: 'E', deg: 90 },
  { label: 'ESE', deg: 112.5 },
  { label: 'SE', deg: 135 },
  { label: 'SSE', deg: 157.5 },
  { label: 'S', deg: 180 },
  { label: 'SSW', deg: 202.5 },
  { label: 'SW', deg: 225 },
  { label: 'WSW', deg: 247.5 },
  { label: 'W', deg: 270 },
  { label: 'WNW', deg: 292.5 },
  { label: 'NW', deg: 315 },
  { label: 'NNW', deg: 337.5 },
];

export const getCardinalLabel = (deg: number): string => {
  const normalized = ((deg % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return CARDINALS_16[index].label;
};

export interface ColorStop {
  stop: number; // 0 to 1
  color: [number, number, number];
}

// Authentic Windy.com smooth multi-color meteorological gradient
export const WINDY_COLOR_STOPS: ColorStop[] = [
  { stop: 0.0, color: [56, 189, 248] }, // #38bdf8 light sky blue (calm)
  { stop: 0.15, color: [16, 185, 129] }, // #10b981 emerald green (light air)
  { stop: 0.3, color: [132, 204, 22] }, // #84cc16 lime green (gentle breeze)
  { stop: 0.45, color: [234, 179, 8] }, // #eab308 amber yellow (moderate)
  { stop: 0.6, color: [249, 115, 22] }, // #f97316 orange (fresh breeze)
  { stop: 0.75, color: [239, 68, 68] }, // #ef4444 vivid red (strong / near gale)
  { stop: 0.9, color: [168, 85, 247] }, // #a855f7 purple / violet (gale / storm)
  { stop: 1.0, color: [236, 72, 153] }, // #ec4899 magenta / hurricane
];

export const STANDARD_COLOR_STOPS: ColorStop[] = [
  { stop: 0.0, color: [56, 189, 248] }, // cyan
  { stop: 0.25, color: [34, 197, 94] }, // green
  { stop: 0.5, color: [234, 179, 8] }, // yellow
  { stop: 0.75, color: [249, 115, 22] }, // orange
  { stop: 0.9, color: [239, 68, 68] }, // red
  { stop: 1.0, color: [192, 132, 252] }, // purple
];

export const interpolateColorStops = (ratio: number, stops: ColorStop[] = WINDY_COLOR_STOPS): string => {
  const r = Math.max(0, Math.min(1, ratio));
  if (r <= stops[0].stop) {
    const c = stops[0].color;
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }
  if (r >= stops[stops.length - 1].stop) {
    const c = stops[stops.length - 1].color;
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];
    if (r >= s1.stop && r <= s2.stop) {
      const t = (r - s1.stop) / (s2.stop - s1.stop);
      const red = Math.round(s1.color[0] + t * (s2.color[0] - s1.color[0]));
      const green = Math.round(s1.color[1] + t * (s2.color[1] - s1.color[1]));
      const blue = Math.round(s1.color[2] + t * (s2.color[2] - s1.color[2]));
      return `rgb(${red}, ${green}, ${blue})`;
    }
  }

  return `rgb(${stops[0].color.join(',')})`;
};

export const getDefaultFixedSpeedMax = (unit: string): number => {
  const u = unit.toLowerCase();
  if (u === 'km/h') {
    return 60;
  }
  if (u === 'kn' || u === 'knots') {
    return 40;
  }
  if (u === 'mph') {
    return 45;
  }
  if (u === 'bft') {
    return 12;
  }
  if (u === 'ft/s') {
    return 60;
  }
  return 20; // default for m/s
};

export const getSpeedColor = (
  speed: number,
  minSpeed: number,
  maxSpeed: number,
  palette: ColorPalette = 'windy'
): string => {
  const span = Math.max(0.1, maxSpeed - minSpeed);
  const ratio = Math.max(0, Math.min(1, (speed - minSpeed) / span));
  const stops = palette === 'standard' ? STANDARD_COLOR_STOPS : WINDY_COLOR_STOPS;
  return interpolateColorStops(ratio, stops);
};

const formatRelativeTime = (timeDiffMs: number): string => {
  const seconds = Math.round(Math.abs(timeDiffMs) / 1000);
  if (seconds < 60) {
    return 'Now';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `-${minutes}m`;
  }
  const hours = (minutes / 60).toFixed(1).replace('.0', '');
  if (Number(hours) < 24) {
    return `-${hours}h`;
  }
  const days = (Number(hours) / 24).toFixed(1).replace('.0', '');
  return `-${days}d`;
};

const getStyles = () => {
  return {
    container: (placement: 'right' | 'bottom' | 'overlay' = 'overlay') => {
      let flexDir = 'row';
      let align = 'center';
      let justify = 'center';
      if (placement === 'right') {
        flexDir = 'row';
        align = 'stretch';
        justify = 'flex-start';
      } else if (placement === 'bottom') {
        flexDir = 'column';
        align = 'center';
        justify = 'flex-start';
      }
      return css`
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        display: flex;
        flex-direction: ${flexDir};
        align-items: ${align};
        justify-content: ${justify};
        user-select: none;
      `;
    },
    compassWrapper: css`
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
    `,
    svg: css`
      display: block;
    `,
    hud: css`
      position: absolute;
      top: 10px;
      left: 12px;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 12px;
      z-index: 10;
    `,
    hudBadge: css`
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(4px);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      width: fit-content;
    `,
    sidebar: css`
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      gap: 10px;
      height: 100%;
      padding: 10px 12px;
      box-sizing: border-box;
      overflow-y: auto;
      border-left: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(0, 0, 0, 0.18);
      backdrop-filter: blur(4px);
      z-index: 5;
      flex-shrink: 0;
    `,
    sidebarCard: css`
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    `,
    sidebarHeader: css`
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: rgba(255, 255, 255, 0.65);
    `,
    sidebarDir: css`
      display: flex;
      align-items: baseline;
      gap: 6px;
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
    `,
    cardinalBadge: css`
      font-size: 11px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.12);
      color: #38bdf8;
    `,
    sidebarSpeed: css`
      font-size: 13px;
      font-weight: 600;
      color: #4ade80;
    `,
    sidebarStats: css`
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin-top: 4px;
      padding-top: 6px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 11px;
    `,
    statRow: css`
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    `,
    statLabel: css`
      color: rgba(255, 255, 255, 0.55);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    `,
    statValue: css`
      color: rgba(255, 255, 255, 0.9);
      font-weight: 600;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    `,
    bottomBar: css`
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 4px 12px;
      box-sizing: border-box;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(0, 0, 0, 0.25);
      backdrop-filter: blur(4px);
      z-index: 5;
      gap: 12px;
      flex-shrink: 0;
    `,
    bottomCurrent: css`
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.85);
      white-space: nowrap;
    `,
    bottomLegend: css`
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
    `,
    tooltip: css`
      position: absolute;
      pointer-events: none;
      padding: 6px 10px;
      border-radius: 6px;
      background: rgba(18, 20, 24, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #f3f4f6;
      font-size: 11px;
      line-height: 1.4;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
      transform: translate(-50%, -120%);
      white-space: nowrap;
      z-index: 100;
      transition:
        top 0.06s ease,
        left 0.06s ease;
    `,
    empty: css`
      padding: 20px;
      text-align: center;
      color: #9ca3af;
      font-size: 13px;
    `,
    legendContainer: (position: LegendPosition = 'bottom-right') => {
      let posCss = 'bottom: 12px; right: 12px;';
      if (position === 'bottom-left') {
        posCss = 'bottom: 12px; left: 12px;';
      } else if (position === 'top-right') {
        posCss = 'top: 12px; right: 12px;';
      } else if (position === 'bottom-center') {
        posCss = 'bottom: 12px; left: 50%; transform: translateX(-50%);';
      }
      return css`
        position: absolute;
        ${posCss}
        pointer-events: none;
        background: rgba(0, 0, 0, 0.48);
        backdrop-filter: blur(4px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 6px;
        padding: 5px 9px;
        display: flex;
        flex-direction: column;
        gap: 3px;
        z-index: 10;
        user-select: none;
      `;
    },
    legendTitle: css`
      font-size: 10px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.85);
      margin-bottom: 2px;
      white-space: nowrap;
    `,
    legendTicks: (ticksWidth = 120) => css`
      display: flex;
      justify-content: space-between;
      width: ${ticksWidth}px;
      font-size: 9px;
      color: rgba(255, 255, 255, 0.65);
      margin-top: 2px;
    `,
  };
};

export const WindTrailPanel: React.FC<Props> = ({ options, data, width, height, timeRange, replaceVariables }) => {
  const theme = useTheme2();
  const styles = useStyles2(getStyles);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<WindPoint | null>(null);
  const legendGradId = useId();

  // 1. Extract and process data
  const {
    points,
    tMin,
    tMax,
    minSpeed,
    maxSpeed,
    dataMinSpeed,
    dataMaxSpeed,
    dataAvgSpeed,
    directionSector,
    hasSpeed,
    speedUnit,
    isBft,
    latestPoint,
  } = useMemo(() => {
    if (!data.series || data.series.length === 0) {
      return {
        points: [],
        tMin: 0,
        tMax: 0,
        minSpeed: 0,
        maxSpeed: 0,
        dataMinSpeed: 0,
        dataMaxSpeed: 0,
        dataAvgSpeed: 0,
        directionSector: { startDir: 0, endDir: 0, spanDeg: 0 },
        hasSpeed: false,
        speedField: undefined,
        speedUnit: 'm/s',
        isBft: false,
        latestPoint: null,
      };
    }

    const frame: DataFrame = data.series[0];

    // Find time field
    const timeField = frame.fields.find((f: Field) => f.type === FieldType.time);

    // Find direction field
    let dirField: Field | undefined;
    if (options.directionFieldName) {
      dirField = frame.fields.find((f: Field) => f.name === options.directionFieldName);
    }
    if (!dirField) {
      dirField = frame.fields.find(
        (f: Field) =>
          f.type === FieldType.number &&
          (/wind.*dir|dir.*wind|direction|bearing|wd|heading/i.test(f.name) || f.config?.unit === 'degree')
      );
    }
    // Fallback: first numeric field
    if (!dirField) {
      dirField = frame.fields.find((f: Field) => f.type === FieldType.number);
    }

    // Find speed field
    let speedField: Field | undefined;
    if (options.speedFieldName) {
      speedField = frame.fields.find((f: Field) => f.name === options.speedFieldName);
    }
    if (!speedField && dirField) {
      speedField = frame.fields.find(
        (f: Field) =>
          f.type === FieldType.number &&
          f !== dirField &&
          (/speed|ws|velocity|wind_speed|windspeed/i.test(f.name) ||
            /velocity|speed|m\/s|knot|km\/h|mph/i.test(f.config?.unit || ''))
      );
    }

    if (!timeField || !dirField) {
      return {
        points: [],
        tMin: 0,
        tMax: 0,
        minSpeed: 0,
        maxSpeed: 0,
        dataMinSpeed: 0,
        dataMaxSpeed: 0,
        dataAvgSpeed: 0,
        directionSector: { startDir: 0, endDir: 0, spanDeg: 0 },
        hasSpeed: false,
        speedField: undefined,
        speedUnit: 'm/s',
        isBft: false,
        latestPoint: null,
      };
    }

    const tVals = timeField.values;
    const dVals = dirField.values;
    const sVals = speedField ? speedField.values : null;

    const resolvedDisplayUnit = replaceVariables
      ? replaceVariables(options.displaySpeedUnit ?? 'same')
      : (options.displaySpeedUnit ?? 'same');
    const resolvedInputUnit = replaceVariables
      ? replaceVariables(options.inputSpeedUnit ?? 'auto')
      : (options.inputSpeedUnit ?? 'auto');
    const resolvedCustomLabel = replaceVariables
      ? replaceVariables(options.speedUnit ?? '')
      : (options.speedUnit ?? '');

    const sampleUnit = convertSpeed(
      0,
      resolvedInputUnit,
      resolvedDisplayUnit,
      speedField?.config?.unit
    );
    const isSameDisplay = !resolvedDisplayUnit || resolvedDisplayUnit === 'same';
    const customLabel = isSameDisplay ? resolvedCustomLabel?.trim() : undefined;
    const effectiveUnit = customLabel || sampleUnit.unitLabel;
    const isBft = sampleUnit.unitLabel === 'Bft';

    const rawPoints: Array<{ time: number; dir: number; speed: number }> = [];

    for (let i = 0; i < tVals.length; i++) {
      const t = tVals[i];
      const d = dVals[i];
      if (t != null && d != null && !isNaN(d)) {
        const rawT = Number(t);
        // Normalize unix seconds to milliseconds if timestamp is before 1973 in ms
        const timeMs = rawT < 1e11 ? rawT * 1000 : rawT;
        const rawSpeed = sVals && sVals[i] != null && !isNaN(sVals[i]) ? Number(sVals[i]) : 0;
        const converted = convertSpeed(
          rawSpeed,
          resolvedInputUnit,
          resolvedDisplayUnit,
          speedField?.config?.unit
        );
        rawPoints.push({
          time: timeMs,
          dir: ((Number(d) % 360) + 360) % 360,
          speed: converted.value,
        });
      }
    }

    // Sort chronologically ascending
    rawPoints.sort((a, b) => a.time - b.time);

    if (rawPoints.length === 0) {
      return {
        points: [],
        tMin: 0,
        tMax: 0,
        minSpeed: 0,
        maxSpeed: 0,
        dataMinSpeed: 0,
        dataMaxSpeed: 0,
        dataAvgSpeed: 0,
        directionSector: { startDir: 0, endDir: 0, spanDeg: 0 },
        hasSpeed: false,
        speedField: undefined,
        speedUnit: effectiveUnit,
        isBft,
        latestPoint: null,
      };
    }

    const latestRaw = rawPoints[rawPoints.length - 1];
    const effectiveMaxPoints = options.maxDataPoints ?? 150;
    const finalPoints = downsamplePoints(rawPoints, effectiveMaxPoints);

    let tMin = rawPoints[0].time;
    let tMax = latestRaw.time;

    const useDashboardTime = (options.timeRangeSource ?? 'data') === 'dashboard';
    if (useDashboardTime && timeRange?.from && timeRange?.to && typeof timeRange.from.valueOf === 'function') {
      const fromMs = timeRange.from.valueOf();
      const toMs = timeRange.to.valueOf();
      if (!isNaN(fromMs) && !isNaN(toMs) && toMs > fromMs) {
        const dataMin = rawPoints[0].time;
        const dataMax = latestRaw.time;
        // Only use dashboard bounds if the data actually overlaps with the dashboard range
        if (dataMax >= fromMs && dataMin <= toMs) {
          tMin = fromMs;
          tMax = toMs;
        }
      }
    }

    const speedScaleMode = options.speedScaleMode ?? 'fixed';
    let minSpeed = 0;
    let maxSpeed = 10;

    if (speedScaleMode === 'fixed') {
      minSpeed = 0;
      maxSpeed = options.fixedSpeedMax ?? getDefaultFixedSpeedMax(effectiveUnit);
    } else if (speedScaleMode === 'custom') {
      minSpeed = options.speedMin ?? 0;
      maxSpeed = options.speedMax ?? getDefaultFixedSpeedMax(effectiveUnit);
    } else {
      // 'auto' mode: data bounds
      const cfgMin = speedField?.config?.min;
      const cfgMax = speedField?.config?.max;
      let dMin = options.speedMin !== undefined ? options.speedMin : cfgMin != null ? Number(cfgMin) : Infinity;
      let dMax = options.speedMax !== undefined ? options.speedMax : cfgMax != null ? Number(cfgMax) : -Infinity;

      for (const p of rawPoints) {
        if (options.speedMin === undefined && cfgMin == null && p.speed < dMin) {
          dMin = p.speed;
        }
        if (options.speedMax === undefined && cfgMax == null && p.speed > dMax) {
          dMax = p.speed;
        }
      }
      minSpeed = dMin === Infinity || isNaN(dMin) ? 0 : dMin;
      maxSpeed = dMax === -Infinity || isNaN(dMax) ? 10 : dMax;
    }

    // Calculate observed speed statistics
    let dataMinSpeed = 0;
    let dataMaxSpeed = 0;
    let dataAvgSpeed = 0;
    if (rawPoints.length > 0 && Boolean(speedField)) {
      let sMin = Infinity;
      let sMax = -Infinity;
      let sSum = 0;
      for (const p of rawPoints) {
        if (p.speed < sMin) {
          sMin = p.speed;
        }
        if (p.speed > sMax) {
          sMax = p.speed;
        }
        sSum += p.speed;
      }
      dataMinSpeed = sMin === Infinity ? 0 : sMin;
      dataMaxSpeed = sMax === -Infinity ? 0 : sMax;
      dataAvgSpeed = sSum / rawPoints.length;
    }

    const directionSector = computeDirectionSector(rawPoints, undefined, Boolean(speedField));

    return {
      points: finalPoints,
      tMin,
      tMax,
      minSpeed,
      maxSpeed,
      dataMinSpeed,
      dataMaxSpeed,
      dataAvgSpeed,
      directionSector,
      hasSpeed: Boolean(speedField),
      speedField,
      speedUnit: effectiveUnit,
      isBft,
      latestPoint: latestRaw,
    };
  }, [
    data,
    options.directionFieldName,
    options.speedFieldName,
    options.maxDataPoints,
    options.timeRangeSource,
    options.speedScaleMode,
    options.fixedSpeedMax,
    options.speedMin,
    options.speedMax,
    options.inputSpeedUnit,
    options.displaySpeedUnit,
    options.speedUnit,
    timeRange,
    replaceVariables,
  ]);

  // 2. Geometry calculations & responsive layout
  const hasStatsInfo = Boolean(options.showSpeedMinMax || options.showAngleSector);
  const hasCurrentInfo = (options.showCurrent !== false || hasStatsInfo) && Boolean(latestPoint);
  const hasLegendInfo = Boolean(options.showLegend) && hasSpeed;
  const hasAnyInfo = hasCurrentInfo || hasLegendInfo;

  const requestedPlacement: InfoPlacement = options.infoPlacement ?? 'auto';
  let effectivePlacement: 'right' | 'bottom' | 'overlay' =
    requestedPlacement === 'auto' ? 'overlay' : requestedPlacement;

  if (!hasAnyInfo) {
    effectivePlacement = 'overlay';
  } else if (requestedPlacement === 'auto') {
    // 1. Wide panel: Right sidebar mode (Compass left, Info right)
    const isWide = width >= 320 && (width - height >= 60 || width / height >= 1.22);
    if (isWide) {
      effectivePlacement = 'right';
    } else if (hasLegendInfo) {
      // 2. Square, portrait, or compact with legend: Bottom bar mode
      // Guarantees scale legend never overlaps the compass rose or wind trail
      effectivePlacement = 'bottom';
    } else {
      effectivePlacement = 'overlay';
    }
  }

  // Calculate compass area and sidebar/bottom dimensions
  let compassWidth = width;
  let compassHeight = height;
  let sidebarWidth = 0;
  let bottomBarHeight = 0;

  if (hasAnyInfo && effectivePlacement === 'right') {
    sidebarWidth = Math.min(160, Math.max(130, Math.floor(width * 0.3)));
    if (width - sidebarWidth < 180 && width > 260) {
      sidebarWidth = Math.max(100, width - 180);
    }
    compassWidth = Math.max(50, width - sidebarWidth);
    compassHeight = height;
  } else if (hasAnyInfo && effectivePlacement === 'bottom') {
    bottomBarHeight = hasLegendInfo && hasCurrentInfo ? (width < 280 ? 42 : 46) : 38;
    compassWidth = width;
    compassHeight = Math.max(50, height - bottomBarHeight);
  }

  const size = Math.min(compassWidth, compassHeight);
  const cxVal = compassWidth / 2;
  const cyVal = compassHeight / 2;
  const isSmall = size < 260;
  const padding = options.showCardinalLabels ? (isSmall ? 18 : 28) : (isSmall ? 10 : 16);
  const maxR = Math.max(10, size / 2 - padding);
  const minR = 6; // small central deadzone for clarity

  // 3. Project points to polar coordinates
  const projectedPoints: WindPoint[] = useMemo(() => {
    if (points.length === 0) {
      return [];
    }

    const isCenterToEdge = (options.timeDirection ?? 'center-to-edge') === 'center-to-edge';
    const timeSpan = tMax - tMin;

    return points.map((p, index) => {
      const rawProgress = timeSpan > 0 ? (p.time - tMin) / timeSpan : 1;
      const progress = Math.max(0, Math.min(1, rawProgress));
      const radiusFraction = isCenterToEdge ? progress : 1 - progress;
      const r = minR + radiusFraction * (maxR - minR);

      // In compass coordinates: 0° is North (up), 90° East (right), 180° South (down), 270° West (left)
      const rad = (p.dir * Math.PI) / 180;
      const x = cxVal + r * Math.sin(rad);
      const y = cyVal - r * Math.cos(rad);

      return {
        index,
        time: p.time,
        dir: p.dir,
        speed: p.speed,
        r,
        x,
        y,
        progress,
      };
    });
  }, [points, tMin, tMax, options.timeDirection, minR, maxR, cxVal, cyVal]);


  if (points.length === 0) {
    return (
      <div className={styles.container('overlay')} data-testid="windtrail-empty">
        <div className={styles.empty}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No Wind Data Available</div>
          <div>Ensure your query returns a time field and a wind direction field in degrees (0–360°).</div>
        </div>
      </div>
    );
  }

  // Filter spokes based on spokeCount
  const spokeCount: SpokeCount = options.spokeCount ?? 8;
  const visibleSpokes = CARDINALS_16.filter((c) => {
    if (spokeCount === 4) {
      return c.deg % 90 === 0;
    }
    if (spokeCount === 8) {
      return c.deg % 45 === 0;
    }
    return true;
  });

  // Concentric time rings
  const ringCount = Math.max(2, Math.min(8, options.ringCount ?? 4));
  const rings = Array.from({ length: ringCount }, (_, idx) => {
    const fraction = (idx + 1) / ringCount;
    const r = minR + fraction * (maxR - minR);
    const isCenterToEdge = (options.timeDirection ?? 'center-to-edge') === 'center-to-edge';
    const ringProgress = isCenterToEdge ? fraction : 1 - fraction;
    const ringTime = tMin + ringProgress * (tMax - tMin);
    const timeDiff = ringTime - tMax;
    const label = formatRelativeTime(timeDiff);
    return { r, fraction, label, ringTime };
  });

  const latestProjected = projectedPoints[projectedPoints.length - 1];

  const renderLegend = (barWidth: number) => {
    if (!hasLegendInfo) {
      return null;
    }

    const isWindy = (options.colorPalette ?? 'windy') === 'windy';
    const activeStops = isWindy ? WINDY_COLOR_STOPS : STANDARD_COLOR_STOPS;
    const gradientCss = activeStops
      .map((s) => `rgb(${s.color.join(',')}) ${Math.round(s.stop * 100)}%`)
      .join(', ');

    const hasPins = Boolean(options.showLegendPins) && hasSpeed && maxSpeed > minSpeed;
    const range = maxSpeed - minSpeed;
    const xMinPin = hasPins ? Math.max(0, Math.min(barWidth, ((dataMinSpeed - minSpeed) / range) * barWidth)) : 0;
    const xMaxPin = hasPins ? Math.max(0, Math.min(barWidth, ((dataMaxSpeed - minSpeed) / range) * barWidth)) : 0;

    return (
      <div data-testid="windtrail-legend">
        <div className={styles.legendTitle}>
          <span>{isBft ? 'Beaufort Scale (Bft)' : `Speed (${speedUnit})`}</span>
        </div>
        <div>
          {hasPins && (
            <svg
              width={barWidth}
              height="8"
              style={{ display: 'block', overflow: 'visible', marginBottom: 1 }}
              data-testid="windtrail-legend-pins"
            >
              {/* Min pin */}
              <polygon
                points={`${(xMinPin - 3).toFixed(1)},1 ${(xMinPin + 3).toFixed(1)},1 ${xMinPin.toFixed(1)},6`}
                fill="#38bdf8"
                stroke="#ffffff"
                strokeWidth="0.5"
              >
                <title>{`Observed Min Speed: ${formatSpeed(dataMinSpeed, speedUnit, isBft)}`}</title>
              </polygon>
              {/* Max pin */}
              <polygon
                points={`${(xMaxPin - 3).toFixed(1)},1 ${(xMaxPin + 3).toFixed(1)},1 ${xMaxPin.toFixed(1)},6`}
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth="0.5"
              >
                <title>{`Observed Max Speed (Gust): ${formatSpeed(dataMaxSpeed, speedUnit, isBft)}`}</title>
              </polygon>
            </svg>
          )}
          {options.scaleWidthBySpeed ? (
            <svg width={barWidth} height="14" style={{ display: 'block' }}>
              <defs>
                <linearGradient id={legendGradId} x1="0%" y1="0%" x2="100%" y2="0%">
                  {options.colorMode === 'speed' ? (
                    activeStops.map((s, idx) => (
                      <stop
                        key={idx}
                        offset={`${Math.round(s.stop * 100)}%`}
                        stopColor={`rgb(${s.color.join(',')})`}
                      />
                    ))
                  ) : (
                    <>
                      <stop offset="0%" stopColor={options.solidColor || '#38bdf8'} />
                      <stop offset="100%" stopColor={options.solidColor || '#38bdf8'} />
                    </>
                  )}
                </linearGradient>
              </defs>
              <polygon points={`0,7 ${barWidth},2 ${barWidth},12 0,7`} fill={`url(#${legendGradId})`} />
            </svg>
          ) : (
            <div
              style={{
                width: barWidth,
                height: 8,
                borderRadius: 4,
                background:
                  options.colorMode === 'speed'
                    ? `linear-gradient(to right, ${gradientCss})`
                    : options.solidColor || '#38bdf8',
              }}
            />
          )}
          <div className={styles.legendTicks(barWidth)}>
            <span>{isBft ? Math.round(minSpeed) : minSpeed.toFixed(0)}</span>
            <span>{isBft ? Math.round((minSpeed + maxSpeed) / 2) : ((minSpeed + maxSpeed) / 2).toFixed(0)}</span>
            <span>{isBft ? `${Math.round(maxSpeed)} Bft` : `${maxSpeed.toFixed(0)} ${speedUnit}`}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderCurrentSidebar = () => {
    if (!hasCurrentInfo || !latestPoint) {
      return null;
    }
    const showLiveReading = options.showCurrent !== false;
    return (
      <div className={styles.sidebarCard} data-testid="windtrail-current">
        {showLiveReading && (
          <>
            <div className={styles.sidebarHeader}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: options.headMarkerColor || '#ef4444',
                  display: 'inline-block',
                  boxShadow: `0 0 6px ${options.headMarkerColor || '#ef4444'}`,
                }}
              />
              <span>Current Wind</span>
            </div>
            <div className={styles.sidebarDir}>
              <span>{Math.round(latestPoint.dir)}°</span>
              <span className={styles.cardinalBadge}>{getCardinalLabel(latestPoint.dir)}</span>
            </div>
            {hasSpeed && (
              <div className={styles.sidebarSpeed}>
                {formatSpeed(latestPoint.speed, speedUnit, isBft)}
              </div>
            )}
          </>
        )}
        {(options.showAngleSector || options.showSpeedMinMax) && (
          <div className={styles.sidebarStats} data-testid="windtrail-sidebar-stats">
            {options.showAngleSector && directionSector.spanDeg > 0 && (
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Dir Range:</span>
                <span className={styles.statValue}>
                  {Math.round(directionSector.startDir)}°–{Math.round(directionSector.endDir)}° ({Math.round(directionSector.spanDeg)}°)
                </span>
              </div>
            )}
            {options.showSpeedMinMax && hasSpeed && (
              <>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Speed Min:</span>
                  <span className={styles.statValue}>{formatSpeed(dataMinSpeed, speedUnit, isBft)}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Speed Max:</span>
                  <span className={styles.statValue} style={{ color: '#f87171' }}>
                    {formatSpeed(dataMaxSpeed, speedUnit, isBft)}
                  </span>
                </div>
                {options.showSpeedAvg && (
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>Speed Avg:</span>
                    <span className={styles.statValue}>{formatSpeed(dataAvgSpeed, speedUnit, isBft)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderCurrentBottom = () => {
    if (!hasCurrentInfo || !latestPoint) {
      return null;
    }
    const isNarrow = width < 300;
    const showLiveReading = options.showCurrent !== false;
    return (
      <div className={styles.bottomCurrent} data-testid="windtrail-current">
        {showLiveReading && (
          <>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: options.headMarkerColor || '#ef4444',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            {!isNarrow && <span>Current:</span>}
            <strong style={{ color: theme.colors.text.primary, whiteSpace: 'nowrap' }}>
              {Math.round(latestPoint.dir)}° ({getCardinalLabel(latestPoint.dir)})
            </strong>
            {hasSpeed && (
              <span style={{ color: theme.colors.text.secondary, whiteSpace: 'nowrap' }}>
                {formatSpeed(latestPoint.speed, speedUnit, isBft)}
              </span>
            )}
          </>
        )}
        {options.showAngleSector && directionSector.spanDeg > 0 && !isNarrow && (
          <span style={{ color: theme.colors.text.secondary, fontSize: 10, whiteSpace: 'nowrap' }} data-testid="windtrail-bottom-dir-range">
            [{directionSector.spanDeg >= 359.9 ? '0°–360°' : `${Math.round(directionSector.startDir)}°–${Math.round(directionSector.endDir)}°`}]
          </span>
        )}
        {options.showSpeedMinMax && hasSpeed && (
          <span style={{ color: theme.colors.text.secondary, fontSize: 10, whiteSpace: 'nowrap' }} data-testid="windtrail-bottom-speed-range">
            {isNarrow ? (
              `${formatSpeed(dataMinSpeed, speedUnit, isBft)}–${formatSpeed(dataMaxSpeed, speedUnit, isBft)}`
            ) : (
              `Min: ${formatSpeed(dataMinSpeed, speedUnit, isBft)} • Max: ${formatSpeed(dataMaxSpeed, speedUnit, isBft)}`
            )}
            {options.showSpeedAvg && !isNarrow && ` (Avg: ${formatSpeed(dataAvgSpeed, speedUnit, isBft)})`}
          </span>
        )}
      </div>
    );
  };

  const renderCurrentOverlay = () => {
    if (!hasCurrentInfo || !latestPoint) {
      return null;
    }
    const showLiveReading = options.showCurrent !== false;
    return (
      <div className={styles.hud} data-testid="windtrail-current">
        <div className={styles.hudBadge}>
          {showLiveReading && (
            <>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: options.headMarkerColor || '#ef4444',
                  display: 'inline-block',
                }}
              />
              <span>Current:</span>
              <span style={{ color: theme.colors.text.primary }}>
                {Math.round(latestPoint.dir)}° ({getCardinalLabel(latestPoint.dir)})
              </span>
              {hasSpeed && (
                <span style={{ color: theme.colors.text.secondary }}>
                  {formatSpeed(latestPoint.speed, speedUnit, isBft)}
                </span>
              )}
            </>
          )}
          {options.showAngleSector && directionSector.spanDeg > 0 && (
            <span style={{ color: theme.colors.text.secondary, fontSize: 10 }} data-testid="windtrail-overlay-dir-range">
              [{directionSector.spanDeg >= 359.9 ? '0°–360°' : `${Math.round(directionSector.startDir)}°–${Math.round(directionSector.endDir)}°`}]
            </span>
          )}
          {options.showSpeedMinMax && hasSpeed && (
            <span style={{ color: theme.colors.text.secondary, fontSize: 10 }} data-testid="windtrail-overlay-speed-range">
              Min: {formatSpeed(dataMinSpeed, speedUnit, isBft)} • Max: {formatSpeed(dataMaxSpeed, speedUnit, isBft)}
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderDirectionSector = () => {
    if (!options.showAngleSector || directionSector.spanDeg <= 0) {
      return null;
    }

    const style: SectorStyle = options.sectorStyle ?? 'rim';
    const baseColor = options.sectorColor || '#38bdf8';
    const isWedge = style === 'wedge';

    const rOuter = maxR;
    const rimThickness = Math.max(6, Math.min(14, maxR * 0.1));
    const rInner = isWedge ? minR : maxR - rimThickness;

    const pathData = buildSectorPath(
      cxVal,
      cyVal,
      rInner,
      rOuter,
      directionSector.startDir,
      directionSector.endDir,
      directionSector.spanDeg
    );

    if (!pathData) {
      return null;
    }

    const radStart = (directionSector.startDir * Math.PI) / 180;
    const radEnd = (directionSector.endDir * Math.PI) / 180;
    const tickInner = rInner - (isWedge ? 0 : 2);
    const tickOuter = rOuter + 2;

    const x1Start = cxVal + tickInner * Math.sin(radStart);
    const y1Start = cyVal - tickInner * Math.cos(radStart);
    const x2Start = cxVal + tickOuter * Math.sin(radStart);
    const y2Start = cyVal - tickOuter * Math.cos(radStart);

    const x1End = cxVal + tickInner * Math.sin(radEnd);
    const y1End = cyVal - tickInner * Math.cos(radEnd);
    const x2End = cxVal + tickOuter * Math.sin(radEnd);
    const y2End = cyVal - tickOuter * Math.cos(radEnd);

    return (
      <g data-testid="windtrail-sector">
        <path
          d={pathData}
          fill={baseColor}
          fillOpacity={isWedge ? 0.16 : 0.32}
          stroke={baseColor}
          strokeOpacity={isWedge ? 0.45 : 0.75}
          strokeWidth="1"
          fillRule="evenodd"
        >
          <title>
            {directionSector.spanDeg >= 359.9
              ? 'Wind Direction Range: 0°–360° (Full compass rotation) • Spread: 360°'
              : `Wind Direction Range: ${Math.round(directionSector.startDir)}° (${getCardinalLabel(directionSector.startDir)}) – ${Math.round(directionSector.endDir)}° (${getCardinalLabel(directionSector.endDir)}) • Spread: ${Math.round(directionSector.spanDeg)}°`}
          </title>
        </path>
        {directionSector.spanDeg < 359 && (
          <>
            <line
              x1={x1Start.toFixed(2)}
              y1={y1Start.toFixed(2)}
              x2={x2Start.toFixed(2)}
              y2={y2Start.toFixed(2)}
              stroke={baseColor}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1={x1End.toFixed(2)}
              y1={y1End.toFixed(2)}
              x2={x2End.toFixed(2)}
              y2={y2End.toFixed(2)}
              stroke={baseColor}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </>
        )}
      </g>
    );
  };

  return (
    <div className={styles.container(effectivePlacement)} ref={containerRef} data-testid="windtrail-panel">
      <div className={styles.compassWrapper} style={{ width: compassWidth, height: compassHeight }}>
        <svg
          className={styles.svg}
          data-testid="windtrail-compass"
          width={compassWidth}
          height={compassHeight}
          onMouseLeave={() => setHoveredPoint(null)}
        >
        <defs>
          {/* Radial subtle backdrop gradient */}
          <radialGradient id="compass-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={theme.colors.background.secondary} stopOpacity="0.4" />
            <stop offset="100%" stopColor={theme.colors.background.primary} stopOpacity="0.8" />
          </radialGradient>

          {/* Glow filter for latest head point */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer Circular Disk */}
        <circle
          cx={cxVal}
          cy={cyVal}
          r={maxR}
          fill="url(#compass-bg)"
          stroke={theme.colors.border.weak}
          strokeWidth="1.5"
        />

        {/* Concentric Time Rings */}
        {rings.map((ring, idx) => (
          <g key={idx}>
            <circle
              cx={cxVal}
              cy={cyVal}
              r={ring.r}
              fill="none"
              stroke={theme.colors.border.weak}
              strokeWidth={idx === rings.length - 1 ? '1.5' : '1'}
              strokeDasharray={idx === rings.length - 1 ? undefined : '3 3'}
              opacity={0.65}
            />
            {options.showTimeLabels !== false && (
              <text
                x={cxVal + 4}
                y={cyVal - ring.r + 11}
                fill={theme.colors.text.secondary}
                fontSize={9}
                opacity={0.75}
              >
                {ring.label}
              </text>
            )}
          </g>
        ))}

        {/* Central Core Indicator */}
        <circle cx={cxVal} cy={cyVal} r={minR} fill={theme.colors.border.medium} opacity={0.6} />

        {/* Wind Direction Variation Sector */}
        {renderDirectionSector()}

        {/* Compass Spokes and Cardinal Labels */}
        {visibleSpokes.map((spoke) => {
          const rad = (spoke.deg * Math.PI) / 180;
          const x2 = cxVal + maxR * Math.sin(rad);
          const y2 = cyVal - maxR * Math.cos(rad);
          const isMajor = spoke.deg % 90 === 0;

          const labelOffset = maxR + (isSmall ? 9 : 13);
          const lx = cxVal + labelOffset * Math.sin(rad);
          const ly = cyVal - labelOffset * Math.cos(rad) + (isSmall ? 3 : 4);

          return (
            <g key={spoke.label}>
              <line
                x1={cxVal}
                y1={cyVal}
                x2={x2}
                y2={y2}
                stroke={isMajor ? theme.colors.border.medium : theme.colors.border.weak}
                strokeWidth={isMajor ? 1.2 : 0.75}
                opacity={isMajor ? 0.8 : 0.45}
              />
              {options.showCardinalLabels !== false && (
                <text
                  x={lx}
                  y={ly}
                  fill={isMajor ? theme.colors.text.primary : theme.colors.text.secondary}
                  fontWeight={isMajor ? 600 : 400}
                  fontSize={isMajor ? (isSmall ? 10 : 11) : isSmall ? 8 : 9}
                  textAnchor="middle"
                >
                  {spoke.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Trajectory Trail Segments */}
        {projectedPoints.map((pt, i) => {
          if (i === 0) {
            return null;
          }
          const prev = projectedPoints[i - 1];

          // 1. Color resolution
          let strokeColor = options.solidColor || '#38bdf8';
          if (options.colorMode === 'speed' && hasSpeed) {
            const avgSpeed = (pt.speed + prev.speed) / 2;
            strokeColor = getSpeedColor(avgSpeed, minSpeed, maxSpeed, options.colorPalette ?? 'windy');
          } else {
            strokeColor = options.solidColor || '#38bdf8';
          }

          // 2. Fading (opacity over time) - decoupled and combinable with any color mode & thickness
          let strokeOpacity = 0.85;
          const shouldFade = options.fadeOverTime !== false;
          if (shouldFade) {
            const minOp = options.minOpacity ?? 0.18;
            strokeOpacity = minOp + (1 - minOp) * Math.pow(pt.progress, 1.2);
          }

          // 3. Line Thickness (Speed-based and/or Time-tapered)
          const minW = options.minStrokeWidth ?? 1.5;
          const maxW = options.maxStrokeWidth ?? 7;
          let segmentStrokeWidth = options.strokeWidth ?? 2.5;

          if (options.scaleWidthBySpeed && hasSpeed) {
            const avgSpeed = (pt.speed + prev.speed) / 2;
            const span = Math.max(0.1, maxSpeed - minSpeed);
            const ratio = Math.max(0, Math.min(1, (avgSpeed - minSpeed) / span));
            segmentStrokeWidth = minW + ratio * (maxW - minW);
          }

          if (options.fadeWidthOverTime) {
            const timeTaper = 0.3 + 0.7 * pt.progress;
            segmentStrokeWidth = Math.max(minW * 0.5, segmentStrokeWidth * timeTaper);
          }

          const pathD = buildSegmentPath(prev, pt, cxVal, cyVal, options.curveMode ?? 'polar');

          return (
            <path
              key={`seg-${i}`}
              d={pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth={segmentStrokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={strokeOpacity}
            />
          );
        })}

        {/* Data Point Dots (Interactive) */}
        {projectedPoints.map((pt, i) => {
          const isLatest = i === projectedPoints.length - 1;
          const isDense = options.autoHidePoints !== false && projectedPoints.length > 80;
          const showDot = isLatest || (options.showPoints !== false && !isDense);
          if (!showDot) {
            return null;
          }

          let dotFill = options.solidColor || '#38bdf8';
          if (options.colorMode === 'speed' && hasSpeed) {
            dotFill = getSpeedColor(pt.speed, minSpeed, maxSpeed, options.colorPalette ?? 'windy');
          }

          let r = options.pointRadius ?? 2.5;
          if (options.scaleWidthBySpeed && hasSpeed) {
            const span = Math.max(0.1, maxSpeed - minSpeed);
            const ratio = Math.max(0, Math.min(1, (pt.speed - minSpeed) / span));
            const minR = Math.max(1.2, (options.minStrokeWidth ?? 1.5) * 0.7);
            const maxR = Math.max(2.5, (options.maxStrokeWidth ?? 7) * 0.7);
            r = minR + ratio * (maxR - minR);
          }

          if (options.fadeWidthOverTime) {
            const timeTaper = 0.3 + 0.7 * pt.progress;
            r = Math.max(1, r * timeTaper);
          }

          let dotOpacity = 0.85;
          const shouldFade = options.fadeOverTime !== false;
          if (shouldFade) {
            const minOp = options.minOpacity ?? 0.18;
            dotOpacity = minOp + (1 - minOp) * pt.progress;
          }

          return (
            <circle
              key={`dot-${i}`}
              cx={pt.x}
              cy={pt.y}
              r={r}
              fill={dotFill}
              opacity={dotOpacity}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredPoint(pt)}
            />
          );
        })}

        {/* Current Head Marker (Most Recent Point) */}
        {options.showHeadMarker !== false && latestProjected && (
          <g filter="url(#glow)">
            {/* Outer halo */}
            <circle
              cx={latestProjected.x}
              cy={latestProjected.y}
              r={8}
              fill="none"
              stroke={options.headMarkerColor || '#ef4444'}
              strokeWidth="2"
              opacity="0.85"
            />
            {/* Solid Center */}
            <circle cx={latestProjected.x} cy={latestProjected.y} r={4.5} fill={options.headMarkerColor || '#ef4444'} />
          </g>
        )}

        {/* Hover Highlight Ring */}
        {hoveredPoint && (
          <circle
            cx={hoveredPoint.x}
            cy={hoveredPoint.y}
            r={(options.pointRadius ?? 2.5) + 4}
            fill="none"
            stroke="#ffffff"
            strokeWidth="2"
          />
        )}
      </svg>

      {/* Hover Tooltip */}
      {hoveredPoint && (
        <div
          className={styles.tooltip}
          style={{
            left: `${hoveredPoint.x}px`,
            top: `${hoveredPoint.y}px`,
          }}
        >
          <div style={{ fontWeight: 600, color: '#ffffff' }}>
            {dateTimeFormat(hoveredPoint.time, { format: 'YYYY-MM-DD HH:mm:ss' })}
          </div>
          <div>
            Direction:{' '}
            <strong style={{ color: '#38bdf8' }}>
              {Math.round(hoveredPoint.dir)}° ({getCardinalLabel(hoveredPoint.dir)})
            </strong>
          </div>
          {hasSpeed && (
            <div>
              Speed: <strong style={{ color: '#4ade80' }}>{formatSpeed(hoveredPoint.speed, speedUnit, isBft)}</strong>
            </div>
          )}
          <div style={{ opacity: 0.7, fontSize: 10 }}>{formatRelativeTime(hoveredPoint.time - tMax)} from latest</div>
        </div>
      )}

      {/* Overlay Mode Telemetry */}
      {effectivePlacement === 'overlay' && (
        <>
          {renderCurrentOverlay()}
          {hasLegendInfo && (
            <div className={styles.legendContainer(options.legendPosition ?? 'bottom-right')}>
              {renderLegend(isSmall ? 80 : 120)}
            </div>
          )}
        </>
      )}
      </div>

      {/* Right Sidebar Layout */}
      {effectivePlacement === 'right' && (
        <div className={styles.sidebar} style={{ width: sidebarWidth }}>
          {renderCurrentSidebar()}
          {hasLegendInfo && (
            <div className={styles.sidebarCard}>
              {renderLegend(Math.min(130, sidebarWidth - 28))}
            </div>
          )}
        </div>
      )}

      {/* Bottom Bar Layout */}
      {effectivePlacement === 'bottom' && (
        <div className={styles.bottomBar} style={{ height: bottomBarHeight }}>
          {renderCurrentBottom()}
          {hasLegendInfo && (
            <div className={styles.bottomLegend}>
              {renderLegend(width < 280 ? 60 : isSmall ? 75 : 105)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
