import React from 'react';
import { render } from '@testing-library/react';
import {
  WindTrailPanel,
  getCardinalLabel,
  convertSpeed,
  buildSegmentPath,
  interpolateColorStops,
  getDefaultFixedSpeedMax,
  getSpeedColor,
  WINDY_COLOR_STOPS,
  STANDARD_COLOR_STOPS,
  computeVectorAverageDirection,
  downsamplePoints,
  RawWindPoint,
  computeDirectionSector,
  buildSectorPath,
} from './WindTrailPanel';
import { FieldType, LoadingState, toDataFrame } from '@grafana/data';
import { WindTrailOptions } from '../types';

describe('WindTrailPanel', () => {
  describe('convertSpeed', () => {
    it('converts m/s to km/h, knots, mph, and bft correctly', () => {
      expect(convertSpeed(10, 'm/s', 'km/h').value).toBeCloseTo(36, 1);
      expect(convertSpeed(10, 'm/s', 'km/h').unitLabel).toBe('km/h');

      expect(convertSpeed(10, 'm/s', 'knots').value).toBeCloseTo(19.44, 1);
      expect(convertSpeed(10, 'm/s', 'knots').unitLabel).toBe('kn');

      expect(convertSpeed(10, 'm/s', 'mph').value).toBeCloseTo(22.37, 1);
      expect(convertSpeed(10, 'm/s', 'mph').unitLabel).toBe('mph');

      expect(convertSpeed(10, 'm/s', 'bft').value).toBe(5);
      expect(convertSpeed(10, 'm/s', 'bft').unitLabel).toBe('Bft');
    });

    it('converts km/h to knots and m/s correctly', () => {
      expect(convertSpeed(36, 'km/h', 'm/s').value).toBeCloseTo(10, 1);
      expect(convertSpeed(36, 'km/h', 'knots').value).toBeCloseTo(19.44, 1);
    });

    it('handles same unit without conversion', () => {
      expect(convertSpeed(15, 'knots', 'same').value).toBe(15);
      expect(convertSpeed(15, 'knots', 'same').unitLabel).toBe('kn');
    });
  });
  describe('getCardinalLabel', () => {
    it('correctly maps angles to 16 cardinal points', () => {
      expect(getCardinalLabel(0)).toBe('N');
      expect(getCardinalLabel(360)).toBe('N');
      expect(getCardinalLabel(45)).toBe('NE');
      expect(getCardinalLabel(90)).toBe('E');
      expect(getCardinalLabel(135)).toBe('SE');
      expect(getCardinalLabel(180)).toBe('S');
      expect(getCardinalLabel(225)).toBe('SW');
      expect(getCardinalLabel(270)).toBe('W');
      expect(getCardinalLabel(315)).toBe('NW');
    });

    it('handles floating point degrees and negative angles', () => {
      expect(getCardinalLabel(22.4)).toBe('NNE');
      expect(getCardinalLabel(248)).toBe('WSW');
      expect(getCardinalLabel(-90)).toBe('W');
    });
  });

  describe('buildSegmentPath', () => {
    const cx = 200;
    const cy = 200;

    it('returns direct line when curveMode is linear', () => {
      const p1 = { x: 200, y: 100, r: 100, dir: 0 };
      const p2 = { x: 300, y: 200, r: 100, dir: 90 };
      const path = buildSegmentPath(p1, p2, cx, cy, 'linear');
      expect(path).toBe('M 200.00 100.00 L 300.00 200.00');
    });

    it('returns polar circular arc path when curveMode is polar', () => {
      const p1 = { x: 200, y: 100, r: 100, dir: 0 };
      const p2 = { x: 300, y: 200, r: 100, dir: 90 };
      const path = buildSegmentPath(p1, p2, cx, cy, 'polar');
      // Should have multiple L commands following the 90° arc
      const segments = path.split(' L ');
      expect(segments.length).toBeGreaterThan(5);
      expect(path.startsWith('M 200.00 100.00')).toBe(true);
      expect(path.endsWith('300.00 200.00')).toBe(true);
    });

    it('takes the shortest path across North (350° to 10°)', () => {
      const rad1 = (350 * Math.PI) / 180;
      const rad2 = (10 * Math.PI) / 180;
      const p1 = { x: cx + 100 * Math.sin(rad1), y: cy - 100 * Math.cos(rad1), r: 100, dir: 350 };
      const p2 = { x: cx + 100 * Math.sin(rad2), y: cy - 100 * Math.cos(rad2), r: 100, dir: 10 };
      const path = buildSegmentPath(p1, p2, cx, cy, 'polar');
      // For a 20° difference, should have around 7 steps, not 340 steps
      const segments = path.split(' L ');
      expect(segments.length).toBeLessThan(15);
      expect(segments.length).toBeGreaterThan(2);
    });

    it('returns direct radial line when subsequent points have the same angle', () => {
      // Wind direction stays constant at 180° (South) while time progresses outwards from r=50 to r=100
      const p1 = { x: 200, y: 250, r: 50, dir: 180 };
      const p2 = { x: 200, y: 300, r: 100, dir: 180 };
      const path = buildSegmentPath(p1, p2, cx, cy, 'polar');
      expect(path).toBe('M 200.00 250.00 L 200.00 300.00');
    });
  });

  describe('getDefaultFixedSpeedMax', () => {
    it('returns standard meteorological maximums for various speed units', () => {
      expect(getDefaultFixedSpeedMax('km/h')).toBe(60);
      expect(getDefaultFixedSpeedMax('knots')).toBe(40);
      expect(getDefaultFixedSpeedMax('kn')).toBe(40);
      expect(getDefaultFixedSpeedMax('mph')).toBe(45);
      expect(getDefaultFixedSpeedMax('bft')).toBe(12);
      expect(getDefaultFixedSpeedMax('ft/s')).toBe(60);
      expect(getDefaultFixedSpeedMax('m/s')).toBe(20);
      expect(getDefaultFixedSpeedMax('unknown')).toBe(20);
    });
  });

  describe('interpolateColorStops and getSpeedColor', () => {
    it('returns boundary colors correctly', () => {
      expect(interpolateColorStops(0, WINDY_COLOR_STOPS)).toBe('rgb(56, 189, 248)');
      expect(interpolateColorStops(1, WINDY_COLOR_STOPS)).toBe('rgb(236, 72, 153)');
      expect(interpolateColorStops(-0.5, WINDY_COLOR_STOPS)).toBe('rgb(56, 189, 248)');
      expect(interpolateColorStops(1.5, WINDY_COLOR_STOPS)).toBe('rgb(236, 72, 153)');

      expect(interpolateColorStops(0, STANDARD_COLOR_STOPS)).toBe('rgb(56, 189, 248)');
      expect(interpolateColorStops(1, STANDARD_COLOR_STOPS)).toBe('rgb(192, 132, 252)');
    });

    it('interpolates colors between stops', () => {
      // Between stop 0 (0.0: [56, 189, 248]) and stop 1 (0.15: [16, 185, 129])
      const color = interpolateColorStops(0.075, WINDY_COLOR_STOPS);
      expect(color).toMatch(/^rgb\(\d+,\s*\d+,\s*\d+\)$/);
    });

    it('getSpeedColor scales speed across palette stops', () => {
      const min = 0;
      const max = 100;
      // Windy palette: start is light sky blue, end is magenta
      expect(getSpeedColor(0, min, max, 'windy')).toBe('rgb(56, 189, 248)');
      expect(getSpeedColor(100, min, max, 'windy')).toBe('rgb(236, 72, 153)');

      // Standard palette: start is cyan, end is purple
      expect(getSpeedColor(0, min, max, 'standard')).toBe('rgb(56, 189, 248)');
      expect(getSpeedColor(100, min, max, 'standard')).toBe('rgb(192, 132, 252)');
    });
  });

  describe('computeVectorAverageDirection', () => {
    it('correctly averages angles across North boundary without inverted results', () => {
      // 350° (-10°) and 10° (+10°) -> should average to 0° (North), NOT 180° (South)
      const avg = computeVectorAverageDirection([350, 10]);
      expect(avg).toBeCloseTo(0, 1);
    });

    it('correctly averages perpendicular angles', () => {
      // 90° (East) and 180° (South) -> 135° (South-East)
      const avg = computeVectorAverageDirection([90, 180]);
      expect(avg).toBeCloseTo(135, 1);
    });

    it('weights direction by speed when speeds are supplied', () => {
      // Strong wind from North (0° at 30 m/s) with light puff from East (90° at 1 m/s)
      const avg = computeVectorAverageDirection([0, 90], [30, 1]);
      // Should be very close to North (~1.9°)
      expect(avg).toBeLessThan(5);
      expect(avg).toBeGreaterThanOrEqual(0);
    });

    it('handles cancellation and empty array gracefully', () => {
      expect(computeVectorAverageDirection([])).toBe(0);
      // Equal opposite vectors 0° and 180° -> falls back to last observed
      expect(computeVectorAverageDirection([0, 180], [10, 10])).toBe(180);
    });
  });

  describe('downsamplePoints', () => {
    it('does not downsample if count is <= maxPoints', () => {
      const pts: RawWindPoint[] = [
        { time: 1000, dir: 45, speed: 5 },
        { time: 2000, dir: 90, speed: 6 },
        { time: 3000, dir: 135, speed: 7 },
      ];
      expect(downsamplePoints(pts, 10)).toEqual(pts);
    });

    it('does not downsample if maxPoints is 0 or negative (disabled)', () => {
      const pts: RawWindPoint[] = Array.from({ length: 50 }, (_, i) => ({
        time: 1000 + i * 10,
        dir: i * 5,
        speed: 5,
      }));
      expect(downsamplePoints(pts, 0)).toHaveLength(50);
      expect(downsamplePoints(pts, -1)).toHaveLength(50);
    });

    it('downsamples large dataset to <= maxPoints and preserves exact latest point', () => {
      const pts: RawWindPoint[] = Array.from({ length: 300 }, (_, i) => ({
        time: 1000 + i * 60000, // 300 minutes
        dir: (i * 12) % 360,
        speed: 5 + (i % 10),
      }));

      const downsampled = downsamplePoints(pts, 50);
      expect(downsampled.length).toBeLessThanOrEqual(50);
      expect(downsampled.length).toBeGreaterThan(10);

      // Latest point MUST match the exact raw latest point
      const lastDown = downsampled[downsampled.length - 1];
      const lastRaw = pts[pts.length - 1];
      expect(lastDown.time).toBe(lastRaw.time);
      expect(lastDown.dir).toBe(lastRaw.dir);
      expect(lastDown.speed).toBe(lastRaw.speed);

      // Timestamps must remain strictly ascending
      for (let i = 1; i < downsampled.length; i++) {
        expect(downsampled[i].time).toBeGreaterThan(downsampled[i - 1].time);
      }
    });

    it('accurately vector-averages points across North within bins', () => {
      const now = Date.now();
      const pts: RawWindPoint[] = [
        { time: now, dir: 350, speed: 10 },
        { time: now + 100, dir: 10, speed: 10 },
        { time: now + 10000, dir: 90, speed: 12 }, // Last point
      ];
      // Downsample 3 points into 2 points (bucket 1 = points 0 & 1, point 2 = exact latest)
      const downsampled = downsamplePoints(pts, 2);
      expect(downsampled).toHaveLength(2);
      expect(downsampled[0].dir).toBeCloseTo(0, 1); // 350° and 10° vector mean = 0° (North)
      expect(downsampled[1].dir).toBe(90);
    });
  });

  describe('Component rendering', () => {
    const defaultOptions: WindTrailOptions = {
      timeDirection: 'center-to-edge',
      spokeCount: 8,
      ringCount: 4,
      strokeWidth: 2.5,
      scaleWidthBySpeed: false,
      fadeWidthOverTime: false,
      minStrokeWidth: 1.5,
      maxStrokeWidth: 7,
      fadeOverTime: true,
      minOpacity: 0.18,
      colorMode: 'solid',
      solidColor: '#38bdf8',
      showPoints: true,
      pointRadius: 2.5,
      showHeadMarker: true,
      headMarkerColor: '#ef4444',
      showTimeLabels: true,
      showCardinalLabels: true,
      speedUnit: 'm/s',
    };

    it('renders empty state when data is empty', () => {
      const { getByText } = render(
        <WindTrailPanel
          id={1}
          data={{
            series: [],
            state: LoadingState.Done,
            timeRange: {} as any,
          }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={defaultOptions}
          width={400}
          height={400}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      expect(getByText(/No Wind Data Available/i)).toBeInTheDocument();
    });

    it('renders wind trail and HUD when data is provided', () => {
      const now = Date.now();
      const frame = toDataFrame({
        fields: [
          {
            name: 'time',
            type: FieldType.time,
            values: [now - 3600000, now - 1800000, now],
          },
          {
            name: 'wind_dir',
            type: FieldType.number,
            values: [180, 225, 270],
          },
          {
            name: 'wind_speed',
            type: FieldType.number,
            values: [5.2, 8.4, 12.1],
          },
        ],
      });

      const { getByText, container } = render(
        <WindTrailPanel
          id={1}
          data={{
            series: [frame],
            state: LoadingState.Done,
            timeRange: {} as any,
          }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            scaleWidthBySpeed: true,
            minStrokeWidth: 1,
            maxStrokeWidth: 8,
          }}
          width={500}
          height={500}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      // Current direction is 270° (W)
      expect(getByText(/270° \(W\)/i)).toBeInTheDocument();
      // Speed is 12.1 m/s
      expect(getByText(/12.1 m\/s/i)).toBeInTheDocument();
      // Verify line elements (spokes) and path elements (trajectory arcs) are rendered
      const lines = container.querySelectorAll('line');
      expect(lines.length).toBeGreaterThan(0);
      const paths = container.querySelectorAll('path');
      expect(paths.length).toBeGreaterThan(0);
    });

    it('applies dashboard timeRange when timeRangeSource is dashboard', () => {
      const now = Date.now();
      const frame = toDataFrame({
        fields: [
          {
            name: 'time',
            type: FieldType.time,
            values: [now - 1800000, now],
          },
          {
            name: 'wind_dir',
            type: FieldType.number,
            values: [90, 180],
          },
        ],
      });

      const { container } = render(
        <WindTrailPanel
          id={1}
          data={{
            series: [frame],
            state: LoadingState.Done,
            timeRange: {} as any,
          }}
          timeRange={{
            from: { valueOf: () => now - 7200000 } as any,
            to: { valueOf: () => now } as any,
            raw: {} as any,
          }}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            timeRangeSource: 'dashboard',
          }}
          width={500}
          height={500}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      const circles = container.querySelectorAll('circle');
      expect(circles.length).toBeGreaterThan(0);
    });

    it('converts speed unit for display when configured', () => {
      const now = Date.now();
      const frame = toDataFrame({
        fields: [
          {
            name: 'time',
            type: FieldType.time,
            values: [now - 1000, now],
          },
          {
            name: 'wind_dir',
            type: FieldType.number,
            values: [180, 270],
          },
          {
            name: 'wind_speed',
            type: FieldType.number,
            values: [10, 10], // 10 m/s = 36 km/h
          },
        ],
      });

      const { getByText } = render(
        <WindTrailPanel
          id={1}
          data={{
            series: [frame],
            state: LoadingState.Done,
            timeRange: {} as any,
          }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            inputSpeedUnit: 'm/s',
            displaySpeedUnit: 'km/h',
          }}
          width={500}
          height={500}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      // 10 m/s displayed in km/h is 36.0 km/h
      expect(getByText(/36\.0 km\/h/i)).toBeInTheDocument();
    });

    it('gracefully falls back to data bounds when dashboard timeRange does not overlap with data', () => {
      // Historical data from 6 months ago
      const pastTime = 1775973900000;
      const frame = toDataFrame({
        fields: [
          {
            name: 'time',
            type: FieldType.time,
            values: [pastTime, pastTime + 1800000, pastTime + 3600000],
          },
          {
            name: 'wind_dir',
            type: FieldType.number,
            values: [90, 180, 270],
          },
        ],
      });

      const now = Date.now();
      const { container } = render(
        <WindTrailPanel
          id={1}
          data={{
            series: [frame],
            state: LoadingState.Done,
            timeRange: {} as any,
          }}
          timeRange={{
            // Dashboard is set to "Now - 6h" to "Now"
            from: { valueOf: () => now - 21600000 } as any,
            to: { valueOf: () => now } as any,
            raw: {} as any,
          }}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            timeRangeSource: 'dashboard',
          }}
          width={500}
          height={500}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      // Lines must still be rendered spanning across the compass instead of collapsing
      const lines = container.querySelectorAll('line');
      expect(lines.length).toBeGreaterThan(0);
      // Head marker should not be collapsed at the center
      const headMarker = container.querySelector('g[filter="url(#glow)"] circle');
      expect(headMarker).toBeInTheDocument();
      const cx = Number(headMarker?.getAttribute('cx'));
      const cy = Number(headMarker?.getAttribute('cy'));
      // Center is (250, 250). At 270° (West), x should be far out to the left (near edge, ~28), not ~250
      expect(cx).toBeLessThan(100);
      expect(cy).toBeCloseTo(250, 0);
    });

    it('interpolates dashboard template variable in displaySpeedUnit', () => {
      const now = Date.now();
      const frame = toDataFrame({
        fields: [
          {
            name: 'time',
            type: FieldType.time,
            values: [now - 1000, now],
          },
          {
            name: 'wind_dir',
            type: FieldType.number,
            values: [180, 270],
          },
          {
            name: 'wind_speed',
            type: FieldType.number,
            values: [10, 10], // 10 m/s
          },
        ],
      });

      const mockReplaceVariables = jest.fn((str: string) => {
        if (str === '$speed_unit') {
          return 'knots';
        }
        return str;
      });

      const { getByText } = render(
        <WindTrailPanel
          id={1}
          data={{
            series: [frame],
            state: LoadingState.Done,
            timeRange: {} as any,
          }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            inputSpeedUnit: 'm/s',
            displaySpeedUnit: '$speed_unit',
          }}
          width={500}
          height={500}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={mockReplaceVariables}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      // 10 m/s converted to knots = 19.4 kn
      expect(getByText(/19\.4 kn/i)).toBeInTheDocument();
      expect(mockReplaceVariables).toHaveBeenCalledWith('$speed_unit');
    });

    it('renders optional speed scale legend when showLegend is true', () => {
      const now = Date.now();
      const frame = toDataFrame({
        fields: [
          {
            name: 'time',
            type: FieldType.time,
            values: [now - 1000, now],
          },
          {
            name: 'wind_dir',
            type: FieldType.number,
            values: [180, 270],
          },
          {
            name: 'wind_speed',
            type: FieldType.number,
            values: [2.5, 15.0],
          },
        ],
      });

      const { getByText, container } = render(
        <WindTrailPanel
          id={1}
          data={{
            series: [frame],
            state: LoadingState.Done,
            timeRange: {} as any,
          }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            showLegend: true,
            legendPosition: 'bottom-right',
            scaleWidthBySpeed: true,
            colorMode: 'speed',
            speedScaleMode: 'fixed',
          }}
          width={500}
          height={500}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      // Legend title
      expect(getByText(/Speed \(m\/s\)/i)).toBeInTheDocument();
      // Default fixed max for m/s is 20 m/s
      expect(getByText(/20 m\/s/i)).toBeInTheDocument();
      // Polygon for thickness scale wedge
      expect(container.querySelector('polygon')).toBeInTheDocument();
      // Windy gradient has 8 stops
      const stops = container.querySelectorAll('linearGradient stop');
      expect(stops.length).toBe(8);
    });

    it('renders dynamic bounds when speedScaleMode is auto', () => {
      const now = Date.now();
      const frame = toDataFrame({
        fields: [
          {
            name: 'time',
            type: FieldType.time,
            values: [now - 1000, now],
          },
          {
            name: 'wind_dir',
            type: FieldType.number,
            values: [180, 270],
          },
          {
            name: 'wind_speed',
            type: FieldType.number,
            values: [2.5, 15.0],
          },
        ],
      });

      const { getByText } = render(
        <WindTrailPanel
          id={1}
          data={{
            series: [frame],
            state: LoadingState.Done,
            timeRange: {} as any,
          }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            showLegend: true,
            colorMode: 'speed',
            speedScaleMode: 'auto',
          }}
          width={500}
          height={500}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      // In auto mode, scales to data max (15 m/s)
      expect(getByText(/15 m\/s/i)).toBeInTheDocument();
    });

    it('renders custom bounds when fixedSpeedMax is provided', () => {
      const now = Date.now();
      const frame = toDataFrame({
        fields: [
          {
            name: 'time',
            type: FieldType.time,
            values: [now - 1000, now],
          },
          {
            name: 'wind_dir',
            type: FieldType.number,
            values: [180, 270],
          },
          {
            name: 'wind_speed',
            type: FieldType.number,
            values: [2.5, 15.0],
          },
        ],
      });

      const { getByText, container } = render(
        <WindTrailPanel
          id={1}
          data={{
            series: [frame],
            state: LoadingState.Done,
            timeRange: {} as any,
          }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            showLegend: true,
            colorMode: 'speed',
            speedScaleMode: 'fixed',
            fixedSpeedMax: 40,
            colorPalette: 'standard',
            scaleWidthBySpeed: true,
          }}
          width={500}
          height={500}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      // Overridden max: 40 m/s
      expect(getByText(/40 m\/s/i)).toBeInTheDocument();
      // Standard palette has 6 stops
      const stops = container.querySelectorAll('linearGradient stop');
      expect(stops.length).toBe(6);
    });

    it('downsamples data points according to maxDataPoints in component rendering', () => {
      const now = Date.now();
      const count = 200;
      const frame = toDataFrame({
        fields: [
          {
            name: 'time',
            type: FieldType.time,
            values: Array.from({ length: count }, (_, i) => now - (count - i) * 10000),
          },
          {
            name: 'wind_dir',
            type: FieldType.number,
            values: Array.from({ length: count }, (_, i) => (i * 10) % 360),
          },
          {
            name: 'wind_speed',
            type: FieldType.number,
            values: Array.from({ length: count }, (_, i) => 5 + (i % 5)),
          },
        ],
      });

      const { container } = render(
        <WindTrailPanel
          id={1}
          data={{
            series: [frame],
            state: LoadingState.Done,
            timeRange: {} as any,
          }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            maxDataPoints: 25,
          }}
          width={500}
          height={500}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      // Trajectory segments count should be <= 25
      const segments = container.querySelectorAll('path[stroke]');
      expect(segments.length).toBeLessThanOrEqual(25);
      expect(segments.length).toBeGreaterThan(5);
    });

    it('auto-hides intermediate dots when point count is dense', () => {
      const now = Date.now();
      const count = 90; // > 80 threshold
      const frame = toDataFrame({
        fields: [
          {
            name: 'time',
            type: FieldType.time,
            values: Array.from({ length: count }, (_, i) => now - (count - i) * 10000),
          },
          {
            name: 'wind_dir',
            type: FieldType.number,
            values: Array.from({ length: count }, (_, i) => (i * 10) % 360),
          },
          {
            name: 'wind_speed',
            type: FieldType.number,
            values: Array.from({ length: count }, () => 10),
          },
        ],
      });

      // 1. With autoHidePoints: true (default)
      const { container: containerHidden } = render(
        <WindTrailPanel
          id={1}
          data={{
            series: [frame],
            state: LoadingState.Done,
            timeRange: {} as any,
          }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            maxDataPoints: 0, // Keep all 90 points
            showPoints: true,
            autoHidePoints: true,
          }}
          width={500}
          height={500}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      // Intermediate dots should be suppressed (only latest point dot + head marker circles rendered)
      const circlesHidden = containerHidden.querySelectorAll('circle');
      expect(circlesHidden.length).toBeLessThan(10);

      // 2. With autoHidePoints: false, all 90 dots should be rendered
      const { container: containerVisible } = render(
        <WindTrailPanel
          id={2}
          data={{
            series: [frame],
            state: LoadingState.Done,
            timeRange: {} as any,
          }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            maxDataPoints: 0,
            showPoints: true,
            autoHidePoints: false,
          }}
          width={500}
          height={500}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      const circlesVisible = containerVisible.querySelectorAll('circle');
      expect(circlesVisible.length).toBeGreaterThanOrEqual(90);
    });

    it('renders right sidebar layout on wide panels when infoPlacement is auto', () => {
      const now = Date.now();
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [now - 60000, now] },
          { name: 'wind_dir', type: FieldType.number, values: [180, 270] },
          { name: 'wind_speed', type: FieldType.number, values: [12, 18] },
        ],
      });

      // Wide panel: width 500, height 300 (aspect ratio 1.67)
      const { container, getByText } = render(
        <WindTrailPanel
          id={1}
          data={{ series: [frame], state: LoadingState.Done, timeRange: {} as any }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            infoPlacement: 'auto',
            showLegend: true,
            showCurrent: true,
          }}
          width={500}
          height={300}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      // Current Wind card in sidebar
      expect(getByText('Current Wind')).toBeInTheDocument();
      expect(getByText(/270°/)).toBeInTheDocument();
      expect(container.textContent).toContain('270°');
      expect(container.textContent).toContain('18.0 m/s');

      // Legend in sidebar
      expect(getByText(/Speed \(m\/s\)/i)).toBeInTheDocument();

      // SVG should be allocated compass width, less than total width 500
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(Number(svg?.getAttribute('width'))).toBeLessThan(500);
      expect(Number(svg?.getAttribute('width'))).toBeGreaterThanOrEqual(340);
    });

    it('renders bottom bar layout when infoPlacement is bottom', () => {
      const now = Date.now();
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [now - 60000, now] },
          { name: 'wind_dir', type: FieldType.number, values: [90, 135] },
          { name: 'wind_speed', type: FieldType.number, values: [5, 10] },
        ],
      });

      const { container, getByText } = render(
        <WindTrailPanel
          id={1}
          data={{ series: [frame], state: LoadingState.Done, timeRange: {} as any }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            infoPlacement: 'bottom',
            showLegend: true,
            showCurrent: true,
          }}
          width={400}
          height={400}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      expect(getByText(/Current:/i)).toBeInTheDocument();
      expect(getByText(/135°/)).toBeInTheDocument();
      expect(getByText(/Speed \(m\/s\)/i)).toBeInTheDocument();

      // SVG height should be less than 400 to reserve space for bottom bar
      const svg = container.querySelector('svg');
      expect(Number(svg?.getAttribute('height'))).toBeLessThan(400);
    });

    it('hides current wind readout when showCurrent is false', () => {
      const now = Date.now();
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [now - 60000, now] },
          { name: 'wind_dir', type: FieldType.number, values: [90, 135] },
          { name: 'wind_speed', type: FieldType.number, values: [5, 10] },
        ],
      });

      const { queryByText } = render(
        <WindTrailPanel
          id={1}
          data={{ series: [frame], state: LoadingState.Done, timeRange: {} as any }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            showCurrent: false,
            showLegend: false,
          }}
          width={400}
          height={400}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      expect(queryByText(/Current/i)).toBeNull();
    });

    describe('computeDirectionSector', () => {
      it('returns 0 for empty array', () => {
        expect(computeDirectionSector([])).toEqual({ startDir: 0, endDir: 0, spanDeg: 0 });
      });

      it('returns identical start and end for single point', () => {
        expect(computeDirectionSector([180])).toEqual({ startDir: 180, endDir: 180, spanDeg: 0 });
      });

      it('calculates sector without crossing North', () => {
        const sector = computeDirectionSector([180, 190, 210]);
        expect(sector.startDir).toBe(180);
        expect(sector.endDir).toBe(210);
        expect(sector.spanDeg).toBe(30);
      });

      it('calculates sector crossing North correctly', () => {
        const sector = computeDirectionSector([340, 350, 10, 20]);
        expect(sector.startDir).toBe(340);
        expect(sector.endDir).toBe(20);
        expect(sector.spanDeg).toBe(40);
      });

      it('handles turning from 270° through North to 100°', () => {
        const sector = computeDirectionSector([270, 310, 350, 40, 100]);
        expect(sector.startDir).toBe(270);
        expect(sector.endDir).toBe(100);
        expect(sector.spanDeg).toBe(190);
      });

      it('handles turning from 100° through South to 270°', () => {
        const sector = computeDirectionSector([100, 160, 220, 270]);
        expect(sector.startDir).toBe(100);
        expect(sector.endDir).toBe(270);
        expect(sector.spanDeg).toBe(170);
      });

      it('filters out calm readings (speed 0) that distort the directional turning corridor', () => {
        const sector = computeDirectionSector(
          [270, 310, 0, 100],
          [5, 5, 0, 5]
        );
        expect(sector.startDir).toBe(270);
        expect(sector.endDir).toBe(100);
        expect(sector.spanDeg).toBe(190);
      });

      it('handles dead calm throughout the time window gracefully', () => {
        const sector = computeDirectionSector(
          [0, 0, 0],
          [0, 0, 0],
          true
        );
        expect(sector).toEqual({ startDir: 0, endDir: 0, spanDeg: 0 });
      });

      it('handles full 360 degree rotation across all compass directions', () => {
        const sector = computeDirectionSector([210, 310, 100, 160, 270, 360]);
        expect(sector.spanDeg).toBe(360);
        expect(sector.startDir).toBe(0);
        expect(sector.endDir).toBe(360);
      });
    });

    describe('buildSectorPath', () => {
      it('returns empty string for non-positive span', () => {
        expect(buildSectorPath(100, 100, 50, 80, 0, 0, 0)).toBe('');
      });

      it('generates annular rim path', () => {
        const path = buildSectorPath(100, 100, 70, 80, 0, 90, 90);
        expect(path).toContain('M');
        expect(path).toContain('A 80 80');
        expect(path).toContain('A 70 70');
        expect(path).toContain('Z');
      });

      it('generates radial wedge path when rInner is 0', () => {
        const path = buildSectorPath(100, 100, 0, 80, 0, 90, 90);
        expect(path).toContain('M 100.00 100.00');
        expect(path).toContain('A 80 80');
        expect(path).toContain('Z');
      });

      it('handles 360 degree full circle annular ring', () => {
        const path = buildSectorPath(100, 100, 70, 80, 0, 360, 360);
        expect(path).toContain('M');
        expect(path).toContain('A 80 80');
        expect(path).toContain('A 70 70');
      });

      it('handles 360 degree full circle radial wedge disk (rInner = 0)', () => {
        const path = buildSectorPath(100, 100, 0, 80, 0, 360, 360);
        expect(path).toContain('M');
        expect(path).toContain('A 80 80');
        expect(path).not.toContain('A 0 0');
      });
    });

    it('renders wind direction sector when showAngleSector is true', () => {
      const now = Date.now();
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [now - 60000, now - 30000, now] },
          { name: 'wind_dir', type: FieldType.number, values: [340, 0, 20] },
          { name: 'wind_speed', type: FieldType.number, values: [5, 8, 12] },
        ],
      });

      const { getByTestId } = render(
        <WindTrailPanel
          id={1}
          data={{ series: [frame], state: LoadingState.Done, timeRange: {} as any }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            showAngleSector: true,
            sectorStyle: 'rim',
            sectorColor: '#38bdf8',
          }}
          width={400}
          height={400}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      expect(getByTestId('windtrail-sector')).toBeInTheDocument();
    });

    it('renders wind direction sector with sectorStyle lines (transparent background and radial lines)', () => {
      const now = Date.now();
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [now - 60000, now - 30000, now] },
          { name: 'wind_dir', type: FieldType.number, values: [270, 310, 100] },
          { name: 'wind_speed', type: FieldType.number, values: [5, 8, 12] },
        ],
      });

      const { getByTestId, container } = render(
        <WindTrailPanel
          id={1}
          data={{ series: [frame], state: LoadingState.Done, timeRange: {} as any }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            showAngleSector: true,
            sectorStyle: 'lines',
            sectorColor: '#38bdf8',
          }}
          width={400}
          height={400}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      const sectorGroup = getByTestId('windtrail-sector');
      expect(sectorGroup).toBeInTheDocument();
      const path = sectorGroup.querySelector('path');
      expect(path).toHaveAttribute('fill', 'transparent');
      expect(path).toHaveAttribute('stroke', 'none');

      const lines = sectorGroup.querySelectorAll('line');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toHaveAttribute('stroke', '#38bdf8');
      expect(lines[1]).toHaveAttribute('stroke', '#38bdf8');
    });

    it('renders min and max speed statistics when showSpeedMinMax is true', () => {
      const now = Date.now();
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [now - 60000, now - 30000, now] },
          { name: 'wind_dir', type: FieldType.number, values: [180, 190, 200] },
          { name: 'wind_speed', type: FieldType.number, values: [2.5, 7.0, 14.2] },
        ],
      });

      const { getByTestId, getByText, getAllByText } = render(
        <WindTrailPanel
          id={1}
          data={{ series: [frame], state: LoadingState.Done, timeRange: {} as any }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            infoPlacement: 'right',
            showSpeedMinMax: true,
            showSpeedAvg: true,
            showAngleSector: true,
          }}
          width={600}
          height={400}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      expect(getByTestId('windtrail-sidebar-stats')).toBeInTheDocument();
      expect(getByText(/Dir Range:/i)).toBeInTheDocument();
      expect(getByText(/Speed Min:/i)).toBeInTheDocument();
      expect(getByText(/Speed Max:/i)).toBeInTheDocument();
      expect(getByText(/Speed Avg:/i)).toBeInTheDocument();
      expect(getByText(/2.5 m\/s/i)).toBeInTheDocument();
      expect(getAllByText(/14.2 m\/s/i)).toHaveLength(2);
    });

    it('renders min and max speed pins on legend when showLegendPins is true', () => {
      const now = Date.now();
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [now - 60000, now] },
          { name: 'wind_dir', type: FieldType.number, values: [180, 200] },
          { name: 'wind_speed', type: FieldType.number, values: [3, 15] },
        ],
      });

      const { getByTestId } = render(
        <WindTrailPanel
          id={1}
          data={{ series: [frame], state: LoadingState.Done, timeRange: {} as any }}
          timeRange={{} as any}
          onFieldConfigChange={jest.fn()}
          options={{
            ...defaultOptions,
            showLegend: true,
            showLegendPins: true,
          }}
          width={400}
          height={400}
          fieldConfig={{} as any}
          renderCounter={0}
          title="Wind Trail"
          transparent={false}
          replaceVariables={(s) => s}
          onOptionsChange={jest.fn()}
          eventBus={{} as any}
          timeZone="browser"
          onChangeTimeRange={jest.fn()}
        />
      );

      expect(getByTestId('windtrail-legend-pins')).toBeInTheDocument();
    });
  });
});


