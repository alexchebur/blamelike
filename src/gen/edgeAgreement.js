// @ts-check
/**
 * EdgeAgreement — единое правило границы чанков
 * Гарантирует, что два соседних чанка сгенерируют одинаковые элементы на общей грани
 * без необходимости обмена данными между чанками
 */

import { hash3D } from '../core/rng.js';

/**
 * @typedef {Object} BoundaryDecision
 * @property {boolean} hasPassage - есть ли проход на этой ячейке границы
 * @property {string|null} connectionType - тип соединения: 'bridge', 'stairs', 'ramp', 'portal', null
 * @property {number} connectionHeight - высота соединения относительно уровня яруса [0-1]
 * @property {boolean} isPierceAxis - является ли эта точка осью протыкающей фигуры
 * @property {string|null} pierceType - тип протыкающей фигуры на границе
 */

/**
 * Вычисляет "паспорт грани" — уникальный идентификатор для границы между двумя чанками
 * Паспорт одинаков для обоих соседей, так как зависит только от мировых координат грани
 * @param {number} cx - координата чанка по X
 * @param {number} cy - координата чанка по Y
 * @param {number} cz - координата чанка по Z
 * @param {string} axis - ось границы: 'x', 'y', 'z'
 * @param {number} direction - направление: +1 (положительная грань) или -1 (отрицательная грань)
 * @param {number} seed - сид мира
 * @returns {number} паспорт грани (большое целое число)
 */
export function getBoundaryPassport(cx, cy, cz, axis, direction, seed) {
    // Определяем мировые координаты грани
    let gx, gy, gz;
    
    if (axis === 'x') {
        gx = direction > 0 ? cx + 1 : cx;
        gy = cy;
        gz = cz;
    } else if (axis === 'y') {
        gx = cx;
        gy = direction > 0 ? cy + 1 : cy;
        gz = cz;
    } else { // axis === 'z'
        gx = cx;
        gy = cy;
        gz = direction > 0 ? cz + 1 : cz;
    }
    
    // Хеш из координат грани + оси + направления + сида
    // Это гарантирует одинаковый результат для обоих соседей
    return Math.floor(hash3D(gx, gy, gz, seed) * 1000000) + 
           (axis === 'x' ? 0 : axis === 'y' ? 1000000 : 2000000) +
           (direction > 0 ? 0 : 500000);
}

/**
 * Принимает решение о наличии прохода/соединения на конкретной ячейке границы
 * @param {number} passport - паспорт грани
 * @param {number} cellIndex - индекс ячейки вдоль грани (0..gridSize-1)
 * @param {number} gridSize - размер сетки чанка
 * @param {Object} config - конфигурация
 * @returns {BoundaryDecision} решение для этой ячейки
 */
export function decideBoundaryCell(passport, cellIndex, gridSize, config) {
    // Локальный хеш для этой конкретной ячейки на грани
    const cellHash = hash3D(passport, cellIndex, 0, 0);
    
    const decision = {
        hasPassage: false,
        connectionType: null,
        connectionHeight: 0.5,
        isPierceAxis: false,
        pierceType: null
    };
    
    // Решение о наличии прохода
    if (cellHash < config.bridgeChance) {
        decision.hasPassage = true;
        
        // Выбор типа соединения
        const typeRoll = cellHash * 10; // нормализуем в [0, 10)
        
        if (typeRoll < config.bridgeWeights.straight * 10) {
            decision.connectionType = 'bridge';
        } else if (typeRoll < (config.bridgeWeights.straight + config.bridgeWeights.arched) * 10) {
            decision.connectionType = 'arched_bridge';
        } else if (typeRoll < (config.bridgeWeights.straight + config.bridgeWeights.arched + config.bridgeWeights.suspended) * 10) {
            decision.connectionType = 'suspended_bridge';
        } else {
            decision.connectionType = 'tube_bridge';
        }
        
        // Высота соединения (относительно уровня яруса)
        decision.connectionHeight = 0.3 + (cellHash * 0.4); // [0.3, 0.7]
    }
    
    // Решение о протыкающей фигуре на границе
    const pierceHash = hash3D(passport, cellIndex, 1, 0);
    if (pierceHash < config.scatterDensity * 0.5) { //减半密度 на границах
        decision.isPierceAxis = true;
        
        // Выбор типа протыкающей фигуры
        const pierceTypes = Object.entries(config.pierceWeights);
        const totalWeight = pierceTypes.reduce((sum, [, w]) => sum + w, 0);
        let roll = pierceHash * totalWeight;
        
        for (const [type, weight] of pierceTypes) {
            roll -= weight;
            if (roll <= 0) {
                decision.pierceType = type;
                break;
            }
        }
    }
    
    return decision;
}

/**
 * Получает все решения для всей грани чанка
 * @param {number} cx - координата чанка по X
 * @param {number} cy - координата чанка по Y
 * @param {number} cz - координата чанка по Z
 * @param {string} axis - ось границы: 'x', 'y', 'z'
 * @param {number} direction - направление: +1 или -1
 * @param {number} seed - сид мира
 * @param {Object} config - конфигурация
 * @returns {BoundaryDecision[]} массив решений для каждой ячейки грани
 */
export function getBoundaryDecisions(cx, cy, cz, axis, direction, seed, config) {
    const passport = getBoundaryPassport(cx, cy, cz, axis, direction, seed);
    const decisions = [];
    
    for (let i = 0; i < config.gridSize; i++) {
        decisions.push(decideBoundaryCell(passport, i, config.gridSize, config));
    }
    
    return decisions;
}

/**
 * Проверяет, является ли позиция на границе "специальной" (требует особого префаба)
 * Используется при выборе префабов для boundary-слотов
 * @param {number} cx 
 * @param {number} cy 
 * @param {number} cz 
 * @param {string} axis 
 * @param {number} direction 
 * @param {number} cellIndex 
 * @param {number} seed 
 * @param {Object} config 
 * @returns {Object} { isSpecial: boolean, type: string|null }
 */
export function isBoundarySpecial(cx, cy, cz, axis, direction, cellIndex, seed, config) {
    const passport = getBoundaryPassport(cx, cy, cz, axis, direction, seed);
    const specialHash = hash3D(passport, cellIndex, 99, 0);
    
    if (specialHash < 0.1) { // 10% шанс специальной точки
        return {
            isSpecial: true,
            type: specialHash < 0.05 ? 'portal_half' : 'bridge_half'
        };
    }
    
    return { isSpecial: false, type: null };
}

export default {
    getBoundaryPassport,
    decideBoundaryCell,
    getBoundaryDecisions,
    isBoundarySpecial
};
