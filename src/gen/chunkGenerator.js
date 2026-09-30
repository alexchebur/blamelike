// src/gen/chunkGenerator.js
// @ts-check
import { createRNG, hash3D } from '../core/rng.js';
import { chunkToBounds } from '../core/chunkKey.js';
import { getBoundaryDecisions } from './edgeAgreement.js';

/**
 * Генерирует экраны под платформами
 */
function generateScreensUnderPlatforms(platforms, cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { platformThickness } = config;
    const screenChance = config.decorDensity?.panels || 0.1; 
    const types = ['monitor', 'panel', 'display'];

    for (const platform of platforms) {
        if (platform.type !== 'box') continue;
        
        const hash = hash3D(
            Math.floor(platform.position.x), 
            Math.floor(platform.position.y), 
            Math.floor(platform.position.z), 
            seed
        );
        
        if (hash < screenChance) {
            const type = types[Math.floor(hash * types.length)];
            const bottomY = platform.position.y - (platformThickness / 2);
            const screenWidth = Math.max(0.5, platform.scale.x * 0.8);
            const screenHeight = Math.max(0.5, platform.scale.z * 0.8);
            const yPos = bottomY - (screenHeight / 2);
            
            primitives.push({
                type: 'screen',
                screenType: type,
                position: { x: platform.position.x, y: yPos, z: platform.position.z },
                rotation: { tiltX: 0, tiltY: rng() * 360, twistZ: 0 },
                scale: { x: screenWidth, y: screenHeight, z: 1 },
                paletteSlot: 'glow',
                role: 'decor',
                flags: { emissive: true }
            });
        }
    }
    return primitives;
}

/**
 * Этап G: Светящиеся экраны и панели (случайные)
 */
function generateScreens(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { decorDensity } = config;
    const screenDensity = decorDensity?.panels || 0.04;
    
    const area = (bounds.max.x - bounds.min.x) * (bounds.max.z - bounds.min.z);
    const count = Math.floor(area * screenDensity / 500);
    const types = ['monitor', 'panel', 'display'];
    
    for (let i = 0; i < count; i++) {
        const hash = hash3D(cx, cy, cz + i * 0.7, seed);
        if (hash < screenDensity) {
            const type = types[Math.floor(hash * types.length)];
            const wx = bounds.min.x + rng() * (bounds.max.x - bounds.min.x);
            const wy = bounds.min.y + rng() * (bounds.max.y - bounds.min.y);
            const wz = bounds.min.z + rng() * (bounds.max.z - bounds.min.z);
            
            primitives.push({
                type: 'screen',
                screenType: type,
                position: { x: wx, y: wy, z: wz },
                rotation: { tiltX: (rng() - 0.5) * 30, tiltY: rng() * 360, twistZ: 0 },
                scale: { x: 0.8 + rng() * 1.2, y: 0.4 + rng() * 0.6, z: 0.05 },
                paletteSlot: 'glow',
                role: 'decor',
                flags: { emissive: true }
            });
        }
    }
    return primitives;
}

function generateArches(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { gridSize, levelHeight, roomDensity } = config;
    const archChance = config.decorDensity?.antennas ? config.decorDensity.antennas * 2 : 0.1; 

    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        const yBase = level * levelHeight;
        for (let gx = 0; gx < gridSize - 1; gx++) {
            for (let gy = 0; gy < gridSize - 1; gy++) {
                const currentHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                if (currentHash < roomDensity && rng() < archChance) {
                    primitives.push({
                        type: 'arch',
                        position: { x: bounds.min.x + (gx + 0.5) * cellSize, y: yBase + (config.platformThickness || 0.5), z: bounds.min.z + (gy + 0.5) * cellSize },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize * 0.8, y: levelHeight * 0.6, z: cellSize * 0.8 },
                        paletteSlot: 'glow',
                        role: 'decor'
                    });
                }
            }
        }
    }
    return primitives;
}

export function generateChunk(cx, cy, cz, seed, config) {
    const primitives = [];
    const chunkSeed = hash3D(cx, cy, cz, seed);
    const rng = createRNG(Math.floor(chunkSeed * 1000000));
    const bounds = chunkToBounds(cx, cy, cz, config.chunkSize);
    const cellSize = config.chunkSize / config.gridSize;
    
    let instanceCount = 0;
    const maxInstances = config.maxInstancesPerChunk || 30000;

    // === ЭТАП A: Платформы + Лестницы ===
    const platforms = generatePlatforms(cx, cy, cz, seed, config, rng, bounds, cellSize);
    primitives.push(...platforms);
    instanceCount += platforms.length;

    // === ЭТАП B: Комнаты и стены ===
    if (instanceCount < maxInstances) {
        const rooms = generateRooms(cx, cy, cz, seed, config, rng, bounds, cellSize);
        primitives.push(...rooms);
        instanceCount += rooms.length;
    }

    // === ЭТАП C: Мосты ===
    if (instanceCount < maxInstances) {
        const connections = generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize);
        primitives.push(...connections);
        instanceCount += connections.length;
    }

    // === ЭТАП D: Монолиты ===
    if (instanceCount < maxInstances) {
        const mega = generateMegaStructures(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...mega);
        instanceCount += mega.length;
    }

    // === ЭТАП E: Протыкающие фигуры ===
    if (instanceCount < maxInstances) {
        const pierce = generatePierce(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...pierce);
        instanceCount += pierce.length;
    }

    // === ЭТАП F.5: Арки ===
    if (instanceCount < maxInstances) {
        const arches = generateArches(cx, cy, cz, seed, config, rng, bounds, cellSize);
        primitives.push(...arches);
        instanceCount += arches.length;
    }
    
    // === ЭТАП F: Декор (КАБЕЛИ ЗДЕСЬ) ===
    if (instanceCount < maxInstances) {
        const decor = generateDecor(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...decor);
        instanceCount += decor.length;
    }

    // === ЭТАП G: Экраны ===
    if (instanceCount < maxInstances) {
        const screens = generateScreens(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...screens);
        instanceCount += screens.length;
    }
    
    if (instanceCount < maxInstances) {
        const underScreens = generateScreensUnderPlatforms(platforms, cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...underScreens);
        instanceCount += underScreens.length;
    }
    
    return primitives;
}

function generatePlatforms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { levelHeight, platformThickness, gridSize, roomDensity, stairsChance } = config;
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        const yBase = level * levelHeight; 
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const baseHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                if (baseHash >= roomDensity) continue;

                const wx = bounds.min.x + (gx + 0.5) * cellSize;
                const wz = bounds.min.z + (gy + 0.5) * cellSize; 
                
                let stairType = null;
                if (level < endLevel && rng() < stairsChance) {
                    const targetLevel = level + 1;
                    const directions = [
                        { dx: 0, dy: -1, type: 'stair_south' },
                        { dx: 0, dy: 1, type: 'stair_north' },
                        { dx: -1, dy: 0, type: 'stair_west' },
                        { dx: 1, dy: 0, type: 'stair_east' }
                    ];
                    
                    for (const dir of directions) {
                        const midX = gx + dir.dx;
                        const midY = gy + dir.dy;
                        const targetX = gx + dir.dx * 2;
                        const targetY = gy + dir.dy * 2;

                        if (targetX >= 0 && targetX < gridSize && targetY >= 0 && targetY < gridSize) {
                            const midEmpty = hash3D(cx * gridSize + midX, cy * gridSize + midY, targetLevel, seed) >= roomDensity;
                            const targetOccupied = hash3D(cx * gridSize + targetX, cy * gridSize + targetY, targetLevel, seed) < roomDensity;
                            
                            if (midEmpty && targetOccupied) {
                                stairType = dir.type;
                                break;
                            }
                        }
                    }
                }

                if (stairType) {
                    primitives.push({
                        type: stairType,
                        position: { x: wx, y: yBase, z: wz }, 
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: levelHeight, z: cellSize },
                        paletteSlot: 'accent',
                        role: 'connector',
                        params: { platformThickness, levelHeight }
                    });
                } else {
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
                const isRoom = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed) < roomDensity;
                
                if (isRoom && hash3D(cx * gridSize + gx, cy * gridSize + gy, level + 0.5, seed) < wallDensity) {
                    primitives.push({
                        type: 'box',
                        position: { x: wx, y: yWallCenter, z: wz },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize * 0.9, y: levelHeight, z: cellSize * 0.1 },
                        paletteSlot: 'baseDark',
                        role: 'frame'
                    });
                }
                
                if (isRoom && hash3D(cx * gridSize + gx + 0.5, cy * gridSize + gy + 0.5, level, seed) < pillarDensity) {
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
        const currentYBase = level * levelHeight;
        const gridMap = new Map(); 
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                gridMap.set(`${gx},${gy}`, hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed) < roomDensity);
            }
        }

        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                if (gridMap.get(`${gx},${gy}`)) continue;

                const hasWest = gridMap.get(`${gx-1},${gy}`);
                const hasEast = gridMap.get(`${gx+1},${gy}`);
                const hasSouth = gridMap.get(`${gx},${gy-1}`);
                const hasNorth = gridMap.get(`${gx},${gy+1}`);

                let bridgeType = null;
                if (hasWest && hasEast) bridgeType = 'bridge_ew';
                else if (hasNorth && hasSouth) bridgeType = 'bridge_ns';
                else if (rng() < bridgeChance * 0.5) {
                    if (hasWest || hasEast) bridgeType = 'bridge_ew';
                    else if (hasNorth || hasSouth) bridgeType = 'bridge_ns';
                }

                if (bridgeType) {
                    primitives.push({
                        type: bridgeType,
                        position: { x: bounds.min.x + (gx + 0.5) * cellSize, y: currentYBase + (config.platformThickness || 0.5) + 0.05, z: bounds.min.z + (gy + 0.5) * cellSize }, 
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: 1, z: cellSize }, 
                        paletteSlot: 'accent',
                        role: 'connector'
                    });
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
                position: { x: bounds.min.x + rng()*(bounds.max.x-bounds.min.x), y: bounds.min.y + h/2, z: bounds.min.z + rng()*(bounds.max.z-bounds.min.z) },
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
                position: { x: bounds.min.x + rng()*(bounds.max.x-bounds.min.x), y: bounds.min.y + h/2, z: bounds.min.z + rng()*(bounds.max.z-bounds.min.z) },
                rotation: { tiltX: (rng()-0.5)*2*pierceMaxTilt, tiltY: (rng()-0.5)*2*pierceMaxTilt, twistZ: 0 },
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
    const { decorDensity, cableWeights, lCableWeights, levelHeight, gridSize, roomDensity } = config;
    if (!decorDensity) return primitives;

    const w = bounds.max.x - bounds.min.x;
    const d = bounds.max.z - bounds.min.z;
    const h = bounds.max.y - bounds.min.y;
    const cellSize = config.chunkSize / gridSize;
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    // 1. Антенны
    for (let i = 0; i < Math.floor(w * (decorDensity.antennas || 0)); i++) {
        primitives.push({
            type: 'cylinder',
            position: { x: bounds.min.x + rng() * w, y: bounds.min.y + 10, z: bounds.min.z + rng() * d },
            rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
            scale: { x: 0.5, y: 10 + rng() * 20, z: 0.5 },
            paletteSlot: 'baseLight', role: 'decor'
        });
    }

    // 2. Сферы
    for (let i = 0; i < Math.floor(w * (decorDensity.spheres || 0)); i++) {
        primitives.push({
            type: 'sphere',
            position: { x: bounds.min.x + rng() * w, y: bounds.min.y + rng() * h, z: bounds.min.z + rng() * d },
            rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
            scale: { x: 2 + rng() * 3, y: 2 + rng() * 3, z: 2 + rng() * 3 },
            paletteSlot: 'glow', role: 'decor'
        });
    }

    // 3. ПРЯМЫЕ КАБЕЛИ (Вертикальные боксы)
    for (let level = startLevel; level <= endLevel; level++) {
        const yBase = level * levelHeight;
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                if (hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed) >= roomDensity) continue;
                if (rng() >= (decorDensity.cables || 0)) continue;

                const bundleSize = 3 + Math.floor(rng() * 5); 
                for (let b = 0; b < bundleSize; b++) {
                    let r = rng() * ((cableWeights?.thick || 0.3) + (cableWeights?.medium || 0.5) + (cableWeights?.thin || 0.2));
                    let width = 0.15;
                    let length = 5 + rng() * 10;
                    let slot = 'shadow';

                    if (r < (cableWeights?.thick || 0.3)) {
                        width = 0.4; length = 12 + rng() * 15; slot = 'baseDark';
                    } else if (r < (cableWeights?.thick || 0.3) + (cableWeights?.medium || 0.5)) {
                        width = 0.25; length = 8 + rng() * 10; slot = 'accent';
                    }

                    const attachY = yBase - (config.platformThickness || 0.5);
                    primitives.push({
                        type: 'box',
                        position: { 
                            x: bounds.min.x + (gx + 0.5) * cellSize + (rng() - 0.5) * cellSize * 0.6, 
                            y: attachY - length / 2, 
                            z: bounds.min.z + (gy + 0.5) * cellSize + (rng() - 0.5) * cellSize * 0.6 
                        },
                        rotation: { tiltX: (rng() - 0.5) * 12, tiltY: (rng() - 0.5) * 12, twistZ: 0 }, 
                        scale: { x: width, y: length, z: width },
                        paletteSlot: slot, role: 'decor'
                    });
                }
            }
        }
    }

    // 4. ИЗОГНУТЫЕ L-КАБЕЛИ (Уголки)
    const lCableCount = Math.floor(w * (decorDensity.lCables || 0));
    for (let i = 0; i < lCableCount; i++) {
        let placed = false;
        let attempts = 0;
        while (!placed && attempts < 15) {
            const gx = Math.floor(rng() * gridSize);
            const gy = Math.floor(rng() * gridSize);
            const level = startLevel + Math.floor(rng() * Math.max(1, endLevel - startLevel + 1));
            
            if (hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed) < roomDensity) {
                const yBase = level * levelHeight;
                const attachY = yBase - (config.platformThickness || 0.5);
                
                const r = rng() * ((lCableWeights?.short || 0.4) + (lCableWeights?.medium || 0.4) + (lCableWeights?.long || 0.2));
                let lengthRatio = 0.5;
                if (r < (lCableWeights?.short || 0.4)) lengthRatio = 0.4 + rng() * 0.3;
                else if (r < (lCableWeights?.short || 0.4) + (lCableWeights?.medium || 0.4)) lengthRatio = 0.7 + rng() * 0.4;
                else lengthRatio = 1.1 + rng() * 0.6;
                
                primitives.push({
                    type: 'l_cable',
                    position: { 
                        x: bounds.min.x + (gx + 0.5) * cellSize + (rng() - 0.5) * cellSize * 0.6, 
                        y: attachY, 
                        z: bounds.min.z + (gy + 0.5) * cellSize + (rng() - 0.5) * cellSize * 0.6 
                    },
                    rotation: { tiltX: 0, tiltY: rng() * 360, twistZ: 20 + rng() * 50 }, 
                    scale: { 
                        x: lengthRatio,         
                        y: (0.08 + rng() * 0.12) / 0.1,     
                        z: (0.08 + rng() * 0.12) / 0.1 
                    },
                    paletteSlot: rng() > 0.6 ? 'accent' : 'shadow',
                    role: 'decor'
                });
                placed = true;
            }
            attempts++;
        }
    }

    // 5. Торусы
    for (let i = 0; i < Math.floor(w * (decorDensity.torus || 0)); i++) {
        primitives.push({
            type: 'torus',
            position: { x: bounds.min.x + rng() * w, y: bounds.min.y + rng() * h, z: bounds.min.z + rng() * d },
            rotation: { tiltX: rng() * 360, tiltY: rng() * 360, twistZ: 0 },
            scale: { x: 3 + rng() * 5, y: 3 + rng() * 5, z: 3 + rng() * 5 },
            paletteSlot: 'accent', role: 'decor'
        });
    }

    // 6. Панели
    for (let i = 0; i < Math.floor(w * (decorDensity.panels || 0)); i++) {
        primitives.push({
            type: 'box',
            position: { x: bounds.min.x + rng() * w, y: bounds.min.y + rng() * h, z: bounds.min.z + rng() * d },
            rotation: { tiltX: rng() > 0.5 ? 90 : 0, tiltY: rng() * 360, twistZ: 0 },
            scale: { x: 2 + rng() * 3, y: 0.2, z: 2 + rng() * 3 },
            paletteSlot: 'baseLight', role: 'decor'
        });
    }

    return primitives;
}
export default { generateChunk };
