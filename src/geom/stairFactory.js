// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// src/geom/stairFactory.js

function createBaseStairPlatform() {
    const geometries = [];
    
    // 1. Платформа (основание)
    // Делаем её тонкой (0.1 от высоты), чтобы при масштабе levelHeight она давала ~2 единицы
    const base = new THREE.BoxGeometry(1, 0.1, 1);
    // Поднимаем так, чтобы низ был на 0, а верх на 0.1
    base.translate(0, 0.05, 0); 
    geometries.push(base);

    // 2. Лестница
    const steps = 20; 
    const stairLength = 1.0; 
    const width = 0.3; 
    
    // Начинаем лестницу сразу от края платформы (0.5)
    const startOffset = 0.5; 
    
    const stepH = 0.9 / steps; // Оставляем 0.1 на платформу, остальное (0.9) на подъем
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, stepH, width);
        
        // Позиция по X (вдоль лестницы)
        const x = startOffset + (i * stepD); 
        
        // Позиция по Y. Начинаем от верха платформы (0.1)
        const y = 0.1 + (i * stepH) + (stepH / 2);
        
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
