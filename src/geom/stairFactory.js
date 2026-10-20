// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const geomCache = {};

/**
 * Создает базовую геометрию лестницы, направленной на Восток (+X)
 * ИЗМЕНЕНО: ширина теперь 0.15 (как у мостов)
 */
function createEastStairGeometry(plateThickness, levelHeight) {
    const safeThickness = (typeof plateThickness === 'number' && plateThickness > 0) ? plateThickness : 0.5;
    const safeLevelHeight = (typeof levelHeight === 'number' && levelHeight > 0) ? levelHeight : 20;
    const thicknessRatio = Math.max(0.01, Math.min(0.99, safeThickness / safeLevelHeight));
    
    const geometries = [];
    
    // 1. ПЛИТА ОСНОВАНИЯ
    const base = new THREE.BoxGeometry(1, thicknessRatio, 1);
    base.translate(0, thicknessRatio / 2, 0); 
    geometries.push(base);
    
    // 2. ЛЕСТНИЦА
    const steps = 21; 
    const stairLength = 1.05; 
    const width = 0.15;        // <-- ИЗМЕНЕНО: было 0.4, стало 0.15 (как у мостов)
    const zOffset = 0.35;      // <-- ИЗМЕНЕНО: смещаем ближе к краю (было 0.25)
    const startOffset = 0.5; 
    const availableHeight = 1.0 - thicknessRatio;
    const stepH = availableHeight / steps;
    const stepD = stairLength / steps;
    
    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, stepH, width);
        const x = startOffset + (i * stepD); 
        const y = thicknessRatio + (i * stepH) + (stepH / 2);
        const z = zOffset;
        step.translate(x, y, z);
        geometries.push(step);
    }
    
    return mergeGeometries(geometries);
}

/**
 * Создает геометрию арки (две стойки + перекладина)
 */
function createArchGeometry() {
    const geometries = [];
    const width = 0.5;
    const height = 0.5;
    const thickness = 0.10;
    
    const leftLeg = new THREE.BoxGeometry(thickness, height, thickness);
    leftLeg.translate(-width / 2 + thickness / 2, height / 2, 0);
    geometries.push(leftLeg);
    
    const rightLeg = new THREE.BoxGeometry(thickness, height, thickness);
    rightLeg.translate(width / 2 - thickness / 2, height / 2, 0);
    geometries.push(rightLeg);
    
    const topBar = new THREE.BoxGeometry(width, thickness, thickness);
    topBar.translate(0, height - thickness / 2, 0);
    geometries.push(topBar);
    
    return mergeGeometries(geometries);
}

/**
 * Создает простую геометрию моста Север-Юг (вдоль оси Z)
 */
function createBridgeNSGeometry() {
    const geo = new THREE.BoxGeometry(0.2, 0.1, 1.0);
    return geo;
}

/**
 * Создает простую геометрию моста Восток-Запад (вдоль оси X)
 */
function createBridgeEWGeometry() {
    const geo = new THREE.BoxGeometry(1.0, 0.1, 0.2);
    return geo;
}

/**
 * Возвращает геометрию нужного типа (лестница, мост или арка)
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
    } else if (type === 'arch') {
        geo = createArchGeometry();
    } else {
        // Создаем базовую геометрию лестницы, направленную на Восток (+X)
        geo = createEastStairGeometry(safePT, safeLH);
        
        // Поворачиваем вокруг центра платформы (0,0)
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
