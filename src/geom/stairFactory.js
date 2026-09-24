// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const geomCache = {};

/**
 * Создает базовую геометрию лестницы (направлена на +X)
 * @param {number} plateThickness - Абсолютная толщина плиты основания
 * @param {number} levelHeight - Абсолютная высота подъема (масштаб Y)
 */
function createEastStairGeometry(plateThickness, levelHeight) {
    // === ЗАЩИТА ОТ NaN И Infinity ===
    // Если параметры некорректны, используем безопасные дефолты
    const safeThickness = (typeof plateThickness === 'number' && plateThickness > 0) ? plateThickness : 2;
    const safeLevelHeight = (typeof levelHeight === 'number' && levelHeight > 0) ? levelHeight : 20;
    
    // Вычисляем нормализованную долю толщины плиты от общей высоты меша
    // Clamp гарантирует, что ratio всегда в диапазоне [0.01, 0.99]
    const thicknessRatio = Math.max(0.01, Math.min(0.99, safeThickness / safeLevelHeight));
    
    const geometries = [];
    
    // 1. ПЛИТА ОСНОВАНИЯ
    // В локальных координатах [0..1] она занимает [0 .. thicknessRatio]
    const base = new THREE.BoxGeometry(1, thicknessRatio, 1);
    base.translate(0, thicknessRatio / 2, 0); 
    geometries.push(base);

    // 2. ЛЕСТНИЦА
    // Поднимается от верха плиты до верха меша (1.0)
    const steps = 20; 
    const stairLength = 1.0; // Ровно одна клетка
    const width = 0.4;
    
    const startOffset = 0.5; // От центра клетки
    
    const availableHeight = 1.0 - thicknessRatio;
    const stepH = availableHeight / steps;
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, stepH, width);
        
        const x = startOffset + (i * stepD); 
        const y = thicknessRatio + (i * stepH) + (stepH / 2);
        
        step.translate(x, y, 0);
        geometries.push(step);
    }

    return mergeGeometries(geometries);
}

/**
 * Возвращает геометрию лестницы нужного направления
 * @param {'stair_north'|'stair_south'|'stair_east'|'stair_west'} type 
 * @param {number} plateThickness - Толщина плиты (из конфига/примитива)
 * @param {number} levelHeight - Высота яруса (из конфига/примитива)
 */
export function getStairGeometry(type, plateThickness, levelHeight) {
    // Ключ кэша включает размеры, чтобы геометрия пересоздавалась при смене параметров
    // Добавляем защиту от undefined в ключе кэша
    const safePT = plateThickness ?? 2;
    const safeLH = levelHeight ?? 20;
    const cacheKey = `${type}_${safePT}_${safeLH}`;
    
    if (geomCache[cacheKey]) return geomCache[cacheKey];

    let geo = createEastStairGeometry(safePT, safeLH);

    // Поворот вокруг вертикальной оси Y (Y-up система)
    if (type === 'stair_west') geo.rotateY(Math.PI);
    else if (type === 'stair_north') geo.rotateY(-Math.PI / 2);
    else if (type === 'stair_south') geo.rotateY(Math.PI / 2);

    geomCache[cacheKey] = geo;
    return geo;
}
