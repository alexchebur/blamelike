// src/gen/archWallBuilder.js
// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Кэш для геометрий арочных стен
 */
const archWallCache = new Map();

/**
 * Создает геометрию арочной стены (композитный подход)
 * Состоит из двух боковых столбов и перемычки сверху
 * 
 * @param {number} width - Ширина стены
 * @param {number} height - Высота стены  
 * @param {number} depth - Толщина стены
 * @param {number} archWidth - Ширина арки (выреза)
 * @param {number} archHeight - Высота арки (от верха стены вниз)
 * @returns {THREE.BufferGeometry} Объединенная геометрия арочной стены
 */
export function createArchWallGeometry(width, height, depth, archWidth, archHeight) {
    const geometries = [];
    
    // Параметры арки
    const pillarWidth = (width - archWidth) / 2; // Ширина каждого бокового столба
    
    // Проверяем, что арка имеет смысл
    if (pillarWidth <= 0.01 || archHeight <= 0 || archWidth >= width) {
        // Если параметры некорректны, возвращаем обычную стену
        console.warn('Некорректные параметры арки, создана обычная стена');
        return new THREE.BoxGeometry(width, height, depth);
    }
    
    // 1. Левый столб
    const leftPillar = new THREE.BoxGeometry(pillarWidth, height, depth);
    leftPillar.translate(-width/2 + pillarWidth/2, height/2, 0);
    geometries.push(leftPillar);
    
    // 2. Правый столб
    const rightPillar = new THREE.BoxGeometry(pillarWidth, height, depth);
    rightPillar.translate(width/2 - pillarWidth/2, height/2, 0);
    geometries.push(rightPillar);
    
    // 3. Перемычка сверху (горизонтальная балка над аркой)
    const lintelHeight = archHeight;
    const lintel = new THREE.BoxGeometry(width, lintelHeight, depth);
    lintel.translate(0, height - lintelHeight/2, 0);
    geometries.push(lintel);
    
    // Объединяем все части в одну геометрию
    return mergeGeometries(geometries);
}

/**
 * Получает или создает кэшированную геометрию арочной стены
 * @param {Object} params - Параметры стены
 * @returns {THREE.BufferGeometry}
 */
export function getCachedArchWallGeometry(params) {
    const {
        width = 1,
        height = 20,
        depth = 0.9,
        archWidthRatio = 0.6,
        archHeightRatio = 0.4
    } = params;
    
    // Создаем ключ кэша
    const cacheKey = `arch_${width.toFixed(2)}_${height.toFixed(2)}_${depth.toFixed(2)}_${archWidthRatio.toFixed(2)}_${archHeightRatio.toFixed(2)}`;
    
    if (!archWallCache.has(cacheKey)) {
        const archWidth = width * archWidthRatio;
        const archHeight = height * archHeightRatio;
        const geometry = createArchWallGeometry(width, height, depth, archWidth, archHeight);
        archWallCache.set(cacheKey, geometry);
    }
    
    return archWallCache.get(cacheKey);
}

/**
 * Очищает кэш геометрий арочных стен
 */
export function clearArchWallCache() {
    archWallCache.clear();
}

/**
 * Генерирует параметры арки на основе сида для вариативности
 * @param {number} seed - Сид для генерации
 * @param {number} x - X координата
 * @param {number} y - Y координата
 * @param {number} z - Z координата
 * @returns {Object} Параметры арки
 */
export function generateArchParams(seed, x, y, z) {
    // Используем хеш для детерминированной генерации
    const hash = ((x * 374761393 + y * 668265263 + z * 1274126177 + seed) & 0xFFFFFFFF) / 0xFFFFFFFF;
    
    // Вариативность параметров арки
    const archWidthRatio = 0.5 + (hash % 100) / 100 * 0.3; // 0.5 - 0.8
    const archHeightRatio = 0.3 + ((hash >> 8) % 100) / 100 * 0.3; // 0.3 - 0.6
    
    return {
        archWidthRatio: Math.max(0.4, Math.min(0.8, archWidthRatio)),
        archHeightRatio: Math.max(0.25, Math.min(0.6, archHeightRatio))
    };
}
