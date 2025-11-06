// =============================================================================
// Bluetooth Trilateration Simulator - RSSI Edition
// Version 1.1
// =============================================================================

class TrilaterationSimulator {
    constructor() {
        // Canvas setup
        this.canvas = document.getElementById('mainCanvas');
        this.ctx = this.canvas.getContext('2d');

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

        // Radios (transmitters)
        this.radios = [];
        this.numRadios = 4;

        // Device (receiver)
        this.device = {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            radius: 12
        };

        // Estimated position from trilateration
        this.estimatedPosition = null;

        // Interaction state
        this.dragging = null;
        this.dragOffset = { x: 0, y: 0 };

        this.init();
    }

    init() {
        this.initializeRadios();
        this.setupEventListeners();
        this.updateUI();
        this.animate();
    }

    initializeRadios() {
        this.radios = [];
        const margin = 80;
        const width = this.canvas.width - 2 * margin;
        const height = this.canvas.height - 2 * margin;

        // Position radios in a pattern based on count
        if (this.numRadios === 3) {
            // Triangle
            this.radios = [
                { x: this.canvas.width / 2, y: margin, radius: 10, label: 'R1' },
                { x: margin, y: this.canvas.height - margin, radius: 10, label: 'R2' },
                { x: this.canvas.width - margin, y: this.canvas.height - margin, radius: 10, label: 'R3' }
            ];
        } else if (this.numRadios === 4) {
            // Square corners
            this.radios = [
                { x: margin, y: margin, radius: 10, label: 'R1' },
                { x: this.canvas.width - margin, y: margin, radius: 10, label: 'R2' },
                { x: this.canvas.width - margin, y: this.canvas.height - margin, radius: 10, label: 'R3' },
                { x: margin, y: this.canvas.height - margin, radius: 10, label: 'R4' }
            ];
        } else if (this.numRadios === 5) {
            // Pentagon
            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2;
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
            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2;
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
            this.device.x = this.canvas.width / 2;
            this.device.y = this.canvas.height / 2;
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
        // (Can be extended to weighted least squares for N>3)
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
    // Rendering
    // =========================================================================

    animate() {
        this.render();
        requestAnimationFrame(() => this.animate());
    }

    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid
        this.drawGrid();

        // Draw heatmap if enabled
        if (this.enableHeatmap) {
            this.drawHeatmap();
        }

        // Perform trilateration and get measurements
        const measurements = this.performTrilateration();

        // Draw ranging circles (estimated distances)
        this.drawRangingCircles(measurements);

        // Draw debug lines if enabled
        if (this.showDebugLines) {
            this.drawDebugLines();
        }

        // Draw radios
        for (const radio of this.radios) {
            this.drawRadio(radio);
        }

        // Draw device (true position)
        this.drawDevice();

        // Draw estimated position if available
        if (this.estimatedPosition) {
            this.drawEstimatedPosition();
            this.drawPositionError();
        }

        // Update data tables
        this.updateDataTables(measurements);
    }

    drawGrid() {
        this.ctx.strokeStyle = '#f0f0f0';
        this.ctx.lineWidth = 1;

        // Vertical lines (every meter)
        for (let x = 0; x < this.canvas.width; x += this.scale) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }

        // Horizontal lines
        for (let y = 0; y < this.canvas.height; y += this.scale) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }

        // Add scale indicator
        this.ctx.fillStyle = '#888';
        this.ctx.font = '12px monospace';
        this.ctx.fillText(`Grid: ${this.scale}px = 1m`, 10, this.canvas.height - 10);
    }

    drawHeatmap() {
        const resolution = 20; // Pixels between sample points
        const imageData = this.ctx.createImageData(this.canvas.width, this.canvas.height);

        for (let x = 0; x < this.canvas.width; x += resolution) {
            for (let y = 0; y < this.canvas.height; y += resolution) {
                // Calculate combined RSSI at this point
                let maxRSSI = -120;

                for (const radio of this.radios) {
                    const distance = this.calculateTrueDistance(radio.x, radio.y, x, y);
                    const rssi = this.calculateRSSI(distance);
                    maxRSSI = Math.max(maxRSSI, rssi);
                }

                // Map RSSI to color (gradient from red to green)
                const normalized = (maxRSSI + 100) / 40; // -100 to -60 -> 0 to 1
                const clamped = Math.max(0, Math.min(1, normalized));

                const r = Math.floor(255 * (1 - clamped));
                const g = Math.floor(255 * clamped);
                const b = 0;
                const a = 30; // Low opacity

                // Fill the resolution block
                for (let dx = 0; dx < resolution && x + dx < this.canvas.width; dx++) {
                    for (let dy = 0; dy < resolution && y + dy < this.canvas.height; dy++) {
                        const idx = ((y + dy) * this.canvas.width + (x + dx)) * 4;
                        imageData.data[idx] = r;
                        imageData.data[idx + 1] = g;
                        imageData.data[idx + 2] = b;
                        imageData.data[idx + 3] = a;
                    }
                }
            }
        }

        this.ctx.putImageData(imageData, 0, 0);
    }

    drawRangingCircles(measurements) {
        for (const m of measurements) {
            const radius = m.estimatedDistance * this.scale;
            const opacity = Math.max(0.2, Math.min(0.7, (m.rssi + 100) / 40));
            const color = this.getRSSIColor(m.rssi);

            // Circle fill
            this.ctx.beginPath();
            this.ctx.arc(m.radio.x, m.radio.y, radius, 0, 2 * Math.PI);
            this.ctx.fillStyle = this.hexToRGBA(color, opacity * 0.1);
            this.ctx.fill();

            // Circle border
            this.ctx.strokeStyle = this.hexToRGBA(color, opacity);
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
    }

    drawDebugLines() {
        for (const radio of this.radios) {
            this.ctx.beginPath();
            this.ctx.moveTo(radio.x, radio.y);
            this.ctx.lineTo(this.device.x, this.device.y);
            this.ctx.strokeStyle = 'rgba(150, 150, 150, 0.3)';
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([5, 5]);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
    }

    drawRadio(radio) {
        // Radio circle
        this.ctx.beginPath();
        this.ctx.arc(radio.x, radio.y, radio.radius, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#4CAF50';
        this.ctx.fill();
        this.ctx.strokeStyle = '#2E7D32';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();

        // Label
        this.ctx.fillStyle = '#000';
        this.ctx.font = 'bold 12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(radio.label, radio.x, radio.y - radio.radius - 8);
    }

    drawDevice() {
        // Device circle
        this.ctx.beginPath();
        this.ctx.arc(this.device.x, this.device.y, this.device.radius, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#FF5722';
        this.ctx.fill();
        this.ctx.strokeStyle = '#D84315';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();

        // Cross marker for true position
        this.ctx.strokeStyle = '#FFC107';
        this.ctx.lineWidth = 3;
        const crossSize = 8;
        this.ctx.beginPath();
        this.ctx.moveTo(this.device.x - crossSize, this.device.y);
        this.ctx.lineTo(this.device.x + crossSize, this.device.y);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(this.device.x, this.device.y - crossSize);
        this.ctx.lineTo(this.device.x, this.device.y + crossSize);
        this.ctx.stroke();

        // Label
        this.ctx.fillStyle = '#000';
        this.ctx.font = 'bold 12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Device (True)', this.device.x, this.device.y + this.device.radius + 18);
    }

    drawEstimatedPosition() {
        const { x, y } = this.estimatedPosition;

        // Estimated position marker
        this.ctx.beginPath();
        this.ctx.arc(x, y, 10, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#2196F3';
        this.ctx.fill();
        this.ctx.strokeStyle = '#1565C0';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();

        // Label
        this.ctx.fillStyle = '#000';
        this.ctx.font = 'bold 12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Estimated', x, y - 20);
    }

    drawPositionError() {
        const { x, y } = this.estimatedPosition;

        // Error vector
        this.ctx.beginPath();
        this.ctx.moveTo(this.device.x, this.device.y);
        this.ctx.lineTo(x, y);
        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Error magnitude
        const errorMeters = this.calculateTrueDistance(this.device.x, this.device.y, x, y);
        const midX = (this.device.x + x) / 2;
        const midY = (this.device.y + y) / 2;

        this.ctx.fillStyle = '#F44336';
        this.ctx.font = 'bold 11px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`Error: ${errorMeters.toFixed(2)}m`, midX, midY - 5);
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
                // Radio is out of range
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
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if clicking on device
        if (this.isPointInCircle(x, y, this.device.x, this.device.y, this.device.radius)) {
            this.dragging = this.device;
            this.dragOffset = {
                x: this.device.x - x,
                y: this.device.y - y
            };
            return;
        }

        // Check if clicking on any radio
        for (const radio of this.radios) {
            if (this.isPointInCircle(x, y, radio.x, radio.y, radio.radius)) {
                this.dragging = radio;
                this.dragOffset = {
                    x: radio.x - x,
                    y: radio.y - y
                };
                return;
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
        this.dragging.x = Math.max(20, Math.min(this.canvas.width - 20, this.dragging.x));
        this.dragging.y = Math.max(20, Math.min(this.canvas.height - 20, this.dragging.y));
    }

    handleMouseUp() {
        this.dragging = null;
    }

    isPointInCircle(px, py, cx, cy, radius) {
        const dx = px - cx;
        const dy = py - cy;
        return dx * dx + dy * dy <= radius * radius;
    }

    // =========================================================================
    // Utility Functions
    // =========================================================================

    hexToRGBA(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}

// Initialize the simulator when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new TrilaterationSimulator();
});
