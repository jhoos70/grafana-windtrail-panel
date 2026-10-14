# Changelog

## 1.0.2

- **Fixed Speed Range & Cross-Panel Comparability**: Added `speedScaleMode` option ('fixed', 'auto', 'custom') ensuring multiple panels share an identical, comparable color and legend scale regardless of query timeframe or transient extremes.
- **Meteorological Fixed Scale Defaults**: Intelligently sets fixed upper bounds based on unit (e.g. 60 km/h, 20 m/s, 40 kn, 12 Bft, 45 mph) with manual override support (`fixedSpeedMax`).
- **Windy App Color Palette**: Added authentic multi-stop continuous meteorological gradient inspired by Windy.com (`colorPalette: 'windy'`) alongside legacy standard bands (`'standard'`).
- **Continuous RGB Interpolation**: Smooth gradient color mapping across arbitrary stops.

## 1.0.1

- **Smooth Polar Spline Curves**: Continuous Catmull-Rom polar spline curve interpolation bridging angular sweeps and time radially.
- **Unit Conversions & Dashboard Variable Support**: Added live conversion between m/s, km/h, knots, mph, and Beaufort scale with `$speed_unit` variable support.

## 1.0.0

Initial release of Wind Direction Trail Panel.
