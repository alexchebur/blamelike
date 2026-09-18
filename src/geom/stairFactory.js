// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function createBaseStairPlatform() {
    const geometries = [];
    
    // 1. Платформа (основание): 1x1x0.2
    const base = new THREE.BoxGeometry(1, 1, 0.2);
    base.translate(0, 0, 0.1);
    geometries.push(base);

    // 2. Лестница
    const steps = 20; 
    const stairLength = 1.0; 
    
    // Смещение начала на 2/3 ребра
    const startOffset = 0.5 + (1 / 6); 
    const width = 0.3; 
    
    // !!! ИЗМЕНЕНИЕ: Подъем идет до 1.2 (а не 1.0)
    // Это компенсирует толщину целевой платформы (0.2)
    // Локальная высота подъема = 1.2 - 0.2 = 1.0
    const stepH = 1.0 / steps; 
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, width, stepH);
        
        const x = startOffset + (i * stepD) + (stepD / 2);
        // Z начинается от 0.2 и идет до 1.2
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
    if (direction === 'x_neg') geo.rotateZ(Math.PI);
    else if (direction === 'y_pos') geo.rotateZ(-Math.PI / 2);
    else if (direction === 'y_neg') geo.rotateZ(Math.PI / 2);
    geomCache[direction] = geo;
    return geo;
}
