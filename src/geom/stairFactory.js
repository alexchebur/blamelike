// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Создает геометрию платформы со встроенной лестницей (единичные размеры)
 * Лестница жестко привязана к краю платформы (+X по умолчанию)
 */
function createBaseStairPlatform() {
    const geometries = [];
    
    // 1. Платформа (основание): 1x1x0.1, центр в (0,0,0.05)
    // Грани находятся точно на X=-0.5 и X=+0.5
    const base = new THREE.BoxGeometry(1, 1, 0.1);
    base.translate(0, 0, 0.05);
    geometries.push(base);

    // 2. Лестница
    const steps = 16; // Мелкие ступени для детализации
    const stairLength = 1.0; // Лестница занимает ровно 1 клетку (до центра следующей или до края?)
    // По ТЗ: "через нее - клетки с платформой". Значит лестница должна пересечь пустую клетку
    // и упереться в следующую платформу. Длина = 1 клетка (пустая) + небольшой заход на цель?
    // Сделаем длину 1.0, тогда при масштабе cellSize она займет ровно соседнюю клетку.
    
    const stepH = (1 - 0.1) / steps; // Высота подъема от верха базы (0.1) до верха яруса (1.0)
    const stepD = stairLength / steps;
    const width = 0.7; // Чуть уже клетки

    for (let i = 0; i < steps; i++) {
        // Ступень: глубина по X, ширина по Y, высота по Z
        const step = new THREE.BoxGeometry(stepD, width, stepH);
        
        // X: Начинаем строго от 0.5 (правый край базы)
        const x = 0.5 + (i * stepD) + (stepD / 2);
        
        // Z: Начинаем от 0.1 (верх базы) и идем до 1.0
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
