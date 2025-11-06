// =============================================================================
// Bluetooth Trilateration Simulator - RSSI Edition with Three.js
// Version 1.2
// =============================================================================

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
        this.gridGroup = new THREE.Group();
        this.heatmapGroup = new THREE.Group();
        this.circlesGroup = new THREE.Group();
        this.debugLinesGroup = new THREE.Group();
        this.radiosGroup = new THREE.Group();
        this.deviceGroup = new THREE.Group();
        this.estimatedGroup = new THREE.Group();

        this.scene.add(this.gridGroup);
        this.scene.add(this.heatmapGroup);
        this.scene.add(this.circlesGroup);
        this.scene.add(this.debugLinesGroup);
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

        // Scale factor (pixels per meter)
        this.scale = 40; // 40 pixels = 1 meter

        // Coordinate system adjustment (Three.js uses center origin)
        this.width = width;
        this.height = height;

        // Radios (transmitters)
        this.radios = [];
        this.numRadios = 4;

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
     * RSSI = TxPower - 10 * n * log10(d)
     */
    calculateRSSI(distanceMeters) {
        if (distanceMeters < 0.1) distanceMeters = 0.1; // Avoid log(0)

        let rssi = this.txPower - 10 * this.pathLossExponent * Math.log10(distanceMeters);

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
    // Trilateration Algorithm
    // =========================================================================

    /**
     * Perform trilateration using estimated distances from RSSI
     */
    performTrilateration() {
        // Calculate RSSI and estimated distances for all radios
        const measurements = [];

        for (const radio of this.radios) {
            const trueDistance = this.calculateTrueDistance(
                radio.x, radio.y, this.device.x, this.device.y
            );
            const rssi = this.calculateRSSI(trueDistance);

            // Only include measurements above minimum threshold
            if (rssi >= this.minRSSI) {
                const estimatedDistance = this.estimateDistanceFromRSSI(rssi);
                measurements.push({
                    radio: radio,
                    rssi: rssi,
                    trueDistance: trueDistance,
                    estimatedDistance: estimatedDistance
                });
            }
        }

        // Need at least 3 measurements for trilateration
        if (measurements.length < 3) {
            this.estimatedPosition = null;
            this.showStatusMessage('Insufficient radios (need ≥3 with RSSI ≥ ' + this.minRSSI + ' dBm)', 'warning');
            return measurements;
        }

        // Use first 3 measurements for trilateration
        const [m1, m2, m3] = measurements.slice(0, 3);

        // Convert estimated distances back to pixels
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
            // Radios are collinear - can't trilaterate
            this.estimatedPosition = null;
            this.showStatusMessage('Radios are collinear - cannot trilaterate', 'warning');
            return measurements;
        }

        const x = (C * E - F * B) / denominator;
        const y = (A * F - D * C) / denominator;

        this.estimatedPosition = { x, y };
        this.hideStatusMessage();

        return measurements;
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
                    const rssi = this.calculateRSSI(distance);
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
        this.mouse.x = ((e.clientX - rect.left) / this.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / this.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.interactiveObjects);

        if (intersects.length > 0) {
            const obj = intersects[0].object;
            if (obj.userData.type === 'device') {
                this.dragging = obj.userData.device;
                const canvasX = (e.clientX - rect.left);
                const canvasY = (e.clientY - rect.top);
                this.dragOffset = {
                    x: this.dragging.x - canvasX,
                    y: this.dragging.y - canvasY
                };
            } else if (obj.userData.type === 'radio') {
                this.dragging = obj.userData.radio;
                const canvasX = (e.clientX - rect.left);
                const canvasY = (e.clientY - rect.top);
                this.dragOffset = {
                    x: this.dragging.x - canvasX,
                    y: this.dragging.y - canvasY
                };
            }
        }
    }

    handleMouseMove(e) {
        if (!this.dragging) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.dragging.x = x + this.dragOffset.x;
        this.dragging.y = y + this.dragOffset.y;

        // Keep within bounds
        this.dragging.x = Math.max(20, Math.min(this.width - 20, this.dragging.x));
        this.dragging.y = Math.max(20, Math.min(this.height - 20, this.dragging.y));
    }

    handleMouseUp() {
        this.dragging = null;
    }
}

// Initialize the simulator when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new TrilaterationSimulator();
});
