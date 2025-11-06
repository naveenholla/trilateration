// =============================================================================
// Bluetooth Trilateration Simulator - RSSI Edition with Three.js
// Version 1.4 - Wall Attenuation & Floor Map Integration
// =============================================================================

// =============================================================================
// Wall Materials & Constants
// =============================================================================

/**
 * Material properties for different wall types
 * Attenuation values in dB (typical indoor RF loss at 2.4GHz)
 */
const WALL_MATERIALS = {
    drywall: {
        attenuation: 3,      // ~3 dB loss through standard drywall
        color: 0xcccccc,
        name: 'Drywall'
    },
    concrete: {
        attenuation: 10,     // ~10 dB loss through concrete
        color: 0x888888,
        name: 'Concrete'
    },
    brick: {
        attenuation: 8,      // ~8 dB loss through brick
        color: 0xaa6644,
        name: 'Brick'
    },
    glass: {
        attenuation: 2,      // ~2 dB loss through glass
        color: 0x8888ff,
        name: 'Glass'
    },
    metal: {
        attenuation: 20,     // ~20 dB loss through metal (heavy attenuation)
        color: 0x666666,
        name: 'Metal'
    },
    door_wood: {
        attenuation: 4,      // ~4 dB loss through wooden door
        color: 0x996633,
        name: 'Wood Door'
    },
    door_metal: {
        attenuation: 12,     // ~12 dB loss through metal door
        color: 0x555555,
        name: 'Metal Door'
    }
};

/**
 * Wall class representing a physical obstacle
 */
class Wall {
    constructor(start, end, material = 'drywall') {
        this.id = this.generateId();
        this.start = { x: start.x, y: start.y };  // Canvas coordinates
        this.end = { x: end.x, y: end.y };
        this.material = material;
        this.thickness = 0.15;  // meters (default 15cm)

        // Get material properties
        const matProps = WALL_MATERIALS[material] || WALL_MATERIALS.drywall;
        this.attenuation = matProps.attenuation;
        this.color = matProps.color;
        this.name = matProps.name;

        // Three.js mesh (will be created during rendering)
        this.mesh = null;
    }

    generateId() {
        return 'wall_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Calculate length of wall in pixels
     */
    getLength() {
        const dx = this.end.x - this.start.x;
        const dy = this.end.y - this.start.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Get midpoint of wall
     */
    getMidpoint() {
        return {
            x: (this.start.x + this.end.x) / 2,
            y: (this.start.y + this.end.y) / 2
        };
    }

    /**
     * Check if a point is near this wall (for selection/hover)
     */
    containsPoint(point, threshold = 10) {
        const dist = this.distanceToPoint(point);
        return dist <= threshold;
    }

    /**
     * Calculate distance from point to line segment
     */
    distanceToPoint(point) {
        const A = point.x - this.start.x;
        const B = point.y - this.start.y;
        const C = this.end.x - this.start.x;
        const D = this.end.y - this.start.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        let param = -1;
        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = this.start.x;
            yy = this.start.y;
        } else if (param > 1) {
            xx = this.end.x;
            yy = this.end.y;
        } else {
            xx = this.start.x + param * C;
            yy = this.start.y + param * D;
        }

        const dx = point.x - xx;
        const dy = point.y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

/**
 * Line-Line Intersection Algorithm
 * Returns intersection point if lines intersect, null otherwise
 */
function lineLineIntersection(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;
    const x4 = p4.x, y4 = p4.y;

    // Calculate denominators
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    // Lines are parallel if denominator is zero
    if (Math.abs(denom) < 1e-10) {
        return null;
    }

    // Calculate intersection parameters
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    // Check if intersection is within both line segments
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return {
            x: x1 + t * (x2 - x1),
            y: y1 + t * (y2 - y1),
            t: t,  // Parameter along first line (0 to 1)
            u: u   // Parameter along second line (0 to 1)
        };
    }

    return null;
}

/**
 * Find all wall intersections along a signal path
 */
function findWallIntersections(transmitter, receiver, walls) {
    const intersections = [];

    for (const wall of walls) {
        const intersection = lineLineIntersection(
            transmitter,
            receiver,
            wall.start,
            wall.end
        );

        if (intersection) {
            // Calculate distance from transmitter to intersection
            const dx = intersection.x - transmitter.x;
            const dy = intersection.y - transmitter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            intersections.push({
                wall: wall,
                point: { x: intersection.x, y: intersection.y },
                distance: distance,
                t: intersection.t
            });
        }
    }

    // Sort by distance from transmitter (nearest first)
    intersections.sort((a, b) => a.distance - b.distance);

    return intersections;
}

/**
 * Calculate penetration angle factor
 * Signal loss increases when hitting walls at shallow angles
 */
function calculatePenetrationAngle(signalDirection, wall) {
    // Calculate wall normal vector
    const wallDx = wall.end.x - wall.start.x;
    const wallDy = wall.end.y - wall.start.y;
    const wallLength = Math.sqrt(wallDx * wallDx + wallDy * wallDy);

    // Wall tangent (normalized)
    const wallTangentX = wallDx / wallLength;
    const wallTangentY = wallDy / wallLength;

    // Wall normal (perpendicular to tangent)
    const wallNormalX = -wallTangentY;
    const wallNormalY = wallTangentX;

    // Signal direction (normalized)
    const sigLength = Math.sqrt(signalDirection.x ** 2 + signalDirection.y ** 2);
    const sigDirX = signalDirection.x / sigLength;
    const sigDirY = signalDirection.y / sigLength;

    // Dot product gives cosine of angle
    const dotProduct = Math.abs(sigDirX * wallNormalX + sigDirY * wallNormalY);

    // Map from [0, 1] to [0.5, 1.0]
    // 0 = parallel (grazing) -> 0.5 factor
    // 1 = perpendicular -> 1.0 factor
    return 0.5 + 0.5 * dotProduct;
}

class TrilaterationSimulator {
    constructor() {
        // Canvas container
        this.canvas = document.getElementById('mainCanvas');
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Three.js setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xffffff);

        // Orthographic camera for 2D view (looking down at XY plane)
        const aspect = width / height;
        this.camera = new THREE.OrthographicCamera(
            -width / 2, width / 2,    // left, right
            height / 2, -height / 2,  // top, bottom (inverted for canvas-like coords)
            0.1, 1000                 // near, far
        );
        this.camera.position.z = 10;
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Raycaster for mouse interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Groups for organizing objects
        this.floorPlanGroup = new THREE.Group();
        this.gridGroup = new THREE.Group();
        this.heatmapGroup = new THREE.Group();
        this.circlesGroup = new THREE.Group();
        this.debugLinesGroup = new THREE.Group();
        this.wallsGroup = new THREE.Group();
        this.wallIntersectionsGroup = new THREE.Group();
        this.radiosGroup = new THREE.Group();
        this.deviceGroup = new THREE.Group();
        this.estimatedGroup = new THREE.Group();

        this.scene.add(this.floorPlanGroup);
        this.scene.add(this.gridGroup);
        this.scene.add(this.heatmapGroup);
        this.scene.add(this.circlesGroup);
        this.scene.add(this.debugLinesGroup);
        this.scene.add(this.wallsGroup);
        this.scene.add(this.wallIntersectionsGroup);
        this.scene.add(this.radiosGroup);
        this.scene.add(this.deviceGroup);
        this.scene.add(this.estimatedGroup);

        // RSSI Model Parameters (configurable)
        this.txPower = -59;           // dBm at 1 meter
        this.pathLossExponent = 2.7;  // n (2.0 = free space, 2.7-3.5 = indoor)
        this.minRSSI = -100;          // Minimum detectable RSSI

        // Noise settings
        this.enableNoise = false;
        this.noiseStdDev = 5;

        // Visualization options
        this.showDebugLines = false;
        this.enableHeatmap = false;

        // Wall options
        this.enableWalls = false;
        this.enableAngleEffect = true;
        this.enableCumulativeEffect = true;
        this.showWallIntersections = false;

        // Floor plan image
        this.floorPlan = {
            image: null,
            texture: null,
            mesh: null,
            scale: 40,  // pixels per meter (matches grid)
            opacity: 0.5,
            show: false
        };

        // Scale factor (pixels per meter)
        this.scale = 40; // 40 pixels = 1 meter

        // Coordinate system adjustment (Three.js uses center origin)
        this.width = width;
        this.height = height;

        // Radios (transmitters)
        this.radios = [];
        this.numRadios = 4;

        // Walls (obstacles)
        this.walls = [];
        this.initializeWalls();

        // Device (receiver) - stored in canvas coordinates
        this.device = {
            x: width / 2,
            y: height / 2,
            radius: 12
        };

        // Estimated position from trilateration
        this.estimatedPosition = null;

        // Interaction state
        this.dragging = null;
        this.dragOffset = { x: 0, y: 0 };
        this.interactiveObjects = [];

        // Wall editing state
        this.drawWallMode = false;
        this.selectedWallMaterial = 'drywall';
        this.tempWall = null;
        this.selectedWall = null;

        this.init();
    }

    init() {
        this.initializeRadios();
        this.createGrid();
        this.setupEventListeners();
        this.updateUI();
        this.animate();
    }

    // Convert canvas coordinates (origin top-left) to Three.js coordinates (origin center)
    canvasToThree(x, y) {
        return {
            x: x - this.width / 2,
            y: -(y - this.height / 2),
            z: 0
        };
    }

    // Convert Three.js coordinates to canvas coordinates
    threeToCanvas(x, y) {
        return {
            x: x + this.width / 2,
            y: -(y - this.height / 2)
        };
    }

    initializeRadios() {
        this.radios = [];
        const margin = 80;
        const width = this.width - 2 * margin;
        const height = this.height - 2 * margin;

        // Position radios in a pattern based on count
        if (this.numRadios === 3) {
            // Triangle
            this.radios = [
                { x: this.width / 2, y: margin, radius: 10, label: 'R1' },
                { x: margin, y: this.height - margin, radius: 10, label: 'R2' },
                { x: this.width - margin, y: this.height - margin, radius: 10, label: 'R3' }
            ];
        } else if (this.numRadios === 4) {
            // Square corners
            this.radios = [
                { x: margin, y: margin, radius: 10, label: 'R1' },
                { x: this.width - margin, y: margin, radius: 10, label: 'R2' },
                { x: this.width - margin, y: this.height - margin, radius: 10, label: 'R3' },
                { x: margin, y: this.height - margin, radius: 10, label: 'R4' }
            ];
        } else if (this.numRadios === 5) {
            // Pentagon
            const centerX = this.width / 2;
            const centerY = this.height / 2;
            const radius = Math.min(width, height) / 2;
            for (let i = 0; i < 5; i++) {
                const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
                this.radios.push({
                    x: centerX + radius * Math.cos(angle),
                    y: centerY + radius * Math.sin(angle),
                    radius: 10,
                    label: `R${i + 1}`
                });
            }
        } else if (this.numRadios === 6) {
            // Hexagon
            const centerX = this.width / 2;
            const centerY = this.height / 2;
            const radius = Math.min(width, height) / 2;
            for (let i = 0; i < 6; i++) {
                const angle = (i * 2 * Math.PI / 6) - Math.PI / 2;
                this.radios.push({
                    x: centerX + radius * Math.cos(angle),
                    y: centerY + radius * Math.sin(angle),
                    radius: 10,
                    label: `R${i + 1}`
                });
            }
        }
    }

    initializeWalls() {
        this.walls = [];

        // Demo walls - create a simple room layout
        const cx = this.width / 2;
        const cy = this.height / 2;
        const offset = 150;

        // Vertical wall dividing the space
        this.walls.push(new Wall(
            { x: cx, y: cy - offset },
            { x: cx, y: cy + offset },
            'drywall'
        ));

        // Horizontal wall segment (concrete)
        this.walls.push(new Wall(
            { x: cx - offset, y: cy - 80 },
            { x: cx - 50, y: cy - 80 },
            'concrete'
        ));
    }

    createGrid() {
        // Clear existing grid
        this.gridGroup.clear();

        const gridColor = 0xf0f0f0;
        const material = new THREE.LineBasicMaterial({ color: gridColor });

        // Vertical lines (every meter)
        for (let x = 0; x < this.width; x += this.scale) {
            const threePos = this.canvasToThree(x, 0);
            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(threePos.x, this.height / 2, 0),
                new THREE.Vector3(threePos.x, -this.height / 2, 0)
            ]);
            const line = new THREE.Line(geometry, material);
            this.gridGroup.add(line);
        }

        // Horizontal lines
        for (let y = 0; y < this.height; y += this.scale) {
            const threePos = this.canvasToThree(0, y);
            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-this.width / 2, threePos.y, 0),
                new THREE.Vector3(this.width / 2, threePos.y, 0)
            ]);
            const line = new THREE.Line(geometry, material);
            this.gridGroup.add(line);
        }
    }

    setupEventListeners() {
        // Canvas mouse events
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.handleMouseUp());

        // Keyboard events
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                this.deleteSelectedWall();
            } else if (e.key === 'Escape') {
                this.drawWallMode = false;
                this.tempWall = null;
                this.selectedWall = null;
                const btn = document.getElementById('drawWallBtn');
                btn.textContent = '🖊️ Draw Wall Mode (OFF)';
                btn.style.backgroundColor = '';
                this.canvas.style.cursor = 'default';
            }
        });

        // Controls
        document.getElementById('txPower').addEventListener('input', (e) => {
            this.txPower = parseFloat(e.target.value);
            this.updateUI();
        });

        document.getElementById('pathLossExponent').addEventListener('input', (e) => {
            this.pathLossExponent = parseFloat(e.target.value);
            this.updateUI();
        });

        document.getElementById('minRSSI').addEventListener('input', (e) => {
            this.minRSSI = parseFloat(e.target.value);
            this.updateUI();
        });

        document.getElementById('enableNoise').addEventListener('change', (e) => {
            this.enableNoise = e.target.checked;
            document.getElementById('noiseLevel').disabled = !this.enableNoise;
            this.updateUI();
        });

        document.getElementById('noiseLevel').addEventListener('input', (e) => {
            this.noiseStdDev = parseFloat(e.target.value);
            this.updateUI();
        });

        document.getElementById('showDebugLines').addEventListener('change', (e) => {
            this.showDebugLines = e.target.checked;
        });

        document.getElementById('enableHeatmap').addEventListener('change', (e) => {
            this.enableHeatmap = e.target.checked;
        });

        // Floor plan controls
        document.getElementById('floorPlanUpload').addEventListener('change', (e) => {
            this.handleFloorPlanUpload(e);
        });

        document.getElementById('showFloorPlan').addEventListener('change', (e) => {
            this.floorPlan.show = e.target.checked;
            this.updateFloorPlan();
        });

        document.getElementById('floorPlanOpacity').addEventListener('input', (e) => {
            this.floorPlan.opacity = parseFloat(e.target.value);
            document.querySelector('#floorPlanOpacity + .value-display').textContent = e.target.value;
            this.updateFloorPlan();
        });

        document.getElementById('floorPlanScale').addEventListener('input', (e) => {
            this.floorPlan.scale = parseFloat(e.target.value);
            document.querySelector('#floorPlanScale + .value-display').textContent = e.target.value;
            this.updateFloorPlan();
        });

        document.getElementById('clearFloorPlanBtn').addEventListener('click', () => {
            this.clearFloorPlan();
        });

        document.getElementById('enableWalls').addEventListener('change', (e) => {
            this.enableWalls = e.target.checked;
        });

        document.getElementById('showWallIntersections').addEventListener('change', (e) => {
            this.showWallIntersections = e.target.checked;
        });

        document.getElementById('enableAngleEffect').addEventListener('change', (e) => {
            this.enableAngleEffect = e.target.checked;
        });

        document.getElementById('enableCumulativeEffect').addEventListener('change', (e) => {
            this.enableCumulativeEffect = e.target.checked;
        });

        // Wall editor controls
        document.getElementById('drawWallBtn').addEventListener('click', () => {
            this.drawWallMode = !this.drawWallMode;
            const btn = document.getElementById('drawWallBtn');
            btn.textContent = this.drawWallMode ? '🖊️ Draw Wall Mode (ON)' : '🖊️ Draw Wall Mode (OFF)';
            btn.style.backgroundColor = this.drawWallMode ? '#4CAF50' : '';
            this.canvas.style.cursor = this.drawWallMode ? 'crosshair' : 'default';
        });

        document.getElementById('wallMaterial').addEventListener('change', (e) => {
            this.selectedWallMaterial = e.target.value;
        });

        document.getElementById('deleteWallBtn').addEventListener('click', () => {
            this.deleteSelectedWall();
        });

        document.getElementById('clearAllWallsBtn').addEventListener('click', () => {
            if (confirm('Delete all walls?')) {
                this.walls = [];
                this.initializeWalls(); // Re-add demo walls
                this.updateWallCount();
            }
        });

        document.getElementById('numRadios').addEventListener('change', (e) => {
            this.numRadios = parseInt(e.target.value);
            this.initializeRadios();
            this.updateUI();
        });

        document.getElementById('resetBtn').addEventListener('click', () => {
            this.initializeRadios();
            this.device.x = this.width / 2;
            this.device.y = this.height / 2;
            this.updateUI();
        });
    }

    updateUI() {
        // Update value displays
        document.querySelector('#txPower + .value-display').textContent = `${this.txPower} dBm`;
        document.querySelector('#pathLossExponent + .value-display').textContent = this.pathLossExponent.toFixed(1);
        document.querySelector('#minRSSI + .value-display').textContent = `${this.minRSSI} dBm`;
        document.querySelector('#noiseLevel + .value-display').textContent = this.noiseStdDev.toFixed(1);
    }

    // =========================================================================
    // RSSI Model Implementation
    // =========================================================================

    /**
     * Calculate true Euclidean distance between two points
     */
    calculateTrueDistance(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy) / this.scale; // Convert pixels to meters
    }

    /**
     * Calculate expected RSSI based on distance using path-loss model
     * RSSI = TxPower - 10 * n * log10(d) - WallAttenuation
     * @param {Number} distanceMeters - Distance in meters
     * @param {Object} transmitter - Transmitter position {x, y} (optional, for wall calculation)
     * @param {Object} receiver - Receiver position {x, y} (optional, for wall calculation)
     */
    calculateRSSI(distanceMeters, transmitter = null, receiver = null) {
        if (distanceMeters < 0.1) distanceMeters = 0.1; // Avoid log(0)

        let rssi = this.txPower - 10 * this.pathLossExponent * Math.log10(distanceMeters);

        // Apply wall attenuation if enabled and positions provided
        if (this.enableWalls && transmitter && receiver && this.walls.length > 0) {
            const intersections = findWallIntersections(transmitter, receiver, this.walls);

            let totalAttenuation = 0;
            let cumulativeFactor = 1.0;

            for (let i = 0; i < intersections.length; i++) {
                const intersection = intersections[i];
                let wallLoss = intersection.wall.attenuation;

                // Apply penetration angle effect if enabled
                if (this.enableAngleEffect) {
                    const dx = receiver.x - transmitter.x;
                    const dy = receiver.y - transmitter.y;
                    const signalDir = { x: dx, y: dy };
                    const angleFactor = calculatePenetrationAngle(signalDir, intersection.wall);
                    wallLoss *= angleFactor;
                }

                // Apply cumulative effect if enabled (each wall increases loss slightly)
                if (this.enableCumulativeEffect && i > 0) {
                    cumulativeFactor *= 1.1;
                }

                totalAttenuation += wallLoss * cumulativeFactor;
            }

            rssi -= totalAttenuation;
        }

        // Add Gaussian noise if enabled
        if (this.enableNoise) {
            const noise = this.gaussianRandom(0, this.noiseStdDev);
            rssi += noise;
        }

        // Clamp to realistic range
        return Math.max(-120, Math.min(-30, rssi));
    }

    /**
     * Estimate distance from RSSI using inverse path-loss model
     * d = 10^((TxPower - RSSI) / (10 * n))
     */
    estimateDistanceFromRSSI(rssi) {
        const exponent = (this.txPower - rssi) / (10 * this.pathLossExponent);
        return Math.pow(10, exponent); // Returns distance in meters
    }

    /**
     * Generate Gaussian random number (Box-Muller transform)
     */
    gaussianRandom(mean, stdDev) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + stdDev * z0;
    }

    /**
     * Get RSSI color based on strength
     */
    getRSSIColor(rssi) {
        if (rssi >= -60) return '#4CAF50'; // Green - strong
        if (rssi >= -80) return '#FF9800'; // Orange - medium
        return '#F44336'; // Red - weak
    }

    /**
     * Get RSSI class for styling
     */
    getRSSIClass(rssi) {
        if (rssi >= -60) return 'rssi-strong';
        if (rssi >= -80) return 'rssi-medium';
        return 'rssi-weak';
    }

    // =========================================================================
    // Trilateration Algorithm - Non-Linear Least Squares
    // =========================================================================

    /**
     * Perform trilateration using estimated distances from RSSI
     * Uses non-linear least squares optimization to minimize error across all radios
     */
    performTrilateration() {
        // Calculate RSSI and estimated distances for all radios
        const measurements = [];

        for (const radio of this.radios) {
            const trueDistance = this.calculateTrueDistance(
                radio.x, radio.y, this.device.x, this.device.y
            );

            // Calculate RSSI with wall attenuation if enabled
            const transmitter = { x: radio.x, y: radio.y };
            const receiver = { x: this.device.x, y: this.device.y };
            const rssi = this.calculateRSSI(trueDistance, transmitter, receiver);

            // Only include measurements above minimum threshold
            if (rssi >= this.minRSSI) {
                const estimatedDistance = this.estimateDistanceFromRSSI(rssi);

                // Find wall intersections for this radio
                const intersections = this.enableWalls ?
                    findWallIntersections(transmitter, receiver, this.walls) : [];

                measurements.push({
                    radio: radio,
                    rssi: rssi,
                    trueDistance: trueDistance,
                    estimatedDistance: estimatedDistance,
                    wallIntersections: intersections
                });
            }
        }

        // Need at least 3 measurements for trilateration
        if (measurements.length < 3) {
            this.estimatedPosition = null;
            this.showStatusMessage('Insufficient radios (need ≥3 with RSSI ≥ ' + this.minRSSI + ' dBm)', 'warning');
            return measurements;
        }

        // Use least-squares optimization with all measurements
        this.estimatedPosition = this.leastSquaresTrilateration(measurements);

        if (this.estimatedPosition) {
            this.hideStatusMessage();
        } else {
            this.showStatusMessage('Trilateration failed - unable to find solution', 'warning');
        }

        return measurements;
    }

    /**
     * Non-linear least squares trilateration using all available measurements
     * Minimizes: sum of (measured_distance - actual_distance)^2
     */
    leastSquaresTrilateration(measurements) {
        // Initial guess: weighted centroid of radio positions
        let initialX = 0;
        let initialY = 0;
        let totalWeight = 0;

        for (const m of measurements) {
            // Weight by RSSI strength (stronger signals get more weight)
            const weight = Math.pow(10, (m.rssi + 100) / 20);
            initialX += m.radio.x * weight;
            initialY += m.radio.y * weight;
            totalWeight += weight;
        }

        initialX /= totalWeight;
        initialY /= totalWeight;

        // If we have exactly 3 measurements and they're not collinear,
        // use geometric solution as initial guess
        if (measurements.length === 3) {
            const geometricSolution = this.geometricTrilateration(measurements);
            if (geometricSolution) {
                initialX = geometricSolution.x;
                initialY = geometricSolution.y;
            }
        }

        // Gauss-Newton optimization
        let x = initialX;
        let y = initialY;
        const maxIterations = 100;
        const convergenceThreshold = 0.01; // pixels

        for (let iter = 0; iter < maxIterations; iter++) {
            let sumJtJ_xx = 0, sumJtJ_yy = 0, sumJtJ_xy = 0;
            let sumJtr_x = 0, sumJtr_y = 0;

            // Build normal equations: J^T * J * delta = J^T * r
            for (const m of measurements) {
                const dx = x - m.radio.x;
                const dy = y - m.radio.y;
                const predictedDist = Math.sqrt(dx * dx + dy * dy);

                // Avoid division by zero
                if (predictedDist < 0.1) continue;

                const measuredDist = m.estimatedDistance * this.scale; // Convert to pixels
                const residual = predictedDist - measuredDist;

                // Jacobian: d(distance)/d(x) and d(distance)/d(y)
                const J_x = dx / predictedDist;
                const J_y = dy / predictedDist;

                // Accumulate J^T * J
                sumJtJ_xx += J_x * J_x;
                sumJtJ_yy += J_y * J_y;
                sumJtJ_xy += J_x * J_y;

                // Accumulate J^T * r
                sumJtr_x += J_x * residual;
                sumJtr_y += J_y * residual;
            }

            // Solve 2x2 system: [sumJtJ_xx, sumJtJ_xy] [delta_x] = -[sumJtr_x]
            //                   [sumJtJ_xy, sumJtJ_yy] [delta_y]    [sumJtr_y]
            const det = sumJtJ_xx * sumJtJ_yy - sumJtJ_xy * sumJtJ_xy;

            if (Math.abs(det) < 1e-10) {
                // Matrix is singular, can't continue
                break;
            }

            const delta_x = -(sumJtJ_yy * sumJtr_x - sumJtJ_xy * sumJtr_y) / det;
            const delta_y = -(sumJtJ_xx * sumJtr_y - sumJtJ_xy * sumJtr_x) / det;

            // Update position
            x += delta_x;
            y += delta_y;

            // Check convergence
            const deltaLength = Math.sqrt(delta_x * delta_x + delta_y * delta_y);
            if (deltaLength < convergenceThreshold) {
                break;
            }
        }

        // Validate result is within reasonable bounds
        if (x < -100 || x > this.width + 100 || y < -100 || y > this.height + 100) {
            return null;
        }

        return { x, y };
    }

    /**
     * Geometric trilateration for exactly 3 measurements (closed-form solution)
     * Used as initial guess for least-squares optimization
     */
    geometricTrilateration(measurements) {
        if (measurements.length !== 3) return null;

        const [m1, m2, m3] = measurements;

        // Convert estimated distances to pixels
        const r1 = m1.estimatedDistance * this.scale;
        const r2 = m2.estimatedDistance * this.scale;
        const r3 = m3.estimatedDistance * this.scale;

        // Radio positions
        const x1 = m1.radio.x, y1 = m1.radio.y;
        const x2 = m2.radio.x, y2 = m2.radio.y;
        const x3 = m3.radio.x, y3 = m3.radio.y;

        // Trilateration calculations
        const A = 2 * (x2 - x1);
        const B = 2 * (y2 - y1);
        const C = r1 * r1 - r2 * r2 - x1 * x1 + x2 * x2 - y1 * y1 + y2 * y2;
        const D = 2 * (x3 - x2);
        const E = 2 * (y3 - y2);
        const F = r2 * r2 - r3 * r3 - x2 * x2 + x3 * x3 - y2 * y2 + y3 * y3;

        const denominator = (A * E - B * D);

        if (Math.abs(denominator) < 0.001) {
            // Radios are collinear
            return null;
        }

        const x = (C * E - F * B) / denominator;
        const y = (A * F - D * C) / denominator;

        return { x, y };
    }

    // =========================================================================
    // Three.js Rendering
    // =========================================================================

    animate() {
        requestAnimationFrame(() => this.animate());
        this.render();
    }

    render() {
        // Perform trilateration and get measurements
        const measurements = this.performTrilateration();

        // Update all visual elements
        this.updateHeatmap();
        this.updateRangingCircles(measurements);
        this.updateDebugLines();
        this.updateWalls();
        this.updateWallIntersections(measurements);
        this.updateRadios();
        this.updateDevice();
        this.updateEstimatedPosition();

        // Update data tables
        this.updateDataTables(measurements);

        // Render the scene
        this.renderer.render(this.scene, this.camera);
    }

    updateHeatmap() {
        this.heatmapGroup.clear();

        if (!this.enableHeatmap) return;

        const resolution = 20;
        const geometry = new THREE.PlaneGeometry(resolution, resolution);

        for (let x = 0; x < this.width; x += resolution) {
            for (let y = 0; y < this.height; y += resolution) {
                let maxRSSI = -120;

                for (const radio of this.radios) {
                    const distance = this.calculateTrueDistance(radio.x, radio.y, x, y);
                    const transmitter = { x: radio.x, y: radio.y };
                    const receiver = { x: x, y: y };
                    const rssi = this.calculateRSSI(distance, transmitter, receiver);
                    maxRSSI = Math.max(maxRSSI, rssi);
                }

                const normalized = (maxRSSI + 100) / 40;
                const clamped = Math.max(0, Math.min(1, normalized));

                const r = 1 - clamped;
                const g = clamped;
                const b = 0;

                const material = new THREE.MeshBasicMaterial({
                    color: new THREE.Color(r, g, b),
                    transparent: true,
                    opacity: 0.12
                });

                const mesh = new THREE.Mesh(geometry, material);
                const threePos = this.canvasToThree(x, y);
                mesh.position.set(threePos.x, threePos.y, -1);
                this.heatmapGroup.add(mesh);
            }
        }
    }

    updateRangingCircles(measurements) {
        this.circlesGroup.clear();

        for (const m of measurements) {
            const radius = m.estimatedDistance * this.scale;
            const opacity = Math.max(0.2, Math.min(0.7, (m.rssi + 100) / 40));
            const colorHex = this.getRSSIColor(m.rssi);
            const color = new THREE.Color(colorHex);

            // Create circle
            const geometry = new THREE.RingGeometry(radius - 1, radius + 1, 64);
            const material = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: opacity,
                side: THREE.DoubleSide
            });

            const circle = new THREE.Mesh(geometry, material);
            const threePos = this.canvasToThree(m.radio.x, m.radio.y);
            circle.position.set(threePos.x, threePos.y, 1);
            this.circlesGroup.add(circle);

            // Add filled circle with low opacity
            const fillGeometry = new THREE.CircleGeometry(radius, 64);
            const fillMaterial = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: opacity * 0.1,
                side: THREE.DoubleSide
            });
            const fill = new THREE.Mesh(fillGeometry, fillMaterial);
            fill.position.set(threePos.x, threePos.y, 0.5);
            this.circlesGroup.add(fill);
        }
    }

    updateDebugLines() {
        this.debugLinesGroup.clear();

        if (!this.showDebugLines) return;

        const material = new THREE.LineBasicMaterial({
            color: 0x969696,
            transparent: true,
            opacity: 0.3
        });

        for (const radio of this.radios) {
            const radioPos = this.canvasToThree(radio.x, radio.y);
            const devicePos = this.canvasToThree(this.device.x, this.device.y);

            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(radioPos.x, radioPos.y, 0),
                new THREE.Vector3(devicePos.x, devicePos.y, 0)
            ]);

            const line = new THREE.Line(geometry, material);
            this.debugLinesGroup.add(line);
        }
    }

    updateWalls() {
        this.wallsGroup.clear();

        // Render permanent walls
        const wallsToRender = this.enableWalls ? this.walls : [];

        for (const wall of wallsToRender) {
            const isSelected = wall === this.selectedWall;
            this.renderWall(wall, isSelected);
        }

        // Render temporary wall being drawn
        if (this.tempWall) {
            this.renderWall(this.tempWall, false, true);
        }
    }

    renderWall(wall, isSelected = false, isTemp = false) {
        const startPos = this.canvasToThree(wall.start.x, wall.start.y);
        const endPos = this.canvasToThree(wall.end.x, wall.end.y);

        // Wall line
        const material = new THREE.LineBasicMaterial({
            color: isSelected ? 0xffff00 : wall.color,
            linewidth: isSelected ? 5 : 3,
            transparent: true,
            opacity: isTemp ? 0.5 : 0.8
        });

        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(startPos.x, startPos.y, 2),
            new THREE.Vector3(endPos.x, endPos.y, 2)
        ]);

        const line = new THREE.Line(geometry, material);
        this.wallsGroup.add(line);

        // Add thicker background line for better visibility
        const bgMaterial = new THREE.LineBasicMaterial({
            color: isSelected ? 0xffaa00 : 0x000000,
            linewidth: isSelected ? 7 : 5,
            transparent: true,
            opacity: 0.2
        });

        const bgGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(startPos.x, startPos.y, 1.9),
            new THREE.Vector3(endPos.x, endPos.y, 1.9)
        ]);

        const bgLine = new THREE.Line(bgGeometry, bgMaterial);
        this.wallsGroup.add(bgLine);

        // Draw endpoints for selected wall
        if (isSelected) {
            const endpointGeometry = new THREE.CircleGeometry(6, 16);
            const endpointMaterial = new THREE.MeshBasicMaterial({
                color: 0xffff00,
                side: THREE.DoubleSide
            });

            const startCircle = new THREE.Mesh(endpointGeometry, endpointMaterial);
            startCircle.position.set(startPos.x, startPos.y, 2.5);
            this.wallsGroup.add(startCircle);

            const endCircle = new THREE.Mesh(endpointGeometry, endpointMaterial);
            endCircle.position.set(endPos.x, endPos.y, 2.5);
            this.wallsGroup.add(endCircle);
        }
    }

    deleteSelectedWall() {
        if (!this.selectedWall) return;

        const index = this.walls.indexOf(this.selectedWall);
        if (index > -1) {
            this.walls.splice(index, 1);
            this.selectedWall = null;
            this.updateWallCount();
        }
    }

    updateWallCount() {
        const countEl = document.getElementById('wallCount');
        if (countEl) {
            countEl.textContent = this.walls.length;
        }
    }

    updateWallIntersections(measurements) {
        this.wallIntersectionsGroup.clear();

        if (!this.enableWalls || !this.showWallIntersections) return;

        for (const m of measurements) {
            if (!m.wallIntersections || m.wallIntersections.length === 0) continue;

            for (const intersection of m.wallIntersections) {
                const pos = this.canvasToThree(intersection.point.x, intersection.point.y);

                // Draw intersection point as red circle
                const geometry = new THREE.CircleGeometry(5, 16);
                const material = new THREE.MeshBasicMaterial({
                    color: 0xff0000,
                    side: THREE.DoubleSide
                });

                const circle = new THREE.Mesh(geometry, material);
                circle.position.set(pos.x, pos.y, 3.5);
                this.wallIntersectionsGroup.add(circle);

                // Add border
                const borderGeometry = new THREE.RingGeometry(4.5, 6, 16);
                const borderMaterial = new THREE.MeshBasicMaterial({
                    color: 0x880000,
                    side: THREE.DoubleSide
                });
                const border = new THREE.Mesh(borderGeometry, borderMaterial);
                border.position.set(pos.x, pos.y, 3.6);
                this.wallIntersectionsGroup.add(border);
            }
        }
    }

    // =========================================================================
    // Floor Plan Image Handling
    // =========================================================================

    handleFloorPlanUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please select a valid image file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.floorPlan.image = img;
                this.loadFloorPlanTexture(img);

                // Update UI
                const info = document.getElementById('floorPlanInfo');
                info.textContent = `${file.name} (${img.width}×${img.height}px)`;

                // Auto-enable display
                document.getElementById('showFloorPlan').checked = true;
                this.floorPlan.show = true;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    loadFloorPlanTexture(img) {
        // Create texture from image
        const texture = new THREE.Texture(img);
        texture.needsUpdate = true;
        this.floorPlan.texture = texture;

        // Update the display
        this.updateFloorPlan();
    }

    updateFloorPlan() {
        // Clear existing floor plan
        this.floorPlanGroup.clear();

        if (!this.floorPlan.show || !this.floorPlan.texture) return;

        // Create plane geometry matching canvas size
        const geometry = new THREE.PlaneGeometry(this.width, this.height);

        // Create material with texture
        const material = new THREE.MeshBasicMaterial({
            map: this.floorPlan.texture,
            transparent: true,
            opacity: this.floorPlan.opacity,
            side: THREE.DoubleSide
        });

        // Create mesh
        this.floorPlan.mesh = new THREE.Mesh(geometry, material);

        // Position at origin (covers entire canvas)
        this.floorPlan.mesh.position.set(0, 0, -2);

        this.floorPlanGroup.add(this.floorPlan.mesh);
    }

    clearFloorPlan() {
        this.floorPlan.image = null;
        this.floorPlan.texture = null;
        this.floorPlan.mesh = null;
        this.floorPlan.show = false;

        this.floorPlanGroup.clear();

        // Reset UI
        document.getElementById('floorPlanUpload').value = '';
        document.getElementById('showFloorPlan').checked = false;
        document.getElementById('floorPlanInfo').textContent = '';
    }

    updateRadios() {
        this.radiosGroup.clear();
        this.interactiveObjects = [];

        for (const radio of this.radios) {
            const threePos = this.canvasToThree(radio.x, radio.y);

            // Radio circle
            const geometry = new THREE.CircleGeometry(radio.radius, 32);
            const material = new THREE.MeshBasicMaterial({
                color: 0x4CAF50,
                side: THREE.DoubleSide
            });
            const circle = new THREE.Mesh(geometry, material);
            circle.position.set(threePos.x, threePos.y, 3);
            circle.userData = { type: 'radio', radio: radio };
            this.radiosGroup.add(circle);
            this.interactiveObjects.push(circle);

            // Border
            const borderGeometry = new THREE.RingGeometry(radio.radius - 0.5, radio.radius + 1.5, 32);
            const borderMaterial = new THREE.MeshBasicMaterial({
                color: 0x2E7D32,
                side: THREE.DoubleSide
            });
            const border = new THREE.Mesh(borderGeometry, borderMaterial);
            border.position.set(threePos.x, threePos.y, 3.1);
            this.radiosGroup.add(border);
        }
    }

    updateDevice() {
        this.deviceGroup.clear();

        const threePos = this.canvasToThree(this.device.x, this.device.y);

        // Device circle
        const geometry = new THREE.CircleGeometry(this.device.radius, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0xFF5722,
            side: THREE.DoubleSide
        });
        const circle = new THREE.Mesh(geometry, material);
        circle.position.set(threePos.x, threePos.y, 3);
        circle.userData = { type: 'device', device: this.device };
        this.deviceGroup.add(circle);
        this.interactiveObjects.push(circle);

        // Border
        const borderGeometry = new THREE.RingGeometry(this.device.radius - 0.5, this.device.radius + 1.5, 32);
        const borderMaterial = new THREE.MeshBasicMaterial({
            color: 0xD84315,
            side: THREE.DoubleSide
        });
        const border = new THREE.Mesh(borderGeometry, borderMaterial);
        border.position.set(threePos.x, threePos.y, 3.1);
        this.deviceGroup.add(border);

        // Cross marker
        const crossMaterial = new THREE.LineBasicMaterial({ color: 0xFFC107 });
        const crossSize = 8;

        const hLine = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(threePos.x - crossSize, threePos.y, 3.2),
            new THREE.Vector3(threePos.x + crossSize, threePos.y, 3.2)
        ]);
        this.deviceGroup.add(new THREE.Line(hLine, crossMaterial));

        const vLine = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(threePos.x, threePos.y - crossSize, 3.2),
            new THREE.Vector3(threePos.x, threePos.y + crossSize, 3.2)
        ]);
        this.deviceGroup.add(new THREE.Line(vLine, crossMaterial));
    }

    updateEstimatedPosition() {
        this.estimatedGroup.clear();

        if (!this.estimatedPosition) return;

        const threePos = this.canvasToThree(this.estimatedPosition.x, this.estimatedPosition.y);

        // Estimated position circle
        const geometry = new THREE.CircleGeometry(10, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0x2196F3,
            side: THREE.DoubleSide
        });
        const circle = new THREE.Mesh(geometry, material);
        circle.position.set(threePos.x, threePos.y, 2);
        this.estimatedGroup.add(circle);

        // Border
        const borderGeometry = new THREE.RingGeometry(9.5, 11.5, 32);
        const borderMaterial = new THREE.MeshBasicMaterial({
            color: 0x1565C0,
            side: THREE.DoubleSide
        });
        const border = new THREE.Mesh(borderGeometry, borderMaterial);
        border.position.set(threePos.x, threePos.y, 2.1);
        this.estimatedGroup.add(border);

        // Error line
        const devicePos = this.canvasToThree(this.device.x, this.device.y);
        const lineMaterial = new THREE.LineDashedMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.5,
            dashSize: 5,
            gapSize: 5
        });

        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(devicePos.x, devicePos.y, 2.5),
            new THREE.Vector3(threePos.x, threePos.y, 2.5)
        ]);
        const line = new THREE.Line(lineGeometry, lineMaterial);
        line.computeLineDistances();
        this.estimatedGroup.add(line);
    }

    // =========================================================================
    // UI Updates
    // =========================================================================

    updateDataTables(measurements) {
        // Radio data table
        let tableHTML = '<table class="data-table"><thead><tr>' +
            '<th>Radio</th><th>RSSI<br/>(dBm)</th><th>Est. Dist<br/>(m)</th><th>True Dist<br/>(m)</th>' +
            '</tr></thead><tbody>';

        // Create a map of all radios with their data
        const dataMap = new Map();
        for (const m of measurements) {
            dataMap.set(m.radio.label, m);
        }

        // Add rows for all radios
        for (const radio of this.radios) {
            const data = dataMap.get(radio.label);
            if (data) {
                const rssiClass = this.getRSSIClass(data.rssi);
                tableHTML += `<tr>
                    <td><strong>${radio.label}</strong></td>
                    <td class="${rssiClass}">${data.rssi.toFixed(1)}</td>
                    <td>${data.estimatedDistance.toFixed(2)}</td>
                    <td>${data.trueDistance.toFixed(2)}</td>
                </tr>`;
            } else {
                const trueDistance = this.calculateTrueDistance(
                    radio.x, radio.y, this.device.x, this.device.y
                );
                tableHTML += `<tr>
                    <td><strong>${radio.label}</strong></td>
                    <td class="rssi-weak">< ${this.minRSSI}</td>
                    <td>-</td>
                    <td>${trueDistance.toFixed(2)}</td>
                </tr>`;
            }
        }

        tableHTML += '</tbody></table>';
        document.getElementById('radioDataTable').innerHTML = tableHTML;

        // Position data
        const deviceXm = this.device.x / this.scale;
        const deviceYm = this.device.y / this.scale;

        let posHTML = `
            <div class="position-info">
                <span class="position-label">True Position:</span>
                <span class="position-value">(${deviceXm.toFixed(2)}, ${deviceYm.toFixed(2)}) m</span>
            </div>
        `;

        if (this.estimatedPosition) {
            const estXm = this.estimatedPosition.x / this.scale;
            const estYm = this.estimatedPosition.y / this.scale;
            const error = this.calculateTrueDistance(
                this.device.x, this.device.y,
                this.estimatedPosition.x, this.estimatedPosition.y
            );

            posHTML += `
                <div class="position-info">
                    <span class="position-label">Estimated Position:</span>
                    <span class="position-value">(${estXm.toFixed(2)}, ${estYm.toFixed(2)}) m</span>
                </div>
                <div class="position-info">
                    <span class="position-label">Position Error:</span>
                    <span class="position-value" style="color: #F44336;">${error.toFixed(2)} m</span>
                </div>
                <div class="position-info">
                    <span class="position-label">Active Radios:</span>
                    <span class="position-value">${measurements.length} / ${this.radios.length}</span>
                </div>
            `;
        } else {
            posHTML += `
                <div class="position-info">
                    <span class="position-label">Estimated Position:</span>
                    <span class="position-value" style="color: #F44336;">N/A</span>
                </div>
                <div class="position-info">
                    <span class="position-label">Active Radios:</span>
                    <span class="position-value">${measurements.length} / ${this.radios.length}</span>
                </div>
            `;
        }

        document.getElementById('positionData').innerHTML = posHTML;
    }

    showStatusMessage(message, type = 'error') {
        const msgEl = document.getElementById('statusMessage');
        msgEl.textContent = message;
        msgEl.className = `status-message show ${type}`;
    }

    hideStatusMessage() {
        const msgEl = document.getElementById('statusMessage');
        msgEl.classList.remove('show');
    }

    // =========================================================================
    // Interaction Handlers
    // =========================================================================

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;

        // Wall drawing mode
        if (this.drawWallMode) {
            this.tempWall = new Wall(
                { x: canvasX, y: canvasY },
                { x: canvasX, y: canvasY },
                this.selectedWallMaterial
            );
            return;
        }

        // Check if clicking on a wall first
        this.selectedWall = null;
        for (const wall of this.walls) {
            if (wall.containsPoint({ x: canvasX, y: canvasY }, 15)) {
                this.selectedWall = wall;
                return;
            }
        }

        // Then check for radio/device dragging
        this.mouse.x = ((e.clientX - rect.left) / this.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / this.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.interactiveObjects);

        if (intersects.length > 0) {
            const obj = intersects[0].object;
            if (obj.userData.type === 'device') {
                this.dragging = obj.userData.device;
                this.dragOffset = {
                    x: this.dragging.x - canvasX,
                    y: this.dragging.y - canvasY
                };
            } else if (obj.userData.type === 'radio') {
                this.dragging = obj.userData.radio;
                this.dragOffset = {
                    x: this.dragging.x - canvasX,
                    y: this.dragging.y - canvasY
                };
            }
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;

        // Update temporary wall endpoint while drawing
        if (this.tempWall) {
            this.tempWall.end.x = canvasX;
            this.tempWall.end.y = canvasY;
            return;
        }

        // Drag radio or device
        if (this.dragging) {
            this.dragging.x = canvasX + this.dragOffset.x;
            this.dragging.y = canvasY + this.dragOffset.y;

            // Keep within bounds
            this.dragging.x = Math.max(20, Math.min(this.width - 20, this.dragging.x));
            this.dragging.y = Math.max(20, Math.min(this.height - 20, this.dragging.y));
        }
    }

    handleMouseUp() {
        // Finalize wall drawing
        if (this.tempWall) {
            // Only add if wall has minimum length
            if (this.tempWall.getLength() > 10) {
                this.walls.push(this.tempWall);
                this.updateWallCount();
            }
            this.tempWall = null;
        }

        this.dragging = null;
    }
}

// Initialize the simulator when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new TrilaterationSimulator();
});
