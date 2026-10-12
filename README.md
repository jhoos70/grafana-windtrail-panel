# Wind Direction Trail Panel for Grafana

A custom Grafana panel plugin that visualizes **wind direction over time** in a 360° polar coordinate system (wind rose).

Instead of a traditional linear time-series chart—which suffers from awkward discontinuities whenever the wind fluctuates across North ($359^\circ \leftrightarrow 1^\circ$)—this panel maps **time radially** and **direction angularly**. The wind direction trajectory starts at the center and wanders outward over time (or vice versa), tracing a continuous polar trail.

---

## Features

- **360° Polar Trajectory**: Continuous line plotting compass angles ($0^\circ \text{ North}, 90^\circ \text{ East}, 180^\circ \text{ South}, 270^\circ \text{ West}$).
- **Time Rings**: Iso-time concentric rings with relative time labels (e.g., `-6h`, `-3h`, `-1h`, `Now`).
- **Compass Spokes & Cardinals**: Configurable 4, 8, or 16-point compass roses with cardinal direction labels.
- **Multiple Color Modes**:
  - **Time Gradient**: Fades from faint/translucent in the past to vivid and opaque at the present.
  - **Wind Speed**: Color-coded segments along the trajectory according to wind speed (Cyan $\to$ Green $\to$ Yellow $\to$ Orange $\to$ Red $\to$ Purple).
  - **Solid Color**: Customizable uniform color.
- **Current Direction Head Marker**: Glowing accent marker at the latest observation.
- **Real-Time HUD**: On-panel badge showing current direction, cardinal heading, and speed.
- **Interactive Tooltip**: Hover over any point to inspect exact timestamps, degrees, cardinal heading, and speed.
- **Flexible Field Mapping**: Auto-detects time, direction, and speed fields, or allows explicit selection from panel settings.

---

## Data Query Requirements

The panel works with any Grafana data source (Prometheus, InfluxDB, MySQL, PostgreSQL, CSV, etc.) returning a table or time-series frame with:

1. **Time field**: `time` (standard Unix timestamp / DateTime).
2. **Direction field**: Numeric degrees between $0^\circ$ and $360^\circ$ (e.g. `wind_dir`, `direction`, `bearing`, `heading`).
3. **Speed field (Optional)**: Numeric wind speed in m/s, knots, km/h, or mph (e.g. `wind_speed`, `velocity`).

---

## Panel Configuration Options

| Category                 | Option               | Description                                                                     |
| :----------------------- | :------------------- | :------------------------------------------------------------------------------ |
| **Layout & Coordinates** | `timeDirection`      | `Center → Rim` (oldest in center, newest at outer rim) or `Rim → Center`        |
|                          | `timeRangeSource`    | `data` (scales to first/last points, default) or `dashboard` (binds to picker)  |
|                          | `spokeCount`         | `4` (N, E, S, W), `8` (N, NE, E, SE, ...), or `16` points                       |
|                          | `ringCount`          | Number of concentric time rings (2 to 8)                                        |
|                          | `showCardinalLabels` | Toggle display of compass direction letters                                     |
|                          | `showTimeLabels`     | Toggle display of relative time labels on rings                                 |
| **Trail Styling**        | `fadeOverTime`       | Decoupled fading: older trajectory segments fade into the background           |
|                          | `minOpacity`         | Minimum opacity for the oldest points (0.05 to 0.6)                             |
|                          | `scaleWidthBySpeed`  | Dynamically scale line width based on wind speed (thinner when calm)             |
|                          | `fadeWidthOverTime`  | Taper line width over time toward the center (comet tail effect)                |
|                          | `minStrokeWidth`     | Minimum line width for calm wind (0.5 to 5 px)                                  |
|                          | `maxStrokeWidth`     | Maximum line width for storm/gale wind (3 to 16 px)                             |
|                          | `strokeWidth`        | Fixed line thickness (when variable thickness is disabled)                      |
|                          | `colorMode`          | `speed` (multi-color perceptual ramp) or `solid` (single customizable color)    |
|                          | `solidColor`         | Custom color when `colorMode` is `solid`                                        |
|                          | `showPoints`         | Toggle measurement dots along the trail                                         |
|                          | `pointRadius`        | Base radius of data point dots                                                  |
| **Latest Marker**        | `showHeadMarker`     | Highlight the most recent wind direction with a glowing marker                  |
|                          | `headMarkerColor`    | Accent color for the current wind direction marker (default: `#ef4444`)         |
| **Field Mapping**        | `directionFieldName` | Explicitly choose direction field (or auto-detect from names/units)             |
|                          | `speedFieldName`     | Explicitly choose speed field (or auto-detect from names/units)                 |
|                          | `inputSpeedUnit`     | Unit of incoming speed data (`auto`, `m/s`, `km/h`, `knots`, `mph`, `ft/s`)     |
|                          | `displaySpeedUnit`   | Target display unit (`same`, `m/s`, `km/h`, `knots`, `mph`, `bft`, `$var`)     |
|                          | `speedUnit`          | Optional custom suffix override when `displaySpeedUnit` is `same`               |
|                          | `speedMin`           | Manual lower bound for speed color & thickness scaling                          |
|                          | `speedMax`           | Manual upper bound for speed color & thickness scaling                          |
| **Legend**               | `showLegend`         | Toggle visual speed & thickness scale overlay legend                            |
|                          | `legendPosition`     | Placement: `bottom-right`, `bottom-left`, `top-right`, or `bottom-center`       |

---

## Development

```bash
# Install dependencies
npm install

# Run TypeScript checks
npm run typecheck

# Run unit tests
npm run test:ci

# Build production bundle into /dist
npm run build

# Start webpack in watch mode for development
npm run dev

# Start local Grafana development container
npm run server
```
