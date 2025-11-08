# Bluetooth Trilateration Simulator - Complete Recreation Guide

## Table of Contents
1. [Overview](#overview)
2. [Project Architecture](#project-architecture)
3. [Technologies & Dependencies](#technologies--dependencies)
4. [File Structure](#file-structure)
5. [Core Algorithms & Mathematics](#core-algorithms--mathematics)
6. [Detailed Component Breakdown](#detailed-component-breakdown)
7. [Implementation Steps](#implementation-steps)
8. [Key Features Implementation](#key-features-implementation)
9. [Testing & Validation](#testing--validation)

---

## Overview

This is an **interactive web-based Bluetooth Low Energy (BLE) trilateration simulator** that demonstrates realistic indoor positioning using RSSI (Received Signal Strength Indicator) measurements. The application simulates how Bluetooth beacons can be used to determine device location through signal strength measurements from multiple transmitters.

### Key Characteristics
- **Type**: Single-page web application (no build tools required)
- **Rendering**: WebGL-accelerated graphics using Three.js
- **Computer Vision**: Automatic wall detection using OpenCV.js
- **Educational Focus**: Demonstrates real-world RF propagation and positioning algorithms
- **Interactivity**: Full drag-and-drop interface with real-time calculations

---

## Project Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User Interface                         │
│  (HTML + CSS Grid Layout - 3 columns)                      │
├──────────────┬────────────────────────┬─────────────────────┤
│ Left Sidebar │   Center Canvas        │  Right Sidebar      │
│ (Controls)   │   (Three.js Renderer)  │  (Data Display)     │
└──────────────┴────────────────────────┴─────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              TrilaterationSimulator Class                   │
│  (Main application controller)                              │
├─────────────────────────────────────────────────────────────┤
│  • Scene Management (Three.js)                              │
│  • RSSI Calculation Engine                                  │
│  • Trilateration Algorithms                                 │
│  • Wall Detection (OpenCV.js)                               │
│  • User Interaction Handlers                                │
│  • Data Processing & Display                                │
└─────────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  RSSI Model  │ │  Geometric   │ │ Wall Physics │
│  (Path Loss) │ │  Algorithms  │ │  (RF Loss)   │
└──────────────┘ └──────────────┘ └──────────────┘
```

### Data Flow

```
User Interaction → Update Positions → Calculate RSSI → Estimate Distance
                                           │
                                           ▼
                           Apply Wall Attenuation (if enabled)
                                           │
                                           ▼
                      Trilateration Algorithm (Least Squares)
                                           │
                                           ▼
                          Update Visual Elements (Three.js)
                                           │
                                           ▼
                              Render Frame (60 FPS)
```

---

## Technologies & Dependencies

### Core Technologies

1. **Three.js v0.160.0**
   - Purpose: WebGL-based 2D/3D rendering
   - CDN: `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js`
   - Usage: Orthographic camera for 2D view, hardware-accelerated rendering

2. **OpenCV.js v4.8.0**
   - Purpose: Computer vision for automatic wall detection
   - CDN: `https://docs.opencv.org/4.8.0/opencv.js`
   - Features used: Canny edge detection, Hough Line Transform

3. **Vanilla JavaScript (ES6+)**
   - No build tools or transpilation required
   - Uses modern features: classes, arrow functions, destructuring

4. **CSS Grid Layout**
   - Responsive 3-column layout
   - Flexbox for internal component layouts

### Browser Requirements
- Modern browser with WebGL support
- Tested: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- High-DPI display support
- Canvas API support

---

## File Structure

```
trilateration/
├── index.html                    # Main HTML structure (300 lines)
├── styles.css                    # Complete styling (349 lines)
├── app.js                        # Core application logic (1973 lines)
├── README.md                     # User documentation
└── APP_RECREATION_GUIDE.md       # This file
```

### File Responsibilities

#### `index.html`
- Defines UI structure (3-column grid)
- Left sidebar: All configuration controls
- Center: Canvas for Three.js rendering
- Right sidebar: Data display tables
- External script loading (Three.js, OpenCV.js)
- No inline JavaScript

#### `styles.css`
- Modern CSS with gradient backgrounds
- Responsive grid layout (1600px max width)
- Component styling (panels, buttons, inputs)
- Data table formatting with color coding
- Media queries for mobile support

#### `app.js`
- Complete application logic
- **Main components:**
  - Wall materials constants (lines 50-86)
  - Wall class definition (lines 91-174)
  - Geometry utilities (lines 177-276)
  - TrilaterationSimulator class (lines 278-1967)
  - Initialization (lines 1970-1972)

---

## Core Algorithms & Mathematics

### 1. RSSI Path Loss Model

**Formula**:
```
RSSI = TxPower - 10 × n × log₁₀(d) - WallAttenuation + Noise
```

**Parameters**:
- `TxPower`: Reference signal strength at 1 meter (default: -59 dBm)
- `n`: Path loss exponent (2.0 = free space, 2.7-3.5 = indoor)
- `d`: Distance in meters
- `WallAttenuation`: Sum of wall penetration losses
- `Noise`: Optional Gaussian noise (σ = 0-10 dB)

**Implementation** (app.js:744-788):
```javascript
calculateRSSI(distanceMeters, transmitter, receiver) {
    // Basic path loss
    let rssi = this.txPower - 10 * this.pathLossExponent * Math.log10(distanceMeters);

    // Add wall attenuation
    if (this.enableWalls && transmitter && receiver) {
        const intersections = findWallIntersections(transmitter, receiver, this.walls);
        let totalAttenuation = 0;

        for (let i = 0; i < intersections.length; i++) {
            let wallLoss = intersections[i].wall.attenuation;

            // Angle effect: grazing angle reduces penetration
            if (this.enableAngleEffect) {
                const angleFactor = calculatePenetrationAngle(...);
                wallLoss *= angleFactor; // 0.5 to 1.0
            }

            // Cumulative effect: multiple walls compound
            if (this.enableCumulativeEffect && i > 0) {
                wallLoss *= Math.pow(1.1, i);
            }

            totalAttenuation += wallLoss;
        }

        rssi -= totalAttenuation;
    }

    // Add noise
    if (this.enableNoise) {
        rssi += gaussianRandom(0, this.noiseStdDev);
    }

    return clamp(rssi, -120, -30);
}
```

### 2. Distance Estimation (Inverse Path Loss)

**Formula**:
```
d = 10^((TxPower - RSSI) / (10 × n))
```

**Implementation** (app.js:794-797):
```javascript
estimateDistanceFromRSSI(rssi) {
    const exponent = (this.txPower - rssi) / (10 * this.pathLossExponent);
    return Math.pow(10, exponent); // Returns meters
}
```

### 3. Trilateration Algorithm

The app uses **Non-Linear Least Squares** optimization with Gauss-Newton method.

**Mathematical Foundation**:

Given N radios at positions (x₁, y₁), (x₂, y₂), ..., (xₙ, yₙ) with estimated distances r₁, r₂, ..., rₙ:

Minimize: `Σ (√((x-xᵢ)² + (y-yᵢ)²) - rᵢ)²`

**Algorithm Steps**:

1. **Initial Guess** (app.js:892-915):
   - Weighted centroid based on RSSI strength
   - Stronger signals get more weight
   - For N=3, use geometric solution as initial guess

2. **Gauss-Newton Iterations** (app.js:918-974):
   ```javascript
   for (iter = 0; iter < maxIterations; iter++) {
       // Build Jacobian matrix and residual vector
       for each measurement {
           predictedDist = √((x-xᵢ)² + (y-yᵢ)²)
           residual = predictedDist - measuredDist

           J_x = (x - xᵢ) / predictedDist  // ∂distance/∂x
           J_y = (y - yᵢ) / predictedDist  // ∂distance/∂y

           // Accumulate normal equations: JᵀJ·δ = -Jᵀr
       }

       // Solve 2×2 system for position update
       [δx] = -(JᵀJ)⁻¹ · Jᵀr
       [δy]

       x += δx
       y += δy

       if (|δ| < convergenceThreshold) break
   }
   ```

3. **Geometric Trilateration** (for N=3, closed-form solution) (app.js:988-1022):
   ```
   Solve simultaneous circle equations:
   (x-x₁)² + (y-y₁)² = r₁²
   (x-x₂)² + (y-y₂)² = r₂²
   (x-x₃)² + (y-y₃)² = r₃²
   ```

### 4. Wall Intersection Detection

**Line-Line Intersection** (app.js:180-209):

Given two line segments P₁P₂ and P₃P₄:

```
Parametric form:
P = P₁ + t(P₂ - P₁)  where t ∈ [0,1]
P = P₃ + u(P₄ - P₃)  where u ∈ [0,1]

Solve for t and u:
t = [(x₁-x₃)(y₃-y₄) - (y₁-y₃)(x₃-x₄)] / denominator
u = -[(x₁-x₂)(y₁-y₃) - (y₁-y₂)(x₁-x₃)] / denominator

denominator = (x₁-x₂)(y₃-y₄) - (y₁-y₂)(x₃-x₄)

Intersection exists if: 0 ≤ t ≤ 1 AND 0 ≤ u ≤ 1
```

### 5. Wall Penetration Angle Effect

**Formula** (app.js:250-276):
```
angleFactor = 0.5 + 0.5 × |cos(θ)|

where θ = angle between signal direction and wall normal

cos(θ) = (signal · wallNormal) / (|signal| × |wallNormal|)
```

- Perpendicular penetration: factor = 1.0 (full attenuation)
- Grazing angle (parallel): factor = 0.5 (reduced attenuation)

### 6. OpenCV Wall Detection Pipeline

**Steps** (app.js:1470-1556):

1. **Image Preprocessing**:
   ```
   RGBA → Grayscale
   GaussianBlur(kernel=5×5) to reduce noise
   ```

2. **Edge Detection**:
   ```
   Canny(threshold1=50, threshold2=150)
   Produces binary edge map
   ```

3. **Line Detection**:
   ```
   HoughLinesP(
       rho=1,                    // 1 pixel distance resolution
       theta=π/180,              // 1 degree angle resolution
       threshold=50,             // Min votes
       minLineLength=50,         // Min 50px lines
       maxLineGap=10            // Connect lines <10px apart
   )
   ```

4. **Line Merging** (app.js:1564-1650):
   ```
   Group parallel lines (angle difference < 10°)
   Merge if distance < 20px
   Average endpoints to create single line
   ```

---

## Detailed Component Breakdown

### 1. Wall Class (app.js:91-174)

```javascript
class Wall {
    constructor(start, end, material = 'drywall') {
        this.id = generateId();
        this.start = { x, y };  // Canvas coordinates
        this.end = { x, y };
        this.material = material;
        this.attenuation = WALL_MATERIALS[material].attenuation;
        this.color = WALL_MATERIALS[material].color;
    }

    getLength()           // Euclidean distance
    getMidpoint()         // Center point
    containsPoint(p, threshold)  // For mouse selection
    distanceToPoint(p)    // Point-to-line-segment distance
}
```

**Wall Materials** (app.js:50-86):
```javascript
WALL_MATERIALS = {
    drywall:    { attenuation: 3 dB,  color: 0xcccccc },
    concrete:   { attenuation: 10 dB, color: 0x888888 },
    brick:      { attenuation: 8 dB,  color: 0xaa6644 },
    glass:      { attenuation: 2 dB,  color: 0x8888ff },
    metal:      { attenuation: 20 dB, color: 0x666666 },
    door_wood:  { attenuation: 4 dB,  color: 0x996633 },
    door_metal: { attenuation: 12 dB, color: 0x555555 }
}
```

### 2. TrilaterationSimulator Class (app.js:278-1967)

**State Variables**:
```javascript
// Rendering
this.scene              // Three.js Scene
this.camera             // OrthographicCamera
this.renderer           // WebGLRenderer
this.raycaster          // For mouse picking

// Groups (for organized rendering)
this.floorPlanGroup
this.gridGroup
this.heatmapGroup
this.circlesGroup
this.debugLinesGroup
this.wallsGroup
this.wallIntersectionsGroup
this.radiosGroup
this.deviceGroup
this.estimatedGroup

// RSSI Model
this.txPower = -59        // dBm at 1m
this.pathLossExponent = 2.7
this.minRSSI = -100       // Detection threshold

// Noise
this.enableNoise = false
this.noiseStdDev = 5

// Walls
this.enableWalls = false
this.enableAngleEffect = true
this.enableCumulativeEffect = true

// Objects
this.radios = []          // Array of radio objects
this.walls = []           // Array of Wall instances
this.device = { x, y, radius }
this.estimatedPosition = { x, y } | null

// Interaction
this.dragging = null      // Current object being dragged
this.selectedWall = null
this.drawWallMode = false
this.tempWall = null

// Floor Plan
this.floorPlan = {
    image: null,
    texture: null,
    mesh: null,
    scale: 40,           // px/m
    opacity: 0.5,
    show: false
}

// Wall Detection
this.wallDetection = {
    cannyThreshold1: 50,
    cannyThreshold2: 150,
    houghThreshold: 50,
    minLineLength: 50,
    maxLineGap: 10,
    detectedMaterial: 'drywall'
}
```

**Key Methods**:

1. **Coordinate Conversion**:
   ```javascript
   canvasToThree(x, y)  // Canvas (top-left origin) → Three.js (center origin)
   threeToCanvas(x, y)  // Three.js → Canvas
   ```

2. **Initialization**:
   ```javascript
   initializeRadios()   // Position radios in patterns (3-6)
   initializeWalls()    // Create demo walls
   createGrid()         // Draw meter grid
   setupEventListeners() // Bind UI controls
   ```

3. **Rendering Pipeline** (called at 60 FPS):
   ```javascript
   render() {
       measurements = performTrilateration()
       updateHeatmap()
       updateRangingCircles(measurements)
       updateDebugLines()
       updateWalls()
       updateWallIntersections(measurements)
       updateRadios()
       updateDevice()
       updateEstimatedPosition()
       updateDataTables(measurements)
       renderer.render(scene, camera)
   }
   ```

4. **Memory Management**:
   ```javascript
   disposeGroup(group) {
       // Properly dispose Three.js geometries, materials, textures
       // Critical for preventing memory leaks
       for each object {
           geometry.dispose()
           material.dispose()
           texture?.dispose()
           group.remove(object)
       }
   }
   ```

### 3. Rendering Layers (Z-ordering)

Three.js objects are positioned at different Z depths:

```
Z = -2:   Floor plan image
Z = -1:   Heatmap cells
Z = 0:    Grid lines
Z = 0.5:  Filled ranging circles
Z = 1:    Ranging circle borders
Z = 1.9:  Wall background lines
Z = 2:    Wall foreground lines, Estimated position
Z = 2.5:  Wall endpoints (selected), Error line
Z = 3:    Radios, Device
Z = 3.1:  Radio/Device borders
Z = 3.2:  Device cross marker
Z = 3.5:  Wall intersection markers
```

### 4. Interactive Features

**Mouse Interaction** (app.js:1880-1966):

```javascript
handleMouseDown(e):
    1. Check if in wall drawing mode → start temp wall
    2. Raycast against radios/device → start dragging
    3. Check wall selection → highlight wall

handleMouseMove(e):
    1. Update temp wall endpoint (if drawing)
    2. Update dragged object position (if dragging)

handleMouseUp():
    1. Finalize temp wall (if length > 10px)
    2. End dragging
```

**Keyboard Shortcuts**:
- `Delete` / `Backspace`: Delete selected wall
- `Escape`: Exit wall drawing mode

### 5. Floor Plan Upload & Processing

**Upload Flow** (app.js:1322-1405):
```
User selects image file
    → FileReader.readAsDataURL()
    → Create Image element
    → Load into Three.Texture
    → Create PlaneGeometry(canvasWidth, canvasHeight)
    → Position at Z = -2
    → Apply opacity
```

### 6. OpenCV Integration

**Loading** (app.js:10-40):
```javascript
<script async src="opencv.js" onload="onOpenCvReady()"></script>

function onOpenCvReady() {
    opencvReady = true;
    // Enable wall detection button
}
```

**Wall Detection Process** (app.js:1414-1556):
```
1. Draw floor plan image to temporary canvas
2. cv.imread(canvas) → Mat
3. cv.cvtColor(src, gray, COLOR_RGBA2GRAY)
4. cv.GaussianBlur(gray, gray, ksize=5×5)
5. cv.Canny(gray, edges, threshold1, threshold2)
6. cv.HoughLinesP(edges, lines, ...) → line segments
7. mergeParallelLines(lines) → reduce noise
8. Convert to Wall objects
9. Clean up Mats (prevent memory leak)
```

---

## Implementation Steps

### Phase 1: Basic Structure (HTML + CSS)

1. **Create `index.html`**:
   ```html
   <!DOCTYPE html>
   <html lang="en">
   <head>
       <meta charset="UTF-8">
       <title>Bluetooth Trilateration Simulator</title>
       <link rel="stylesheet" href="styles.css">
   </head>
   <body>
       <div class="container">
           <header>...</header>
           <div class="main-content">
               <aside class="sidebar sidebar-left">...</aside>
               <main class="canvas-container">
                   <canvas id="mainCanvas" width="800" height="600"></canvas>
               </main>
               <aside class="sidebar sidebar-right">...</aside>
           </div>
       </div>
       <script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
       <script async src="https://docs.opencv.org/4.8.0/opencv.js" onload="onOpenCvReady()"></script>
       <script src="app.js"></script>
   </body>
   </html>
   ```

2. **Create `styles.css`**:
   - Reset styles
   - Gradient background
   - 3-column grid layout
   - Panel styling
   - Form controls
   - Data table styling
   - Responsive breakpoints

### Phase 2: Three.js Setup

1. **Initialize Scene**:
   ```javascript
   this.scene = new THREE.Scene();
   this.scene.background = new THREE.Color(0xffffff);

   const aspect = width / height;
   this.camera = new THREE.OrthographicCamera(
       -width/2, width/2,
       height/2, -height/2,
       0.1, 1000
   );
   this.camera.position.z = 10;

   this.renderer = new THREE.WebGLRenderer({
       canvas: this.canvas,
       antialias: true,
       alpha: false
   });
   this.renderer.setSize(width, height);
   this.renderer.setPixelRatio(window.devicePixelRatio);
   ```

2. **Create Scene Groups**:
   - Organize objects into groups for efficient rendering
   - Add all groups to scene

3. **Implement Grid**:
   - Draw vertical/horizontal lines every `scale` pixels (40px = 1m)
   - Use `THREE.Line` with `BufferGeometry`

### Phase 3: RSSI Model

1. **Implement Path Loss Formula**:
   ```javascript
   calculateRSSI(distanceMeters, transmitter, receiver) {
       let rssi = this.txPower - 10 * this.pathLossExponent * Math.log10(distanceMeters);
       return rssi;
   }
   ```

2. **Add Gaussian Noise**:
   ```javascript
   gaussianRandom(mean, stdDev) {
       // Box-Muller transform
       const u1 = Math.random();
       const u2 = Math.random();
       const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
       return mean + stdDev * z0;
   }
   ```

3. **Implement Inverse Distance**:
   ```javascript
   estimateDistanceFromRSSI(rssi) {
       return Math.pow(10, (this.txPower - rssi) / (10 * this.pathLossExponent));
   }
   ```

### Phase 4: Trilateration

1. **Geometric Solution (N=3)**:
   - Solve circle intersection equations
   - Handle collinear radios

2. **Least Squares (N≥3)**:
   - Initial guess: weighted centroid
   - Gauss-Newton iterations
   - Jacobian matrix calculation
   - Solve 2×2 system

### Phase 5: Wall System

1. **Create Wall Class**:
   - Store start/end points
   - Material properties
   - Geometric utilities

2. **Line-Line Intersection**:
   - Parametric line equation
   - Segment intersection test

3. **Wall Attenuation**:
   - Find all intersections along signal path
   - Apply material-specific loss
   - Add angle effect
   - Add cumulative effect

4. **Wall Editor**:
   - Draw mode with temp wall
   - Wall selection
   - Delete functionality

### Phase 6: Rendering

1. **Radio Rendering**:
   ```javascript
   updateRadios() {
       disposeGroup(this.radiosGroup);
       for (radio of this.radios) {
           // Create circle mesh
           geometry = new THREE.CircleGeometry(radius, 32);
           material = new THREE.MeshBasicMaterial({ color: 0x4CAF50 });
           mesh = new THREE.Mesh(geometry, material);
           mesh.position.set(threeX, threeY, 3);
           mesh.userData = { type: 'radio', radio };
           this.radiosGroup.add(mesh);
           this.interactiveObjects.push(mesh);
       }
   }
   ```

2. **Ranging Circles**:
   - Create `RingGeometry` with estimated distance radius
   - Color by RSSI strength
   - Varying opacity

3. **Error Visualization**:
   - Dashed line from true to estimated position

4. **Heatmap** (optional):
   - Grid of small planes
   - Calculate max RSSI at each point
   - Color interpolation (red → green)

### Phase 7: Floor Plan & OpenCV

1. **Image Upload**:
   ```javascript
   handleFloorPlanUpload(event) {
       const file = event.target.files[0];
       const reader = new FileReader();
       reader.onload = (e) => {
           const img = new Image();
           img.onload = () => {
               this.floorPlan.image = img;
               this.loadFloorPlanTexture(img);
           };
           img.src = e.target.result;
       };
       reader.readAsDataURL(file);
   }
   ```

2. **Texture Rendering**:
   ```javascript
   updateFloorPlan() {
       const geometry = new THREE.PlaneGeometry(width, height);
       const material = new THREE.MeshBasicMaterial({
           map: this.floorPlan.texture,
           transparent: true,
           opacity: this.floorPlan.opacity
       });
       const mesh = new THREE.Mesh(geometry, material);
       mesh.position.set(0, 0, -2);
       this.floorPlanGroup.add(mesh);
   }
   ```

3. **OpenCV Wall Detection**:
   ```javascript
   detectWallsFromImage() {
       // Draw image to canvas
       canvas.drawImage(this.floorPlan.image, 0, 0, width, height);

       // OpenCV processing
       const src = cv.imread(canvas);
       const gray = new cv.Mat();
       cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
       cv.GaussianBlur(gray, gray, new cv.Size(5,5), 0);

       const edges = new cv.Mat();
       cv.Canny(gray, edges, threshold1, threshold2);

       const lines = new cv.Mat();
       cv.HoughLinesP(edges, lines, 1, Math.PI/180,
                      houghThreshold, minLineLength, maxLineGap);

       // Convert to Wall objects
       for (i = 0; i < lines.rows; i++) {
           const x1 = lines.data32S[i*4];
           const y1 = lines.data32S[i*4+1];
           const x2 = lines.data32S[i*4+2];
           const y2 = lines.data32S[i*4+3];
           walls.push(new Wall({x:x1,y:y1}, {x:x2,y:y2}, material));
       }

       // Clean up
       src.delete();
       gray.delete();
       edges.delete();
       lines.delete();
   }
   ```

### Phase 8: Interaction

1. **Mouse Event Handlers**:
   - Convert mouse coords to canvas coords
   - Raycasting for object selection
   - Drag-and-drop logic
   - Wall drawing

2. **UI Controls**:
   - Bind input events
   - Update value displays
   - Real-time parameter updates

3. **Data Display**:
   - Build HTML tables dynamically
   - Color-code RSSI values
   - Display position error

### Phase 9: Memory Management

1. **Implement Proper Disposal**:
   ```javascript
   disposeGroup(group) {
       while (group.children.length > 0) {
           const object = group.children[0];
           if (object.geometry) object.geometry.dispose();
           if (object.material) {
               if (Array.isArray(object.material)) {
                   object.material.forEach(m => {
                       if (m.map) m.map.dispose();
                       m.dispose();
                   });
               } else {
                   if (object.material.map) object.material.map.dispose();
                   object.material.dispose();
               }
           }
           group.remove(object);
       }
   }
   ```

2. **Call Before Re-rendering**:
   - Always dispose old geometries before creating new ones
   - Critical for preventing memory leaks in long-running sessions

---

## Key Features Implementation

### Feature 1: Adjustable RSSI Parameters

**UI Controls** (index.html):
```html
<div class="control-group">
    <label for="txPower">Tx Power @ 1m (dBm):</label>
    <input type="number" id="txPower" value="-59" step="1" min="-80" max="-30">
    <span class="value-display">-59 dBm</span>
</div>

<div class="control-group">
    <label for="pathLossExponent">Path Loss Exponent (n):</label>
    <input type="range" id="pathLossExponent" value="2.7" step="0.1" min="2.0" max="4.0">
    <span class="value-display">2.7</span>
</div>
```

**Event Binding** (app.js):
```javascript
document.getElementById('txPower').addEventListener('input', (e) => {
    this.txPower = parseFloat(e.target.value);
    this.updateUI();
});
```

### Feature 2: Interactive Dragging

**Raycasting Setup**:
```javascript
this.raycaster = new THREE.Raycaster();
this.mouse = new THREE.Vector2();
this.interactiveObjects = [];  // Populated during rendering

handleMouseDown(e) {
    // Convert to normalized device coordinates
    this.mouse.x = ((e.clientX - rect.left) / width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.interactiveObjects);

    if (intersects.length > 0) {
        const obj = intersects[0].object;
        this.dragging = obj.userData.radio || obj.userData.device;
    }
}
```

### Feature 3: Real-time RSSI Heatmap

**Algorithm**:
```javascript
updateHeatmap() {
    const resolution = 20;  // 20×20 pixel cells

    for (x = 0; x < width; x += resolution) {
        for (y = 0; y < height; y += resolution) {
            // Find strongest signal at this point
            let maxRSSI = -120;
            for (radio of radios) {
                const distance = calculateDistance(radio, {x, y});
                const rssi = calculateRSSI(distance, radio, {x, y});
                maxRSSI = Math.max(maxRSSI, rssi);
            }

            // Map RSSI to color (red → green)
            const normalized = (maxRSSI + 100) / 40;  // -100 to -60 dBm
            const r = 1 - normalized;
            const g = normalized;

            // Create colored cell
            const mesh = new THREE.Mesh(
                new THREE.PlaneGeometry(resolution, resolution),
                new THREE.MeshBasicMaterial({
                    color: new THREE.Color(r, g, 0),
                    transparent: true,
                    opacity: 0.12
                })
            );
            mesh.position.set(x, y, -1);
            this.heatmapGroup.add(mesh);
        }
    }
}
```

### Feature 4: Configurable Radio Layout

**Patterns**:
```javascript
initializeRadios() {
    if (this.numRadios === 3) {
        // Equilateral triangle
        this.radios = [
            { x: width/2, y: margin },
            { x: margin, y: height-margin },
            { x: width-margin, y: height-margin }
        ];
    } else if (this.numRadios === 4) {
        // Square corners
        this.radios = [
            { x: margin, y: margin },
            { x: width-margin, y: margin },
            { x: width-margin, y: height-margin },
            { x: margin, y: height-margin }
        ];
    } else if (this.numRadios === 5 || this.numRadios === 6) {
        // Regular polygon
        const centerX = width/2;
        const centerY = height/2;
        const radius = Math.min(width, height)/2 - margin;

        for (i = 0; i < this.numRadios; i++) {
            const angle = (i * 2*Math.PI / this.numRadios) - Math.PI/2;
            this.radios.push({
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle),
                radius: 10,
                label: `R${i+1}`
            });
        }
    }
}
```

### Feature 5: Wall Material Library

**Material Properties**:
```javascript
WALL_MATERIALS = {
    drywall: {
        attenuation: 3,      // dB
        color: 0xcccccc,     // Light gray
        name: 'Drywall'
    },
    concrete: {
        attenuation: 10,
        color: 0x888888,
        name: 'Concrete'
    },
    // ... more materials
};
```

**Dropdown UI**:
```html
<select id="wallMaterial">
    <option value="drywall" selected>Drywall (3 dB)</option>
    <option value="concrete">Concrete (10 dB)</option>
    <option value="brick">Brick (8 dB)</option>
    <option value="glass">Glass (2 dB)</option>
    <option value="metal">Metal (20 dB)</option>
</select>
```

### Feature 6: OpenCV Parameter Tuning

**Interactive Controls**:
```html
<div class="control-group">
    <label for="cannyThreshold1">Edge Threshold 1:</label>
    <input type="range" id="cannyThreshold1" value="50"
           step="10" min="10" max="200">
    <span class="value-display">50</span>
    <small>(Lower = more edges)</small>
</div>
```

**Real-time Detection**:
- User adjusts sliders
- Clicks "Detect Walls" button
- Algorithm runs with current parameters
- Results displayed immediately
- Can re-run with different parameters

---

## Testing & Validation

### Test Scenarios

1. **Free Space Validation**:
   ```
   Setup: n=2.0, no walls, no noise
   Expected: Position error < 0.1m
   Validation: RSSI matches theoretical path loss
   ```

2. **Indoor Environment**:
   ```
   Setup: n=2.7, walls enabled, noise ±5dB
   Expected: Position error 0.5-2m
   Validation: Realistic BLE behavior
   ```

3. **Wall Attenuation**:
   ```
   Setup: Place wall between radio and device
   Expected: RSSI reduced by wall.attenuation
   Validation: Check intersection detection
   ```

4. **Edge Cases**:
   - Device outside radio coverage → No solution
   - Only 2 radios active → Warning message
   - Collinear radios → Fallback to weighted centroid
   - Device at radio position → Handle d=0

### Performance Targets

- **Rendering**: 60 FPS constant
- **Heatmap**: <100ms generation at 20px resolution
- **Wall Detection**: <500ms for typical floor plan
- **Memory**: No leaks over 1000+ frames
- **Interaction**: <16ms response to mouse events

### Validation Checklist

- [ ] RSSI calculation matches formula
- [ ] Distance estimation is inverse of RSSI calc
- [ ] Trilateration converges in <100 iterations
- [ ] Wall intersections correctly detected
- [ ] Angle effect reduces attenuation at grazing angles
- [ ] OpenCV detects major architectural features
- [ ] UI controls update in real-time
- [ ] Dragging works smoothly at 60 FPS
- [ ] Memory usage stays stable over time
- [ ] Responsive layout works on mobile

---

## Advanced Topics

### Custom Enhancements

**Ideas for Extension**:

1. **Kalman Filtering**:
   ```javascript
   class KalmanFilter {
       constructor() {
           this.state = [0, 0, 0, 0];  // [x, y, vx, vy]
           this.P = identityMatrix(4);  // Covariance
           this.Q = processNoise;
           this.R = measurementNoise;
       }

       predict(dt) {
           // State transition
           this.state = F * this.state;
           this.P = F * this.P * F^T + Q;
       }

       update(measurement) {
           // Kalman gain
           K = P * H^T * (H * P * H^T + R)^-1;
           this.state = this.state + K * (z - H * this.state);
           this.P = (I - K * H) * P;
       }
   }
   ```

2. **3D Positioning**:
   - Add Z coordinate to radios
   - Sphere intersection instead of circle
   - 3D visualization with perspective camera

3. **Multi-floor Support**:
   - Floor selector dropdown
   - Per-floor radio configurations
   - Vertical wall attenuation

4. **Data Export**:
   ```javascript
   exportData() {
       const data = {
           timestamp: Date.now(),
           config: {
               txPower: this.txPower,
               pathLoss: this.pathLossExponent
           },
           radios: this.radios.map(r => ({
               x: r.x / this.scale,
               y: r.y / this.scale,
               rssi: calculateRSSI(...)
           })),
           truePosition: {
               x: this.device.x / this.scale,
               y: this.device.y / this.scale
           },
           estimatedPosition: this.estimatedPosition,
           error: calculateError()
       };

       const blob = new Blob([JSON.stringify(data, null, 2)],
                            { type: 'application/json' });
       downloadFile(blob, 'trilateration_data.json');
   }
   ```

5. **CSV Import**:
   ```javascript
   importRSSIData(csvFile) {
       // Parse CSV: timestamp,radio_id,rssi
       // Replay measurements
       // Visualize tracked path
   }
   ```

### Performance Optimization

**For Large Deployments**:

1. **Spatial Indexing**:
   ```javascript
   class QuadTree {
       // Index radios/walls for O(log n) queries
       insert(object, bounds)
       query(region)
   }
   ```

2. **Level of Detail**:
   ```javascript
   // Reduce geometry complexity based on zoom
   getCircleSegments(radius, zoom) {
       return Math.max(8, Math.min(64, radius * zoom / 10));
   }
   ```

3. **Web Workers**:
   ```javascript
   // Offload trilateration to worker thread
   const worker = new Worker('trilateration-worker.js');
   worker.postMessage({ radios, device, params });
   worker.onmessage = (e) => {
       this.estimatedPosition = e.data.position;
   };
   ```

---

## Common Pitfalls & Solutions

### Issue 1: Memory Leaks

**Problem**: Three.js objects accumulate, causing slowdown
**Solution**: Always dispose before recreating
```javascript
disposeGroup(group);  // Before rendering
updateRangingCircles();  // Creates new geometries
```

### Issue 2: OpenCV Mat Not Released

**Problem**: OpenCV Mats consume WASM memory
**Solution**: Delete all Mats
```javascript
src.delete();
gray.delete();
edges.delete();
lines.delete();
```

### Issue 3: Coordinate System Confusion

**Problem**: Three.js uses center origin, canvas uses top-left
**Solution**: Always use conversion functions
```javascript
const threePos = this.canvasToThree(canvasX, canvasY);
mesh.position.set(threePos.x, threePos.y, z);
```

### Issue 4: Trilateration Divergence

**Problem**: Optimization doesn't converge
**Solutions**:
- Use weighted centroid as initial guess
- Add convergence check (100 iterations max)
- Validate result bounds
- Fall back to geometric solution for N=3

### Issue 5: Wall Drawing Conflicts with Dragging

**Problem**: Clicking on device also draws wall
**Solution**: Check drag targets BEFORE wall selection
```javascript
// Priority: device/radio > wall > wall drawing
if (intersectsDevice) { drag(); return; }
if (intersectsWall) { selectWall(); return; }
if (drawWallMode) { startWall(); }
```

---

## Conclusion

This simulator is a complete educational tool demonstrating:
- **RF Propagation**: Path loss, RSSI, and noise
- **Positioning Algorithms**: Trilateration with optimization
- **Computer Vision**: Automatic feature detection
- **Interactive Graphics**: Real-time WebGL rendering
- **User Experience**: Intuitive drag-and-drop interface

The implementation balances **accuracy** (realistic RSSI model), **performance** (60 FPS WebGL), and **usability** (no build tools required). It serves as both a learning platform and a foundation for more advanced indoor positioning systems.

---

## Quick Reference

### File Sizes
- `index.html`: ~300 lines
- `styles.css`: ~349 lines
- `app.js`: ~1973 lines
- Total: ~2622 lines

### External Dependencies
- Three.js: 160.0 (CDN)
- OpenCV.js: 4.8.0 (CDN)

### Browser Compatibility
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Performance Specs
- Rendering: 60 FPS
- Canvas: 800×600 px
- Grid: 40 px/meter
- Max Radios: 6
- Heatmap Resolution: 20×20 px cells

### Key Algorithms
- RSSI Model: Log-distance path loss
- Trilateration: Gauss-Newton least squares
- Wall Detection: Canny + Hough Transform
- Noise: Box-Muller Gaussian

---

**End of Recreation Guide**
