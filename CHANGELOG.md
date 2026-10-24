# Changelog

## 1.3.5

### Fixes
- **Speed scale legend**: pins are now placed linearly across the full bar width, so they line up with the tick labels.
- **Speed scale legend**: tick labels sit at their true positions on the bar. The unit is no longer repeated on the max tick, as the legend title already shows it.
- **Beaufort legend**: labelled every 3 steps (every 2 on smaller scales) instead of only 0 / 6 / 12.

## 1.3.0

### Features & Enhancements
- **Wind Direction Variation Sector (`showAngleSector`)**: Visualizes the directional variability corridor over the selected time range:
  - **Shortest-Angle Chronological Tracking**: Accurately tracks directional shifts across North ($0^\circ/360^\circ$, e.g. turning from $270^\circ$ through North to $110^\circ$) by unwrapping angles in chronological order.
  - **Calm Speed Filtering**: Automatically filters out calm wind readings (speed = 0) that carry no meaningful direction to prevent distorted sector spans.
  - **Three Visual Styles (`sectorStyle`)**:
    - `'rim'` (Default): Annular rim arc hugging the outer edge of the compass rose with radial boundary ticks.
    - `'wedge'`: Translucent pie/donut wedge across the compass dial.
    - `'lines'`: Two radial sector boundary lines from center to perimeter with transparent background.
  - Configurable sector color via dedicated color picker.
- **Min & Max Wind Speed Telemetry (`showSpeedMinMax`)**:
  - **Sidebar Mode**: Dedicated readouts for Direction Range, Min Speed, Max Speed (highlighted in red), and Average Speed.
  - **Bottom Bar Mode**: Inline compact range badges.
  - **Overlay HUD Mode**: Integrated Min & Max speed readout.
- **Speed Scale Legend Pins (`showLegendPins`)**: Interactive min (blue) and max (red) indicator pins directly on the speed scale legend gradient bar.
- **Speed Scale Legend Shape Option (`legendShape`)**: Added choice between the classic tapering triangle (`'triangle'`) and a modern uniform rectangle (`'rectangle'`).
- **Boundary Containment**: Constrained legend bars and indicator pin markers strictly within card boundaries to prevent visual clipping or overflow.

## 1.2.0

### Features & Enhancements
- **Responsive Multi-Mode Layout (`infoPlacement`)**: Intelligent layout engine that automatically adapts compass rose geometry and telemetry positioning based on panel aspect ratio and screen size:
  - **Wide Panels (Right Sidebar)**: On landscape panels (`aspectRatio >= 1.22`), the compass rose is sized to 100% of available height on the left, while Current Wind telemetry and the Speed Scale Legend are stacked cleanly in a dedicated right sidebar. Eliminates horizontal dead space and keeps the compass rose unobstructed.
  - **Square & Compact Panels (Bottom Bar)**: On square, tall, or small widgets, Current Wind and the Speed Scale Legend are arranged side-by-side along a compact bottom bar below the compass rose. Dynamic radius clamping ensures the scale legend never overlaps the compass rose or wind trail.
  - **Auto-Compact Readout**: When panel width is under 300px, indicators seamlessly condense into micro-pills (`● 190° (S) 5.2 kn`) with compact scale bars (60–75px) to guarantee zero clipping or overflow.
- **Show/Hide Current Telemetry Switch (`showCurrent`)**: Added an explicit toggle under Latest Marker options to show or hide the live direction and speed readout.

## 1.1.0

### Features & Enhancements
- **Circular Vector Downsampling (`maxDataPoints`)**: Added intelligent meteorological downsampling for dense datasets and long time horizons (e.g. 24 hours or 7 days of 1-minute data). Downsamples intermediate points using circular vector averaging ($\sin/\cos$ components weighted by wind speed), eliminating North-crossing wrapping errors ($350^\circ \leftrightarrow 10^\circ$) and preventing trajectory clutter while preserving the exact latest observation and time bounds.
- **Fixed Speed Range & Cross-Panel Comparability (`speedScaleMode`)**: Added standard meteorological scale options (`fixed`, `auto`, `custom`) and intelligent unit defaults (e.g. 0–60 km/h, 0–20 m/s, 0–40 kn, 0–12 Bft, 0–45 mph). Enables immediate visual comparability across different panels and timeframes without color scaling fluctuations caused by transient query extremes.
- **Windy App Color Palette (`colorPalette: 'windy'`)**: Added authentic continuous multi-stop meteorological gradient inspired by Windy.com, mapping seamlessly from light sky blue (calm) through emerald, lime, amber, orange, vivid red (gale), purple, to magenta (storm).
- **Polar Spiral Trajectory Arcs (`curveMode: 'polar'`)**: Trajectory paths follow circular compass arcs while smoothly expanding radially with time drift. When wind direction is steady ($\Delta\theta < 1^\circ$), the path advances cleanly along that radial angle spoke without artificial polynomial spline kinks or overshoot. Straight Cartesian chords (`'linear'`) remain available as an option.
- **Live Unit Conversion & Dashboard Variables**: Built-in conversion between `m/s`, `km/h`, `knots`, `mph`, and `Beaufort (Bft)` scale with template variable interpolation (e.g. `$speed_unit`).
- **Dynamic Speed & Thickness Scale Legend**: Overlay legend with dynamic SVG linear gradient reflecting the active color palette and tick labels indicating lower, midpoint, and upper bounds in the active unit.
- **Automatic Measurement Dot Decluttering (`autoHidePoints`)**: Automatically suppresses intermediate point dots when data density is high (> 80 points) to keep the trajectory ribbon legible, while always retaining the prominent glowing red marker at the latest observation.

## 1.0.0

Initial release of Wind Direction Trail Panel.
