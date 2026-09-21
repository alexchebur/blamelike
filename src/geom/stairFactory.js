// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Создает нормализованную геометрию: 
 * - Плита занимает по Z диапазон [0 .. thicknessRatio]
 * - Лестница занимает [thicknessRatio .. 1.0]
 * @param {number} thicknessRatio - Относительная толщина плиты (platformThickness / levelHeight)
 */
function createBaseStairPlatform(thicknessRatio = 0.2) {
    const geometries = [];
    
    // 1. ОСНОВАНИЕ (Платформа)
    // Высота = thicknessRatio. Центр = thicknessRatio / 2
    const baseH = thicknessRatio;
    const base = new THREE.BoxGeometry(1, 1, baseH);
    base.translate(0, 0, baseH / 2); 
    geometries.push(base);

    // 2. ЛЕСТНИЦА
    // Подъем строго от верха плиты (baseH) до верха единичного куба (1.0)
    const stairStartZ = baseH;
    const stairEndZ = 1.0; 
    const stairHeight = stairEndZ - stairStartZ;
    
    const steps = 20;
    const stepH = stairHeight / steps;
    const stepD = 1.0 / steps; // Длина лестницы = 1 клетка (в единичном пространстве)
    const width = 0.6; // Ширина пролета

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, width, stepH);
        // X: от 0.5 до 1.5 (выход за пределы клетки для соединения со следующей)
        // Но в единичной системе координат меша мы работаем в [0..1].
        // Сдвиг на 0.5 нужен, чтобы лестница начиналась от края платформы.
        const x = 0.5 + (i * stepD) + (stepD / 2); 
        
        // Z: Равномерный подъем
        const z = stairStartZ + (i * stepH) + (stepH / 2);
        
        step.translate(x, 0, z);
        geometries.push(step);
    }
    
    return mergeGeometries(geometries);
}

const geomCache = {};

export function getPlatformStairGeometry(direction, thicknessRatio) {
    // Ключ кеша должен учитывать толщину, иначе при изменении параметра получим старую геометрию
    const key = `${direction}_${thicknessRatio.toFixed(3)}`;
    if (geomCache[key]) return geomCache[key];

    let geo = createBaseStairPlatform(thicknessRatio);
    
    if (direction === 'x_neg') geo.rotateZ(Math.PI);
    else if (direction === 'y_pos') geo.rotateZ(-Math.PI / 2);
    else if (direction === 'y_neg') geo.rotateZ(Math.PI / 2);

    geomCache[key] = geo;
    return geo;
}
