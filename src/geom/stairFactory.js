// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const geomCache = {};

/**
 * Создает базовую геометрию лестницы (направлена на +X)
 */
function createEastStairGeometry(plateThickness, levelHeight) {
    const safeThickness = (typeof plateThickness === 'number' && plateThickness > 0) ? plateThickness : 0.5;
    const safeLevelHeight = (typeof levelHeight === 'number' && levelHeight > 0) ? levelHeight : 20;
    const thicknessRatio = Math.max(0.01, Math.min(0.99, safeThickness / safeLevelHeight));
    
    const geometries = [];
    const base = new THREE.BoxGeometry(1, thicknessRatio, 1);
    base.translate(0, thicknessRatio / 2, 0); 
    geometries.push(base);

    const steps = 21; 
    const stairLength = 1.05; 
    const width = 0.4;
    const startOffset = 0.5; 
    
    const availableHeight = 1.0 - thicknessRatio;
    const stepH = availableHeight / steps;
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, stepH, width);
        const x = startOffset + (i * stepD); 
        const y = thicknessRatio + (i * stepH) + (stepH / 2);
        step.translate(x, y, 0);
        geometries.push(step);
    }

    return mergeGeometries(geometries);
}

/**
 * Создает геометрию моста Север-Юг (вдоль оси Z)
 */
function createBridgeNSGeometry() {
    // Ширина 0.2, Высота 0.1, Длина 1.0
    const geo = new THREE.BoxGeometry(0.2, 0.1, 1.0);
    return geo;
}

/**
 * Создает геометрию моста Восток-Запад (вдоль оси X)
 */
function createBridgeEWGeometry() {
    // Длина 1.0, Высота 0.1, Ширина 0.2
    const geo = new THREE.BoxGeometry(1.0, 0.1, 0.2);
    return geo;
}

/**
 * Возвращает геометрию нужного типа (лестница или мост)
 */
export function getStairGeometry(type, plateThickness, levelHeight) {
    const safePT = plateThickness ?? 0.5;
    const safeLH = levelHeight ?? 20;
    const cacheKey = `${type}_${safePT}_${safeLH}`;
    
    if (geomCache[cacheKey]) return geomCache[cacheKey];

    let geo;

    if (type === 'bridge_ns') {
        geo = createBridgeNSGeometry();
    } else if (type === 'bridge_ew') {
        geo = createBridgeEWGeometry();
    } else {
        geo = createEastStairGeometry(safePT, safeLH);
        if (type === 'stair_west') geo.rotateY(Math.PI);
        else if (type === 'stair_north') geo.rotateY(-Math.PI / 2);
        else if (type === 'stair_south') geo.rotateY(Math.PI / 2);
    }

    if (!geo) {
        console.warn(`Unknown geometry type: ${type}`);
        geo = new THREE.BoxGeometry(1, 1, 1);
    }

    geomCache[cacheKey] = geo;
    return geo;
}
