// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const geomCache = {};

/**
 * Создает нормализованную геометрию "Платформа + Лестница"
 * Вся высота укладывается в диапазон [0, 1].
 */
function createBaseStairPlatform(thicknessRatio) {
    const geometries = [];
    
    // 1. ПЛИТА ОСНОВАНИЯ
    // Занимает нижнюю часть [0 .. thicknessRatio]
    const base = new THREE.BoxGeometry(1, thicknessRatio, 1);
    base.translate(0, thicknessRatio / 2, 0); // Низ на 0
    geometries.push(base);

    // 2. ЛЕСТНИЦА
    // Занимает пространство от thicknessRatio до 1.0
    const steps = 16; 
    const stairLength = 1.0; // <-- ИСПРАВЛЕНО: теперь ровно 1.0 (одна клетка)
    const width = 0.4;
    
    const startOffset = 0.5; // Начинаем от центра клетки (край плиты)
    
    const availableHeight = 1.0 - thicknessRatio;
    const stepH = availableHeight / steps;
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, stepH, width);
        
        // X: движемся от центра клетки к краю соседней клетки
        const x = startOffset + (i * stepD); 
        
        // Y: поднимаемся от верха плиты
        const y = thicknessRatio + (i * stepH) + (stepH / 2);
        
        step.translate(x, y, 0);
        geometries.push(step);
    }

    return mergeGeometries(geometries);
}

/**
 * Возвращает геометрию лестницы, повернутую в нужном направлении
 * @param {'east'|'west'|'north'|'south'} direction 
 * @param {number} thicknessRatio - отношение толщины плиты к высоте яруса
 */
export function getPlatformStairGeometry(direction, thicknessRatio = 0.1) {
    const cacheKey = `${direction}_${thicknessRatio}`;
    if (geomCache[cacheKey]) return geomCache[cacheKey];

    let geo = createBaseStairPlatform(thicknessRatio);

    // Поворот вокруг вертикальной оси Y (Y-up система)
    if (direction === 'west') geo.rotateY(Math.PI);
    else if (direction === 'north') geo.rotateY(-Math.PI / 2);
    else if (direction === 'south') geo.rotateY(Math.PI / 2);
    // 'east' — базовое направление

    geomCache[cacheKey] = geo;
    return geo;
}
