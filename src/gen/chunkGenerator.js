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
 * @typedef {Object} PrimitiveRecord
 * @property {string} type - тип геометрии (box, cylinder, cone, octahedron, capsule, torus, prism, sphere)
 * @property {{x: number, y: number, z: number}} position - мировые координаты центра
 * @property {{tiltX: number, tiltY: number, twistZ: number}} rotation - углы наклона в градусах
 * @property {{x: number, y: number, z: number}} scale - масштаб по осям
 * @property {string} paletteSlot - роль цвета (base, baseLight, baseDark, accent, glow, shadow)
 * @property {Object} [flags] - флаги (emissive, noShadow, micro)
 * @property {string} role - роль для сортировки и LOD (frame, connector, pierce, decor, micro)
 */

/**
 * Генерация одного чанка
 * @param {number} cx - координата чанка по X
 * @param {number} cy - координата чанка по Y
 * @param {number} cz - координата чанка по Z
 * @param {number} seed - сид мира
 * @param {Object} config - конфигурация генерации
 * @returns {PrimitiveRecord[]} массив примитивов чанка
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
    
    // === ЭТАП C: Соединения (с учетом EdgeAgreement) ===
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
 * Этап A: Генерация платформ (ярусов)
 */
function generatePlatforms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { levelHeight, platformThickness, gridSize, roomDensity } = config;
    
    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);
    
    for (let level = startLevel; level <= endLevel; level++) {
        const z = level * levelHeight;
        
        // Проверка существования яруса
        if (hash3D(cx, cy, level, seed) > roomDensity) continue;
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                // Используем хеш ячейки для определения наличия пола
                const cellHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                
                if (cellHash < roomDensity) {
                    const x = bounds.min.x + (gx + 0.5) * cellSize;
                    const y = bounds.min.y + (gy + 0.5) * cellSize;
                    
                    primitives.push({
                        type: 'box',
                        position: { x, y, z },
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
 * Этап B: Генерация комнат и стен
 */
function generateRooms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { wallDensity, pillarDensity, levelHeight, gridSize, roomDensity } = config;
    
    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);
    
    for (let level = startLevel; level <= endLevel; level++) {
        if (hash3D(cx, cy, level, seed) > roomDensity) continue;

        const z = level * levelHeight + levelHeight / 2;
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                // Стены
                const wallHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level + 0.5, seed);
                if (wallHash < wallDensity) {
                    const x = bounds.min.x + (gx + 0.5) * cellSize;
                    const y = bounds.min.y + (gy + 0.5) * cellSize;
                    
                    primitives.push({
                        type: 'box',
                        position: { x, y, z },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize * 0.2, y: cellSize * 0.2, z: levelHeight },
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
                        position: { x, y, z },
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
 * Этап C: Генерация соединений с использованием EdgeAgreement
 */
function generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { gridSize, levelHeight } = config;
    
    // Проверяем границы чанка для мостов
    // Пример: правая граница по оси X
    const rightBoundaryDecisions = edgeAgreement.getBoundaryDecisions(cx, cy, cz, 'x', 1, seed, config);
    
    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);
    
    for (let level = startLevel; level <= endLevel; level++) {
        const z = level * levelHeight;
        if (hash3D(cx, cy, level, seed) > config.roomDensity) continue;

        // Внутренние мосты (между ячейками внутри чанка)
        for (let gx = 0; gx < gridSize - 1; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const leftHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                const rightHash = hash3D(cx * gridSize + gx + 1, cy * gridSize + gy, level, seed);
                
                if (leftHash < config.roomDensity && rightHash < config.roomDensity) {
                    const bridgeHash = hash3D(cx * gridSize + gx + 0.5, cy * gridSize + gy, level + 0.1, seed);
                    if (bridgeHash < config.bridgeChance) {
                        const x = bounds.min.x + (gx + 1) * cellSize;
                        const y = bounds.min.y + (gy + 0.5) * cellSize;
                        
                        primitives.push({
                            type: 'box',
                            position: { x, y, z + 1 },
                            rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                            scale: { x: cellSize * 0.3, y: cellSize * 0.8, z: 0.5 },
                            paletteSlot: 'accent',
                            flags: {},
                            role: 'connector'
                        });
                    }
                }
            }
        }

        // Граничные мосты (используем EdgeAgreement)
        for (let i = 0; i < gridSize; i++) {
            const decision = rightBoundaryDecisions[i];
            if (decision.hasPassage && decision.connectionType === 'bridge') {
                const gy = i;
                const x = bounds.max.x; // На самой границе
                const y = bounds.min.y + (gy + 0.5) * cellSize;
                
                primitives.push({
                    type: 'box',
                    position: { x, y, z + 1 },
                    rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                    scale: { x: cellSize * 0.3, y: cellSize * 0.8, z: 0.5 },
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
 * Этап D: Монолиты
 */
function generateMegaStructures(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { megaBlockChance, megaBlockMinHeight, megaBlockMaxHeight, levelHeight } = config;
    
    for (let i = 0; i < 3; i++) {
        const megaHash = hash3D(cx, cy, cz + i * 0.3, seed);
        if (megaHash < megaBlockChance) {
            const x = bounds.min.x + rng() * (bounds.max.x - bounds.min.x);
            const y = bounds.min.y + rng() * (bounds.max.y - bounds.min.y);
            const z = bounds.min.z + (bounds.max.z - bounds.min.z) / 2;
            const height = (megaBlockMinHeight + rng() * (megaBlockMaxHeight - megaBlockMinHeight)) * levelHeight;
            
            primitives.push({
                type: 'box',
                position: { x, y, z },
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
    
    const area = (bounds.max.x - bounds.min.x) * (bounds.max.y - bounds.min.y);
    const count = Math.floor(area * scatterDensity / 1000);
    
    for (let i = 0; i < count; i++) {
        const pierceHash = hash3D(cx, cy, cz + i * 0.7, seed);
        if (pierceHash < scatterDensity) {
            const types = Object.entries(pierceWeights).map(([type, weight]) => ({ item: type, weight }));
            const totalWeight = types.reduce((sum, t) => sum + t.weight, 0);
            let random = rng() * totalWeight;
            let selectedType = 'cylinder';
            
            for (const t of types) {
                random -= t.weight;
                if (random <= 0) {
                    selectedType = t.item;
                    break;
                }
            }
            
            const x = bounds.min.x + rng() * (bounds.max.x - bounds.min.x);
            const y = bounds.min.y + rng() * (bounds.max.y - bounds.min.y);
            const z = bounds.min.z + (bounds.max.z - bounds.min.z) / 2;
            const height = pierceMinHeight + rng() * (pierceMaxHeight - pierceMinHeight);
            const tiltX = (rng() - 0.5) * 2 * pierceMaxTilt;
            const tiltY = (rng() - 0.5) * 2 * pierceMaxTilt;
            
            primitives.push({
                type: selectedType,
                position: { x, y, z },
                rotation: { tiltX, tiltY, twistZ: 0 },
                scale: { x: 2 + rng() * 3, y: 2 + rng() * 3, z: height },
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
    
    const antennaCount = Math.floor((bounds.max.x - bounds.min.x) * decorDensity.antennas);
    for (let i = 0; i < antennaCount; i++) {
        const x = bounds.min.x + rng() * (bounds.max.x - bounds.min.x);
        const y = bounds.min.y + rng() * (bounds.max.y - bounds.min.y);
        const z = bounds.max.z - 5;
        
        primitives.push({
            type: 'cylinder',
            position: { x, y, z },
            rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
            scale: { x: 0.5, y: 0.5, z: 10 + rng() * 20 },
            paletteSlot: 'baseLight',
            flags: {},
            role: 'decor'
        });
    }
    
    const sphereCount = Math.floor((bounds.max.x - bounds.min.x) * decorDensity.spheres);
    for (let i = 0; i < sphereCount; i++) {
        const x = bounds.min.x + rng() * (bounds.max.x - bounds.min.x);
        const y = bounds.min.y + rng() * (bounds.max.y - bounds.min.y);
        const z = bounds.min.z + rng() * (bounds.max.z - bounds.min.z);
        
        primitives.push({
            type: 'sphere',
            position: { x, y, z },
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
    const microCount = Math.floor((bounds.max.x - bounds.min.x) * microDensity * 10);
    
    for (let i = 0; i < microCount; i++) {
        const x = bounds.min.x + rng() * (bounds.max.x - bounds.min.x);
        const y = bounds.min.y + rng() * (bounds.max.y - bounds.min.y);
        const z = bounds.min.z + rng() * (bounds.max.z - bounds.min.z);
        
        primitives.push({
            type: 'box',
            position: { x, y, z },
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
