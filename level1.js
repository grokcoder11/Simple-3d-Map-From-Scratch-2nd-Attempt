window.levelConfig = {
    maze: { width: 48, height: 48 }, // 240x240
    wallHeight: 2,
    start: [-115, 1, -115], // (1,1)
    exit: [112.5, 1, 112.5], // (47,46)
    enemies: [{ type: 'box', pos: [107.5, 1.1, 107.5], color: 0xff0000 }]
};

window.generateLevel1Maze = function() {
    const maze = Array(48).fill().map(() => Array(48).fill(1));
    function carve(x, y) {
        maze[y][x] = 0; // Current cell
        const dirs = [[0, 2], [2, 0], [0, -2], [-2, 0]]; // 2-cell steps
        dirs.sort(() => Math.random() - 0.5); // Shuffle
        for (let [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < 48 && ny >= 0 && ny < 48 && maze[ny][nx] === 1) {
                maze[y + dy/2][x + dx/2] = 0; // Carve hallway
                maze[ny][nx] = 0; // Carve destination
                carve(nx, ny);
            }
        }
    }
    carve(1, 1); // Start carving from (1,1)
    // Ensure start and exit
    maze[1][1] = 0;
    maze[47][46] = 0;
    maze[46][46] = 0;
    return maze;
};

window.setupLighting = function() {
    const ambientLight = new THREE.AmbientLight(0x808080, 1.0);
    ambientLight.name = 'ambientLight';
    this.scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1, 400);
    pointLight.name = 'pointLight';
    pointLight.position.set(window.levelConfig.start[0], this.wallHeight / 2, window.levelConfig.start[2]);
    this.scene.add(pointLight);
    const boxLight = new THREE.PointLight(0xffffff, 0.5, 200);
    boxLight.name = 'boxLight';
    boxLight.position.set(window.levelConfig.enemies[0].pos[0], 3, window.levelConfig.enemies[0].pos[2]);
    this.scene.add(boxLight);
};