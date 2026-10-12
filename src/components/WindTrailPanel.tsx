import React, { useMemo, useState, useRef } from 'react';
import { PanelProps, dateTimeFormat, DataFrame, Field, FieldType } from '@grafana/data';
import { WindTrailOptions, SpokeCount, SpeedUnit, DisplaySpeedUnit, LegendPosition } from '../types';
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

interface Props extends PanelProps<WindTrailOptions> {}

interface WindPoint {
  index: number;
  time: number;
  dir: number; // degrees 0-360
  speed: number;
  x: number;
  y: number;
  progress: number; // 0 (start) to 1 (end)
}

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

const getSpeedColor = (speed: number, minSpeed: number, maxSpeed: number): string => {
  const span = Math.max(1, maxSpeed - minSpeed);
  const ratio = Math.max(0, Math.min(1, (speed - minSpeed) / span));

  // Perceptual weather scale: Cyan -> Green -> Yellow -> Orange -> Crimson -> Purple
  if (ratio < 0.2) {
    return '#38bdf8';
  } // light blue
  if (ratio < 0.4) {
    return '#22c55e';
  } // green
  if (ratio < 0.6) {
    return '#eab308';
  } // yellow
  if (ratio < 0.8) {
    return '#f97316';
  } // orange
  if (ratio < 0.95) {
    return '#ef4444';
  } // red
  return '#c084fc'; // purple / storm
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
    container: css`
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
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
    `,
    legendTicks: css`
      display: flex;
      justify-content: space-between;
      width: 120px;
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

  // 1. Extract and process data
  const { points, tMin, tMax, minSpeed, maxSpeed, hasSpeed, speedUnit, isBft, latestPoint } = useMemo(() => {
    if (!data.series || data.series.length === 0) {
      return {
        points: [],
        tMin: 0,
        tMax: 0,
        minSpeed: 0,
        maxSpeed: 0,
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
        hasSpeed: false,
        speedField: undefined,
        speedUnit: effectiveUnit,
        isBft,
        latestPoint: null,
      };
    }

    let tMin = rawPoints[0].time;
    let tMax = rawPoints[rawPoints.length - 1].time;

    const useDashboardTime = (options.timeRangeSource ?? 'data') === 'dashboard';
    if (useDashboardTime && timeRange?.from && timeRange?.to && typeof timeRange.from.valueOf === 'function') {
      const fromMs = timeRange.from.valueOf();
      const toMs = timeRange.to.valueOf();
      if (!isNaN(fromMs) && !isNaN(toMs) && toMs > fromMs) {
        const dataMin = rawPoints[0].time;
        const dataMax = rawPoints[rawPoints.length - 1].time;
        // Only use dashboard bounds if the data actually overlaps with the dashboard range
        if (dataMax >= fromMs && dataMin <= toMs) {
          tMin = fromMs;
          tMax = toMs;
        }
      }
    }

    const cfgMin = speedField?.config?.min;
    const cfgMax = speedField?.config?.max;
    let minSpeed: number =
      options.speedMin !== undefined ? options.speedMin : cfgMin != null ? Number(cfgMin) : Infinity;
    let maxSpeed: number =
      options.speedMax !== undefined ? options.speedMax : cfgMax != null ? Number(cfgMax) : -Infinity;

    for (const p of rawPoints) {
      if (options.speedMin === undefined && cfgMin == null && p.speed < minSpeed) {
        minSpeed = p.speed;
      }
      if (options.speedMax === undefined && cfgMax == null && p.speed > maxSpeed) {
        maxSpeed = p.speed;
      }
    }
    if (minSpeed === Infinity || isNaN(minSpeed)) {
      minSpeed = 0;
    }
    if (maxSpeed === -Infinity || isNaN(maxSpeed)) {
      maxSpeed = 10;
    }

    return {
      points: rawPoints,
      tMin,
      tMax,
      minSpeed,
      maxSpeed,
      hasSpeed: Boolean(speedField),
      speedField,
      speedUnit: effectiveUnit,
      isBft,
      latestPoint: rawPoints[rawPoints.length - 1],
    };
  }, [
    data,
    options.directionFieldName,
    options.speedFieldName,
    options.timeRangeSource,
    options.speedMin,
    options.speedMax,
    options.inputSpeedUnit,
    options.displaySpeedUnit,
    options.speedUnit,
    timeRange,
    replaceVariables,
  ]);

  // 2. Geometry calculations
  const size = Math.min(width, height);
  const cxVal = width / 2;
  const cyVal = height / 2;
  const padding = options.showCardinalLabels ? 28 : 16;
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
        x,
        y,
        progress,
      };
    });
  }, [points, tMin, tMax, options.timeDirection, minR, maxR, cxVal, cyVal]);

  if (points.length === 0) {
    return (
      <div className={styles.container}>
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

  return (
    <div className={styles.container} ref={containerRef}>
      <svg className={styles.svg} width={width} height={height} onMouseLeave={() => setHoveredPoint(null)}>
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

        {/* Compass Spokes and Cardinal Labels */}
        {visibleSpokes.map((spoke) => {
          const rad = (spoke.deg * Math.PI) / 180;
          const x2 = cxVal + maxR * Math.sin(rad);
          const y2 = cyVal - maxR * Math.cos(rad);
          const isMajor = spoke.deg % 90 === 0;

          const labelOffset = maxR + 13;
          const lx = cxVal + labelOffset * Math.sin(rad);
          const ly = cyVal - labelOffset * Math.cos(rad) + 4;

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
                  fontSize={isMajor ? 11 : 9}
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
            strokeColor = getSpeedColor(avgSpeed, minSpeed, maxSpeed);
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

          return (
            <line
              key={`seg-${i}`}
              x1={prev.x}
              y1={prev.y}
              x2={pt.x}
              y2={pt.y}
              stroke={strokeColor}
              strokeWidth={segmentStrokeWidth}
              strokeLinecap="round"
              strokeOpacity={strokeOpacity}
            />
          );
        })}

        {/* Data Point Dots (Interactive) */}
        {projectedPoints.map((pt, i) => {
          const isLatest = i === projectedPoints.length - 1;
          const showDot = options.showPoints !== false || isLatest;
          if (!showDot) {
            return null;
          }

          let dotFill = options.solidColor || '#38bdf8';
          if (options.colorMode === 'speed' && hasSpeed) {
            dotFill = getSpeedColor(pt.speed, minSpeed, maxSpeed);
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

      {/* Realtime Head-Up Display (Current Wind Direction & Speed) */}
      {latestPoint && (
        <div className={styles.hud}>
          <div className={styles.hudBadge}>
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
          </div>
        </div>
      )}

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

      {/* Optional Wind Speed & Thickness Scale Legend */}
      {options.showLegend && hasSpeed && (
        <div className={styles.legendContainer(options.legendPosition ?? 'bottom-right')}>
          <div className={styles.legendTitle}>
            <span>{isBft ? 'Beaufort Scale (Bft)' : `Speed (${speedUnit})`}</span>
          </div>
          <div>
            {options.scaleWidthBySpeed ? (
              <svg width="120" height="14" style={{ display: 'block' }}>
                <defs>
                  <linearGradient id="scale-legend-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    {options.colorMode === 'speed' ? (
                      <>
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="20%" stopColor="#22c55e" />
                        <stop offset="45%" stopColor="#eab308" />
                        <stop offset="70%" stopColor="#f97316" />
                        <stop offset="90%" stopColor="#ef4444" />
                        <stop offset="100%" stopColor="#c084fc" />
                      </>
                    ) : (
                      <>
                        <stop offset="0%" stopColor={options.solidColor || '#38bdf8'} />
                        <stop offset="100%" stopColor={options.solidColor || '#38bdf8'} />
                      </>
                    )}
                  </linearGradient>
                </defs>
                <polygon points="0,7 120,2 120,12 0,7" fill="url(#scale-legend-grad)" />
              </svg>
            ) : (
              <div
                style={{
                  width: 120,
                  height: 8,
                  borderRadius: 4,
                  background:
                    options.colorMode === 'speed'
                      ? 'linear-gradient(to right, #38bdf8 0%, #22c55e 20%, #eab308 45%, #f97316 70%, #ef4444 90%, #c084fc 100%)'
                      : (options.solidColor || '#38bdf8'),
                }}
              />
            )}
            <div className={styles.legendTicks}>
              <span>{isBft ? Math.round(minSpeed) : minSpeed.toFixed(0)}</span>
              <span>{isBft ? Math.round((minSpeed + maxSpeed) / 2) : ((minSpeed + maxSpeed) / 2).toFixed(0)}</span>
              <span>{isBft ? `${Math.round(maxSpeed)} Bft` : `${maxSpeed.toFixed(0)} ${speedUnit}`}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
