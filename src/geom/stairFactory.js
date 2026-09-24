// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const geomCache = {};

// src/geom/stairFactory.js

function createEastStairGeometry(plateThickness, levelHeight) {
    const geometries = [];
    
    // Вычисляем нормализованную долю толщины плиты
    // Теперь она будет 0.5 / 20 = 0.025 (очень тонкая плита)
    const thicknessRatio = Math.max(0.01, Math.min(0.99, plateThickness / levelHeight));
    
    // 1. ПЛИТА ОСНОВАНИЯ
    const base = new THREE.BoxGeometry(1, thicknessRatio, 1);
    base.translate(0, thicknessRatio / 2, 0); 
    geometries.push(base);

    // 2. ЛЕСТНИЦА
    // УВЕЛИЧЕНО КОЛИЧЕСТВО СТУПЕНЕЙ: 20 -> 21
    // Каждая ступень станет чуть ниже, но их станет на одну больше
    const steps = 21; 
    const stairLength = 1.0; // Ровно одна клетка
    const width = 0.4;
    
    const startOffset = 0.5; // От центра клетки
    
    const availableHeight = 1.0 - thicknessRatio;
    const stepH = availableHeight / steps; // Высота одной ступени пересчитается автоматически
    const stepD = stairLength / steps;     // Глубина одной ступени тоже пересчитается

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, stepH, width);
        
        const x = startOffset + (i * stepD); 
        const y = thicknessRatio + (i * stepH) + (stepH / 2);
        
        step.translate(x, y, 0);
        geometries.push(step);
    }

    return mergeGeometries(geometries);
}

// ... остальной код файла без изменений ...

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
