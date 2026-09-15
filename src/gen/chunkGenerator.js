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
 */
export function generateChunk(cx, cy, cz, seed, config) {
    const primitives = [];
    
    // Локальный RNG для чанка
    const chunkSeed = hash3D(cx, cy, cz, seed);
    const rng = createRNG(Math.floor(chunkSeed * 1000000));
    
    // Границы чанка
    const bounds = chunkToBounds(cx, cy, cz, config.chunkSize);
    const cellSize = config.chunkSize / config.gridSize;
    
    // Бюджет инстансов
    let instanceCount = 0;
    const maxInstances = config.maxInstancesPerChunk || 30000;
    
    // Этапы генерации
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

function generateRooms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { wallDensity, pillarDensity, levelHeight, gridSize, roomDensity, platformThickness } = config;
    
    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);
    
    for (let level = startLevel; level <= endLevel; level++) {
        if (hash3D(cx, cy, level, seed) > roomDensity) continue;
        
        // Центр яруса по Z
        const zLevel = level * levelHeight;
        // Смещение центра стены, чтобы она стояла на платформе
        const zWall = zLevel + (levelHeight + platformThickness) / 2; 
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                // Проверяем наличие платформы под стеной
                const hasFloor = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed) < roomDensity;
                
                // Генерация стен (только если есть пол или мы хотим "висячие" стены)
                const wallHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level + 0.5, seed);
                if (wallHash < wallDensity) {
                    const x = bounds.min.x + (gx + 0.5) * cellSize;
                    const y = bounds.min.y + (gy + 0.5) * cellSize;
                    
                    // Делаем стену плоской: растягиваем по X, сужаем по Y
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
                
                // Колонны (остаются квадратными)
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
                // Базовый хеш для этой ячейки
                const baseHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                rawMap[gx][gy] = baseHash < roomDensity;
            }
        }

        // Применяем простое правило сглаживания (Cellular Automata)
        // Если ячейка пустая, но у нее 3+ соседа-платформы, она тоже становится платформой
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
                            
                            // Проверяем границы чанка
                            if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                                if (rawMap[nx][ny]) neighbors++;
                            } else {
                                // Для границ используем edgeAgreement или просто считаем, что там есть платформа
                                // чтобы края чанка не выглядели обрубленными
                                neighbors++; 
                            }
                        }
                    }
                    
                    // Если вокруг много платформ, заполняем дыру
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
 * Этап C: Генерация соединений с гарантией связности и учетом границ
 */
function generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { gridSize, levelHeight, roomDensity, bridgeChance } = config;
    
    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);
    
    for (let level = startLevel; level <= endLevel; level++) {
        // Пропускаем ярус, если он не существует
        if (hash3D(cx, cy, level, seed) > roomDensity) continue;
        
        const z = level * levelHeight;
        
        // 1. Собираем координаты всех платформ этого яруса
        const platforms = [];
        const platformSet = new Set(); // Для быстрого поиска
        
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
        
        // Список потенциальных ребер для соединения
        const edgesToAdd = [];

        let safetyCounter = 0;
        while (connected.size < platforms.length && safetyCounter < 500) {
            safetyCounter++;
            
            // Выбираем случайную уже подключенную платформу
            const connectedKeys = Array.from(connected);
            const sourceKey = connectedKeys[Math.floor(rng() * connectedKeys.length)];
            const [sx, sy] = sourceKey.split(',').map(Number);
            
            // Ищем ближайшего неподключенного соседа (в радиусе 2 клеток)
            let nearest = null;
            let minDist = Infinity;
            
            // Проверяем всех соседей в квадрате 5x5 вокруг source
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    
                    const nx = sx + dx;
                    const ny = sy + dy;
                    const key = `${nx},${ny}`;
                    
                    // Если эта платформа существует и еще не подключена
                    if (platformSet.has(key) && !connected.has(key)) {
                        const dist = Math.abs(dx) + Math.abs(dy); // Манхэттенское расстояние
                        if (dist < minDist) {
                            minDist = dist;
                            nearest = { gx: nx, gy: ny };
                        }
                    }
                }
            }
            
            if (nearest) {
                connected.add(`${nearest.gx},${nearest.gy}`);
                
                // Добавляем ребро в список для постройки
                edgesToAdd.push({
                    sx, sy, 
                    tx: nearest.gx, ty: nearest.gy
                });
            }
        }

        // 3. Постройка мостов по найденным ребрам
        for (const edge of edgesToAdd) {
            const x1 = bounds.min.x + (edge.sx + 0.5) * cellSize;
            const y1 = bounds.min.y + (edge.sy + 0.5) * cellSize;
            const x2 = bounds.min.x + (edge.tx + 0.5) * cellSize;
            const y2 = bounds.min.y + (edge.ty + 0.5) * cellSize;
            
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            
            // Длина моста
            const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            
            // Угол поворота (в градусах)
            const angleRad = Math.atan2(y2 - y1, x2 - x1);
            const angleDeg = angleRad * (180 / Math.PI);
            
            primitives.push({
                type: 'box',
                position: { x: midX, y: midY, z: z + 1 }, // Чуть выше платформы
                rotation: { tiltX: 0, tiltY: 0, twistZ: angleDeg },
                scale: { x: dist, y: cellSize * 0.2, z: 0.5 }, // Тонкая балка
                paletteSlot: 'accent',
                flags: {},
                role: 'connector'
            });
        }

        // 4. Граничные соединения (EdgeAgreement)
        // Проверяем правую границу (X+)
        const rightDecisions = edgeAgreement.getBoundaryDecisions(cx, cy, cz, 'x', 1, seed, config);
        for (let i = 0; i < gridSize; i++) {
            const decision = rightDecisions[i];
            // Если есть платформа внутри чанка на границе И решение говорит о мосте
            const internalKey = `${gridSize - 1},${i}`;
            if (platformSet.has(internalKey) && decision.hasPassage) {
                 // Строим половину моста до границы
                 const x1 = bounds.min.x + (gridSize - 0.5) * cellSize; // Центр последней ячейки
                 const y1 = bounds.min.y + (i + 0.5) * cellSize;
                 const x2 = bounds.max.x; // Граница чанка
                 
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


function generateStairs(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { levelHeight, gridSize, roomDensity, stairsChance, stairHeights, stairWidthRatio } = config;
    
    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);
    
    for (let level = startLevel; level < endLevel; level++) {
        // Определяем целевую высоту (1, 2 или 3 уровня вверх)
        const heightRoll = rng();
        let targetLevels = 1;
        if (heightRoll > stairHeights.oneLevel) targetLevels = 2;
        if (heightRoll > (stairHeights.oneLevel + stairHeights.twoLevels)) targetLevels = 3;
        
        const targetLevel = level + targetLevels;
        if (targetLevel > endLevel) continue;

        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                // Есть ли платформа снизу?
                if (hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed) >= roomDensity) continue;
                
                // Проверяем наличие платформы сверху (в той же клетке или по соседству)
                // Для простоты пока ставим лестницу прямо вверх, если там есть пол
                if (hash3D(cx * gridSize + gx, cy * gridSize + gy, targetLevel, seed) < roomDensity) {
                    
                    if (rng() < stairsChance) {
                        const x = bounds.min.x + (gx + 0.5) * cellSize;
                        const y = bounds.min.y + (gy + 0.5) * cellSize;
                        const z = level * levelHeight;
                        
                        primitives.push({
                            type: `stair_${targetLevels}`, // stair_1, stair_2, stair_3
                            position: { x, y, z },
                            rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                            scale: { x: 1, y: 1, z: 1 }, // Геометрия уже подогнана под размер
                            paletteSlot: 'baseLight',
                            flags: {},
                            role: 'connector'
                        });
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

function generatePierce(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { scatterDensity, pierceWeights, pierceMinHeight, pierceMaxHeight, pierceMaxTilt } = config;
    
    // Защита от отсутствия весов
    if (!pierceWeights) return primitives;

    const area = (bounds.max.x - bounds.min.x) * (bounds.max.y - bounds.min.y);
    const count = Math.floor(area * scatterDensity / 1000);
    
    // Подготовка взвешенного списка
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

function generateDecor(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { decorDensity } = config;
    if (!decorDensity) return primitives;

    const width = bounds.max.x - bounds.min.x;
    const depth = bounds.max.y - bounds.min.y;
    
    // Антенны
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
    
    // Сферы
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
