// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Создает геометрию платформы со встроенной лестницей (единичные размеры)
 * Платформа: [-0.5 .. 0.5], Лестница: [0.66 .. 1.66] (смещена вправо на 2/3)
 */
// src/geom/stairFactory.js
function createBaseStairPlatform() {
    const geometries = [];
    
    // 1. Платформа (основание)
    // Толщина 0.2 соответствует platformThickness=4 при levelHeight=20
    const base = new THREE.BoxGeometry(1, 1, 0.2); 
    base.translate(0, 0, 0.1); // Поднимаем на половину толщины
    geometries.push(base);

    // 2. Лестница
    const steps = 20; 
    const stairLength = 1.0; 
    const startOffset = 0.5 + (1 / 6); // Смещение на 2/3 ребра
    const width = 0.3; 
    
    // Подъем начинается от верха базы (0.2) до верха яруса (1.0)
    const stepH = (1 - 0.2) / steps; 
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, width, stepH);
        const x = startOffset + (i * stepD) + (stepD / 2);
        // Z начинается от 0.2 (верх новой базы)
        const z = 0.2 + (i * stepH) + (stepH / 2);
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
    // При повороте смещение "вправо" корректно перейдет в нужное направление
    if (direction === 'x_neg') geo.rotateZ(Math.PI);
    else if (direction === 'y_pos') geo.rotateZ(-Math.PI / 2);
    else if (direction === 'y_neg') geo.rotateZ(Math.PI / 2);

    geomCache[direction] = geo;
    return geo;
}
