// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Создает геометрию платформы со встроенной лестницей (единичные размеры)
 * Платформа: [-0.5 .. 0.5], Лестница: [0.5 .. 1.5] (выходит за границу на 1 клетку)
 */
function createBaseStairPlatform() {
    const geometries = [];
    
    // 1. Платформа (основание): 1x1x0.1, центр в (0,0,0.05)
    // Грани находятся точно на X=-0.5 и X=+0.5
    const base = new THREE.BoxGeometry(1, 1, 0.1);
    base.translate(0, 0, 0.05);
    geometries.push(base);

    // 2. Лестница
    const steps = 50; 
    const stairLength = 1.0; // Ровно 1 клетка длины (от 0.5 до 1.5)
    const stepH = (1 - 0.1) / steps; // Подъем от верха базы (0.1) до верха яруса (1.0)
    const stepD = stairLength / steps;
    const width = 0.1; 

    for (let i = 0; i < steps; i++) {
        // Ступень: глубина по X, ширина по Y, высота по Z
        const step = new THREE.BoxGeometry(stepD, width, stepH);
        
        // X: Начинаем СТРОГО от 0.5 (правый край базы) и идем до 1.5
        const x = 0.5 + (i * stepD) + (stepD / 2);
        
        // Z: От 0.1 (верх базы) до 1.0 (верх яруса)
        const z = 0.1 + (i * stepH) + (stepH / 2);
        
        step.translate(x, 0, z);
        geometries.push(step);
    }
    
    return mergeGeometries(geometries);
}

const geomCache = {};

export function getPlatformStairGeometry(direction) {
    if (geomCache[direction]) return geomCache[direction];

    let geo = createBaseStairPlatform();
    
    // Поворот вокруг центра (0,0), который является центром БАЗОВОЙ платформы
    if (direction === 'x_neg') geo.rotateZ(Math.PI);
    else if (direction === 'y_pos') geo.rotateZ(-Math.PI / 2);
    else if (direction === 'y_neg') geo.rotateZ(Math.PI / 2);

    geomCache[direction] = geo;
    return geo;
}
