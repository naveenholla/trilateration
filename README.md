# Bluetooth Trilateration Simulator - RSSI Edition

**Version 1.2** - An interactive web-based simulator for understanding Bluetooth Low Energy (BLE) trilateration with realistic RSSI-to-distance conversion, powered by Three.js.

![Version](https://img.shields.io/badge/version-1.2-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Powered by](https://img.shields.io/badge/powered%20by-Three.js-black)

## Overview

This web application simulates realistic Bluetooth Low Energy (BLE) indoor positioning using RSSI (Received Signal Strength Indicator) measurements and trilateration algorithms. Unlike idealized geometric simulations, this tool uses the **log-distance path loss model** to convert signal strength into distance estimates, demonstrating real-world ranging errors and environmental effects.

**New in v1.2**: Enhanced rendering with Three.js WebGL for improved visual quality, better anti-aliasing, and hardware-accelerated graphics.

### Key Features

- **Realistic RSSI Simulation**: Uses path-loss model (RSSI = TxPower - 10·n·log₁₀(d))
- **Interactive Visualization**: Drag radios and device to explore different scenarios
- **Configurable Parameters**: Adjust Tx power, path-loss exponent, and noise levels
- **Real-time Trilateration**: See estimated vs. true position with error metrics
- **RSSI Heatmap**: Optional coverage visualization
- **Educational Tool**: Perfect for learning BLE positioning concepts

## Live Demo

Simply open `index.html` in a modern web browser. No build tools or server required!

## How It Works

### RSSI-to-Distance Model

The simulator uses the **log-distance path loss model**:

```
RSSI = TxPower - 10 × n × log₁₀(d)
```

Where:
- `RSSI`: Received signal strength (dBm)
- `TxPower`: Calibrated RSSI at 1 meter (default: -59 dBm)
- `n`: Path loss exponent (2.0 = free space, 2.7-3.5 = indoor)
- `d`: Distance in meters

**Distance Estimation** (inverse formula):

```
d = 10^((TxPower - RSSI) / (10 × n))
```

### Trilateration Algorithm

The simulator:
1. Calculates RSSI from each radio based on true distance
2. Converts RSSI → estimated distance using path-loss model
3. Draws circles with **radius = estimated distance** (not true distance)
4. Solves trilateration equations to find estimated position
5. Displays position error as vector between true and estimated positions

## Usage Guide

### Getting Started

1. **Open the Application**: Load `index.html` in your browser
2. **Observe Default Setup**: 4 radios positioned at corners, device in center
3. **Drag Elements**: Click and drag radios or device to reposition
4. **Adjust Settings**: Use left sidebar to modify RSSI parameters

### Controls

#### RSSI Model Settings

| Parameter | Description | Default | Range |
|-----------|-------------|---------|-------|
| **Tx Power @ 1m** | Signal strength at 1 meter | -59 dBm | -80 to -30 dBm |
| **Path Loss Exponent (n)** | Environmental factor | 2.7 | 2.0 to 4.0 |
| **Min RSSI Threshold** | Minimum detectable signal | -100 dBm | -120 to -60 dBm |

**Path Loss Exponent Guide**:
- `2.0`: Free space (outdoors, line-of-sight)
- `2.7 - 3.0`: Office environment
- `3.0 - 3.5`: Dense indoor (walls, furniture)
- `3.5 - 4.0`: Heavy obstruction

#### Optional Features

- **Enable RSSI Noise**: Add Gaussian noise (±3-8 dB) to simulate real-world variability
- **Show True Distance Lines**: Debug mode showing actual distances (dashed lines)
- **Enable RSSI Heatmap**: Color gradient overlay showing signal coverage
- **Number of Radios**: Choose 3-6 radios (minimum 3 for trilateration)

### Reading the Display

#### Canvas Elements

| Symbol | Meaning |
|--------|---------|
| 🟢 Green circles | Radios (transmitters) |
| 🔴 Red circle with cross | Device true position |
| 🔵 Blue circle | Estimated position from trilateration |
| Colored circles | RSSI ranging circles (radius = estimated distance) |
| Red dashed line | Position error vector |

#### Data Sidebar

**Radio Data Table**:
- **RSSI**: Signal strength at device (color-coded by strength)
  - 🟢 Green: ≥ -60 dBm (strong)
  - 🟠 Orange: -60 to -80 dBm (medium)
  - 🔴 Red: < -80 dBm (weak)
- **Est. Dist**: Distance estimated from RSSI
- **True Dist**: Actual Euclidean distance (for comparison)

**Position Data**:
- True position coordinates
- Estimated position coordinates
- Position error magnitude
- Number of active radios

## Example Scenarios

### Scenario 1: Free Space Simulation
```
Tx Power: -59 dBm
Path Loss (n): 2.0
Noise: Disabled
```
**Result**: Minimal error, circles closely match true distances

### Scenario 2: Indoor Office
```
Tx Power: -59 dBm
Path Loss (n): 2.7
Noise: Enabled (±5 dB)
```
**Result**: Moderate error (~0.5-2m), realistic BLE behavior

### Scenario 3: Dense Environment
```
Tx Power: -59 dBm
Path Loss (n): 3.5
Noise: Enabled (±7 dBm)
```
**Result**: Higher error, some radios may drop out (RSSI < -100 dBm)

## Technical Details

### File Structure

```
trilateration/
├── index.html      # Main HTML structure
├── styles.css      # UI styling
├── app.js          # Core simulation logic
└── README.md       # This file
```

### Browser Requirements

- Modern browser with WebGL support (for Three.js rendering)
- Tested on: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- No build tools required - Three.js loaded via CDN

### Dependencies

- **Three.js v0.160.0**: WebGL-based 3D/2D graphics library (loaded via CDN)

### Performance

- Hardware-accelerated WebGL rendering at 60 FPS
- RSSI computation: O(n) per frame, n ≤ 6 radios
- Heatmap rendering: ~20px resolution for performance
- Enhanced anti-aliasing and high-DPI display support

## Educational Value

This simulator helps students and developers understand:

1. **RSSI Variability**: How signal strength degrades with distance
2. **Environmental Impact**: Effect of path-loss exponent on ranging accuracy
3. **Trilateration Errors**: Difference between true and estimated position
4. **Coverage Analysis**: Dead zones and overlapping coverage areas
5. **Parameter Tuning**: Calibrating RSSI models for different environments

## Future Enhancements

Potential features for future versions:

- [ ] Walls/obstacles affecting local path-loss exponent
- [ ] Import measured RSSI data (CSV upload)
- [ ] 3D positioning with floor plans
- [ ] Weighted least squares for N>3 radios
- [ ] Kalman filtering for position tracking
- [ ] Export simulation results

## Example Calculation

**Given**:
- Radio at (2m, 2m)
- Device at (5m, 5m)
- TxPower = -59 dBm
- Path loss exponent n = 2.7

**Step 1**: True distance
```
d = √((5-2)² + (5-2)²) = 4.24m
```

**Step 2**: Calculate RSSI
```
RSSI = -59 - 10 × 2.7 × log₁₀(4.24)
     = -59 - 10 × 2.7 × 0.627
     = -59 - 16.9
     = -75.9 dBm
```

**Step 3**: Estimate distance from RSSI
```
d_est = 10^((-59 - (-75.9)) / (10 × 2.7))
      = 10^(16.9 / 27)
      = 10^0.626
      = 4.23m
```

**Result**: Circle radius = 4.23m (very close due to no noise)

## License

MIT License - Free to use for educational and commercial purposes.

## Contributing

Contributions welcome! Please feel free to submit issues or pull requests.

## Author

Built with assistance from Claude (Anthropic) based on PRD specifications.

---

**Version History**:
- **v1.2** (2025-11-06): Three.js integration for enhanced rendering quality with WebGL
- **v1.1** (2025-11-06): RSSI-to-distance integration with path-loss model
- **v1.0** (Initial): Basic geometric trilateration

For questions or feedback, please open an issue on the repository.