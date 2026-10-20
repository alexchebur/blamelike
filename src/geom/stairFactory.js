// src/geom/stairFactory.js
import * as THREE from 'three';

const geomCache = {};

/**
 * Создает простую геометрию рампы (наклонный бокс)
 * @param {number} plateThickness - Толщина плиты
 * @param {number} levelHeight - Высота яруса
 * @returns {THREE.BufferGeometry}
 */
function createRampGeometry(plateThickness, levelHeight) {
    const cacheKey = `ramp_${plateThickness}_${levelHeight}`;
    if (geomCache[cacheKey]) return geomCache[cacheKey];

    const thickness = plateThickness || 0.5;
    const height = levelHeight || 20;
    
    // Создаем наклонный бокс: длина = sqrt(cellSize^2 + height^2)
    // Но для простоты используем cellSize = 10 (стандартный размер клетки)
    const cellSize = 10;
    const length = Math.sqrt(cellSize * cellSize + height * height);
    
    const geo = new THREE.BoxGeometry(cellSize * 0.8, thickness, length);
    geomCache[cacheKey] = geo;
    return geo;
}

/**
 * Создает геометрию моста Север-Юг
 */
function createBridgeNSGeometry() {
    const geo = new THREE.BoxGeometry(0.2, 0.1, 1.0);
    return geo;
}

/**
 * Создает геометрию моста Восток-Запад
 */
function createBridgeEWGeometry() {
    const geo = new THREE.BoxGeometry(1.0, 0.1, 0.2);
    return geo;
}

/**
 * Возвращает геометрию нужного типа
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
        // Арка (оставляем как есть)
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
        
        geo = new THREE.BufferGeometry();
        // Упрощенно: используем бокс для арки
        geo = new THREE.BoxGeometry(width, height, thickness);
    } else {
        // Для всех типов лестниц используем простую рампу
        geo = createRampGeometry(safePT, safeLH);
    }
    
    if (!geo) {
        console.warn(`Unknown geometry type: ${type}`);
        geo = new THREE.BoxGeometry(1, 1, 1);
    }
    
    geomCache[cacheKey] = geo;
    return geo;
}
