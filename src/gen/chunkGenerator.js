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

    // === ЭТАП C.1: Вертикальные соединения (лестницы + линии отладки) ===
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
                    const x = bounds.min.x + gx *
