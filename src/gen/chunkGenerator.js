// @ts-check
/**
 * ChunkGenerator — оркестратор генерации одного чанка
 * Чистая функция: принимает координаты и конфиг, возвращает массив PrimitiveRecord
 * Не зависит от Three.js, может работать в Web Worker
 */

import { createRNG, hash3D } from '../core/rng.js';
import { worldToChunk, chunkToBounds } from '../core/chunkKey.js';
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
    const minX = bounds.min.x;
    const maxX = bounds.max.x;
    const minY = bounds.min.y;
    const maxY = bounds.max.y;
    const minZ = bounds.min.z;
    const maxZ = bounds.max.z;
    
    // Размер ячейки сетки внутри чанка
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
    
    // === ЭТАП C: Соединения (мосты, лестницы) ===
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
    
    // === ЭТАП G: Микро-декор (только если включен и есть бюджет) ===
    if (config.enableMicro && instanceCount < maxInstances) {
        const micro = generateMicro(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...micro);
        instanceCount += micro.length;
    }
    
    console.log(`Chunk [${cx},${cy},${cz}] generated: ${primitives.length} primitives`);
    
    return primitives;
}

/**
 * Этап A: Генерация платформ (ярусов)
 * @returns {PrimitiveRecord[]}
 */
function generatePlatforms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { levelHeight, zMin, zMax, platformThickness } = config;
    
    // Определяем диапазон ярусов для этого чанка
    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);
    
    for (let level = startLevel; level <= endLevel; level++) {
        const z = level * levelHeight;
        
        // Проверяем, существует ли этот ярус (levelDensity через хеш)
        const levelHash = hash3D(cx, cy, level, seed);
        if (levelHash > config.roomDensity) continue; // Пропускаем редкие ярусы
        
        // Создаем платформу как тонкую плиту
        // Разбиваем на ячейки для создания отверстий
        const gridSize = config.gridSize;
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                // Решаем, есть ли платформа в этой ячейке
                const cellHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                
                if (cellHash < config.roomDensity) {
                    // Есть платформа
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
 * @returns {PrimitiveRecord[]}
 */
function generateRooms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { wallDensity, pillarDensity, levelHeight, zMin, zMax } = config;
    
    // Для каждого яруса создаем стены по периметру комнат
    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);
    
    for (let level = startLevel; level <= endLevel; level++) {
        const z = level * levelHeight + levelHeight / 2; // Центр между ярусами
        
        // Стены по границам ячеек
        const gridSize = config.gridSize;
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                // Проверяем, нужна ли стена здесь
                const wallHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level + 0.5, seed);
                
                if (wallHash < wallDensity) {
                    // Вертикальная стена
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
 * Этап C: Генерация соединений (мосты, лестницы)
 * @returns {PrimitiveRecord[]}
 */
function generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { bridgeChance, stairsChance, levelHeight } = config;
    
    // Мосты между соседними платформами на одном уровне
    const startLevel = Math.ceil(bounds.min.z / levelHeight);
    const endLevel = Math.floor(bounds.max.z / levelHeight);
    
    for (let level = startLevel; level <= endLevel; level++) {
        const z = level * levelHeight;
        
        // Проходим по сетке и ищем пары платформ
        const gridSize = config.gridSize;
        
        for (let gx = 0; gx < gridSize - 1; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                // Проверяем наличие платформ слева и справа
                const leftHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                const rightHash = hash3D(cx * gridSize + gx + 1, cy * gridSize + gy, level, seed);
                
                if (leftHash < config.roomDensity && rightHash < config.roomDensity) {
                    // Обе платформы есть, можем добавить мост
                    const bridgeHash = hash3D(cx * gridSize + gx + 0.5, cy * gridSize + gy, level + 0.1, seed);
                    
                    if (bridgeHash < bridgeChance) {
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
    }
    
    return primitives;
}

/**
 * Этап D: Монолиты (крупные структуры)
 * @returns {PrimitiveRecord[]}
 */
function generateMegaStructures(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { megaBlockChance, megaBlockMinHeight, megaBlockMaxHeight, levelHeight } = config;
    
    // Несколько попыток разместить монолит
    const attempts = 3;
    
    for (let i = 0; i < attempts; i++) {
        const megaHash = hash3D(cx, cy, cz + i * 0.3, seed);
        
        if (megaHash < megaBlockChance) {
            // Размещаем монолит
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
 * @returns {PrimitiveRecord[]}
 */
function generatePierce(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { scatterDensity, pierceWeights, pierceMinHeight, pierceMaxHeight, pierceMaxTilt } = config;
    
    // Количество протыкающих фигур
    const area = (bounds.max.x - bounds.min.x) * (bounds.max.y - bounds.min.y);
    const count = Math.floor(area * scatterDensity / 1000);
    
    for (let i = 0; i < count; i++) {
        const pierceHash = hash3D(cx, cy, cz + i * 0.7, seed);
        
        if (pierceHash < scatterDensity) {
            // Выбираем тип фигуры
            const types = Object.entries(pierceWeights).map(([type, weight]) => ({ item: type, weight }));
            // Упрощенный weightedRandom
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
 * @returns {PrimitiveRecord[]}
 */
function generateDecor(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { decorDensity } = config;
    
    // Антенны
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
    
    // Сферы
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
 * @returns {PrimitiveRecord[]}
 */
function generateMicro(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { microDensity } = config;
    
    // Болты и мелкие детали
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
