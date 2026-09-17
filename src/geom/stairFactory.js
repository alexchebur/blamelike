// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Создает базовую геометрию платформы с лестницей (единичные размеры 1x1x1)
 * Лестница занимает половину клетки и поднимается на полную высоту
 */
function createBaseStairPlatform() {
    const geometries = [];
    
    // 1. Платформа (основание)
    const base = new THREE.BoxGeometry(1, 1, 0.1);
    base.translate(0, 0, 0.05);
    geometries.push(base);

    // 2. Лестница (20 мелких ступеней для плавности)
    const steps = 20;
    const stepH = 1 / steps;
    const stepD = 0.5 / steps; // Лестница занимает 0.5 единицы по длине
    const width = 0.6;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, width, stepH);
        // X: от 0 до 0.5 (правая половина клетки)
        // Z: от 0.1 (верх базы) до 1.0 (верх яруса)
        const x = (i / steps) * 0.5;
        const z = 0.1 + (i / steps) * 0.9;
        step.translate(x, 0, z);
        geometries.push(step);
    }
    
    return mergeGeometries(geometries);
}

const geomCache = {};

export function getPlatformStairGeometry(direction) {
    if (geomCache[direction]) return geomCache[direction];

    let geo = createBaseStairPlatform();
    
    // Поворот базовой геометрии (+X) в нужное направление
    if (direction === 'x_neg') geo.rotateZ(Math.PI);
    else if (direction === 'y_pos') geo.rotateZ(-Math.PI / 2);
    else if (direction === 'y_neg') geo.rotateZ(Math.PI / 2);

    geomCache[direction] = geo;
    return geo;
}
