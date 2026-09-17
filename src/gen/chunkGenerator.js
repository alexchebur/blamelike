// src/gen/chunkGenerator.js
// @ts-check
/**
 * ChunkGenerator — оркестратор генерации одного чанка
 * Чистая функция: принимает координаты и конфиг, возвращает массив PrimitiveRecord
 */

import { createRNG, hash3D } from '../core/rng.js';
import { chunkToBounds } from '../core/chunkKey.js';
import edgeAgreement from './edgeAgreement.js';

/**
 * Генерация одного чанка
 * @param {number} cx - координата чанка по X
 * @param {number} cy - координата чанка по Y
 * @param {number} cz - координата чанка по Z
 * @param {number} seed - сид мира
 * @param {Object} config - конфигурация генерации
 * @returns {Array} массив PrimitiveRecord
 */
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
 * Этап A: Генерация платформ с интегрированными лестницами
 * ГАРАНТИЯ: Лестница создается ТОЛЬКО если есть целевая платформа через 1 клетку на уровне выше
 */
function generatePlatforms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { levelHeight, platformThickness, gridSize, roomDensity } = config;
    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);

    // 1. Предварительная генерация карт всех уровней для анализа соседей
    const levelMaps = new Map();
    for (let level = startLevel; level <= endLevel; level++) {
        const map = new Map();
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const key = `${gx},${gy}`;
                const baseHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                map.set(key, baseHash < roomDensity);
            }
        }
        levelMaps.set(level, map);
    }

    // 2. Создание примитивов на основе анализа карт
    for (let level = startLevel; level <= endLevel; level++) {
        const currentMap = levelMaps.get(level);
        const upperMap = levelMaps.get(level + 1); 
        const z = level * levelHeight;

        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const key = `${gx},${gy}`;
                
                // Пропускаем пустые клетки текущего уровня
                if (!currentMap.get(key)) continue;

                let stairType = null;

                // Ищем цель ТОЛЬКО если существует уровень выше
                if (upperMap) {
                    // Строгая проверка: [ПУСТО] -> [ЦЕЛЬ] на расстоянии ровно 2 клетки
                    // Приоритет фиксирован для детерминизма: +X > -X > +Y > -Y
                    
                    if (gx + 2 < gridSize && !upperMap.get(`${gx+1},${gy}`) && upperMap.get(`${gx+2},${gy}`)) {
                        stairType = 'x_pos';
                    } else if (gx - 2 >= 0 && !upperMap.get(`${gx-1},${gy}`) && upperMap.get(`${gx-2},${gy}`)) {
                        stairType = 'x_neg';
                    } else if (gy + 2 < gridSize && !upperMap.get(`${gx},${gy+1}`) && upperMap.get(`${gx},${gy+2}`)) {
                        stairType = 'y_pos';
                    } else if (gy - 2 >= 0 && !upperMap.get(`${gx},${gy-1}`) && upperMap.get(`${gx},${gy-2}`)) {
                        stairType = 'y_neg';
                    }
                }

                // === КЛЮЧЕВОЙ МОМЕНТ: ЯВНЫЙ ВЫБОР ТИПА ===
                if (stairType) {
                    // Создаем платформу С лестницей только если цель найдена
                    primitives.push({
                        type: `platform_stair_${stairType}`,
                        position: { 
                            x: bounds.min.x + (gx + 0.5) * cellSize, 
                            y: bounds.min.y + (gy + 0.5) * cellSize, 
                            z 
                        },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: cellSize, z: levelHeight },
                        paletteSlot: 'base',
                        flags: {},
                        role: 'frame'
                    });
                } else {
                    // ВО ВСЕХ ОСТАЛЬНЫХ СЛУЧАЯХ создаем ОБЫЧНУЮ платформу
                    primitives.push({
                        type: 'box',
                        position: { 
                            x: bounds.min.x + (gx + 0.5) * cellSize, 
                            y: bounds.min.y + (gy + 0.5) * cellSize, 
                            z 
                        },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: cellSize, z: platformThickness },
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
 * Этап B: Генерация комнат и стен (плоские стены, прилипшие к полу)
 */
function generateRooms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { wallDensity, pillarDensity, levelHeight, gridSize, roomDensity, platformThickness } = config;
    
    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);
    
    for (let level = startLevel; level <= endLevel; level++) {
        if (hash3D(cx, cy, level, seed) > roomDensity) continue;
        
        const zLevel = level * levelHeight;
        const zWall = zLevel + (levelHeight + platformThickness) / 2; 
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                // Стены
                const wallHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level + 0.5, seed);
                if (wallHash < wallDensity) {
                    const x = bounds.min.x + (gx + 0.5) * cellSize;
                    const y = bounds.min.y + (gy + 0.5) * cellSize;
                    
                    primitives.push({
                        type: 'box',
                        position: { x, y, z: zWall },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize * 0.9, y: cellSize * 0.1, z: levelHeight },
                        paletteSlot: 'baseDark',
                        flags: {},
                        role: 'frame'
                    });
                }
                
                // Колонны
                const pillarHash = hash3D(cx * gridSize + gx + 0.5, cy * gridSize + gy + 0.5, level, seed);
                if (pillarHash < pillarDensity) {
                    const x = bounds.min.x + gx * cellSize;
                    const y = bounds.min.y + gy * cellSize;
                    
                    primitives.push({
                        type: 'cylinder',
                        position: { x, y, z: zWall },
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
 * Этап C: Генерация горизонтальных соединений (мосты) с гарантией связности
 */
function generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { gridSize, levelHeight, roomDensity, bridgeChance } = config;
    
    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);
    
    for (let level = startLevel; level <= endLevel; level++) {
        if (hash3D(cx, cy, level, seed) > roomDensity) continue;
        
        const z = level * levelHeight;
        
        // 1. Собираем координаты всех платформ этого яруса
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

        // 2. Алгоритм связности (упрощенный Prim's algorithm)
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

        // 3. Постройка мостов
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
                position: { x: midX, y: midY, z: z + 1 },
                rotation: { tiltX: 0, tiltY: 0, twistZ: angleDeg },
                scale: { x: dist, y: cellSize * 0.2, z: 0.5 },
                paletteSlot: 'accent',
                flags: {},
                role: 'connector'
            });
        }

        // 4. Граничные соединения (EdgeAgreement)
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
                    position: { x: (x1 + x2) / 2, y: y1, z: z + 1 },
                    rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                    scale: { x: dist, y: cellSize * 0.2, z: 0.5 },
                    paletteSlot: 'accent',
                    flags: {},
                    role: 'connector'
                });
            }
        }
    }
    
    return primitives;
}

/**
 * Этап D: Монолиты (крупные структуры)
 */
function generateMegaStructures(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { megaBlockChance, megaBlockMinHeight, megaBlockMaxHeight, levelHeight } = config;
    
    for (let i = 0; i < 3; i++) {
        if (hash3D(cx, cy, cz + i * 0.3, seed) < megaBlockChance) {
            const height = (megaBlockMinHeight + rng() * (megaBlockMaxHeight - megaBlockMinHeight)) * levelHeight;
            primitives.push({
                type: 'box',
                position: { 
                    x: bounds.min.x + rng() * (bounds.max.x - bounds.min.x), 
                    y: bounds.min.y + rng() * (bounds.max.y - bounds.min.y), 
                    z: bounds.min.z + (bounds.max.z - bounds.min.z) / 2 
                },
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

/**
 * Этап E: Протыкающие фигуры
 */
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
                if (random <= 0) {
                    selectedType = t.item;
                    break;
                }
            }
            
            primitives.push({
                type: selectedType,
                position: { 
                    x: bounds.min.x + rng() * (bounds.max.x - bounds.min.x), 
                    y: bounds.min.y + rng() * (bounds.max.y - bounds.min.y), 
                    z: bounds.min.z + (bounds.max.z - bounds.min.z) / 2 
                },
                rotation: { 
                    tiltX: (rng() - 0.5) * 2 * pierceMaxTilt, 
                    tiltY: (rng() - 0.5) * 2 * pierceMaxTilt, 
                    twistZ: 0 
                },
                scale: { x: 2 + rng() * 3, y: 2 + rng() * 3, z: pierceMinHeight + rng() * (pierceMaxHeight - pierceMinHeight) },
                paletteSlot: 'accent',
                flags: {},
                role: 'pierce'
            });
        }
    }
    return primitives;
}

/**
 * Этап F: Крупный декор
 */
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

/**
 * Этап G: Микро-декор
 */
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
