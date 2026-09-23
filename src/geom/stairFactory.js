// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Создает геометрию "Платформа + Лестница"
 * @param {number} cellSize - Размер клетки (горизонтальная длина лестницы)
 * @param {number} levelHeight - Высота подъема (расстояние между ярусами)
 * @param {number} platformThickness - Толщина плиты основания
 */
function createStairGeometry(cellSize, levelHeight, platformThickness) {
    const geometries = [];
    
    // 1. ПЛИТА ОСНОВАНИЯ
    // Размеры: cellSize x platformThickness x cellSize
    // Центр по Y должен быть на platformThickness / 2, чтобы низ был на 0
    const base = new THREE.BoxGeometry(cellSize, platformThickness, cellSize);
    base.translate(0, platformThickness / 2, 0); 
    geometries.push(base);

    // 2. ЛЕСТНИЦА
    // Должна подняться от platformThickness до levelHeight
    // Горизонтально занять cellSize (или чуть меньше, скажем 0.8 * cellSize)
    const steps = 12; // Фиксированное число ступеней для стиля Blame!
    const stairLength = cellSize * 0.9; // Чуть короче клетки, чтобы был зазор
    const width = cellSize * 0.4; // Ширина марша
    
    const startOffset = cellSize / 2; // Начинаем от центра клетки (край плиты)
    
    const climbHeight = levelHeight - platformThickness;
    const stepH = climbHeight / steps;
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, stepH, width);
        
        // X: движемся от центра клетки к краю
        const x = startOffset + (i * stepD); 
        
        // Y: поднимаемся от верха плиты
        const y = platformThickness + (i * stepH) + (stepH / 2);
        
        step.translate(x, y, 0);
        geometries.push(step);
    }

    return mergeGeometries(geometries);
}

const geomCache = {};

/**
 * Возвращает кэшированную геометрию для заданных параметров
 */
export function getPlatformStairGeometry(variant, cellSize, levelHeight, platformThickness) {
    // Ключ кэша включает размеры, чтобы при изменении конфига геометрия пересоздалась
    const cacheKey = `${variant}_${cellSize}_${levelHeight}_${platformThickness}`;
    if (geomCache[cacheKey]) return geomCache[cacheKey];

    let geo = createStairGeometry(cellSize, levelHeight, platformThickness);

    // Поворот вокруг вертикальной оси Y (так как у нас Y-up)
    if (variant === 'west') geo.rotateY(Math.PI);
    else if (variant === 'north') geo.rotateY(-Math.PI / 2);
    else if (variant === 'south') geo.rotateY(Math.PI / 2);
    // 'east' — базовое направление

    geomCache[cacheKey] = geo;
    return geo;
}
