export type TimeDirection = 'center-to-edge' | 'edge-to-center';
export type TimeRangeSource = 'dashboard' | 'data';
export type SpokeCount = 4 | 8 | 16;
export type ColorMode = 'speed' | 'solid';
export type SpeedUnit = 'auto' | 'm/s' | 'km/h' | 'knots' | 'mph' | 'ft/s' | (string & {});
export type DisplaySpeedUnit = 'same' | 'm/s' | 'km/h' | 'knots' | 'mph' | 'bft' | 'ft/s' | (string & {});
export type LegendPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'bottom-center';

export interface WindTrailOptions {
  timeDirection: TimeDirection;
  timeRangeSource?: TimeRangeSource;
  spokeCount: SpokeCount;
  ringCount: number;
  strokeWidth: number;
  scaleWidthBySpeed: boolean;
  fadeWidthOverTime: boolean;
  minStrokeWidth: number;
  maxStrokeWidth: number;
  fadeOverTime: boolean;
  minOpacity: number;
  colorMode: ColorMode;
  solidColor: string;
  showPoints: boolean;
  pointRadius: number;
  showHeadMarker: boolean;
  headMarkerColor: string;
  showTimeLabels: boolean;
  showCardinalLabels: boolean;
  directionFieldName?: string;
  speedFieldName?: string;
  inputSpeedUnit?: SpeedUnit;
  displaySpeedUnit?: DisplaySpeedUnit;
  speedUnit: string;
  speedMin?: number;
  speedMax?: number;
  showLegend?: boolean;
  legendPosition?: LegendPosition;
}
