// src/gen/structureBuilder.js
// @ts-check
import { hash3D } from '../core/rng.js';

/**
 * Строит структуры чанка: платформы, стены и колонны.
 * Использует карту уровней (levelMaps) для принятия решений.
 * 
 * @param {number} cx - X чанка
 * @param {number} cy - Y чанка
 * @param {number} cz - Z чанка
 * @param {Object} config - Конфигурация
 * @param {{min: {x: number, y: number, z: number}, max: {x: number, y: number, z: number}}} bounds - Границы чанка
 * @param {number} cellSize - Размер одной ячейки грида
 * @param {Map<number, Map<string, boolean>>} levelMaps - Карта занятости ячеек
 * @returns {Array} Массив PrimitiveRecord
 */
export function buildStructure(cx, cy, cz, config, bounds, cellSize, levelMaps) {
    const primitives = [];
    const { levelHeight, platformThickness, gridSize, wallDensity, pillarDensity } = config;

    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        const currentMap = levelMaps.get(level);
        const upperMap = levelMaps.get(level + 1);
        const yBase = level * levelHeight;

        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const key = `${gx},${gy}`;
                if (!currentMap.get(key)) continue;

                const posX = bounds.min.x + (gx + 0.5) * cellSize;
                const posY = bounds.min.y + (gy + 0.5) * cellSize; // Z в мире теперь Y

                // --- 1. ПЛАТФОРМЫ ---
                let stairType = null;
                if (upperMap) {
                    // Простая логика поиска цели для примера (можно усложнить позже)
                    if (gx + 1 < gridSize && upperMap.get(`${gx+1},${gy}`)) stairType = 'x_pos';
                    else if (gx - 1 >= 0 && upperMap.get(`${gx-1},${gy}`)) stairType = 'x_neg';
                    else if (gy + 1 < gridSize && upperMap.get(`${gx},${gy+1}`)) stairType = 'y_pos';
                    else if (gy - 1 >= 0 && upperMap.get(`${gx},${gy-1}`)) stairType = 'y_neg';
                }

                if (stairType) {
                    primitives.push({
                        type: `platform_stair_${stairType}`,
                        position: { x: posX, y: posY, z: 0 }, // Z=0, так как высота в scale/mesh
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: cellSize, z: 1 },
                        paletteSlot: 'base',
                        role: 'frame'
                    });
                } else {
                    primitives.push({
                        type: 'box',
                        position: { 
                            x: posX, 
                            y: yBase + platformThickness / 2, 
                            z: 0 
                        },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: platformThickness, z: cellSize },
                        paletteSlot: 'base',
                        role: 'frame'
                    });
                }

                // --- 2. СТЕНЫ ---
                // Проверяем 4 стороны. Если соседа нет — ставим стену.
                const neighbors = [
                    { dx: 1, dy: 0, side: 'x_pos' },
                    { dx: -1, dy: 0, side: 'x_neg' },
                    { dx: 0, dy: 1, side: 'y_pos' },
                    { dx: 0, dy: -1, side: 'y_neg' }
                ];

                for (const n of neighbors) {
                    const nx = gx + n.dx;
                    const ny = gy + n.dy;
                    const nKey = `${nx},${ny}`;
                    
                    // Стена нужна, если сосед за пределами грида ИЛИ сосед пуст
                    const hasNeighbor = (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) && currentMap.get(nKey);
                    
                    if (!hasNeighbor) {
                        const wallHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level + 0.5 + (n.dx + n.dy), config.seed);
                        if (wallHash < wallDensity) {
                            // Смещение стены к краю клетки
                            const wallX = posX + (n.dx * cellSize / 2);
                            const wallY = posY + (n.dy * cellSize / 2); // В мире это Z
                            
                            primitives.push({
                                type: 'box',
                                position: { 
                                    x: wallX, 
                                    y: yBase + levelHeight / 2, 
                                    z: wallY 
                                },
                                rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                                // Стена тонкая по той оси, где она является границей
                                scale: { 
                                    x: n.dx !== 0 ? 1 : cellSize * 0.9, 
                                    y: levelHeight, 
                                    z: n.dy !== 0 ? 1 : cellSize * 0.9 
                                },
                                paletteSlot: 'baseDark',
                                role: 'frame'
                            });
                        }
                    }
                }

                // --- 3. КОЛОННЫ ---
                const pillarHash = hash3D(cx * gridSize + gx + 0.5, cy * gridSize + gy + 0.5, level, config.seed);
                if (pillarHash < pillarDensity) {
                    primitives.push({
                        type: 'cylinder',
                        position: { 
                            x: bounds.min.x + gx * cellSize, 
                            y: yBase + levelHeight / 2, 
                            z: bounds.min.y + gy * cellSize 
                        },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize * 0.15, y: levelHeight, z: cellSize * 0.15 },
                        paletteSlot: 'accent',
                        role: 'frame'
                    });
                }
            }
        }
    }

    return primitives;
}
