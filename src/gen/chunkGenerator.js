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
    
    // Этапы A-G остаются без изменений...
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
        const stairs = generateStairs(cx, cy, cz, seed, config, rng, bounds, cellSize);
        primitives.push(...stairs);
        instanceCount += stairs.length;
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

// Функции generatePlatforms, generateRooms, generateConnections остаются БЕЗ ИЗМЕНЕНИЙ
// ... (вставь сюда оригинальный код этих функций из предыдущего ответа) ...

/**
 * Этап C.1: Генерация лестниц (ИСПРАВЛЕННАЯ ВЕРСИЯ)
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

                // Ищем лучшую цель для ЭТОЙ КЛЕТКИ (независимо от угла)
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
                                        bestCorner = corner; // Запоминаем угол, для которого нашли эту цель
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

                    // ГЕНЕРИРУЕМ ТОЛЬКО ОДНУ ЛЕСТНИЦУ ДЛЯ ЭТОЙ ПАРЫ
                    if (isValid && rng() < stairsChance) {
                        const startX = bounds.min.x + (gx + bestCorner.x) * cellSize;
                        const startY = bounds.min.y + (gy + bestCorner.y) * cellSize;
                        const startZ = level * levelHeight + platformThickness / 2;
                        const endZ = targetLevel * levelHeight + platformThickness / 2;

                        // Отладочные маркеры и линия (остаются прежними)
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

                        // Создаем примитив лестницы с ЯКОРНЫМИ ДАННЫМИ
                        primitives.push({
                            type: `stair_${targetLevels}`,
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
                        
                        // ВАЖНО: Прерываем цикл углов, чтобы не создать вторую лестницу с этой же клетки
                        break; 
                    }
                }
            }
        }
    }
    return primitives;
}

// Остальные функции (generateMegaStructures, generatePierce и т.д.) остаются БЕЗ ИЗМЕНЕНИЙ
// ... (вставь сюда оригинальный код остальных функций) ...

export default { generateChunk };
