// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Создает геометрию "Платформа + Лестница"
 * @param {number} cellSize - Размер клетки (горизонтальная длина лестницы)
 * @param {number} levelHeight - Высота подъема (расстояние между ярусами)
 * @param {number} platformThickness - Толщина плиты основания
 */
// src/geom/stairFactory.js

export function createStairGeometry(levels, levelHeight, width, stepDepth) {
    const geometries = [];
    
    // Параметры пропорций (должны совпадать с дефолтными значениями из config.js)
    // Мы строим геометрию в локальных координатах [0..1] по высоте.
    // При масштабе levelHeight=20 и thickness=2, плита займет нижние 0.1 (2/20) высоты.
    const plateRatio = 2 / 20; // platformThickness / levelHeight
    
    // 1. ПЛИТА ОСНОВАНИЯ
    // Высота = plateRatio, ширина/глубина = 1. Центр по Y = plateRatio / 2
    const base = new THREE.BoxGeometry(1, plateRatio, 1);
    base.translate(0, plateRatio / 2, 0); 
    geometries.push(base);

    // 2. ЛЕСТНИЦА
    // Начинается сразу над плитой (plateRatio) и идет до верха (1.0)
    const steps = 20; 
    const stairLength = 1.0; 
    
    const startOffset = 0.5; // Начинаем от края платформы
    
    // Доступная высота для ступеней = 1.0 - plateRatio
    const availableHeight = 1.0 - plateRatio;
    const stepH = availableHeight / steps; 
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, stepH, width);
        
        // X: идем вдоль длины лестницы
        const x = startOffset + (i * stepD); 
        
        // Y: начинаем от верха плиты (plateRatio)
        const y = plateRatio + (i * stepH) + (stepH / 2);
        
        step.translate(x, y, 0);
        geometries.push(step);
    }

    return mergeGeometries(geometries);
}

const geomCache = {};



/**
 * Создает геометрию "Платформа + Лестница" с точными размерами
 * @param {'east'|'west'|'north'|'south'} direction - Направление лестницы
 * @param {number} cellSize - Размер клетки грида (ширина/глубина платформы)
 * @param {number} levelHeight - Высота подъема (расстояние между ярусами)
 * @param {number} platformThickness - Толщина плиты основания
 */
export function getPlatformStairGeometry(direction, cellSize, levelHeight, platformThickness) {
    // Ключ кэша включает размеры, чтобы при смене конфига геометрия пересоздалась
    const cacheKey = `${direction}_${cellSize}_${levelHeight}_${platformThickness}`;
    if (geomCache[cacheKey]) return geomCache[cacheKey];

    const geometries = [];

    // 1. ПЛИТА ОСНОВАНИЯ
    // Размеры: cellSize x platformThickness x cellSize
    // Центр по Y должен быть на platformThickness / 2, чтобы низ был на 0
    const base = new THREE.BoxGeometry(cellSize, platformThickness, cellSize);
    base.translate(0, platformThickness / 2, 0); 
    geometries.push(base);

    // 2. ЛЕСТНИЦА
    // Должна подняться от platformThickness до levelHeight
    // Горизонтально занять cellSize (или чуть меньше, скажем 0.9 * cellSize)
    const steps = 12; // Фиксированное число ступеней для стиля Blame!
    const stairLength = cellSize * 0.9; // Чуть короче клетки, чтобы был зазор
    const width = cellSize * 0.4; // Ширина марша
    
    const startOffset = cellSize / 2; // Начинаем от центра клетки (край плиты)
    
    const climbHeight = levelHeight - platformThickness;
    const stepH = climbHeight / steps;
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, stepH, width);
        
        // X: движемся от центра клетки к краю (в сторону лестницы)
        const x = startOffset + (i * stepD); 
        
        // Y: поднимаемся от верха плиты
        const y = platformThickness + (i * stepH) + (stepH / 2);
        
        step.translate(x, y, 0);
        geometries.push(step);
    }

    let mergedGeo = mergeGeometries(geometries);

    // Поворот вокруг вертикальной оси Y (так как у нас Y-up)
    if (direction === 'west') mergedGeo.rotateY(Math.PI);
    else if (direction === 'north') mergedGeo.rotateY(-Math.PI / 2);
    else if (direction === 'south') mergedGeo.rotateY(Math.PI / 2);
    // 'east' — базовое направление, поворот 0

    geomCache[cacheKey] = mergedGeo;
    return mergedGeo;
}
