// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function createBaseStairPlatform() {
    const geometries = [];
    
    // 1. Платформа (основание): 1x1x0.2
    // В системе Y-up: X=ширина, Y=высота(толщина), Z=глубина
    const base = new THREE.BoxGeometry(1, 0.2, 1);
    // Центрируем так, чтобы низ был на Y=0
    base.translate(0, 0.1, 0); 
    geometries.push(base);

    // 2. Лестница
    const steps = 20; 
    const stairLength = 1.0; 
    const width = 0.3; 
    
    // Смещение начала лестницы от центра платформы
    // Начинаем с края платформы (0.5) и добавляем небольшой отступ
    const startOffset = 0.5 + (stairLength / 6); 
    
    const stepH = 1.0 / steps; // Общая высота подъема 1.0
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        // Ступенька: длина по X, высота по Y, ширина по Z
        const step = new THREE.BoxGeometry(stepD, stepH, width);
        
        // Позиция по X (вдоль лестницы)
        const x = startOffset + (i * stepD) - (stairLength / 2); 
        
        // Позиция по Y (высота ступени). Начинаем от толщины плиты (0.2)
        const y = 0.2 + (i * stepH) + (stepH / 2);
        
        step.translate(x, y, 0);
        geometries.push(step);
    }

    return mergeGeometries(geometries);
}

const geomCache = {};

export function getPlatformStairGeometry(direction) {
    if (geomCache[direction]) return geomCache[direction];

    let geo = createBaseStairPlatform();

    // Поворачиваем вокруг вертикальной оси Y
    if (direction === 'x_neg') {
        geo.rotateY(Math.PI);
    } else if (direction === 'y_pos') {
        geo.rotateY(-Math.PI / 2);
    } else if (direction === 'y_neg') {
        geo.rotateY(Math.PI / 2);
    }
    // 'x_pos' — базовое направление, поворот не нужен

    geomCache[direction] = geo;
    return geo;
}
