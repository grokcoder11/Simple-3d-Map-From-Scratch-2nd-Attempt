export class DebugLogger {
    constructor(game) {
        this.game = game;
        this.logs = [];
        this.standardLogs = [];
        this.lastLogTime = 0;
        this.lastStandardStateTime = 0; // New: Track state logging separately
        this.logInterval = 5;
        this.standardStateInterval = 1; // Log state every 1s for standard
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = this.game.roomSize * 2;
        this.objectsToTrack = ['room', 'box'];
        this.baselineLog = null;
        this.mouseDelta = { x: 0, y: 0 };
        this.init();
    }

    init() {
        const originalConsoleError = console.error;
        console.error = (...args) => this.log('ERROR', args.join(' '));
        document.getElementById('standard-debug-button').addEventListener('click', () => this.exportStandardLogs());
        document.getElementById('deep-debug-1-button').addEventListener('click', () => this.exportDeepLogs(1));
        document.getElementById('deep-debug-2-button').addEventListener('click', () => this.exportDeepLogs(2));
        document.getElementById('deep-debug-3-button').addEventListener('click', () => this.exportDeepLogs(3));
        this.log('EVENT', 'DebugLogger initialized');
        this.logStandard('EVENT', 'Game started');
    }

    log(category, message) {
        const timestamp = new Date().toISOString();
        this.logs.push(`[${timestamp}] [${category}] ${message}`);
        if (this.logs.length > 300) this.logs.shift();
    }

    logStandard(category, message) {
        const timestamp = new Date().toISOString();
        this.standardLogs.push(`[${timestamp}] [${category}] ${message}`);
        if (this.standardLogs.length > 50) this.standardLogs.shift();
    }

    exportStandardLogs() {
        const logText = this.standardLogs.join('\n');
        navigator.clipboard.writeText(logText).then(() => alert('Standard debug log copied to clipboard!'));
        console.log(logText);
    }

    exportDeepLogs(part) {
        const third = Math.ceil(this.logs.length / 3);
        const start = (part - 1) * third;
        const end = part * third;
        const logText = this.logs.slice(start, end).join('\n');
        navigator.clipboard.writeText(logText).then(() => alert(`Deep debug log part ${part}/3 copied to clipboard!`));
        console.log(`Deep Debug Part ${part}/3:\n${logText}`);
        if (part === 3) {
            const summary = `Session Summary: ${this.logs.length} entries, Visual Bugs: ${this.logs.filter(l => l.includes('VISUAL BUG')).length}, ` +
                            `Performance Warnings: ${this.logs.filter(l => l.includes('PERFORMANCE')).length}, Collisions: ${this.logs.filter(l => l.includes('COLLISION')).length}`;
            this.log('SUMMARY', summary);
        }
    }

    update(delta) {
        const currentTime = this.game.clock.getElapsedTime();
        if (currentTime - this.lastLogTime >= this.logInterval) {
            this.logState();
            this.checkVisualBugs();
            this.checkPerformance();
            this.checkObjects();
            this.checkLighting();
            this.checkRenderer();
            this.lastLogTime = currentTime;
            if (!this.baselineLog) this.baselineLog = this.logs.slice(-10);
        }
        if (currentTime - this.lastStandardStateTime >= this.standardStateInterval) {
            this.logStandardState(); // Log state more frequently for standard
            this.lastStandardStateTime = currentTime;
        }
        this.checkHistorical();
        this.mouseDelta = { x: 0, y: 0 };
    }

    logState() {
        const cam = this.game.camera;
        const pos = `Camera Position: (${cam.position.x.toFixed(2)}, ${cam.position.y.toFixed(2)}, ${cam.position.z.toFixed(2)})`;
        const rot = `Camera Rotation: (${cam.rotation.x.toFixed(2)}, ${cam.rotation.y.toFixed(2)}, ${cam.rotation.z.toFixed(2)})`;
        const vel = `Velocity: (${this.game.controls.velocity.x.toFixed(2)}, ${this.game.controls.velocity.y.toFixed(2)}, ${this.game.controls.velocity.z.toFixed(2)})`;
        const inputs = `W:${this.game.controls.moveForward}, S:${this.game.controls.moveBackward}, A:${this.game.controls.moveLeft}, D:${this.game.controls.moveRight}, Space:${this.game.controls.jump}, Mouse: (${this.mouseDelta.x}, ${this.mouseDelta.y})`;
        this.log('STATE', `${pos} | ${rot} | ${vel} | Inputs: ${inputs}`);
    }

    logStandardState() {
        const cam = this.game.camera;
        const pos = `Camera Position: (${cam.position.x.toFixed(2)}, ${cam.position.y.toFixed(2)}, ${cam.position.z.toFixed(2)})`;
        const vel = `Velocity: (${this.game.controls.velocity.x.toFixed(2)}, ${this.game.controls.velocity.y.toFixed(2)}, ${this.game.controls.velocity.z.toFixed(2)})`;
        this.logStandard('STATE', `${pos} | ${vel}`);
    }

    checkVisualBugs() {
        const cam = this.game.camera;
        const room = this.game.scene.getObjectByName('room');
        if (!room) {
            this.log('VISUAL BUG', 'Room geometry not found in scene!');
            this.logStandard('VISUAL BUG', 'Room missing');
            return;
        }

        this.log('VISUAL', `Room detected at position: (${room.position.x.toFixed(2)}, ${room.position.y.toFixed(2)}, ${room.position.z.toFixed(2)})`);
        this.logStandard('VISUAL', `Room at (${room.position.x.toFixed(2)}, ${room.position.y.toFixed(2)}, ${room.position.z.toFixed(2)})`);

        const directions = [
            { dir: new THREE.Vector3(1, 0, 0), name: 'Right Wall', expected: 30 - cam.position.x },
            { dir: new THREE.Vector3(-1, 0, 0), name: 'Left Wall', expected: 30 + cam.position.x },
            { dir: new THREE.Vector3(0, 1, 0), name: 'Ceiling', expected: 30 - cam.position.y },
            { dir: new THREE.Vector3(0, -1, 0), name: 'Floor', expected: cam.position.y },
            { dir: new THREE.Vector3(0, 0, 1), name: 'Front Wall', expected: 30 - cam.position.z },
            { dir: new THREE.Vector3(0, 0, -1), name: 'Back Wall', expected: 30 + cam.position.z }
        ];

        directions.forEach(({ dir, name, expected }) => {
            dir.normalize();
            this.raycaster.set(cam.position, dir);
            const intersects = this.raycaster.intersectObject(room, false);
            const multiCast = Array(3).fill().map(() => {
                this.raycaster.set(cam.position, dir.clone().add(new THREE.Vector3(0.01 * Math.random(), 0.01 * Math.random(), 0.01 * Math.random())));
                const hit = this.raycaster.intersectObject(room, false);
                return hit.length ? hit[0].distance : null;
            });
            if (intersects.length === 0) {
                this.log('VISUAL BUG', `${name} not detected (distance: N/A)`);
                this.logStandard('VISUAL BUG', `${name} missing`);
            } else {
                const distance = intersects[0].distance.toFixed(2);
                const tolerance = 1.0;
                if (Math.abs(distance - expected) > tolerance) {
                    this.log('VISUAL BUG', `${name} distance mismatch (distance: ${distance}, expected: ${expected.toFixed(2)})`);
                    this.logStandard('VISUAL BUG', `${name} distance off: ${distance}`);
                } else {
                    this.log('VISUAL', `${name} detected at distance: ${distance}`);
                }
                const variance = multiCast.map(d => d ? Math.abs(d - distance) : 0).reduce((a, b) => a + b, 0);
                if (variance > 0.1) this.log('VISUAL BUG', `${name} possible z-fighting, distances: [${multiCast.map(d => d?.toFixed(2) || 'N/A').join(', ')}]`);
            }
        });

        this.raycaster.set(cam.position, this.game.box.position.clone().sub(cam.position).normalize());
        const boxIntersects = this.raycaster.intersectObject(this.game.box, false);
        this.log('VISUAL', `Box visibility: ${boxIntersects.length ? 'Visible' : 'Occluded'}, distance: ${boxIntersects.length ? boxIntersects[0].distance.toFixed(2) : 'N/A'}`);
    }

    checkPerformance() {
        const fps = Math.round(1 / this.game.clock.getDelta());
        const frameTime = (this.game.clock.getDelta() * 1000).toFixed(1);
        if (fps < 30) {
            this.log('PERFORMANCE', `Low FPS (${fps}) - possible flashing or rendering issue`);
            this.logStandard('PERFORMANCE', `Low FPS: ${fps}`);
        }
        this.log('PERFORMANCE', `FPS: ${fps}, Frame Time: ${frameTime}ms, Draw Calls: ${this.game.renderer.info.render.calls}, Triangles: ${this.game.renderer.info.render.triangles}`);
    }

    checkObjects() {
        this.objectsToTrack.forEach(name => {
            const obj = this.game.scene.getObjectByName(name);
            if (!obj) {
                this.log('VISUAL BUG', `${name} not found in scene!`);
            } else {
                this.log('OBJECTS', `${name} at (${obj.position.x.toFixed(2)}, ${obj.position.y.toFixed(2)}, ${obj.position.z.toFixed(2)}), visible: ${obj.visible}, scale: (${obj.scale.x.toFixed(2)}, ${obj.scale.y.toFixed(2)}, ${obj.scale.z.toFixed(2)})`);
            }
        });
    }

    checkLighting() {
        const lights = this.game.scene.children.filter(child => child instanceof THREE.Light);
        lights.forEach(light => {
            const distance = light.position.distanceTo(this.game.camera.position).toFixed(2);
            this.log('LIGHTING', `${light.type} at (${light.position.x.toFixed(2)}, ${light.position.y.toFixed(2)}, ${light.position.z.toFixed(2)}), intensity: ${light.intensity}, distance to camera: ${distance}`);
        });
        if (lights.length === 0) this.log('LIGHTING BUG', 'No active lights in scene!');
    }

    checkRenderer() {
        const gl = this.game.renderer.getContext();
        this.log('RENDERER', `WebGL: ${gl.isContextLost() ? 'Lost' : 'Active'}, Antialias: ${this.game.renderer.antialias}, ClearColor: ${this.game.renderer.getClearColor(new THREE.Color()).getHexString()}`);
    }

    checkHistorical() {
        if (this.baselineLog) {
            const current = this.logs.slice(-10);
            this.baselineLog.forEach((base, i) => {
                if (current[i] && !current[i].includes(base.split('] ')[1])) {
                    this.log('HISTORICAL', `Deviation from baseline: ${base} -> ${current[i]}`);
                }
            });
        }
    }

    logCollision(objectName, position) {
        this.log('COLLISION', `Collision prevented with ${objectName} at (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
        this.logStandard('COLLISION', `Hit ${objectName} at (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
    }

    logEvent(event) {
        this.log('EVENT', event);
        this.logStandard('EVENT', event);
    }
}