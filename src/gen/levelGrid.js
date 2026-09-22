// src/gen/levelGrid.js
// @ts-check
import { hash3D } from '../core/rng.js';

/**
 * Строит карту занятости ячеек для всех уровней в чанке.
 * Чистая функция: зависит только от координат чанка, сида и конфига.
 * 
 * @param {number} cx - X чанка
 * @param {number} cy - Y чанка (в системе чанков, не мировая высота!)
 * @param {number} cz - Z чанка
 * @param {number} seed - Сид мира
 * @param {Object} config - Конфигурация
 * @param {{min: {y: number}, max: {y: number}}} bounds - Границы чанка в мировых координатах
 * @returns {Map<number, Map<string, boolean>>} Карта: уровень -> (ключ "gx,gy" -> занята?)
 */
export function buildLevelGrid(cx, cy, cz, seed, config, bounds) {
    const { levelHeight, gridSize, roomDensity } = config;
    const levelMaps = new Map();

    // Диапазон уровней по вертикали (Y)
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        const map = new Map();
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const key = `${gx},${gy}`;
                // Детерминированное решение: есть ли платформа в этой клетке на этом уровне
                const h = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                map.set(key, h < roomDensity);
            }
        }
        levelMaps.set(level, map);
    }

    return levelMaps;
}
