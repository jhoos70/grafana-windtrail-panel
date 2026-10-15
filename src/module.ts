import { PanelPlugin } from '@grafana/data';
import { WindTrailOptions } from './types';
import { WindTrailPanel } from './components/WindTrailPanel';

export const plugin = new PanelPlugin<WindTrailOptions>(WindTrailPanel).setPanelOptions((builder) => {
  return (
    builder
      // --- Layout & Coordinates ---
      .addRadio({
        category: ['Layout & Coordinates'],
        path: 'timeDirection',
        name: 'Time direction',
        description: 'Choose whether time flows outwards from center or inwards',
        defaultValue: 'center-to-edge',
        settings: {
          options: [
            { value: 'center-to-edge', label: 'Center (Oldest) → Rim (Latest)' },
            { value: 'edge-to-center', label: 'Rim (Oldest) → Center (Latest)' },
          ],
        },
      })
      .addRadio({
        category: ['Layout & Coordinates'],
        path: 'timeRangeSource',
        name: 'Time range bounds',
        description: 'Choose whether radial bounds match the Dashboard Time Picker or the returned Data bounds',
        defaultValue: 'data',
        settings: {
          options: [
            { value: 'data', label: 'Data Points (scales strictly to first & last data points)' },
            { value: 'dashboard', label: 'Dashboard Time Range (aligns with dashboard picker)' },
          ],
        },
      })
      .addSelect({
        category: ['Layout & Coordinates'],
        path: 'spokeCount',
        name: 'Compass spokes',
        description: 'Number of directional spokes and labels to display',
        defaultValue: 8,
        settings: {
          options: [
            { value: 4, label: '4 Directions (N, E, S, W)' },
            { value: 8, label: '8 Directions (N, NE, E, SE, S, SW, W, NW)' },
            { value: 16, label: '16 Compass Points' },
          ],
        },
      })
      .addSliderInput({
        category: ['Layout & Coordinates'],
        path: 'ringCount',
        name: 'Time rings',
        description: 'Number of concentric time rings to draw',
        defaultValue: 4,
        settings: {
          min: 2,
          max: 8,
          step: 1,
        },
      })
      .addBooleanSwitch({
        category: ['Layout & Coordinates'],
        path: 'showCardinalLabels',
        name: 'Show compass labels',
        defaultValue: true,
      })
      .addBooleanSwitch({
        category: ['Layout & Coordinates'],
        path: 'showTimeLabels',
        name: 'Show time ring labels',
        defaultValue: true,
      })

      // --- Trail Styling ---
      // 1. Fading / Opacity Controls
      .addBooleanSwitch({
        category: ['Trail Styling'],
        path: 'fadeOverTime',
        name: 'Fade trail opacity over time',
        description: 'Older trajectory segments fade into the background so recent observations stand out',
        defaultValue: true,
      })
      .addSliderInput({
        category: ['Trail Styling'],
        path: 'minOpacity',
        name: 'Past trail opacity',
        description: 'Opacity of the oldest points (0.05 = faint ghost, 0.5 = clearly visible)',
        defaultValue: 0.18,
        settings: {
          min: 0.05,
          max: 0.6,
          step: 0.05,
        },
        showIf: (config) => Boolean(config.fadeOverTime),
      })

      // Trajectory Curve Interpolation
      .addRadio({
        category: ['Trail Styling'],
        path: 'curveMode',
        name: 'Trajectory curve',
        description:
          'Choose whether the wind trail follows the circular compass arc (radial spiral with time drift) or connects points via straight chords',
        defaultValue: 'polar',
        settings: {
          options: [
            { value: 'polar', label: 'Follow compass arc (radial spiral with time drift)' },
            { value: 'linear', label: 'Straight chords (direct Cartesian lines)' },
          ],
        },
      })

      // 2. Line Thickness Controls
      .addBooleanSwitch({
        category: ['Trail Styling'],
        path: 'scaleWidthBySpeed',
        name: 'Vary thickness by wind speed',
        description: 'Scale line thickness dynamically based on wind speed (thinner when calm, thicker in strong wind)',
        defaultValue: false,
      })
      .addBooleanSwitch({
        category: ['Trail Styling'],
        path: 'fadeWidthOverTime',
        name: 'Taper thickness over time',
        description: 'Gradually thin out past segments toward the center like a comet tail',
        defaultValue: false,
      })
      .addSliderInput({
        category: ['Trail Styling'],
        path: 'minStrokeWidth',
        name: 'Minimum line width',
        defaultValue: 1.5,
        settings: {
          min: 0.5,
          max: 5,
          step: 0.5,
        },
        showIf: (config) => Boolean(config.scaleWidthBySpeed || config.fadeWidthOverTime),
      })
      .addSliderInput({
        category: ['Trail Styling'],
        path: 'maxStrokeWidth',
        name: 'Maximum line width',
        defaultValue: 7,
        settings: {
          min: 3,
          max: 16,
          step: 0.5,
        },
        showIf: (config) => Boolean(config.scaleWidthBySpeed || config.fadeWidthOverTime),
      })
      .addSliderInput({
        category: ['Trail Styling'],
        path: 'strokeWidth',
        name: 'Fixed line width',
        defaultValue: 2.5,
        settings: {
          min: 1,
          max: 8,
          step: 0.5,
        },
        showIf: (config) => !config.scaleWidthBySpeed && !config.fadeWidthOverTime,
      })

      // 3. Color Controls
      .addRadio({
        category: ['Trail Styling'],
        path: 'colorMode',
        name: 'Color palette',
        description: 'Choose whether color represents wind speed or a single customizable color',
        defaultValue: 'speed',
        settings: {
          options: [
            { value: 'speed', label: 'Color by wind speed (multi-color)' },
            { value: 'solid', label: 'Single color' },
          ],
        },
      })
      .addRadio({
        category: ['Trail Styling'],
        path: 'colorPalette',
        name: 'Speed color palette',
        description: 'Color theme used for wind speed scale',
        defaultValue: 'windy',
        settings: {
          options: [
            { value: 'windy', label: 'Windy (Smooth blue-green-yellow-orange-red-purple)' },
            { value: 'standard', label: 'Standard Weather (Discrete bands)' },
          ],
        },
        showIf: (config) => config.colorMode === 'speed',
      })
      .addColorPicker({
        category: ['Trail Styling'],
        path: 'solidColor',
        name: 'Trail color',
        defaultValue: '#38bdf8',
        showIf: (config) => config.colorMode === 'solid',
      })
      .addBooleanSwitch({
        category: ['Trail Styling'],
        path: 'showPoints',
        name: 'Show data points',
        defaultValue: true,
      })
      .addBooleanSwitch({
        category: ['Trail Styling'],
        path: 'autoHidePoints',
        name: 'Auto-hide dots when dense',
        description:
          'Automatically hides intermediate measurement dots when there are many points to keep the chart clean',
        defaultValue: true,
        showIf: (config) => config.showPoints,
      })
      .addSliderInput({
        category: ['Trail Styling'],
        path: 'pointRadius',
        name: 'Data point radius',
        defaultValue: 2.5,
        settings: {
          min: 1,
          max: 6,
          step: 0.5,
        },
        showIf: (config) => config.showPoints,
      })

      // --- Head Marker ---
      .addBooleanSwitch({
        category: ['Latest Marker'],
        path: 'showHeadMarker',
        name: 'Highlight current wind direction',
        description: 'Draw an emphasized marker at the most recent data point',
        defaultValue: true,
      })
      .addColorPicker({
        category: ['Latest Marker'],
        path: 'headMarkerColor',
        name: 'Marker color',
        defaultValue: '#ef4444',
        showIf: (config) => config.showHeadMarker,
      })
      .addBooleanSwitch({
        category: ['Latest Marker'],
        path: 'showCurrent',
        name: 'Show current wind reading',
        description: 'Display live direction and speed readout (Current: 295° WNW 14 km/h)',
        defaultValue: true,
      })

      // --- Field Mapping ---
      .addFieldNamePicker({
        category: ['Field Mapping'],
        path: 'directionFieldName',
        name: 'Wind direction field',
        description: 'Field containing degrees (0-360). If unset, auto-detected from data.',
      })
      .addFieldNamePicker({
        category: ['Field Mapping'],
        path: 'speedFieldName',
        name: 'Wind speed field',
        description: 'Optional field containing wind speed. Used for coloring and tooltips.',
      })
      .addNumberInput({
        category: ['Field Mapping'],
        path: 'maxDataPoints',
        name: 'Max points limit (vector downsampling)',
        description:
          'Maximum number of trajectory points to display (default: 150). When data exceeds this limit, points are downsampled using circular vector averaging. Set to 0 to disable.',
        defaultValue: 150,
      })
      .addSelect({
        category: ['Field Mapping'],
        path: 'inputSpeedUnit',
        name: 'Supplied speed unit',
        description: 'The unit of the incoming wind speed data. Supports dashboard variables (e.g. $input_unit)',
        defaultValue: 'auto',
        settings: {
          allowCustomValue: true,
          options: [
            { value: 'auto', label: 'Auto-detect from field config (default m/s)' },
            { value: 'm/s', label: 'Meters per second (m/s)' },
            { value: 'km/h', label: 'Kilometers per hour (km/h)' },
            { value: 'knots', label: 'Knots (kn)' },
            { value: 'mph', label: 'Miles per hour (mph)' },
            { value: 'ft/s', label: 'Feet per second (ft/s)' },
          ],
        },
      })
      .addSelect({
        category: ['Field Mapping'],
        path: 'displaySpeedUnit',
        name: 'Display speed unit',
        description: 'The target unit to convert to and display. Supports dashboard variables (e.g. $speed_unit)',
        defaultValue: 'same',
        settings: {
          allowCustomValue: true,
          options: [
            { value: 'same', label: 'Same as supplied (no conversion)' },
            { value: 'm/s', label: 'Meters per second (m/s)' },
            { value: 'km/h', label: 'Kilometers per hour (km/h)' },
            { value: 'knots', label: 'Knots (kn)' },
            { value: 'mph', label: 'Miles per hour (mph)' },
            { value: 'bft', label: 'Beaufort scale (Bft)' },
            { value: 'ft/s', label: 'Feet per second (ft/s)' },
          ],
        },
      })
      .addTextInput({
        category: ['Field Mapping'],
        path: 'speedUnit',
        name: 'Custom speed unit label',
        description:
          'Optional custom suffix override. If left empty or using auto-conversion, standard abbreviation is used.',
        defaultValue: '',
        showIf: (config) => config.displaySpeedUnit === 'same' || !config.displaySpeedUnit,
      })
      .addRadio({
        category: ['Field Mapping'],
        path: 'speedScaleMode',
        name: 'Speed scale & legend range',
        description:
          'Choose whether color & legend use a fixed meteorological range (for comparing multiple panels) or adapt to data',
        defaultValue: 'fixed',
        settings: {
          options: [
            { value: 'fixed', label: 'Fixed range (comparable across panels, e.g. 0-60 km/h or 0-12 Bft)' },
            { value: 'auto', label: 'Dynamic (scales strictly to min & max speeds in current data)' },
            { value: 'custom', label: 'Custom range (enter exact min & max below)' },
          ],
        },
      })
      .addNumberInput({
        category: ['Field Mapping'],
        path: 'fixedSpeedMax',
        name: 'Fixed scale maximum override',
        description:
          'Optional override for the fixed upper bound (defaults: 60 km/h, 20 m/s, 40 kn, 12 Bft, 45 mph).',
        showIf: (config) => config.speedScaleMode === 'fixed',
      })
      .addNumberInput({
        category: ['Field Mapping'],
        path: 'speedMin',
        name: 'Custom scale minimum',
        description: 'Fixed lower bound for speed color and width scaling (e.g. 0).',
        showIf: (config) => config.speedScaleMode === 'custom',
      })
      .addNumberInput({
        category: ['Field Mapping'],
        path: 'speedMax',
        name: 'Custom scale maximum',
        description: 'Fixed upper bound for speed color and width scaling (e.g. 50).',
        showIf: (config) => config.speedScaleMode === 'custom',
      })

      // --- Legend & Layout ---
      .addSelect({
        category: ['Legend & Layout'],
        path: 'infoPlacement',
        name: 'Layout / info placement',
        description: 'Positioning for current wind reading and speed scale legend',
        defaultValue: 'auto',
        settings: {
          options: [
            { value: 'auto', label: 'Auto (Right sidebar when wide, compact when small)' },
            { value: 'right', label: 'Right sidebar (Compass left, info right)' },
            { value: 'bottom', label: 'Bottom bar (Compass top, info bottom)' },
            { value: 'overlay', label: 'Overlay (Floating badges over compass)' },
          ],
        },
      })
      .addBooleanSwitch({
        category: ['Legend & Layout'],
        path: 'showLegend',
        name: 'Show speed scale legend',
        description: 'Display a scale legend showing the wind speed color scale and thickness',
        defaultValue: false,
      })
      .addSelect({
        category: ['Legend & Layout'],
        path: 'legendPosition',
        name: 'Overlay legend position',
        description: 'Position of the scale legend when in overlay mode',
        defaultValue: 'bottom-right',
        settings: {
          options: [
            { value: 'bottom-right', label: 'Bottom Right' },
            { value: 'bottom-left', label: 'Bottom Left' },
            { value: 'top-right', label: 'Top Right' },
            { value: 'bottom-center', label: 'Bottom Center' },
          ],
        },
        showIf: (config) => Boolean(config.showLegend) && (config.infoPlacement === 'overlay' || !config.infoPlacement),
      })
  );
});
