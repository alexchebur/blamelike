// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function createBaseStairPlatform() {
    const geometries = [];
    
    // 1. Платформа (основание)
    const base = new THREE.BoxGeometry(1, 1, 0.1);
    base.translate(0, 0, 0.05);
    geometries.push(base);

    // 2. Лестница
    const steps = 20; 
    const stairLength = 1.0; 
    const stepH = (1 - 0.1) / steps; 
    const stepD = stairLength / steps;
    const width = 0.6; // <--- ИСПРАВЛЕНО: было 0.1, теперь лестница широкая и заметная

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, width, stepH);
        const x = 0.5 + (i * stepD) + (stepD / 2);
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
    if (direction === 'x_neg') geo.rotateZ(Math.PI);
    else if (direction === 'y_pos') geo.rotateZ(-Math.PI / 2);
    else if (direction === 'y_neg') geo.rotateZ(Math.PI / 2);
    geomCache[direction] = geo;
    return geo;
}
