// gameBase.js
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        if (!this.canvas) {
            console.error("Canvas element not found");
            throw new Error("Canvas initialization failed");
        }
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x000000, 1);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.2, 1000);
        if (!window.levelConfig) {
            console.error("levelConfig not defined - check level1.js");
            throw new Error("Level config missing");
        }
        this.camera.position.set(window.levelConfig.start[0], window.levelConfig.start[1], window.levelConfig.start[2]);

        this.clock = new THREE.Clock();
        this.controls = null;
        this.roomSize = 240;
        this.wallHeight = window.levelConfig.wallHeight;
        this.roomHeight = this.wallHeight * 0.45;
        this.box = null;
        this.lastCollisionLogTime = 0;
        this.lastVisualLogTime = 0;
        this.raycaster = new THREE.Raycaster();
        this.levelObjects = {};

        this.isLoading = true;
        this.loadingScreen = document.getElementById('loading-screen');
        this.fpsDisplay = document.getElementById('fps');

        this.debugger = new EnhancedDebugLogger(this);
        if (typeof window.generateLevel1Maze !== 'function') {
            console.error("generateLevel1Maze not defined - ensure level1.js loaded before gameBase.js");
            throw new Error("Maze function missing");
        }
        this.maze = window.generateLevel1Maze();
        if (!this.maze || !Array.isArray(this.maze) || this.maze.length === 0) {
            console.error("Maze initialization failed - returned:", this.maze);
            throw new Error("Invalid maze data");
        }
        console.log("Maze initialized with dimensions:", this.maze.length, "x", this.maze[0].length);

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupScene();
        this.setupControls();
        window.setupLighting.call(this);
        this.isLoading = false;
        if (this.loadingScreen) this.loadingScreen.style.display = 'none';
        this.debugger.logEvent('Scene loaded and game started');
        this.animate();
    }

    setupScene() {
        if (!this.maze || !Array.isArray(this.maze) || this.maze.length === 0) {
            console.error("Maze not properly initialized in setupScene - current value:", this.maze);
            this.maze = window.generateLevel1Maze();
            if (!this.maze || !Array.isArray(this.maze) || this.maze.length === 0) {
                throw new Error("Failed to generate maze - check level1.js");
            }
        }

        const floorGeometry = new THREE.PlaneGeometry(this.roomSize, this.roomSize);
        const floorMaterial = new THREE.MeshPhongMaterial({ color: 0x404040, side: THREE.DoubleSide });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.01;
        floor.name = 'floor';
        this.scene.add(floor);
        this.levelObjects['floor'] = floor;

        const ceilingGeometry = new THREE.PlaneGeometry(this.roomSize, this.roomSize);
        const ceilingMaterial = new THREE.MeshPhongMaterial({ color: 0x606060, side: THREE.DoubleSide });
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = this.wallHeight + 0.01;
        ceiling.name = 'ceiling';
        this.scene.add(ceiling);
        this.levelObjects['ceiling'] = ceiling;

        const wallMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x808080, 
            side: THREE.DoubleSide, 
            transparent: false, 
            opacity: 1,
            depthTest: true,
            depthWrite: true 
        });
        const cellSize = 5;
        const offset = -120;

        for (let y = 0; y < window.levelConfig.maze.height; y++) {
            for (let x = 0; x < window.levelConfig.maze.width; x++) {
                if (this.maze[y][x] === 1) {
                    const posX = offset + x * cellSize + cellSize / 2;
                    const posZ = offset + y * cellSize + cellSize / 2;
                    const wall = new THREE.Mesh(
                        new THREE.BoxGeometry(cellSize, this.wallHeight, cellSize),
                        wallMaterial
                    );
                    wall.position.set(posX, this.wallHeight / 2, posZ);
                    wall.name = `wall_${x}_${y}`;
                    this.scene.add(wall);
                    this.levelObjects[wall.name] = wall;
                    if (x === 1 && y === 0) {
                        this.debugger.logEvent(`Wall [0][1] at (${posX}, ${this.wallHeight / 2}, ${posZ})`);
                    }
                }
            }
        }

        window.levelConfig.enemies.forEach((enemy, idx) => {
            const boxGeometry = new THREE.BoxGeometry(2, 2.2, 2);
            const boxMaterial = new THREE.MeshBasicMaterial({ color: enemy.color });
            this.box = new THREE.Mesh(boxGeometry, boxMaterial);
            this.box.position.set(enemy.pos[0], enemy.pos[1], enemy.pos[2]);
            this.box.name = `enemy_${idx}`;
            this.scene.add(this.box);
            this.levelObjects[this.box.name] = this.box;
            this.debugger.logEvent(`Enemy added at ${enemy.pos.join(',')}`);
        });

        const exitGeometry = new THREE.BoxGeometry(2, 2, 2);
        const exitMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const exit = new THREE.Mesh(exitGeometry, exitMaterial);
        exit.position.set(window.levelConfig.exit[0], window.levelConfig.exit[1], window.levelConfig.exit[2]);
        exit.name = 'exit';
        this.scene.add(exit);
        this.levelObjects['exit'] = exit;
        this.debugger.logEvent('Exit added to scene');
    }

    setupControls() {
        this.controls = {
            moveForward: false,
            moveBackward: false,
            moveLeft: false,
            moveRight: false,
            jump: false,
            velocity: new THREE.Vector3(),
            direction: new THREE.Vector3(),
            speed: 6,
            jumpSpeed: 7,
            gravity: -9.8,
            yaw: 0,
            pitch: 0,
            mouseSensitivity: 0.002,
            isOnBox: false
        };
        this.canvas.addEventListener('click', () => {
            this.canvas.requestPointerLock();
            this.debugger.logEvent('Pointer lock requested');
        });
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => this.onKeyDown(e), false);
        document.addEventListener('keyup', (e) => this.onKeyUp(e), false);
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('resize', () => this.onResize());
        this.renderer.domElement.addEventListener('webglcontextlost', () => this.debugger.logEvent('WebGL context lost'));
        this.renderer.domElement.addEventListener('webglcontextrestored', () => this.debugger.logEvent('WebGL context restored'));
    }

    onKeyDown(event) {
        switch (event.code) {
            case 'KeyW': this.controls.moveForward = true; break;
            case 'KeyS': this.controls.moveBackward = true; break;
            case 'KeyA': this.controls.moveLeft = true; break;
            case 'KeyD': this.controls.moveRight = true; break;
            case 'Space':
                if (this.camera.position.y <= 1.01 || this.controls.isOnBox) {
                    this.controls.jump = true;
                    this.debugger.logEvent('Jump key pressed');
                }
                break;
        }
        this.debugger.logEvent(`Key down: ${event.code}`);
    }

    onKeyUp(event) {
        switch (event.code) {
            case 'KeyW': this.controls.moveForward = false; break;
            case 'KeyS': this.controls.moveBackward = false; break;
            case 'KeyA': this.controls.moveLeft = false; break;
            case 'KeyD': this.controls.moveRight = false; break;
            case 'Space': this.controls.jump = false; break;
        }
        this.debugger.logEvent(`Key up: ${event.code}`);
    }

    onMouseMove(event) {
        if (document.pointerLockElement === this.canvas) {
            this.controls.yaw -= event.movementX * this.controls.mouseSensitivity;
            this.controls.pitch -= event.movementY * this.controls.mouseSensitivity;
            this.controls.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.controls.pitch));
            this.debugger.mouseDelta.x = event.movementX;
            this.debugger.mouseDelta.y = event.movementY;
        }
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.debugger.logEvent('Window resized');
    }

    checkCollision(newPosition) {
        const cellSize = 5;
        const offset = -120;
        const playerSize = 0.5;
        const mazeX = Math.floor((newPosition.x - offset) / cellSize);
        const mazeZ = Math.floor((newPosition.z - offset) / cellSize);

        const time = this.clock.getElapsedTime();
        if (time < 1) {
            this.debugger.logEvent(`Start pos: (${newPosition.x.toFixed(2)}, ${newPosition.y.toFixed(2)}, ${newPosition.z.toFixed(2)}) -> maze[${mazeZ}][${mazeX}] = ${this.maze[mazeZ]?.[mazeX]}`);
        }

        let collisionDetected = false;
        let pushDirection = null;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const x = mazeX + dx;
                const z = mazeZ + dz;
                if (x < 0 || x >= this.maze[0].length || z < 0 || z >= this.maze.length) continue;
                if (this.maze[z][x] === 1) {
                    const wallX = offset + x * cellSize + cellSize / 2;
                    const wallZ = offset + z * cellSize + cellSize / 2;
                    const minX = wallX - cellSize / 2 - playerSize;
                    const maxX = wallX + cellSize / 2 + playerSize;
                    const minZ = wallZ - cellSize / 2 - playerSize;
                    const maxZ = wallZ + cellSize / 2 + playerSize;
                    const minY = 0 - playerSize;
                    const maxY = this.wallHeight + playerSize;

                    if (newPosition.x >= minX && newPosition.x <= maxX &&
                        newPosition.z >= minZ && newPosition.z <= maxZ &&
                        newPosition.y >= minY && newPosition.y <= maxY) {
                        this.debugger.logCollision(`Wall at maze[${z}][${x}]`, new THREE.Vector3(wallX, this.wallHeight / 2, wallZ));
                        collisionDetected = true;

                        if (newPosition.z < wallZ) pushDirection = 'forward';
                        else if (newPosition.z > wallZ) pushDirection = 'backward';
                        if (newPosition.y >= this.wallHeight - 0.01) {
                            newPosition.y = this.wallHeight + playerSize;
                            this.controls.velocity.set(0, 0, 0);
                            this.controls.isOnBox = true;
                            return false;
                        }
                    }
                }
            }
        }

        if (collisionDetected && time < 1) {
            if (pushDirection === 'forward') newPosition.z = -117.5;
            else if (pushDirection === 'backward') newPosition.z = -112.5;
            this.camera.position.copy(newPosition);
            this.debugger.logEvent(`Pushed out to (${newPosition.x.toFixed(2)}, ${newPosition.y.toFixed(2)}, ${newPosition.z.toFixed(2)})`);
            return false;
        }

        const objects = [this.levelObjects['enemy_0'], this.levelObjects['exit']];
        for (let obj of objects) {
            const boxPos = obj.position;
            const boxSizeX = obj.geometry.parameters.width / 2;
            const boxSizeY = obj.geometry.parameters.height / 2;
            const boxSizeZ = obj.geometry.parameters.depth / 2;

            const minX = boxPos.x - boxSizeX - playerSize;
            const maxX = boxPos.x + boxSizeX + playerSize;
            const minY = boxPos.y - boxSizeY - playerSize;
            const maxY = boxPos.y + boxSizeY + playerSize;
            const minZ = boxPos.z - boxSizeZ - playerSize;
            const maxZ = boxPos.z + boxSizeZ + playerSize;

            const collides = (
                newPosition.x >= minX && newPosition.x <= maxX &&
                newPosition.y >= minY && newPosition.y <= maxY &&
                newPosition.z >= minZ && newPosition.z <= maxZ
            );

            if (collides && newPosition.y >= boxPos.y + boxSizeY - 0.01) {
                newPosition.y = boxPos.y + boxSizeY + playerSize;
                this.controls.velocity.set(0, 0, 0);
                this.controls.jump = false;
                if (!this.controls.isOnBox && time - this.lastCollisionLogTime >= 0.1) {
                    this.debugger.logCollision(`${obj.name} (landed on top)`, boxPos);
                    this.lastCollisionLogTime = time;
                }
                this.controls.isOnBox = true;
                return false;
            } else if (collides) {
                this.controls.isOnBox = false;
                if (time - this.lastCollisionLogTime >= 0.1) {
                    this.debugger.logCollision(obj.name, boxPos);
                    this.lastCollisionLogTime = time;
                }
                return true;
            }
        }

        this.controls.isOnBox = false;
        return collisionDetected;
    }

    update() {
        const delta = Math.min(this.clock.getDelta(), 0.1);

        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.controls.yaw;
        this.camera.rotation.x = this.controls.pitch;

        this.controls.velocity.x *= 0.7;
        this.controls.velocity.z *= 0.7;

        if (this.controls.jump && (this.camera.position.y <= 1.01 || this.controls.isOnBox)) {
            this.controls.velocity.y = this.controls.jumpSpeed;
            this.debugger.logEvent('Jump initiated');
            this.controls.isOnBox = false;
            this.controls.jump = false;
        } else if (!this.controls.isOnBox && this.camera.position.y > 1.01) {
            this.controls.velocity.y += this.controls.gravity * delta;
        } else {
            this.controls.velocity.y = 0;
        }

        this.controls.direction.z = Number(this.controls.moveForward) - Number(this.controls.moveBackward);
        this.controls.direction.x = Number(this.controls.moveLeft) - Number(this.controls.moveRight);
        this.controls.direction.normalize();

        if (this.controls.moveForward || this.controls.moveBackward) {
            this.controls.velocity.z = this.controls.direction.z * this.controls.speed * delta;
        }
        if (this.controls.moveLeft || this.controls.moveRight) {
            this.controls.velocity.x = this.controls.direction.x * this.controls.speed * delta;
        }

        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion).normalize();
        forward.y = 0;
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));

        const newPosition = this.camera.position.clone();
        newPosition.addScaledVector(forward, -this.controls.velocity.z);
        newPosition.addScaledVector(right, this.controls.velocity.x);
        newPosition.y += this.controls.velocity.y * delta;

        if (!this.checkCollision(newPosition)) {
            this.camera.position.copy(newPosition);
        } else {
            this.controls.velocity.set(0, 0, 0);
        }

        if (this.camera.position.y < 1) {
            this.camera.position.y = 1;
            this.controls.velocity.y = 0;
            this.controls.isOnBox = false;
        }
        if (this.camera.position.y > this.wallHeight - 1) {
            this.camera.position.y = this.wallHeight - 1;
            this.controls.velocity.y = 0;
        }

        this.camera.position.x = Math.max(-this.roomSize / 2 + 1, Math.min(this.roomSize / 2 - 1, this.camera.position.x));
        this.camera.position.z = Math.max(-this.roomSize / 2 + 1, Math.min(this.roomSize / 2 - 1, this.camera.position.z));

        this.debugger.update(delta);
        this.fpsDisplay.textContent = `FPS: ${Math.round(1 / delta)}`;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (!this.isLoading) {
            this.update();
            this.renderer.render(this.scene, this.camera);
        }
    }
}

class EnhancedDebugLogger {
    constructor(game) {
        this.game = game;
        this.logs = [];
        this.mouseDelta = new THREE.Vector2();

        this.debugDiv = document.createElement('div');
        this.debugDiv.style.position = 'absolute';
        this.debugDiv.style.bottom = '10px';
        this.debugDiv.style.right = '10px';
        this.debugDiv.style.background = 'rgba(0, 0, 0, 0.7)';
        this.debugDiv.style.color = 'white';
        this.debugDiv.style.padding = '10px';
        this.debugDiv.style.fontFamily = 'Arial, sans-serif';
        document.body.appendChild(this.debugDiv);

        const levels = [
            { name: 'Standard', depth: 0.33 },
            { name: 'Deep 1/3', depth: 0.33 },
            { name: 'Deep 2/3', depth: 0.66 },
            { name: 'Deep 3/3', depth: 1.0 }
        ];
        levels.forEach(level => {
            const btn = document.createElement('button');
            btn.textContent = `Copy ${level.name} Log`;
            btn.style.margin = '5px';
            btn.onclick = () => this.copyLog(level.depth);
            this.debugDiv.appendChild(btn);
        });
    }

    logEvent(message) {
        const log = `[${new Date().toISOString()}] [EVENT] ${message}`;
        this.logs.push(log);
        console.log(log);
    }

    logCollision(objectName, position) {
        const log = `[${new Date().toISOString()}] [COLLISION] Hit ${objectName} at (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`;
        this.logs.push(log);
        console.log(log);
    }

    update(delta) {
        this.frameCount = (this.frameCount || 0) + 1;
        if (this.frameCount % 60 === 0) {
            this.checkMazeDensity();
            this.checkEnclosure();
        }
        while (this.logs.length > 1000) this.logs.shift();
    }

    checkMazeDensity() {
        const maze = this.game.maze;
        const totalCells = maze.length * maze[0].length;
        const walls = maze.flat().reduce((sum, cell) => sum + cell, 0);
        const density = (walls / totalCells) * 100;
        this.logEvent(`[MAZE_DEBUG] Wall density: ${density.toFixed(2)}% (Walls: ${walls}, Total: ${totalCells})`);
    }

    checkEnclosure() {
        const directions = [
            new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)
        ];
        for (let dir of directions) {
            this.game.raycaster.set(this.game.camera.position, dir);
            const hits = this.game.raycaster.intersectObjects(Object.values(this.game.levelObjects), true);
            const dist = hits.length ? hits[0].distance : '∞';
            if (!hits.length || hits[0].distance > 15) {
                this.logEvent(`[MAZE_DEBUG] Open space in ${dir.toArray().map(x => x.toFixed(2)).join(',')} (dist: ${dist})`);
            } else {
                this.logEvent(`[MAZE_DEBUG] Wall hit in ${dir.toArray().map(x => x.toFixed(2)).join(',')} (dist: ${dist})`);
            }
        }
    }

    copyLog(depth) {
        const logCount = Math.floor(this.logs.length * depth);
        const logText = this.logs.slice(-logCount).join('\n');
        navigator.clipboard.writeText(logText).then(() => {
            alert(`Copied ${logCount} logs (${depth * 100}% of total)`);
        });
    }
}

const game = new Game();