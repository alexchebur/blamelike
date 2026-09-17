// @ts-check
/**
 * ChunkGenerator — оркестратор генерации одного чанка
 * Чистая функция: принимает координаты и конфиг, возвращает массив PrimitiveRecord
 */

// @ts-check
/**
 * ChunkGenerator — оркестратор генерации одного чанка
 */
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
    
    // Этапы A-C остаются без изменений...
    const platforms = generatePlatforms(cx, cy, cz, seed, config, rng, bounds, cellSize);
    primitives.push(...platforms);
    instanceCount += platforms.length;
    
    if (instanceCount < maxInstances) {
        const rooms = generateRooms(cx, cy, cz, seed, config, rng, bounds, cellSize);
        primitives.push(...rooms);
        instanceCount += rooms.length;
    }
    
    if (instanceCount < maxInstances) {
        const connections = generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize);
        primitives.push(...connections);
        instanceCount += connections.length;
    }

    // === ЭТАП C.1: РАМПЫ (вместо лестниц) ===
    if (instanceCount < maxInstances) {
        const ramps = generateRamps(cx, cy, cz, seed, config, rng, bounds, cellSize);
        primitives.push(...ramps);
        instanceCount += ramps.length;
    }
    
    // Остальные этапы (Mega, Pierce, Decor, Micro) остаются без изменений
    if (instanceCount < maxInstances) {
        const mega = generateMegaStructures(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...mega);
        instanceCount += mega.length;
    }
    if (instanceCount < maxInstances) {
        const pierce = generatePierce(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...pierce);
        instanceCount += pierce.length;
    }
    if (instanceCount < maxInstances) {
        const decor = generateDecor(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...decor);
        instanceCount += decor.length;
    }
    if (config.enableMicro && instanceCount < maxInstances) {
        const micro = generateMicro(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...micro);
        instanceCount += micro.length;
    }
    
    return primitives;
}

// src/gen/chunkGenerator.js
// ... импорты

/**
 * Этап A: Генерация платформ с интегрированными лестницами
 */
function generatePlatforms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { levelHeight, platformThickness, gridSize, roomDensity } = config;
    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);

    // Сначала генерируем карту всех платформ, чтобы знать соседей
    // Map<level, Map<key, boolean>>
    const levelMaps = new Map();

    for (let level = startLevel; level <= endLevel; level++) {
        const map = new Map();
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const key = `${gx},${gy}`;
                const baseHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                const isPlatform = baseHash < roomDensity;
                map.set(key, isPlatform);
            }
        }
        levelMaps.set(level, map);
    }

    // Теперь проходимся и создаем примитивы
    for (let level = startLevel; level <= endLevel; level++) {
        const currentMap = levelMaps.get(level);
        const upperMap = levelMaps.get(level + 1); // Карта уровня выше
        
        const z = level * levelHeight;

        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const key = `${gx},${gy}`;
                if (!currentMap.get(key)) continue; // Нет платформы - пропускаем

                // Определяем тип платформы
                let stairType = null; // 'x_pos', 'x_neg', 'y_pos', 'y_neg' или null

                if (upperMap) {
                    // Проверяем 4 направления
                    // Приоритет: если есть несколько вариантов, выбираем первый по хешу или фиксированный порядок
                    
                    // Проверка +X: (gx+1, gy) должна быть пустой, а (gx+2, gy) платформой
                    if (gx + 2 < gridSize) {
                        const nextKey = `${gx+1},${gy}`;
                        const targetKey = `${gx+2},${gy}`;
                        if (!upperMap.get(nextKey) && upperMap.get(targetKey)) {
                            stairType = 'x_pos';
                        }
                    }
                    
                    // Проверка -X
                    if (!stairType && gx - 2 >= 0) {
                        const nextKey = `${gx-1},${gy}`;
                        const targetKey = `${gx-2},${gy}`;
                        if (!upperMap.get(nextKey) && upperMap.get(targetKey)) {
                            stairType = 'x_neg';
                        }
                    }

                    // Проверка +Y
                    if (!stairType && gy + 2 < gridSize) {
                        const nextKey = `${gx},${gy+1}`;
                        const targetKey = `${gx},${gy+2}`;
                        if (!upperMap.get(nextKey) && upperMap.get(targetKey)) {
                            stairType = 'y_pos';
                        }
                    }

                    // Проверка -Y
                    if (!stairType && gy - 2 >= 0) {
                        const nextKey = `${gx},${gy-1}`;
                        const targetKey = `${gx},${gy-2}`;
                        if (!upperMap.get(nextKey) && upperMap.get(targetKey)) {
                            stairType = 'y_neg';
                        }
                    }
                }

                // Создаем примитив
                if (stairType) {
                    primitives.push({
                        type: `platform_stair_${stairType}`,
                        position: { 
                            x: bounds.min.x + (gx + 0.5) * cellSize, 
                            y: bounds.min.y + (gy + 0.5) * cellSize, 
                            z 
                        },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: cellSize, z: levelHeight }, // Масштабируем под размер клетки и высоту яруса
                        paletteSlot: 'base',
                        flags: {},
                        role: 'frame'
                    });
                } else {
                    // Обычная платформа
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
 * Этап C.1: Генерация рамп (ИСПРАВЛЕННАЯ ВЕРСИЯ)
 * Реализует Anchor Mode: рампа цепляется за угол платформы и тянется к цели
 */
function generateRamps(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { levelHeight, gridSize, roomDensity, stairsChance, stairHeights, platformThickness } = config;
    
    if (!stairHeights) return primitives;

    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);

    for (let level = startLevel; level < endLevel; level++) {
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                // Проверяем наличие платформы-источника
                if (hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed) >= roomDensity) continue;
                
                // Определяем высоту цели ОДИН РАЗ для всей клетки
                const heightRoll = rng();
                let targetLevels = 1;
                const w1 = stairHeights.oneLevel || 0.6;
                const w2 = stairHeights.twoLevels || 0.3;
                
                if (heightRoll > w1) targetLevels = 2;
                if (heightRoll > (w1 + w2)) targetLevels = 3;
                
                const targetLevel = level + targetLevels;
                if (targetLevel > endLevel) continue;

                // Ищем лучшую цель для ЭТОЙ КЛЕТКИ
                let bestEnd = null;
                let minDist = Infinity;
                let bestCorner = null;

                // Перебираем все 4 угла как потенциальные точки старта
                const corners = [
                    { x: 0, y: 0 }, { x: 1, y: 0 }, 
                    { x: 0, y: 1 }, { x: 1, y: 1 }
                ];

                for (const corner of corners) {
                    const startX = bounds.min.x + (gx + corner.x) * cellSize;
                    const startY = bounds.min.y + (gy + corner.y) * cellSize;

                    // Поиск цели в радиусе 2-3 клеток
                    for (let dx = -3; dx <= 3; dx++) {
                        for (let dy = -3; dy <= 3; dy++) {
                            const distGrid = Math.max(Math.abs(dx), Math.abs(dy));
                            if (distGrid < 2 || distGrid > 3) continue; 
                            
                            const nx = gx + dx;
                            const ny = gy + dy;
                            if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) continue;

                            if (hash3D(cx * gridSize + nx, cy * gridSize + ny, targetLevel, seed) < roomDensity) {
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
                                        bestEnd = { x: endX, y: endY, dx, dy, tx: nx, ty: ny, tcx: tCorner.x, tcy: tCorner.y };
                                        bestCorner = corner;
                                    }
                                }
                            }
                        }
                    }
                }

                // Если нашли валидную пару Старт(Угол) -> Цель
                if (bestEnd && bestCorner) {
                    let isValid = true;
                    
                    // Проверка зоны высадки и препятствий (остается прежней)
                    let diagDx = 0, diagDy = 0;
                    if (bestEnd.tcx === 0) diagDx = -1; else diagDx = 1;
                    if (bestEnd.tcy === 0) diagDy = -1; else diagDy = 1;
                    
                    const diagX = bestEnd.tx + diagDx;
                    const diagY = bestEnd.ty + diagDy;
                    if (diagX >= 0 && diagX < gridSize && diagY >= 0 && diagY < gridSize) {
                        if (hash3D(cx * gridSize + diagX, cy * gridSize + diagY, targetLevel, seed) < roomDensity) {
                            isValid = false;
                        }
                    }

                    if (isValid) {
                        const steps = Math.max(Math.abs(bestEnd.dx), Math.abs(bestEnd.dy));
                        for (let s = 1; s < steps; s++) {
                            const t = s / steps;
                            const checkX = Math.round(gx + bestEnd.dx * t);
                            const checkY = Math.round(gy + bestEnd.dy * t);
                            
                            for (let l = level; l <= targetLevel; l++) {
                                if ((l === level && checkX === gx && checkY === gy) || 
                                    (l === targetLevel && checkX === gx + bestEnd.dx && checkY === gy + bestEnd.dy)) continue;
                                
                                if (checkX >= 0 && checkX < gridSize && checkY >= 0 && checkY < gridSize) {
                                    if (hash3D(cx * gridSize + checkX, cy * gridSize + checkY, l, seed) < roomDensity) {
                                        isValid = false; break;
                                    }
                                }
                            }
                            if (!isValid) break;
                        }
                    }

                    // ГЕНЕРИРУЕМ ТОЛЬКО ОДНУ РАМПУ ДЛЯ ЭТОЙ ПАРЫ
                    if (isValid && rng() < stairsChance) {
                        const startX = bounds.min.x + (gx + bestCorner.x) * cellSize;
                        const startY = bounds.min.y + (gy + bestCorner.y) * cellSize;
                        const startZ = level * levelHeight + platformThickness / 2;
                        const endZ = targetLevel * levelHeight + platformThickness / 2;

                        // Отладочные маркеры и линия
                        if (config.showStairStarts) {
                            primitives.push({ type: 'sphere', position: { x: startX, y: startY, z: startZ }, scale: { x: 0.8, y: 0.8, z: 0.8 }, paletteSlot: 'glow', flags: { emissive: true }, role: 'debug' });
                        }
                        if (config.showStairEnds) {
                            primitives.push({ type: 'sphere', position: { x: bestEnd.x, y: bestEnd.y, z: endZ }, scale: { x: 0.8, y: 0.8, z: 0.8 }, paletteSlot: 'accent', flags: { emissive: true }, role: 'debug' });
                        }

                        primitives.push({
                            type: 'line', position: { x: startX, y: startY, z: startZ },
                            scale: { x: bestEnd.x, y: bestEnd.y, z: endZ },
                            paletteSlot: 'glow', role: 'connector'
                        });

                        // Расчет параметров для Anchor Mode
                        const dx = bestEnd.x - startX;
                        const dy = bestEnd.y - startY;
                        const dz = endZ - startZ;
                        const lineLength = Math.sqrt(dx*dx + dy*dy + dz*dz);
                        const rotZ = Math.atan2(dy, dx) * (180 / Math.PI);
                        const horizontalDist = Math.sqrt(dx*dx + dy*dy);
                        const tiltDeg = Math.atan2(dz, horizontalDist) * (180 / Math.PI);

                        // Создаем примитив РАМПЫ с ЯКОРНЫМИ ДАННЫМИ
                        primitives.push({
                            type: 'ramp', // Используем новый тип вместо stair_N
                            position: { x: startX, y: startY, z: startZ }, // Якорь в точке старта!
                            rotation: { tiltX: -tiltDeg, tiltY: 0, twistZ: rotZ },
                            scale: { x: 1, y: 1, z: 1 },
                            paletteSlot: 'baseLight',
                            role: 'connector',
                            // Данные для векторной ориентации в рендере
                            lineStart: { x: startX, y: startY, z: startZ },
                            lineEnd: { x: bestEnd.x, y: bestEnd.y, z: endZ },
                            lineLength: lineLength,
                            lengthScale: config.stairLengthScale || 1.0
                        });
                        
                        // Прерываем цикл углов
                        break; 
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
