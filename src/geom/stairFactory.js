// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// src/geom/stairFactory.js

// src/geom/stairFactory.js

function createBaseStairPlatform() {
    const geometries = [];
    
    // Параметры (должны совпадать с дефолтными значениями из config.js для корректной пропорции)
    // Мы строим геометрию в локальных координатах [0..1] по высоте.
    // При масштабе levelHeight=20 и thickness=2, плита займет нижние 0.1 (2/20) высоты.
    const plateRatio = 2 / 20; // platformThickness / levelHeight
    
    // 1. ПЛИТА ОСНОВАНИЯ
    // Высота = plateRatio, ширина/глубина = 1. Центр по Y = plateRatio / 2
    const base = new THREE.BoxGeometry(1, plateRatio, 1);
    base.translate(0, plateRatio / 2, 0); 
    geometries.push(base);

    // 2. ЛЕСТНИЦА
    // Начинается сразу над плитой (plateRatio) и идет до верха (1.0)
    const steps = 20; 
    const stairLength = 1.0; 
    const width = 0.3; 
    
    const startOffset = 0.5; // Начинаем от края платформы
    
    // Доступная высота для ступеней = 1.0 - plateRatio
    const availableHeight = 1.0 - plateRatio;
    const stepH = availableHeight / steps; 
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, stepH, width);
        
        // X: идем вдоль длины лестницы
        const x = startOffset + (i * stepD); 
        
        // Y: начинаем от верха плиты (plateRatio)
        const y = plateRatio + (i * stepH) + (stepH / 2);
        
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
