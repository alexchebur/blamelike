// @ts-check
/**
 * ChunkGenerator — оркестратор генерации одного чанка
 * Чистая функция: принимает координаты и конфиг, возвращает массив PrimitiveRecord
 * Не зависит от Three.js, может работать в Web Worker
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
    
    // Локальный RNG для чанка (детерминированный)
    const chunkSeed = hash3D(cx, cy, cz, seed);
    const rng = createRNG(Math.floor(chunkSeed * 1000000));
    
    // Границы чанка в мировых координатах
    const bounds = chunkToBounds(cx, cy, cz, config.chunkSize);
    const cellSize = config.chunkSize / config.gridSize;
    
    // Счетчик инстансов для бюджета
    let instanceCount = 0;
    const maxInstances = config.maxInstancesPerChunk || 30000;
    
    // === ЭТАП A: Ярусы (платформы) ===
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

    // === ЭТАП C.1: Вертикальные соединения (лестницы) ===
    if (instanceCount < maxInstances) {
        const stairs = generateStairs(cx, cy, cz, seed, config, rng, bounds, cellSize);
        primitives.push(...stairs);
        instanceCount += stairs.length;
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
    
    // === ЭТАП G: Микро-декор (только если включен и есть бюджет) ===
    if (config.enableMicro && instanceCount < maxInstances) {
        const micro = generateMicro(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...micro);
        instanceCount += micro.length;
    }
    
    return primitives;
}

/**
 * Этап A: Генерация платформ (ярусов) с Cellular Automata
 */
function generatePlatforms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { levelHeight, platformThickness, gridSize, roomDensity } = config;
    
    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);
    
    for (let level = startLevel; level <= endLevel; level++) {
        const z = level * levelHeight;
        
        // Сначала определяем "сырую" карту яруса
        const rawMap = [];
        for (let gx = 0; gx < gridSize; gx++) {
            rawMap[gx] = [];
            for (let gy = 0; gy < gridSize; gy++) {
                const baseHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                rawMap[gx][gy] = baseHash < roomDensity;
            }
        }

        // Применяем простое правило сглаживания (Cellular Automata)
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                let isPlatform = rawMap[gx][gy];
                
                if (!isPlatform) {
                    let neighbors = 0;
                    for (let dx = -1; dx <= 1; dx++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            if (dx === 0 && dy === 0) continue;
                            
                            const nx = gx + dx;
                            const ny = gy + dy;
                            
                            if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                                if (rawMap[nx][ny]) neighbors++;
                            } else {
                                neighbors++; // Считаем границы "заполненными" для плавности
                            }
                        }
                    }
                    
                    if (neighbors >= 5) {
                        isPlatform = true;
                    }
                }

                if (isPlatform) {
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
        // Смещение центра стены, чтобы она стояла НА платформе
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
 * Этап C.1: Генерация диагональных связей с проверкой зоны высадки
 */
function generateStairs(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { levelHeight, gridSize, roomDensity, stairsChance, stairHeights, platformThickness } = config;
    
    if (!stairHeights) return primitives;

    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);

    for (let level = startLevel; level < endLevel; level++) {
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                // 1. Есть ли платформа-источник?
                if (hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed) >= roomDensity) continue;
                
                // Определяем высоту цели
                const heightRoll = rng();
                let targetLevels = 1;
                const w1 = stairHeights.oneLevel || 0.6;
                const w2 = stairHeights.twoLevels || 0.3;
                
                if (heightRoll > w1) targetLevels = 2;
                if (heightRoll > (w1 + w2)) targetLevels = 3;
                
                const targetLevel = level + targetLevels;
                if (targetLevel > endLevel) continue;

                // Координаты 4 углов текущей клетки
                const corners = [
                    { x: 0, y: 0 }, { x: 1, y: 0 }, 
                    { x: 0, y: 1 }, { x: 1, y: 1 }
                ];

                for (const corner of corners) {
                    // Мировые координаты ВЕРХНЕГО внешнего угла источника
                    const startX = bounds.min.x + (gx + corner.x) * cellSize;
                    const startY = bounds.min.y + (gy + corner.y) * cellSize;
                    const startZ = level * levelHeight + platformThickness / 2;

                    // Ищем платформу-цель в радиусе 2-3 клеток
                    let bestEnd = null;
                    let minDist = Infinity;

                    for (let dx = -3; dx <= 3; dx++) {
                        for (let dy = -3; dy <= 3; dy++) {
                            const distGrid = Math.max(Math.abs(dx), Math.abs(dy));
                            if (distGrid < 2 || distGrid > 3) continue; 
                            
                            const nx = gx + dx;
                            const ny = gy + dy;
                            
                            if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) continue;

                            // Проверяем наличие платформы-цели
                            if (hash3D(cx * gridSize + nx, cy * gridSize + ny, targetLevel, seed) < roomDensity) {
                                // Находим ближайший угол целевой платформы
                                const targetCorners = [
                                    { x: 0, y: 0 }, { x: 1, y: 0 }, 
                                    { x: 0, y: 1 }, { x: 1, y: 1 }
                                ];
                                
                                for (const tCorner of targetCorners) {
                                    const endX = bounds.min.x + (nx + tCorner.x) * cellSize;
                                    const endY = bounds.min.y + (ny + tCorner.y) * cellSize;
                                    
                                    const dist = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
                                    
                                    if (dist < minDist) {
                                        minDist = dist;
                                        // Сохраняем смещение и координаты угла для проверки зоны высадки
                                        bestEnd = { 
                                            x: endX, y: endY, 
                                            dx, dy, 
                                            tx: nx, ty: ny, 
                                            tcx: tCorner.x, tcy: tCorner.y 
                                        };
                                    }
                                }
                            }
                        }
                    }

                    // Проверка зоны высадки и препятствий на пути
                    if (bestEnd) {
                        let isValid = true;

                        // --- ПРОВЕРКА ЗОНЫ ВЫСАДКИ ---
                        // Угол (tcx, tcy) находится внутри клетки (tx, ty).
                        // Три внутренние клетки, примыкающие к этому углу:
                        const landingCells = [];
                        
                        // Клетка самого угла
                        landingCells.push({ x: bestEnd.tx, y: bestEnd.ty });
                        
                        // Клетка слева/справа от угла (в зависимости от tcx)
                        if (bestEnd.tcx === 0) {
                            landingCells.push({ x: bestEnd.tx - 1, y: bestEnd.ty });
                        } else {
                            landingCells.push({ x: bestEnd.tx + 1, y: bestEnd.ty });
                        }
                        
                        // Клетка сверху/снизу от угла (в зависимости от tcy)
                        if (bestEnd.tcy === 0) {
                            landingCells.push({ x: bestEnd.tx, y: bestEnd.ty - 1 });
                        } else {
                            landingCells.push({ x: bestEnd.tx, y: bestEnd.ty + 1 });
                        }

                        // Проверяем, нет ли платформ в этих клетках на целевом уровне
                        for (const cell of landingCells) {
                            if (cell.x >= 0 && cell.x < gridSize && cell.y >= 0 && cell.y < gridSize) {
                                if (hash3D(cx * gridSize + cell.x, cy * gridSize + cell.y, targetLevel, seed) < roomDensity) {
                                    isValid = false; // Над головой будет потолок!
                                    break;
                                }
                            }
                        }

                        // --- ПРОВЕРКА ПУТИ НА ПРЕПЯТСТВИЯ ---
                        if (isValid) {
                            const steps = Math.max(Math.abs(bestEnd.dx), Math.abs(bestEnd.dy));
                            for (let s = 1; s < steps; s++) {
                                const t = s / steps;
                                const checkX = Math.round(gx + bestEnd.dx * t);
                                const checkY = Math.round(gy + bestEnd.dy * t);
                                
                                for (let l = level; l <= targetLevel; l++) {
                                    if (l === level && checkX === gx && checkY === gy) continue;
                                    if (l === targetLevel && checkX === gx + bestEnd.dx && checkY === gy + bestEnd.dy) continue;
                                    
                                    if (checkX >= 0 && checkX < gridSize && checkY >= 0 && checkY < gridSize) {
                                        if (hash3D(cx * gridSize + checkX, cy * gridSize + checkY, l, seed) < roomDensity) {
                                            isValid = false;
                                            break;
                                        }
                                    }
                                }
                                if (!isValid) break;
                            }
                        }

                        // Если все проверки пройдены и прошел шанс
                        if (isValid && rng() < stairsChance) {
                            primitives.push({
                                type: 'line',
                                position: { x: startX, y: startY, z: startZ },
                                rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                                scale: { 
                                    x: bestEnd.x, 
                                    y: bestEnd.y, 
                                    z: targetLevel * levelHeight + platformThickness / 2 
                                },
                                paletteSlot: 'glow',
                                flags: {},
                                role: 'connector'
                            });
                            
                            break; // Одно соединение на угол
                        }
                    }
                }
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
