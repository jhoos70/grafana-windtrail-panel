# Changelog

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
