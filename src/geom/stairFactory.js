// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Создает базовую геометрию платформы с лестницей (единичные размеры 1x1x1)
 * Лестница идет от центра к краю (+X) и вверх до Z=1
 */
function createBaseStairPlatform() {
    const geometries = [];
    
    // 1. Платформа (основание) - тонкая плита 1x1x0.1
    const base = new THREE.BoxGeometry(1, 1, 0.1);
    base.translate(0, 0, 0.05); // Поднимаем, чтобы низ был на Z=0
    geometries.push(base);

    // 2. Лестница
    // Делаем много мелких ступеней для плавности (20 штук)
    const steps = 20; 
    const stepHeight = 1 / steps;
    const stepDepth = 0.5 / steps; // Лестница занимает только половину клетки (0.5 по X)
    const stairWidth = 0.6; // Лестница чуть уже клетки

    for (let i = 0; i < steps; i++) {
        // Ступень: глубина по X, высота по Y, ширина по Z
        const step = new THREE.BoxGeometry(stepDepth, stepHeight, stairWidth);
        
        // Позиционируем ступень:
        // X: от 0 (центр) до 0.5 (край клетки)
        // Z: от 0.1 (верх платформы) до 1 (верх яруса)
        const x = (i / steps) * 0.5; 
        const z = 0.1 + (i / steps) * (1 - 0.1);
        
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
