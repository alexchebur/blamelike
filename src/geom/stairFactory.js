// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Создает нормализованную геометрию платформы с лестницей.
 * Вся геометрия укладывается в bounding box [0..1] по всем осям.
 * @param {number} thicknessRatio - Относительная толщина основания (platformThickness / levelHeight)
 */
function createBaseStairPlatform(thicknessRatio = 0.2) {
    const geometries = [];
    
    // 1. ОСНОВАНИЕ (Плита)
    // Занимает по Z диапазон [0 .. thicknessRatio]
    const baseH = thicknessRatio;
    const base = new THREE.BoxGeometry(1, 1, baseH);
    // Сдвигаем так, чтобы низ плиты был на Z=0
    base.translate(0, 0, baseH / 2); 
    geometries.push(base);

    // 2. ЛЕСТНИЦА
    // Начинается ровно на верхней грани плиты (baseH)
    // Заканчивается на верхней границе единичного куба (1.0)
    const stairStartZ = baseH;
    const stairEndZ = 1.0; 
    const stairHeight = stairEndZ - stairStartZ;
    
    const steps = 12; // Количество ступеней
    const stepH = stairHeight / steps;
    const stepD = 1.0 / steps; // Длина лестницы равна 1 клетке (единичный куб)
    const width = 0.4; // Ширина пролета

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, width, stepH);
        
        // X: Лестница идет от центра клетки (0.5) к краю (1.0 в локальных координатах)
        const x = 0.5 + (i * stepD) + (stepD / 2); 
        
        // Z: Равномерный подъем от верха плиты
        const z = stairStartZ + (i * stepH) + (stepH / 2);
        
        step.translate(x, 0, z);
        geometries.push(step);
    }
    
    return mergeGeometries(geometries);
}

const geomCache = {};

export function getPlatformStairGeometry(direction, thicknessRatio = 0.2) {
    // Защита от undefined
    if (thicknessRatio === undefined || isNaN(thicknessRatio)) thicknessRatio = 0.2;

    const key = `${direction}_${thicknessRatio.toFixed(3)}`;
    if (geomCache[key]) return geomCache[key];

    let geo = createBaseStairPlatform(thicknessRatio);
    
    // Повороты для разных направлений выхода лестницы
    if (direction === 'x_neg') geo.rotateZ(Math.PI);
    else if (direction === 'y_pos') geo.rotateZ(-Math.PI / 2);
    else if (direction === 'y_neg') geo.rotateZ(Math.PI / 2);

    geomCache[key] = geo;
    return geo;
}
