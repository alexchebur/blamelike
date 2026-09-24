// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const geomCache = {};

/**
 * Создает базовую геометрию лестницы, направленной на ВОСТОК (+X)
 * @param {number} thicknessRatio - отношение толщины плиты к высоте яруса
 */
function createEastStairGeometry(thicknessRatio) {
    const geometries = [];
    
    // 1. ПЛИТА ОСНОВАНИЯ
    // Занимает нижнюю часть [0 .. thicknessRatio]
    const base = new THREE.BoxGeometry(1, thicknessRatio, 1);
    base.translate(0, thicknessRatio / 2, 0); 
    geometries.push(base);

    // 2. ЛЕСТНИЦА
    // Занимает пространство от thicknessRatio до 1.0
    const steps = 16; 
    const stairLength = 0.9; // Чуть меньше клетки для зазора
    const width = 0.4;
    
    const startOffset = 0.5; // Начинаем от центра клетки
    
    const availableHeight = 1.0 - thicknessRatio;
    const stepH = availableHeight / steps;
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, stepH, width);
        
        // X: движемся от центра к краю (на восток)
        const x = startOffset + (i * stepD); 
        
        // Y: поднимаемся от верха плиты
        const y = thicknessRatio + (i * stepH) + (stepH / 2);
        
        step.translate(x, y, 0);
        geometries.push(step);
    }

    return mergeGeometries(geometries);
}

/**
 * Возвращает геометрию лестницы нужного направления
 * @param {'stair_north'|'stair_south'|'stair_east'|'stair_west'} type 
 * @param {number} thicknessRatio - отношение толщины плиты к высоте яруса
 */
export function getStairGeometry(type, thicknessRatio = 0.1) {
    const cacheKey = `${type}_${thicknessRatio}`;
    if (geomCache[cacheKey]) return geomCache[cacheKey];

    let geo = createEastStairGeometry(thicknessRatio);

    // Поворачиваем базовую (восточную) геометрию вокруг вертикальной оси Y (Y-up система)
    if (type === 'stair_west') {
        geo.rotateY(Math.PI);
    } else if (type === 'stair_north') {
        geo.rotateY(-Math.PI / 2);
    } else if (type === 'stair_south') {
        geo.rotateY(Math.PI / 2);
    }
    // 'stair_east' — базовое направление, поворот не нужен

    geomCache[cacheKey] = geo;
    return geo;
}
