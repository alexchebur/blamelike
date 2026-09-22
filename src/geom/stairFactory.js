// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function createBaseStairPlatform() {
    const geometries = [];
    
    // 1. Платформа (основание): 1x1x0.2
    const base = new THREE.BoxGeometry(1, 0.2, 1);
    base.translate(0, 0.1, 0); 
    geometries.push(base);

    // 2. Лестница (растет вдоль оси X, поднимается по Y)
    const steps = 20; 
    const stairLength = 1.0; 
    const width = 0.3; 
    const startOffset = 0.5 + (stairLength / 6); 
    
    const stepH = 1.0 / steps; 
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, stepH, width);
        const x = startOffset + (i * stepD) - (stairLength / 2); 
        const y = 0.2 + (i * stepH) + (stepH / 2);
        step.translate(x, y, 0);
        geometries.push(step);
    }

    return mergeGeometries(geometries);
}

const geomCache = {};

export function getPlatformStairGeometry(variant) {
    if (geomCache[variant]) return geomCache[variant];

    let geo = createBaseStairPlatform();

    // Поворачиваем вокруг вертикальной оси Y
    if (variant === 'west') {
        geo.rotateY(Math.PI);
    } else if (variant === 'north') {
        geo.rotateY(-Math.PI / 2);
    } else if (variant === 'south') {
        geo.rotateY(Math.PI / 2);
    }
    // 'east' — базовое направление

    geomCache[variant] = geo;
    return geo;
}
