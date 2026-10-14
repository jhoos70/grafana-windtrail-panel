import React from 'react';
import { render } from '@testing-library/react';
import { WindTrailPanel, getCardinalLabel, convertSpeed, buildSegmentPath } from './WindTrailPanel';
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
      // Legend max tick
      expect(getByText(/15 m\/s/i)).toBeInTheDocument();
      // Polygon for thickness scale wedge
      expect(container.querySelector('polygon')).toBeInTheDocument();
    });
  });
});


