// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const geomCache = {};

/**
 * Создает базовую геометрию лестницы, направленной на Восток (+X)
 * Вся геометрия нормализована: платформа занимает [0..1] по X и Z, 
 * а высота укладывается в [0..1] по Y с учетом толщины плиты.
 * 
 * @param {number} plateThickness - Абсолютная толщина плиты основания
 * @param {number} levelHeight - Абсолютная высота подъема (масштаб Y)
 */
function createEastStairGeometry(plateThickness, levelHeight) {
    // === ЗАЩИТА ОТ НЕКОРРЕКТНЫХ ЗНАЧЕНИЙ ===
    const safeThickness = (typeof plateThickness === 'number' && plateThickness > 0) ? plateThickness : 0.5;
    const safeLevelHeight = (typeof levelHeight === 'number' && levelHeight > 0) ? levelHeight : 20;
    
    // Нормализованное отношение толщины плиты к высоте яруса
    const thicknessRatio = Math.max(0.01, Math.min(0.99, safeThickness / safeLevelHeight));
    
    const geometries = [];

    // 1. ПЛИТА ОСНОВАНИЯ (Платформа)
    // Размер 1x1, толщина thicknessRatio. Центр по Y находится на thicknessRatio / 2
    const base = new THREE.BoxGeometry(1, thicknessRatio, 1);
    base.translate(0, thicknessRatio / 2, 0); 
    geometries.push(base);

    // 2. ЛЕСТНИЦА
    const steps = 21; 
    const stairLength = 1.05; // Длина чуть больше клетки для перехлеста с целью
    const width = 0.4;        // Ширина самой лестницы
    
    // === СДВИГ ВДОЛЬ РЕБРА (Ось Z для направления East) ===
    // 0.25 смещает центр лестницы к центру правой половины грани платформы.
    const zOffset = 0.25; 
    
    // Начало лестницы от края платформы (по оси X)
    const startOffset = 0.5; 
    
    const availableHeight = 1.0 - thicknessRatio;
    const stepH = availableHeight / steps;
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        // Ступень: глубина по X, высота по Y, ширина по Z
        const step = new THREE.BoxGeometry(stepD, stepH, width);
        
        // X: начинаем от края платформы и идем вперед
        const x = startOffset + (i * stepD); 
        
        // Y: поднимаемся от верха плиты до верха яруса
        const y = thicknessRatio + (i * stepH) + (stepH / 2);
        
        // Z: смещение вдоль ребра платформы
        const z = zOffset;
        
        step.translate(x, y, z);
        geometries.push(step);
    }

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
 * Возвращает геометрию нужного типа (лестница или мост)
 * @param {'stair_north'|'stair_south'|'stair_east'|'stair_west'|'bridge_ns'|'bridge_ew'} type 
 * @param {number} plateThickness - Толщина плиты (из конфига/примитива)
 * @param {number} levelHeight - Высота яруса (из конфига/примитива)
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
        // Создаем базовую геометрию, направленную на Восток (+X) со смещением
        geo = createEastStairGeometry(safePT, safeLH);
        
        // Поворачиваем вокруг центра платформы (0,0), который является центром плиты основания
        if (type === 'stair_west') geo.rotateY(Math.PI);
        else if (type === 'stair_north') geo.rotateY(-Math.PI / 2);
        else if (type === 'stair_south') geo.rotateY(Math.PI / 2);
        // 'stair_east' — базовое направление, поворот 0
    }

    if (!geo) {
        console.warn(`Unknown geometry type: ${type}`);
        geo = new THREE.BoxGeometry(1, 1, 1);
    }

    geomCache[cacheKey] = geo;
    return geo;
}
