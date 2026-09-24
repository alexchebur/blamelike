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
    // === ЖЕСТКАЯ ЗАЩИТА ОТ NaN И НЕКОРРЕКТНЫХ ЗНАЧЕНИЙ ===
    const safeThickness = (typeof plateThickness === 'number' && plateThickness > 0) ? plateThickness : 0.5;
    const safeLevelHeight = (typeof levelHeight === 'number' && levelHeight > 0) ? levelHeight : 20;
    
    // Вычисляем нормализованную долю толщины плиты от общей высоты меша
    const thicknessRatio = Math.max(0.01, Math.min(0.99, safeThickness / safeLevelHeight));
    
    const geometries = [];
    
    // 1. ПЛИТА ОСНОВАНИЯ
    const base = new THREE.BoxGeometry(1, thicknessRatio, 1);
    base.translate(0, thicknessRatio / 2, 0); 
    geometries.push(base);

    // 2. ЛЕСТНИЦА
    const steps = 21; 
    const stairLength = 1.05; 
    const width = 0.4;
    
    const startOffset = 0.5; 
    
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
 * Создает геометрию моста Север-Юг (вдоль оси Z)
 * Размер: 1x1 клетка. Мост узкий по X, длинный по Z.
 */
function createBridgeNSGeometry() {
    // Ширина 0.2, Высота 0.1, Длина 1.0
    const geo = new THREE.BoxGeometry(0.2, 0.1, 1.0);
    return geo;
}

/**
 * Создает геометрию моста Восток-Запад (вдоль оси X)
 * Размер: 1x1 клетка. Мост длинный по X, узкий по Z.
 */
function createBridgeEWGeometry() {
    // Длина 1.0, Высота 0.1, Ширина 0.2
    const geo = new THREE.BoxGeometry(1.0, 0.1, 0.2);
    return geo;
}

/**
 * Возвращает геометрию нужного типа (лестница или мост)
 * @param {'stair_north'|'stair_south'|'stair_east'|'stair_west'|'bridge_ns'|'bridge_ew'} type 
 * @param {number} plateThickness - Толщина плиты (используется только для лестниц)
 * @param {number} levelHeight - Высота яруса (используется только для лестниц)
 */
export function getStairGeometry(type, plateThickness, levelHeight) {
    // Для мостов параметры толщины не важны, используем дефолтные для ключа кэша
    const safePT = plateThickness ?? 0.5;
    const safeLH = levelHeight ?? 20;
    
    const cacheKey = `${type}_${safePT}_${safeLH}`;
    
    if (geomCache[cacheKey]) return geomCache[cacheKey];

    let geo;

    // === ГЕОМЕТРИЯ МОСТОВ ===
    if (type === 'bridge_ns') {
        geo = createBridgeNSGeometry();
    } 
    else if (type === 'bridge_ew') {
        geo = createBridgeEWGeometry();
    }
    // === ГЕОМЕТРИЯ ЛЕСТНИЦ (Legacy) ===
    else {
        geo = createEastStairGeometry(safePT, safeLH);

        // Поворот вокруг вертикальной оси Y (Y-up система)
        if (type === 'stair_west') geo.rotateY(Math.PI);
        else if (type === 'stair_north') geo.rotateY(-Math.PI / 2);
        else if (type === 'stair_south') geo.rotateY(Math.PI / 2);
    }

    if (!geo) {
        console.warn(`Unknown geometry type: ${type}`);
        geo = new THREE.BoxGeometry(1, 1, 1);
    }

    geomCache[cacheKey] = geo;
    return geo;
}
