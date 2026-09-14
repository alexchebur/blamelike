// @ts-check
/**
 * Утилиты для работы с ключами чанков
 * Упаковывает 3D-координаты (cx, cy, cz) в строковый ключ для Map/Set
 * и обратно разбирает ключ в координаты
 */

/**
 * @typedef {Object} ChunkCoords
 * @property {number} cx - координата чанка по X
 * @property {number} cy - координата чанка по Y
 * @property {number} cz - координата чанка по Z
 */

/**
 * Создает уникальный строковый ключ для чанка из его координат
 * Формат: "cx,cy,cz" (например, "5,-2,10")
 * @param {number} cx - координата чанка по X
 * @param {number} cy - координата чанка по Y
 * @param {number} cz - координата чанка по Z
 * @returns {string} уникальный ключ чанка
 * 
 * @example
 * const key = createChunkKey(5, -2, 10); // "5,-2,10"
 */
export function createChunkKey(cx, cy, cz) {
    return `${cx},${cy},${cz}`;
}

/**
 * Разбирает строковый ключ обратно в координаты чанка
 * @param {string} key - ключ чанка в формате "cx,cy,cz"
 * @returns {ChunkCoords} объект с координатами чанка
 * @throws {Error} если формат ключа некорректный
 * 
 * @example
 * const coords = parseChunkKey("5,-2,10");
 * // { cx: 5, cy: -2, cz: 10 }
 */
export function parseChunkKey(key) {
    if (!key || typeof key !== 'string') {
        throw new Error(`Invalid chunk key: ${key}`);
    }
    
    const parts = key.split(',');
    
    if (parts.length !== 3) {
        throw new Error(`Invalid chunk key format: ${key}. Expected "cx,cy,cz"`);
    }
    
    const cx = Number(parts[0]);
    const cy = Number(parts[1]);
    const cz = Number(parts[2]);
    
    if (isNaN(cx) || isNaN(cy) || isNaN(cz)) {
        throw new Error(`Invalid chunk key values: ${key}`);
    }
    
    return { cx, cy, cz };
}

/**
 * Вычисляет координаты чанка из мировых координат
 * @param {number} x - мировая координата X
 * @param {number} y - мировая координата Y
 * @param {number} z - мировая координата Z
 * @param {number} chunkSize - размер чанка в мировых единицах
 * @returns {ChunkCoords} координаты чанка
 * 
 * @example
 * const coords = worldToChunk(150, 75, -200, 100);
 * // { cx: 1, cy: 0, cz: -2 }
 */
export function worldToChunk(x, y, z, chunkSize) {
    return {
        cx: Math.floor(x / chunkSize),
        cy: Math.floor(y / chunkSize),
        cz: Math.floor(z / chunkSize)
    };
}

/**
 * Вычисляет мировые координаты центра чанка
 * @param {number} cx - координата чанка по X
 * @param {number} cy - координата чанка по Y
 * @param {number} cz - координата чанка по Z
 * @param {number} chunkSize - размер чанка в мировых единицах
 * @returns {{x: number, y: number, z: number}} мировые координаты центра
 * 
 * @example
 * const center = chunkToWorldCenter(1, 0, -2, 100);
 * // { x: 150, y: 50, z: -150 }
 */
export function chunkToWorldCenter(cx, cy, cz, chunkSize) {
    const halfSize = chunkSize / 2;
    return {
        x: cx * chunkSize + halfSize,
        y: cy * chunkSize + halfSize,
        z: cz * chunkSize + halfSize
    };
}

/**
 * Вычисляет bounding box чанка в мировых координатах
 * @param {number} cx - координата чанка по X
 * @param {number} cy - координата чанка по Y
 * @param {number} cz - координата чанка по Z
 * @param {number} chunkSize - размер чанка в мировых единицах
 * @returns {{min: {x: number, y: number, z: number}, max: {x: number, y: number, z: number}}}
 * 
 * @example
 * const bbox = chunkToBounds(1, 0, -2, 100);
 * // { min: {x: 100, y: 0, z: -200}, max: {x: 200, y: 100, z: -100} }
 */
export function chunkToBounds(cx, cy, cz, chunkSize) {
    return {
        min: {
            x: cx * chunkSize,
            y: cy * chunkSize,
            z: cz * chunkSize
        },
        max: {
            x: (cx + 1) * chunkSize,
            y: (cy + 1) * chunkSize,
            z: (cz + 1) * chunkSize
        }
    };
}

/**
 * Проверяет, находится ли точка внутри чанка
 * @param {number} x - мировая координата X
 * @param {number} y - мировая координата Y
 * @param {number} z - мировая координата Z
 * @param {number} cx - координата чанка по X
 * @param {number} cy - координата чанка по Y
 * @param {number} cz - координата чанка по Z
 * @param {number} chunkSize - размер чанка в мировых единицах
 * @returns {boolean} true если точка внутри чанка
 */
export function isPointInChunk(x, y, z, cx, cy, cz, chunkSize) {
    const minX = cx * chunkSize;
    const maxX = (cx + 1) * chunkSize;
    const minY = cy * chunkSize;
    const maxY = (cy + 1) * chunkSize;
    const minZ = cz * chunkSize;
    const maxZ = (cz + 1) * chunkSize;
    
    return x >= minX && x < maxX &&
           y >= minY && y < maxY &&
           z >= minZ && z < maxZ;
}

/**
 * Получает соседние чанки по всем осям (26 соседей в 3D)
 * @param {number} cx - координата чанка по X
 * @param {number} cy - координата чанка по Y
 * @param {number} cz - координата чанка по Z
 * @returns {ChunkCoords[]} массив координат соседних чанков
 */
export function getNeighborChunks(cx, cy, cz) {
    const neighbors = [];
    
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
                // Пропускаем сам чанк
                if (dx === 0 && dy === 0 && dz === 0) continue;
                
                neighbors.push({
                    cx: cx + dx,
                    cy: cy + dy,
                    cz: cz + dz
                });
            }
        }
    }
    
    return neighbors;
}

/**
 * Получает только граничных соседей (6 соседей по осям)
 * @param {number} cx - координата чанка по X
 * @param {number} cy - координата чанка по Y
 * @param {number} cz - координата чанка по Z
 * @returns {ChunkCoords[]} массив координат граничных соседей
 */
export function getFaceNeighbors(cx, cy, cz) {
    return [
        { cx: cx + 1, cy, cz },
        { cx: cx - 1, cy, cz },
        { cx, cy: cy + 1, cz },
        { cx, cy: cy - 1, cz },
        { cx, cy, cz: cz + 1 },
        { cx, cy, cz: cz - 1 }
    ];
}

export default {
    createChunkKey,
    parseChunkKey,
    worldToChunk,
    chunkToWorldCenter,
    chunkToBounds,
    isPointInChunk,
    getNeighborChunks,
    getFaceNeighbors
};
