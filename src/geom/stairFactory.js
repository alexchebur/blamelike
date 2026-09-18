// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Создает геометрию платформы со встроенной лестницей (единичные размеры)
 * ГАРАНТИЯ ИДЕАЛЬНОЙ СТЫКОВКИ:
 * - База лестницы: Z=[0..0.2] (соответствует platformThickness=4 при levelHeight=20)
 * - Ступени: Z=[0.2..1.2] (поднимаются на levelHeight + platformThickness)
 * - Начало лестницы: смещено на 2/3 длины ребра платформы
 */
function createBaseStairPlatform() {
    const geometries = [];
    
    // 1. Платформа (основание): 1x1x0.2
    // Нижняя грань на Z=0, верхняя на Z=0.2
    const base = new THREE.BoxGeometry(1, 1, 0.2);
    base.translate(0, 0, 0.1); // Центр по Z = 0.1
    geometries.push(base);

    // 2. Лестница
    const steps = 20; 
    const stairLength = 1.0; 
    
    // Смещение начала: 0.5 (грань) + 1/6 (смещение на 2/3 ребра) = 0.666...
    const startOffset = 0.5 + (1 / 6); 
    
    // Узкая ширина для индустриального вида
    const width = 0.3; 
    
    // Подъем: от верха базы (0.2) до верха целевой платформы (1.0 + 0.2)
    // Общая высота подъема = 1.0
    const totalRise = 1.0; 
    const stepH = totalRise / steps; 
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, width, stepH);
        
        // X: От startOffset до startOffset + 1.0
        const x = startOffset + (i * stepD) + (stepD / 2);
        
        // Z: От 0.2 (верх базы) до 1.2 (верх целевой платформы)
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
    
    // Поворот вокруг центра (0,0,0.1) — центра базовой платформы
    if (direction === 'x_neg') geo.rotateZ(Math.PI);
    else if (direction === 'y_pos') geo.rotateZ(-Math.PI / 2);
    else if (direction === 'y_neg') geo.rotateZ(Math.PI / 2);

    geomCache[direction] = geo;
    return geo;
}
