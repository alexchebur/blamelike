// @ts-check
/**
 * Детерминированный генератор случайных чисел для процедурной генерации
 * Использует алгоритм mulberry32 для скорости и качества
 * Все генерации зависят от сида — одинаковый сид = одинаковый мир
 */

/**
 * Создает seeded RNG из числа
 * Алгоритм mulberry32 — быстрый, качественный, период 2^32
 * @param {number} seed - начальное значение (целое число)
 * @returns {() => number} функция, возвращающая псевдослучайное число [0, 1)
 * 
 * @example
 * const rng = createRNG(12345);
 * console.log(rng()); // 0.123456...
 * console.log(rng()); // 0.789012...
 */
export function createRNG(seed) {
    // Приводим к беззнаковому 32-битному целому
    let state = seed >>> 0;
    
    return function() {
        state |= 0;
        state = state + 0x6D2B79F5 | 0;
        let t = Math.imul(state ^ state >>> 15, 1 | state);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

/**
 * Хеш-функция для 3D координат + seed
 * Возвращает детерминированное число на основе позиции в мире
 * Используется для принятия решений о размещении объектов
 * @param {number} x - мировая координата X
 * @param {number} y - мировая координата Y
 * @param {number} z - мировая координата Z
 * @param {number} seed - сид мира
 * @returns {number} хеш [0, 1)
 * 
 * @example
 * const h = hash3D(5, 10, 15, 12345);
 * if (h < 0.3) { /* разместить комнату *\/ }
 */
export function hash3D(x, y, z, seed) {
    // Используем битовые операции для быстрого хеширования
    // Формула основана на murmurhash3 mixing
    let h = seed;
    
    // Смешиваем x
    h = Math.imul(h ^ x, 0x5bd1e995);
    h = Math.imul(h ^ (h >>> 15), 0x5bd1e995);
    
    // Смешиваем y
    h = Math.imul(h ^ y, 0x5bd1e995);
    h = Math.imul(h ^ (h >>> 15), 0x5bd1e995);
    
    // Смешиваем z
    h = Math.imul(h ^ z, 0x5bd1e995);
    h = Math.imul(h ^ (h >>> 15), 0x5bd1e995);
    
    // Финальное смешивание
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    
    // Нормализуем в диапазон [0, 1)
    return ((h >>> 0) & 0x7fffffff) / 0x7fffffff;
}

/**
 * Случайное целое число в диапазоне [min, max] включительно
 * @param {number} min - минимальное значение
 * @param {number} max - максимальное значение
 * @param {() => number} rng - функция RNG
 * @returns {number} случайное целое число
 * 
 * @example
 * const rng = createRNG(12345);
 * const size = randomInt(2, 5, rng); // 2, 3, 4 или 5
 */
export function randomInt(min, max, rng) {
    return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Случайное число с плавающей точкой в диапазоне [min, max)
 * @param {number} min - минимальное значение (включительно)
 * @param {number} max - максимальное значение (исключительно)
 * @param {() => number} rng - функция RNG
 * @returns {number} случайное число
 * 
 * @example
 * const rng = createRNG(12345);
 * const height = randomFloat(10, 50, rng); // например, 23.456
 */
export function randomFloat(min, max, rng) {
    return rng() * (max - min) + min;
}

/**
 * Случайный выбор из массива с весами
 * @param {Array<{item: any, weight: number}>} items - массив объектов с весами
 * @param {() => number} rng - функция RNG
 * @returns {any} выбранный элемент
 * 
 * @example
 * const types = [
 *   { item: 'cylinder', weight: 0.3 },
 *   { item: 'cone', weight: 0.2 },
 *   { item: 'obelisk', weight: 0.15 }
 * ];
 * const type = weightedRandom(types, rng);
 */
export function weightedRandom(items, rng) {
    if (!items || items.length === 0) {
        throw new Error('weightedRandom: empty items array');
    }
    
    // Вычисляем общий вес
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    
    if (totalWeight <= 0) {
        throw new Error('weightedRandom: total weight must be positive');
    }
    
    // Выбираем случайное число в диапазоне [0, totalWeight)
    let random = rng() * totalWeight;
    
    // Находим соответствующий элемент
    for (const item of items) {
        random -= item.weight;
        if (random <= 0) {
            return item.item;
        }
    }
    
    // Фолбэк (не должен достигаться при корректных весах)
    return items[items.length - 1].item;
}

/**
 * Случайный булево значение с заданной вероятностью
 * @param {number} probability - вероятность true [0-1]
 * @param {() => number} rng - функция RNG
 * @returns {boolean}
 * 
 * @example
 * const hasBridge = chance(0.4, rng); // 40% шанс true
 */
export function chance(probability, rng) {
    return rng() < probability;
}

/**
 * Перемешивание массива (алгоритм Fisher-Yates)
 * @param {Array} array - массив для перемешивания
 * @param {() => number} rng - функция RNG
 * @returns {Array} тот же массив, но перемешанный
 * 
 * @example
 * const rooms = [room1, room2, room3];
 * shuffleArray(rooms, rng);
 */
export function shuffleArray(array, rng) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Генерация последовательности уникальных случайных чисел
 * @param {number} count - количество чисел
 * @param {number} min - минимум
 * @param {number} max - максимум
 * @param {() => number} rng - функция RNG
 * @returns {number[]} массив уникальных чисел
 * 
 * @example
 * const indices = uniqueRandoms(5, 0, 99, rng); // 5 уникальных чисел от 0 до 99
 */
export function uniqueRandoms(count, min, max, rng) {
    if (count > (max - min + 1)) {
        throw new Error('uniqueRandoms: count exceeds range');
    }
    
    const set = new Set();
    while (set.size < count) {
        set.add(randomInt(min, max, rng));
    }
    
    return Array.from(set);
}

export default {
    createRNG,
    hash3D,
    randomInt,
    randomFloat,
    weightedRandom,
    chance,
    shuffleArray,
    uniqueRandoms
};
