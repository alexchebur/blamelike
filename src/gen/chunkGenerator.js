// src/gen/chunkGenerator.js
// @ts-check
import { createRNG, hash3D } from '../core/rng.js';
import { chunkToBounds } from '../core/chunkKey.js';
import edgeAgreement from './edgeAgreement.js';

export function generateChunk(cx, cy, cz, seed, config) {
    const primitives = [];
    const chunkSeed = hash3D(cx, cy, cz, seed);
    const rng = createRNG(Math.floor(chunkSeed * 1000000));
    const bounds = chunkToBounds(cx, cy, cz, config.chunkSize);
    const cellSize = config.chunkSize / config.gridSize;
    
    let instanceCount = 0;
    const maxInstances = config.maxInstancesPerChunk || 30000;

    // === ЭТАП A: Платформы (Ярусы) ===
    const platforms = generatePlatforms(cx, cy, cz, seed, config, rng, bounds, cellSize);
    primitives.push(...platforms);
    instanceCount += platforms.length;

    // === ЭТАП B: Комнаты и стены ===
    if (instanceCount < maxInstances) {
        const rooms = generateRooms(cx, cy, cz, seed, config, rng, bounds, cellSize);
        primitives.push(...rooms);
        instanceCount += rooms.length;
    }

    // === ЭТАП C: Горизонтальные соединения (мосты) ===
    if (instanceCount < maxInstances) {
        const connections = generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize);
        primitives.push(...connections);
        instanceCount += connections.length;
    }

    // === ЭТАП D: Вертикальные соединения (лестницы) ===
    if (instanceCount < maxInstances) {
        const stairs = generateStairs(cx, cy, cz, seed, config, rng, bounds, cellSize);
        primitives.push(...stairs);
        instanceCount += stairs.length;
    }

    // === ЭТАП E: Монолиты ===
    if (instanceCount < maxInstances) {
        const mega = generateMegaStructures(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...mega);
        instanceCount += mega.length;
    }

    // === ЭТАП F: Протыкающие фигуры ===
    if (instanceCount < maxInstances) {
        const pierce = generatePierce(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...pierce);
        instanceCount += pierce.length;
    }

    // === ЭТАП G: Декор ===
    if (instanceCount < maxInstances) {
        const decor = generateDecor(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...decor);
        instanceCount += decor.length;
    }

    return primitives;
}

function generatePlatforms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { levelHeight, platformThickness, gridSize, roomDensity } = config;
    
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        const yBase = level * levelHeight;
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const baseHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                if (baseHash < roomDensity) {
                    const wx = bounds.min.x + (gx + 0.5) * cellSize;
                    const wz = bounds.min.z + (gy + 0.5) * cellSize; 
                    
                    primitives.push({
                        type: 'box',
                        position: { x: wx, y: yBase + platformThickness / 2, z: wz },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: platformThickness, z: cellSize },
                        paletteSlot: 'base',
                        role: 'frame'
                    });
                }
            }
        }
    }
    return primitives;
}

function generateRooms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { wallDensity, pillarDensity, levelHeight, gridSize, roomDensity, platformThickness } = config;
    
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        if (hash3D(cx, cy, level, seed) > roomDensity) continue;
        
        const yBase = level * levelHeight;
        const yWallCenter = yBase + platformThickness + (levelHeight - platformThickness) / 2; 

        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const wx = bounds.min.x + (gx + 0.5) * cellSize;
                const wz = bounds.min.z + (gy + 0.5) * cellSize;

                const wallHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level + 0.5, seed);
                if (wallHash < wallDensity) {
                    primitives.push({
                        type: 'box',
                        position: { x: wx, y: yWallCenter, z: wz },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize * 0.9, y: levelHeight, z: cellSize * 0.1 },
                        paletteSlot: 'baseDark',
                        role: 'frame'
                    });
                }

                const pillarHash = hash3D(cx * gridSize + gx + 0.5, cy * gridSize + gy + 0.5, level, seed);
                if (pillarHash < pillarDensity) {
                    primitives.push({
                        type: 'cylinder',
                        position: { x: wx, y: yWallCenter, z: wz },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize * 0.15, y: levelHeight, z: cellSize * 0.15 },
                        paletteSlot: 'accent',
                        role: 'frame'
                    });
                }
            }
        }
    }
    return primitives;
}

function generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { gridSize, levelHeight, roomDensity, bridgeChance } = config;
    
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        if (hash3D(cx, cy, level, seed) > roomDensity) continue;
        const yBase = level * levelHeight;

        const platforms = [];
        const platformSet = new Set();
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                if (hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed) < roomDensity) {
                    platforms.push({ gx, gy });
                    platformSet.add(`${gx},${gy}`);
                }
            }
        }
        if (platforms.length < 2) continue;

        const connected = new Set([`${platforms[0].gx},${platforms[0].gy}`]);
        const edgesToAdd = [];
        let safety = 0;
        while (connected.size < platforms.length && safety++ < 500) {
            const keys = Array.from(connected);
            const srcKey = keys[Math.floor(rng() * keys.length)];
            const [sx, sy] = srcKey.split(',').map(Number);
            
            let nearest = null, minDist = Infinity;
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    if (dx===0 && dy===0) continue;
                    const nx = sx+dx, ny = sy+dy;
                    const k = `${nx},${ny}`;
                    if (platformSet.has(k) && !connected.has(k)) {
                        const d = Math.abs(dx)+Math.abs(dy);
                        if (d < minDist) { minDist = d; nearest = {gx:nx, gy:ny}; }
                    }
                }
            }
            if (nearest) {
                connected.add(`${nearest.gx},${nearest.gy}`);
                edgesToAdd.push({sx, sy, tx:nearest.gx, ty:nearest.gy});
            }
        }

        for (const e of edgesToAdd) {
            const x1 = bounds.min.x + (e.sx + 0.5) * cellSize;
            const z1 = bounds.min.z + (e.sy + 0.5) * cellSize;
            const x2 = bounds.min.x + (e.tx + 0.5) * cellSize;
            const z2 = bounds.min.z + (e.ty + 0.5) * cellSize;
            
            const midX = (x1+x2)/2, midZ = (z1+z2)/2;
            const dist = Math.sqrt((x2-x1)**2 + (z2-z1)**2);
            const angle = Math.atan2(z2-z1, x2-x1) * (180/Math.PI);

            // ИСПРАВЛЕНИЕ МОСТОВ: Масштаб теперь корректен для Y-up
            primitives.push({
                type: 'box',
                position: { x: midX, y: yBase + 1, z: midZ }, // yBase + 1 = чуть выше пола
                rotation: { tiltX: 0, tiltY: 0, twistZ: angle },
                scale: { x: dist, y: 0.5, z: cellSize * 0.2 }, // y=толщина, z=ширина
                paletteSlot: 'accent',
                role: 'connector'
            });
        }
    }
    return primitives;
}

function generateStairs(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { levelHeight, gridSize, roomDensity, stairsChance, platformThickness } = config;
    
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level < endLevel; level++) {
        const yBase = level * levelHeight;
        const targetLevel = level + 1;

        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                if (hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed) >= roomDensity) continue;

                // Ищем соседей СТРОГО по осям на уровень выше
                const neighbors = [
                    { dx: 1, dy: 0, variant: 'east' },
                    { dx: -1, dy: 0, variant: 'west' },
                    { dx: 0, dy: 1, variant: 'north' },
                    { dx: 0, dy: -1, variant: 'south' }
                ];

                for (const n of neighbors) {
                    const nx = gx + n.dx;
                    const ny = gy + n.dy;
                    
                    if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                        if (hash3D(cx * gridSize + nx, cy * gridSize + ny, targetLevel, seed) < roomDensity) {
                            if (rng() < stairsChance) {
                                const wx = bounds.min.x + (gx + 0.5) * cellSize;
                                const wz = bounds.min.z + (gy + 0.5) * cellSize;

                                // НОВАЯ ЛЕСТНИЦА: Единый тип + вариант
                                primitives.push({
                                    type: 'platform_stair',
                                    variant: n.variant,
                                    position: { x: wx, y: yBase, z: wz },
                                    rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                                    scale: { x: cellSize, y: cellSize, z: levelHeight },
                                    paletteSlot: 'baseLight',
                                    role: 'connector'
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    return primitives;
}

function generateMegaStructures(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { megaBlockChance, megaBlockMinHeight, megaBlockMaxHeight, levelHeight } = config;
    
    for (let i = 0; i < 3; i++) {
        if (hash3D(cx, cy, cz + i*0.3, seed) < megaBlockChance) {
            const h = (megaBlockMinHeight + rng()*(megaBlockMaxHeight-megaBlockMinHeight)) * levelHeight;
            primitives.push({
                type: 'box',
                position: { 
                    x: bounds.min.x + rng()*(bounds.max.x-bounds.min.x), 
                    y: bounds.min.y + h/2, 
                    z: bounds.min.z + rng()*(bounds.max.z-bounds.min.z) 
                },
                rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                scale: { x: 10+rng()*20, y: h, z: 10+rng()*20 },
                paletteSlot: 'baseDark',
                role: 'frame'
            });
        }
    }
    return primitives;
}

function generatePierce(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { scatterDensity, pierceWeights, pierceMinHeight, pierceMaxHeight, pierceMaxTilt } = config;
    if (!pierceWeights) return primitives;

    const area = (bounds.max.x-bounds.min.x) * (bounds.max.z-bounds.min.z);
    const count = Math.floor(area * scatterDensity / 1000);
    
    const types = Object.entries(pierceWeights).map(([t,w]) => ({item:t, weight:w}));
    const totalW = types.reduce((s,t) => s+t.weight, 0);

    for (let i=0; i<count; i++) {
        if (hash3D(cx, cy, cz+i*0.7, seed) < scatterDensity) {
            let r = rng()*totalW, sel='cylinder';
            for (const t of types) { r-=t.weight; if(r<=0){sel=t.item; break;} }
            
            const h = pierceMinHeight + rng()*(pierceMaxHeight-pierceMinHeight);
            primitives.push({
                type: sel,
                position: { 
                    x: bounds.min.x + rng()*(bounds.max.x-bounds.min.x), 
                    y: bounds.min.y + h/2, 
                    z: bounds.min.z + rng()*(bounds.max.z-bounds.min.z) 
                },
                rotation: { 
                    tiltX: (rng()-0.5)*2*pierceMaxTilt, 
                    tiltY: (rng()-0.5)*2*pierceMaxTilt, 
                    twistZ: 0 
                },
                scale: { x: 2+rng()*3, y: h, z: 2+rng()*3 },
                paletteSlot: 'accent',
                role: 'pierce'
            });
        }
    }
    return primitives;
}

function generateDecor(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { decorDensity } = config;
    if (!decorDensity) return primitives;

    const w = bounds.max.x-bounds.min.x;
    const d = bounds.max.z-bounds.min.z;

    for (let i=0; i<Math.floor(w*(decorDensity.antennas||0)); i++) {
        primitives.push({
            type: 'cylinder',
            position: { x: bounds.min.x+rng()*w, y: bounds.min.y+10, z: bounds.min.z+rng()*d },
            rotation: { tiltX:0, tiltY:0, twistZ:0 },
            scale: { x:0.5, y:10+rng()*20, z:0.5 },
            paletteSlot: 'baseLight', role: 'decor'
        });
    }
    for (let i=0; i<Math.floor(w*(decorDensity.spheres||0)); i++) {
        primitives.push({
            type: 'sphere',
            position: { x: bounds.min.x+rng()*w, y: bounds.min.y+rng()*(bounds.max.y-bounds.min.y), z: bounds.min.z+rng()*d },
            rotation: { tiltX:0, tiltY:0, twistZ:0 },
            scale: { x:2+rng()*3, y:2+rng()*3, z:2+rng()*3 },
            paletteSlot: 'glow', role: 'decor'
        });
    }
    return primitives;
}

export default { generateChunk };
