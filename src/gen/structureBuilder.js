// src/gen/structureBuilder.js
// @ts-check
import { hash3D } from '../core/rng.js';

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
                        grid: { gx, gy, level },
                        scale: { x: cellSize, y: cellSize, z: levelHeight },
                        paletteSlot: 'base',
                        role: 'frame'
                    });
                } else {
                    primitives.push({
                        type: 'box',
                        grid: { gx, gy, level },
                        offset: { y: platformThickness / 2 }, // Смещение внутри ячейки
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
                            primitives.push({
                                type: 'wall',
                                variant: 'solid',
                                side: n.side,
                                grid: { gx, gy, level },
                                scale: { x: cellSize, y: levelHeight, z: cellSize },
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
                        grid: { gx, gy, level },
                        offset: { x: -cellSize/2, z: -cellSize/2 }, // В угол клетки
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
