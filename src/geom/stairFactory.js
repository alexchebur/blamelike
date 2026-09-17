// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Создает базовую геометрию платформы с лестницей (единичные размеры)
 * Лестница идет от центра к краю (+X) и вверх
 */
function createBaseStairPlatform() {
    const geometries = [];
    
    // Платформа 1x1x0.1 (толщина условная)
    const base = new THREE.BoxGeometry(1, 1, 0.1);
    base.translate(0, 0, 0.05);
    geometries.push(base);

    // Лестница из 5 ступеней
    const steps = 5;
    for (let i = 0; i < steps; i++) {
        // Ступень: глубина 0.2, высота 0.2, ширина 0.8
        const step = new THREE.BoxGeometry(0.2, 0.2, 0.8);
        // Позиция: 
        // X: от 0.1 до 0.9 (в пределах правой половины)
        // Z: от 0.1 до 0.9 (вверх)
        const x = 0.1 + (i * 0.2) + 0.1; 
        const z = 0.1 + (i * 0.2) + 0.1;
        step.translate(x, 0, z);
        geometries.push(step);
    }
    
    return mergeGeometries(geometries);
}

// Кэш геометрий
const geomCache = {};

export function getPlatformStairGeometry(direction) {
    if (geomCache[direction]) return geomCache[direction];

    let geo = createBaseStairPlatform();
    
    // Поворачиваем базовую геометрию (которая смотрит в +X) в нужную сторону
    if (direction === 'x_neg') {
        geo.rotateZ(Math.PI);
    } else if (direction === 'y_pos') {
        geo.rotateZ(-Math.PI / 2);
    } else if (direction === 'y_neg') {
        geo.rotateZ(Math.PI / 2);
    }
    // 'x_pos' остается как есть

    geomCache[direction] = geo;
    return geo;
}
