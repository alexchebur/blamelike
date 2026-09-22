// src/gen/structureBuilder.js
// @ts-check
import { hash3D } from '../core/rng.js';

/**
 * @param {number} cx 
 * @param {number} cy 
 * @param {number} cz 
 * @param {Object} config 
 * @param {{min: {x:number, y:number, z:number}, max: {x:number, y:number, z:number}}} bounds - ВАЖНО: используем bounds для получения смещения чанка
 * @param {number} cellSize 
 * @param {Map<number, Map<string, boolean>>} levelMaps 
 */
export function buildStructure(cx, cy, cz, config, bounds, cellSize, levelMaps) {
    const primitives = [];
    const { levelHeight, platformThickness, gridSize, wallDensity, pillarDensity } = config;

    // Смещение чанка в мире
    const offsetX = bounds.min.x;
    const offsetY = bounds.min.y; // В Y-up системе это "пол" чанка по вертикали? Нет, bounds.min.y это нижняя граница чанка по Y
    const offsetZ = bounds.min.z;

    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        const currentMap = levelMaps.get(level);
        const upperMap = levelMaps.get(level + 1);
        const yBase = level * levelHeight; // Это абсолютная высота уровня в мире

        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const key = `${gx},${gy}`;
                if (!currentMap.get(key)) continue;

                // === КОНВЕРТАЦИЯ GRID -> WORLD С УЧЕТОМ СМЕЩЕНИЯ ЧАНКА ===
                const posX = offsetX + (gx + 0.5) * cellSize;
                const posZ = offsetZ + (gy + 0.5) * cellSize; 

                // --- 1. ПЛАТФОРМЫ ---
                let stairVariant = null;
                if (upperMap) {
                    if (gx + 1 < gridSize && upperMap.get(`${gx+1},${gy}`)) stairVariant = 'east';
                    else if (gx - 1 >= 0 && upperMap.get(`${gx-1},${gy}`)) stairVariant = 'west';
                    else if (gy + 1 < gridSize && upperMap.get(`${gx},${gy+1}`)) stairVariant = 'north';
                    else if (gy - 1 >= 0 && upperMap.get(`${gx},${gy-1}`)) stairVariant = 'south';
                }

                if (stairVariant) {
                    primitives.push({
                        type: 'platform_stair',
                        variant: stairVariant,
                        position: { x: posX, y: yBase, z: posZ }, // Явная позиция вместо grid
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: cellSize, z: levelHeight },
                        paletteSlot: 'base',
                        role: 'frame'
                    });
                } else {
                    primitives.push({
                        type: 'box',
                        position: { 
                            x: posX, 
                            y: yBase + platformThickness / 2, 
                            z: posZ 
                        },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: platformThickness, z: cellSize },
                        paletteSlot: 'base',
                        role: 'frame'
                    });
                }

                // --- 2. СТЕНЫ ---
                const neighbors = [
                    { dx: 1, dy: 0, side: 'east' },
                    { dx: -1, dy: 0, side: 'west' },
                    { dx: 0, dy: 1, side: 'north' },
                    { dx: 0, dy: -1, side: 'south' }
                ];

                for (const n of neighbors) {
                    const nx = gx + n.dx;
                    const ny = gy + n.dy;
                    const nKey = `${nx},${ny}`;
                    const hasNeighbor = (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) && currentMap.get(nKey);
                    
                    if (!hasNeighbor) {
                        const wallHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level + 0.5 + (n.dx + n.dy), config.seed);
                        if (wallHash < wallDensity) {
                            const wallX = posX + (n.dx * cellSize / 2);
                            const wallZ = posZ + (n.dy * cellSize / 2);
                            
                            primitives.push({
                                type: 'box',
                                position: { 
                                    x: wallX, 
                                    y: yBase + levelHeight / 2, 
                                    z: wallZ 
                                },
                                rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
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
                            x: offsetX + gx * cellSize, 
                            y: yBase + levelHeight / 2, 
                            z: offsetZ + gy * cellSize 
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
