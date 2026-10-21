// src/geom/stairFactory.js
import * as THREE from 'three';

const geomCache = {};

/**
 * Создает простую геометрию рампы (наклонный бокс) без ступенек
 * Ширина как у мостов (0.15), длина покрывает пролет клетки
 */
function createRampGeometry(plateThickness, levelHeight) {
    const safeThickness = (typeof plateThickness === 'number' && plateThickness > 0) ? plateThickness : 0.5;
    const safeLevelHeight = (typeof levelHeight === 'number' && levelHeight > 0) ? levelHeight : 20;
    
    // Размеры в локальных координатах (до масштабирования примитивом)
    // Примитив имеет scale: { x: cellSize, y: levelHeight, z: cellSize }
    // Нам нужно, чтобы после масштабирования получилась рампа толщиной ~0.5
    
    const width = 0.15; // Узкая, как мост
    const thicknessRatio = safeThickness / safeLevelHeight; // Толщина относительно высоты яруса
    const length = 1.1; // Чуть длиннее клетки, чтобы покрыть пролет
    
    const geo = new THREE.BoxGeometry(width, thicknessRatio, length);
    
    // Сдвигаем геометрию так, чтобы pivot был в центре нижней грани
    geo.translate(0, thicknessRatio / 2, 0);
    
    // Наклоняем рампу: сдвигаем вершины по Y в зависимости от Z
    // Это создает честный наклон без использования rotation (который ломает InstancedMesh)
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        const y = pos.getY(i);
        // Линейный наклон: при z = +0.55 (конец) поднимаем на 1.0 локальную единицу
        // При z = -0.55 (начало) опускаем на 1.0
        // Коэффициент 0.9 дает угол ~42 градуса после масштабирования
        pos.setY(i, y + z * 0.9);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    
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
 * Создает геометрию арки
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
    
    // Простое объединение без mergeGeometries для надежности
    const merged = new THREE.BoxGeometry(width, height, thickness);
    return merged;
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
        geo = createArchGeometry();
    } else {
        // Для всех типов лестниц используем простую рампу
        geo = createRampGeometry(safePT, safeLH);
        
        // Поворачиваем рампу в нужном направлении
        if (type === 'stair_west') geo.rotateY(Math.PI / 2);
        else if (type === 'stair_east') geo.rotateY(-Math.PI / 2);
        else if (type === 'stair_south') geo.rotateY(Math.PI);
        // stair_north остается без поворота (вдоль +Z)
    }
    
    if (!geo) {
        console.warn(`Unknown geometry type: ${type}`);
        geo = new THREE.BoxGeometry(1, 1, 1);
    }
    
    geomCache[cacheKey] = geo;
    return geo;
}
