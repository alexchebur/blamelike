// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Создает геометрию платформы со встроенной лестницей (единичные размеры 1x1x1)
 * @param {string} direction - направление лестницы: 'x_pos', 'x_neg', 'y_pos', 'y_neg'
 */
function createBaseStairPlatform(direction) {
    const geometries = [];
    
    // 1. Платформа (основание) - плита 1x1 толщиной 0.1
    // Центр плиты в (0,0,0.05), низ на Z=0
    const base = new THREE.BoxGeometry(1, 1, 0.1);
    base.translate(0, 0, 0.05);
    geometries.push(base);

    // 2. Лестница
    // Параметры ступеней
    const steps = 12; // Количество ступеней
    const stairLength = 0.8; // Лестница занимает 80% клетки (начинается от центра/края платформы)
    const stairWidth = 0.6;  // Ширина лестницы
    
    // Расчет размеров одной ступени
    const stepH = 1 / steps;      // Высота ступени (в единицах геометрии, т.к. общая высота 1)
    const stepD = stairLength / steps; // Глубина ступени
    
    // Смещение начала лестницы относительно центра клетки
    // Если x_pos: лестница идет от 0 до +0.5 (правая половина)
    // Если x_neg: лестница идет от 0 до -0.5 (левая половина)
    let startX = 0, startY = 0;
    let axis = 'x'; 
    
    if (direction === 'x_pos') { startX = 0; axis = 'x'; }
    else if (direction === 'x_neg') { startX = -stairLength; axis = 'x'; } // Сдвигаем влево
    else if (direction === 'y_pos') { startY = 0; axis = 'y'; }
    else if (direction === 'y_neg') { startY = -stairLength; axis = 'y'; }

    for (let i = 0; i < steps; i++) {
        // Создаем ступень
        // Для X-направлений: ширина по Y, глубина по X
        // Для Y-направлений: ширина по X, глубина по Y
        
        let geo;
        if (axis === 'x') {
            geo = new THREE.BoxGeometry(stepD, stairWidth, stepH);
        } else {
            geo = new THREE.BoxGeometry(stairWidth, stepD, stepH);
        }

        // Позиция ступени
        // Z: начинается с 0.1 (верх платформы) и растет до 1.0
        const zPos = 0.1 + (i * stepH) + (stepH / 2);
        
        let xPos = startX, yPos = startY;
        
        if (axis === 'x') {
            xPos += (i * stepD) + (stepD / 2);
        } else {
            yPos += (i * stepD) + (stepD / 2);
        }

        geo.translate(xPos, yPos, zPos);
        geometries.push(geo);
    }
    
    return mergeGeometries(geometries);
}

// Кэш геометрий
const geomCache = {};

export function getPlatformStairGeometry(direction) {
    if (geomCache[direction]) return geomCache[direction];
    
    const geo = createBaseStairPlatform(direction);
    geomCache[direction] = geo;
    return geo;
}
