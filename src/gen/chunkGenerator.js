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
    
    // === ЭТАП A: Платформы с интегрированными лестницами ===
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
    
    // === ЭТАП F: Крупный декор ===
    if (instanceCount < maxInstances) {
        const decor = generateDecor(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...decor);
        instanceCount += decor.length;
    }
    
    // === ЭТАП G: Микро-декор ===
    if (config.enableMicro && instanceCount < maxInstances) {
        const micro = generateMicro(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...micro);
        instanceCount += micro.length;
    }
    
    return primitives;
}

/**
 * Этап A: Генерация платформ с жесткой привязкой к гриду
 * ВСЕ ПЛАТФОРМЫ:
 * - Нижняя грань строго на yBase = level * levelHeight
 * - Верхняя грань плиты строго на yBase + platformThickness
 * - Лестница (если есть) идет от yBase + platformThickness до yBase + levelHeight
 */
function generatePlatforms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { levelHeight, platformThickness, gridSize, roomDensity } = config;
    
    // Относительная толщина для геометрии лестницы (передаем в params, если factory это поддерживает)
    const thicknessRatio = platformThickness / levelHeight;

    // Определяем диапазон уровней по вертикали (Y)
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    // 1. Генерируем карту всех уровней
    const levelMaps = new Map();
    for (let level = startLevel; level <= endLevel; level++) {
        const map = new Map();
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const key = `${gx},${gy}`;
                // Используем hash3D для детерминированного решения о наличии платформы
                const baseHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                map.set(key, baseHash < roomDensity);
            }
        }
        levelMaps.set(level, map);
    }

    // 2. Создаем примитивы
    for (let level = startLevel; level <= endLevel; level++) {
        const currentMap = levelMaps.get(level);
        const upperMap = levelMaps.get(level + 1); 
        const yBase = level * levelHeight; // НИЖНЯЯ ГРАНЬ УРОВНЯ

        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const key = `${gx},${gy}`;
                if (!currentMap.get(key)) continue;

                let stairType = null;

                // Ищем цель ТОЛЬКО на соседней клетке (dx=1, dy=0 или dx=0, dy=1)
                // И ТОЛЬКО на один уровень выше
                if (upperMap) {
                    if (gx + 1 < gridSize && upperMap.get(`${gx+1},${gy}`)) stairType = 'x_pos';
                    else if (gx - 1 >= 0 && upperMap.get(`${gx-1},${gy}`)) stairType = 'x_neg';
                    else if (gy + 1 < gridSize && upperMap.get(`${gx},${gy+1}`)) stairType = 'y_pos';
                    else if (gy - 1 >= 0 && upperMap.get(`${gx},${gy-1}`)) stairType = 'y_neg';
                }

                const posX = bounds.min.x + (gx + 0.5) * cellSize;
                const posY = bounds.min.y + (gy + 0.5) * cellSize;

                if (stairType) {
                    // === ПЛАТФОРМА С ЛЕСТНИЦЕЙ ===
                    // Геометрия: плита [0..thicknessRatio], лестница [thicknessRatio..1.0]
                    // Позиция: yBase (низ платформы)
                    // Масштаб: levelHeight (чтобы 1.0 превратилось в levelHeight)
                    primitives.push({
                        type: `platform_stair_${stairType}`,
                        position: { x: posX, y: posY, z: 0 }, // Z пока 0, так как мы в плоскости XZ
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: cellSize, z: 1 }, // Z-масштаб не важен для плоской платформы, но пусть будет 1
                        paletteSlot: 'base',
                        flags: {},
                        role: 'frame',
                        params: { thicknessRatio }
                    });
                } else {
                    // === ОБЫЧНАЯ ПЛАТФОРМА ===
                    // BoxGeometry центрирована. Чтобы низ был на yBase:
                    // position.y = yBase + platformThickness / 2
                    // scale.y = platformThickness
                    primitives.push({
                        type: 'box',
                        position: { 
                            x: posX, 
                            y: yBase + platformThickness / 2, 
                            z: 0 
                        },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: platformThickness, z: cellSize },
                        paletteSlot: 'base',
                        flags: {},
                        role: 'frame'
                    });
                }
            }
        }
    }
    return primitives;
}
/**
 * Этап B: Генерация комнат и стен
 */
function generateRooms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { wallDensity, pillarDensity, levelHeight, gridSize, roomDensity, platformThickness } = config;
    
    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);
    
    for (let level = startLevel; level <= endLevel; level++) {
        if (hash3D(cx, cy, level, seed) > roomDensity) continue;
        
        const zBase = level * levelHeight;
        // Центр стены: начало уровня + толщина платформы + половина высоты стены
        const zWallCenter = zBase + platformThickness + levelHeight / 2;
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const wallHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level + 0.5, seed);
                if (wallHash < wallDensity) {
                    const x = bounds.min.x + (gx + 0.5) * cellSize;
                    const y = bounds.min.y + (gy + 0.5) * cellSize;
                    
                    primitives.push({
                        type: 'box',
                        position: { x, y, z: zWallCenter },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize * 0.9, y: cellSize * 0.1, z: levelHeight },
                        paletteSlot: 'baseDark',
                        flags: {},
                        role: 'frame'
                    });
                }
                
                const pillarHash = hash3D(cx * gridSize + gx + 0.5, cy * gridSize + gy + 0.5, level, seed);
                if (pillarHash < pillarDensity) {
                    const x = bounds.min.x + gx * cellSize;
                    const y = bounds.min.y + gy * cellSize;
                    
                    primitives.push({
                        type: 'cylinder',
                        position: { x, y, z: zWallCenter },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize * 0.15, y: cellSize * 0.15, z: levelHeight },
                        paletteSlot: 'accent',
                        flags: {},
                        role: 'frame'
                    });
                }
            }
        }
    }
    return primitives;
}

/**
 * Этап C: Мосты, жестко лежащие на платформах
 */
function generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { gridSize, levelHeight, roomDensity, platformThickness } = config;
    
    const bridgeThickness = 0.5;
    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);
    
    for (let level = startLevel; level <= endLevel; level++) {
        if (hash3D(cx, cy, level, seed) > roomDensity) continue;
        
        const zBase = level * levelHeight;
        // Центр моста лежит на верхней грани платформы + половина толщины моста
        const zBridgeCenter = zBase + platformThickness + (bridgeThickness / 2);
        
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

        // Упрощенный Prim's algorithm
        const connected = new Set();
        connected.add(`${platforms[0].gx},${platforms[0].gy}`);
        const edgesToAdd = [];
        let safetyCounter = 0;
        
        while (connected.size < platforms.length && safetyCounter < 500) {
            safetyCounter++;
            const connectedKeys = Array.from(connected);
            const sourceKey = connectedKeys[Math.floor(rng() * connectedKeys.length)];
            const [sx, sy] = sourceKey.split(',').map(Number);
            
            let nearest = null;
            let minDist = Infinity;
            
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = sx + dx;
                    const ny = sy + dy;
                    const key = `${nx},${ny}`;
                    
                    if (platformSet.has(key) && !connected.has(key)) {
                        const dist = Math.abs(dx) + Math.abs(dy);
                        if (dist < minDist) {
                            minDist = dist;
                            nearest = { gx: nx, gy: ny };
                        }
                    }
                }
            }
            
            if (nearest) {
                connected.add(`${nearest.gx},${nearest.gy}`);
                edgesToAdd.push({ sx, sy, tx: nearest.gx, ty: nearest.gy });
            }
        }

        for (const edge of edgesToAdd) {
            const x1 = bounds.min.x + (edge.sx + 0.5) * cellSize;
            const y1 = bounds.min.y + (edge.sy + 0.5) * cellSize;
            const x2 = bounds.min.x + (edge.tx + 0.5) * cellSize;
            const y2 = bounds.min.y + (edge.ty + 0.5) * cellSize;
            
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            
            const angleRad = Math.atan2(y2 - y1, x2 - x1);
            const angleDeg = angleRad * (180 / Math.PI);
            
            primitives.push({
                type: 'box',
                position: { x: midX, y: midY, z: zBridgeCenter },
                rotation: { tiltX: 0, tiltY: 0, twistZ: angleDeg },
                scale: { x: dist, y: cellSize * 0.2, z: bridgeThickness },
                paletteSlot: 'accent',
                flags: {},
                role: 'connector'
            });
        }

        // Граничные соединения
        const rightDecisions = edgeAgreement.getBoundaryDecisions(cx, cy, cz, 'x', 1, seed, config);
        for (let i = 0; i < gridSize; i++) {
            const decision = rightDecisions[i];
            const internalKey = `${gridSize - 1},${i}`;
            
            if (platformSet.has(internalKey) && decision.hasPassage) {
                 const x1 = bounds.min.x + (gridSize - 0.5) * cellSize;
                 const y1 = bounds.min.y + (i + 0.5) * cellSize;
                 const x2 = bounds.max.x;
                 const dist = cellSize / 2;
                 
                 primitives.push({
                    type: 'box',
                    position: { x: (x1 + x2) / 2, y: y1, z: zBridgeCenter },
                    rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                    scale: { x: dist, y: cellSize * 0.2, z: bridgeThickness },
                    paletteSlot: 'accent',
                    flags: {},
                    role: 'connector'
                });
            }
        }
    }
    return primitives;
}

// Остальные функции (MegaStructures, Pierce, Decor, Micro) остаются без изменений
function generateMegaStructures(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { megaBlockChance, megaBlockMinHeight, megaBlockMaxHeight, levelHeight } = config;
    for (let i = 0; i < 3; i++) {
        if (hash3D(cx, cy, cz + i * 0.3, seed) < megaBlockChance) {
            const height = (megaBlockMinHeight + rng() * (megaBlockMaxHeight - megaBlockMinHeight)) * levelHeight;
            primitives.push({
                type: 'box',
                position: { x: bounds.min.x + rng() * (bounds.max.x - bounds.min.x), y: bounds.min.y + rng() * (bounds.max.y - bounds.min.y), z: bounds.min.z + (bounds.max.z - bounds.min.z) / 2 },
                rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                scale: { x: 10 + rng() * 20, y: 10 + rng() * 20, z: height },
                paletteSlot: 'baseDark',
                flags: {},
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
    const area = (bounds.max.x - bounds.min.x) * (bounds.max.y - bounds.min.y);
    const count = Math.floor(area * scatterDensity / 1000);
    const types = [];
    let totalWeight = 0;
    for (const [type, weight] of Object.entries(pierceWeights)) {
        types.push({ item: type, weight });
        totalWeight += weight;
    }
    for (let i = 0; i < count; i++) {
        if (hash3D(cx, cy, cz + i * 0.7, seed) < scatterDensity) {
            let random = rng() * totalWeight;
            let selectedType = 'cylinder';
            for (const t of types) {
                random -= t.weight;
                if (random <= 0) { selectedType = t.item; break; }
            }
            primitives.push({
                type: selectedType,
                position: { x: bounds.min.x + rng() * (bounds.max.x - bounds.min.x), y: bounds.min.y + rng() * (bounds.max.y - bounds.min.y), z: bounds.min.z + (bounds.max.z - bounds.min.z) / 2 },
                rotation: { tiltX: (rng() - 0.5) * 2 * pierceMaxTilt, tiltY: (rng() - 0.5) * 2 * pierceMaxTilt, twistZ: 0 },
                scale: { x: 2 + rng() * 3, y: 2 + rng() * 3, z: pierceMinHeight + rng() * (pierceMaxHeight - pierceMinHeight) },
                paletteSlot: 'accent',
                flags: {},
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
    const width = bounds.max.x - bounds.min.x;
    const depth = bounds.max.y - bounds.min.y;
    const antennaCount = Math.floor(width * (decorDensity.antennas || 0));
    for (let i = 0; i < antennaCount; i++) {
        primitives.push({
            type: 'cylinder',
            position: { x: bounds.min.x + rng() * width, y: bounds.min.y + rng() * depth, z: bounds.max.z - 5 },
            rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
            scale: { x: 0.5, y: 0.5, z: 10 + rng() * 20 },
            paletteSlot: 'baseLight',
            flags: {},
            role: 'decor'
        });
    }
    const sphereCount = Math.floor(width * (decorDensity.spheres || 0));
    for (let i = 0; i < sphereCount; i++) {
        primitives.push({
            type: 'sphere',
            position: { x: bounds.min.x + rng() * width, y: bounds.min.y + rng() * depth, z: bounds.min.z + rng() * (bounds.max.z - bounds.min.z) },
            rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
            scale: { x: 2 + rng() * 3, y: 2 + rng() * 3, z: 2 + rng() * 3 },
            paletteSlot: 'glow',
            flags: { emissive: true },
            role: 'decor'
        });
    }
    return primitives;
}

function generateMicro(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { microDensity } = config;
    if (!microDensity) return primitives;
    const width = bounds.max.x - bounds.min.x;
    const depth = bounds.max.y - bounds.min.y;
    const height = bounds.max.z - bounds.min.z;
    const microCount = Math.floor(width * microDensity * 10);
    for (let i = 0; i < microCount; i++) {
        primitives.push({
            type: 'box',
            position: { x: bounds.min.x + rng() * width, y: bounds.min.y + rng() * depth, z: bounds.min.z + rng() * height },
            rotation: { tiltX: rng() * 360, tiltY: rng() * 360, twistZ: rng() * 360 },
            scale: { x: 0.2, y: 0.2, z: 0.2 },
            paletteSlot: 'shadow',
            flags: { micro: true },
            role: 'micro'
        });
    }
    return primitives;
}

export default { generateChunk };
