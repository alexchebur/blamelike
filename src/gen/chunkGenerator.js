// src/gen/chunkGenerator.js
// @ts-check
import { createRNG, hash3D } from '../core/rng.js';
import { chunkToBounds } from '../core/chunkKey.js';
import edgeAgreement from './edgeAgreement.js';
import { buildLevelGrid } from './levelGrid.js';
import { buildStructure } from './structureBuilder.js';

export function generateChunk(cx, cy, cz, seed, config) {
    const primitives = [];
    const chunkSeed = hash3D(cx, cy, cz, seed);
    const rng = createRNG(Math.floor(chunkSeed * 1000000));
    const bounds = chunkToBounds(cx, cy, cz, config.chunkSize);
    const cellSize = config.chunkSize / config.gridSize;
    
    let instanceCount = 0;
    const maxInstances = config.maxInstancesPerChunk || 30000;

    // === ЭТАП A+B: Сетка уровней и Структуры (Платформы, Стены, Колонны) ===
    // Используем новые модули вместо старой generatePlatforms
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

// ... (остальные функции generateConnections, generateMegaStructures и т.д. остаются как в предыдущем ответе, 
// но убедись, что везде используется bounds.min.y для высоты, а не z)

/**
 * Этап C: Генерация горизонтальных соединений (мостов) с учетом Y-up
 */
function generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize, levelMaps) {
    const primitives = [];
    const { gridSize, levelHeight, bridgeChance } = config;
    
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        const currentMap = levelMaps.get(level);
        if (!currentMap) continue;

        const yBase = level * levelHeight;
        
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
                            // Мост описываем через grid средней точки для простоты
                            primitives.push({
                                type: 'box',
                                grid: { 
                                    gx: (gx + nx) / 2, 
                                    gy: (gy + ny) / 2, 
                                    level: level 
                                },
                                offset: { y: 1 }, // Чуть выше пола платформы
                                rotation: { 
                                    tiltX: 0, 
                                    tiltY: 0, 
                                    twistZ: (n.dx !== 0 ? 0 : 90) // Поворот на 90 градусов для мостов по Y
                                },
                                scale: { x: cellSize, y: 0.5, z: cellSize * 0.2 },
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
    const { megaBlockChance, megaBlockMinHeight, megaBlockMaxHeight, levelHeight, gridSize } = config;
    
    for (let i = 0; i < 3; i++) {
        if (hash3D(cx, cy, cz + i * 0.3, seed) < megaBlockChance) {
            const heightInLevels = megaBlockMinHeight + rng() * (megaBlockMaxHeight - megaBlockMinHeight);
            const height = heightInLevels * levelHeight;
            
            // Выбираем случайную клетку грида для привязки
            const gx = Math.floor(rng() * gridSize);
            const gy = Math.floor(rng() * gridSize);
            
            primitives.push({
                type: 'box',
                grid: { gx, gy, level: 0 }, // Уровень 0 как база, но растягиваем по высоте
                offset: { 
                    x: (rng() - 0.5) * (bounds.max.x - bounds.min.x) / gridSize, 
                    y: height / 2, 
                    z: (rng() - 0.5) * (bounds.max.z - bounds.min.z) / gridSize 
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
    const { scatterDensity, pierceWeights, pierceMinHeight, pierceMaxHeight, pierceMaxTilt, gridSize } = config;
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
            const gx = Math.floor(rng() * gridSize);
            const gy = Math.floor(rng() * gridSize);
            
            primitives.push({
                type: selectedType,
                grid: { gx, gy, level: 0 },
                offset: { 
                    x: (rng() - 0.5) * (bounds.max.x - bounds.min.x) / gridSize, 
                    y: height / 2, 
                    z: (rng() - 0.5) * (bounds.max.z - bounds.min.z) / gridSize 
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
    const { decorDensity, gridSize } = config;
    if (!decorDensity) return primitives;

    // Антенны (растут вверх по Y)
    const antennaCount = Math.floor(gridSize * (decorDensity.antennas || 0) * 10);
    for (let i = 0; i < antennaCount; i++) {
        const gx = Math.floor(rng() * gridSize);
        const gy = Math.floor(rng() * gridSize);
        primitives.push({
            type: 'cylinder',
            grid: { gx, gy, level: 0 },
            offset: { y: 10 },
            rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
            scale: { x: 0.5, y: 10 + rng() * 20, z: 0.5 },
            paletteSlot: 'baseLight',
            role: 'decor'
        });
    }

    // Сферы (парят в пространстве)
    const sphereCount = Math.floor(gridSize * (decorDensity.spheres || 0) * 10);
    for (let i = 0; i < sphereCount; i++) {
        const gx = Math.floor(rng() * gridSize);
        const gy = Math.floor(rng() * gridSize);
        primitives.push({
            type: 'sphere',
            grid: { gx, gy, level: 0 },
            offset: { y: rng() * (bounds.max.y - bounds.min.y) },
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
    const { microDensity, gridSize } = config;
    if (!microDensity) return primitives;

    const height = bounds.max.y - bounds.min.y;
    const microCount = Math.floor(gridSize * microDensity * 20);
    
    for (let i = 0; i < microCount; i++) {
        const gx = Math.floor(rng() * gridSize);
        const gy = Math.floor(rng() * gridSize);
        primitives.push({
            type: 'box',
            grid: { gx, gy, level: 0 },
            offset: { 
                x: (rng() - 0.5) * (bounds.max.x - bounds.min.x) / gridSize,
                y: rng() * height, 
                z: (rng() - 0.5) * (bounds.max.z - bounds.min.z) / gridSize 
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
