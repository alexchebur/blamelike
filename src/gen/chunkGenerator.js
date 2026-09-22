// src/gen/chunkGenerator.js
// @ts-check
/**
 * ChunkGenerator — оркестратор генерации одного чанка
 * Чистая функция: принимает координаты и конфиг, возвращает массив PrimitiveRecord
 */
import { createRNG, hash3D } from '../core/rng.js';
import { chunkToBounds } from '../core/chunkKey.js';
import edgeAgreement from './edgeAgreement.js';
import { buildLevelGrid } from './levelGrid.js';
import { buildStructure } from './structureBuilder.js';

/**
 * Генерация одного чанка
 * @param {number} cx - координата чанка по X
 * @param {number} cy - координата чанка по Y (вертикальный индекс чанка)
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

    // === ЭТАП A+B: Сетка уровней и Структуры (Платформы, Стены, Колонны) ===
    const levelMaps = buildLevelGrid(cx, cy, cz, seed, config, bounds);
    const structures = buildStructure(cx, cy, cz, config, bounds, cellSize, levelMaps);
    primitives.push(...structures);
    instanceCount += structures.length;

    // === ЭТАП C: Горизонтальные соединения (мосты) ===
    if (instanceCount < maxInstances) {
        const connections = generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize, levelMaps);
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
 * Этап C: Генерация горизонтальных соединений (мостов) с учетом Y-up
 */
function generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize, levelMaps) {
    const primitives = [];
    const { gridSize, levelHeight, roomDensity, bridgeChance } = config;
    
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        const currentMap = levelMaps.get(level);
        if (!currentMap) continue;

        const yBase = level * levelHeight;
        
        // Проходим по сетке и ищем соседние платформы для мостов
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const key = `${gx},${gy}`;
                if (!currentMap.get(key)) continue;

                // Проверяем соседей справа и снизу (чтобы не дублировать)
                const neighbors = [
                    { dx: 1, dy: 0 },
                    { dx: 0, dy: 1 }
                ];

                for (const n of neighbors) {
                    const nx = gx + n.dx;
                    const ny = gy + n.dy;
                    const nKey = `${nx},${ny}`;

                    if (nx < gridSize && ny < gridSize && currentMap.get(nKey)) {
                        const bridgeHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level + 0.25, seed);
                        if (bridgeHash < bridgeChance) {
                            const x1 = bounds.min.x + (gx + 0.5) * cellSize;
                            const z1 = bounds.min.z + (gy + 0.5) * cellSize; // Глубина это Z
                            const x2 = bounds.min.x + (nx + 0.5) * cellSize;
                            const z2 = bounds.min.z + (ny + 0.5) * cellSize;

                            const midX = (x1 + x2) / 2;
                            const midZ = (z1 + z2) / 2;
                            const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
                            const angleRad = Math.atan2(z2 - z1, x2 - x1);
                            const angleDeg = angleRad * (180 / Math.PI);

                            primitives.push({
                                type: 'box',
                                position: { x: midX, y: yBase + 1, z: midZ }, // Y = высота моста
                                rotation: { tiltX: 0, tiltY: 0, twistZ: angleDeg },
                                scale: { x: dist, y: 0.5, z: cellSize * 0.2 }, // Толщина по Y, ширина по Z
                                paletteSlot: 'accent',
                                role: 'connector'
                            });
                        }
                    }
                }
            }
        }
    }
    return primitives;
}

/**
 * Этап D: Монолиты (крупные структуры) в системе Y-up
 */
function generateMegaStructures(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { megaBlockChance, megaBlockMinHeight, megaBlockMaxHeight, levelHeight } = config;
    
    for (let i = 0; i < 3; i++) {
        if (hash3D(cx, cy, cz + i * 0.3, seed) < megaBlockChance) {
            const heightInLevels = megaBlockMinHeight + rng() * (megaBlockMaxHeight - megaBlockMinHeight);
            const height = heightInLevels * levelHeight;
            
            primitives.push({
                type: 'box',
                position: { 
                    x: bounds.min.x + rng() * (bounds.max.x - bounds.min.x), 
                    y: bounds.min.y + height / 2, // Центр по высоте
                    z: bounds.min.z + rng() * (bounds.max.z - bounds.min.z) 
                },
                rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                scale: { x: 10 + rng() * 20, y: height, z: 10 + rng() * 20 },
                paletteSlot: 'baseDark',
                role: 'frame'
            });
        }
    }
    return primitives;
}

/**
 * Этап E: Протыкающие фигуры в системе Y-up
 */
function generatePierce(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { scatterDensity, pierceWeights, pierceMinHeight, pierceMaxHeight, pierceMaxTilt } = config;
    if (!pierceWeights) return primitives;

    const area = (bounds.max.x - bounds.min.x) * (bounds.max.z - bounds.min.z);
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

            const height = pierceMinHeight + rng() * (pierceMaxHeight - pierceMinHeight);
            
            primitives.push({
                type: selectedType,
                position: { 
                    x: bounds.min.x + rng() * (bounds.max.x - bounds.min.x), 
                    y: bounds.min.y + height / 2, 
                    z: bounds.min.z + rng() * (bounds.max.z - bounds.min.z) 
                },
                rotation: { 
                    tiltX: (rng() - 0.5) * 2 * pierceMaxTilt, 
                    tiltY: (rng() - 0.5) * 2 * pierceMaxTilt, 
                    twistZ: 0 
                },
                scale: { x: 2 + rng() * 3, y: height, z: 2 + rng() * 3 },
                paletteSlot: 'accent',
                role: 'pierce'
            });
        }
    }
    return primitives;
}

/**
 * Этап F: Крупный декор в системе Y-up
 */
function generateDecor(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { decorDensity } = config;
    if (!decorDensity) return primitives;

    const width = bounds.max.x - bounds.min.x;
    const depth = bounds.max.z - bounds.min.z; // Глубина это Z
    
    // Антенны (растут вверх по Y)
    const antennaCount = Math.floor(width * (decorDensity.antennas || 0));
    for (let i = 0; i < antennaCount; i++) {
        primitives.push({
            type: 'cylinder',
            position: { 
                x: bounds.min.x + rng() * width, 
                y: bounds.min.y + 10, // Начинаем от "пола" чанка
                z: bounds.min.z + rng() * depth 
            },
            rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
            scale: { x: 0.5, y: 10 + rng() * 20, z: 0.5 },
            paletteSlot: 'baseLight',
            role: 'decor'
        });
    }

    // Сферы (парят в пространстве)
    const sphereCount = Math.floor(width * (decorDensity.spheres || 0));
    for (let i = 0; i < sphereCount; i++) {
        primitives.push({
            type: 'sphere',
            position: { 
                x: bounds.min.x + rng() * width, 
                y: bounds.min.y + rng() * (bounds.max.y - bounds.min.y), 
                z: bounds.min.z + rng() * depth 
            },
            rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
            scale: { x: 2 + rng() * 3, y: 2 + rng() * 3, z: 2 + rng() * 3 },
            paletteSlot: 'glow',
            role: 'decor'
        });
    }
    return primitives;
}

/**
 * Этап G: Микро-декор в системе Y-up
 */
function generateMicro(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { microDensity } = config;
    if (!microDensity) return primitives;

    const width = bounds.max.x - bounds.min.x;
    const depth = bounds.max.z - bounds.min.z;
    const height = bounds.max.y - bounds.min.y;

    const microCount = Math.floor(width * microDensity * 10);
    for (let i = 0; i < microCount; i++) {
        primitives.push({
            type: 'box',
            position: { 
                x: bounds.min.x + rng() * width, 
                y: bounds.min.y + rng() * height, 
                z: bounds.min.z + rng() * depth 
            },
            rotation: { tiltX: rng() * 360, tiltY: rng() * 360, twistZ: rng() * 360 },
            scale: { x: 0.2, y: 0.2, z: 0.2 },
            paletteSlot: 'shadow',
            role: 'micro'
        });
    }
    return primitives;
}

export default { generateChunk };
