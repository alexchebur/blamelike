// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const geomCache = {};

/**
 * Создает базовую геометрию лестницы, направленной на ВОСТОК (+X)
 * Вся высота укладывается в диапазон [0, 1].
 */
function createEastStairGeometry() {
    const geometries = [];
    
    // 1. ПЛИТА ОСНОВАНИЯ (нижние 10% высоты)
    const plateRatio = 0.1; 
    const base = new THREE.BoxGeometry(1, plateRatio, 1);
    base.translate(0, plateRatio / 2, 0); 
    geometries.push(base);

    // 2. ЛЕСТНИЦА (поднимается от plateRatio до 1.0 вдоль +X)
    const steps = 16; 
    const stairLength = 0.9; // Чуть меньше клетки для зазора
    const width = 0.4;
    
    const startOffset = 0.5; // Начинаем от центра клетки
    
    const availableHeight = 1.0 - plateRatio;
    const stepH = availableHeight / steps;
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, stepH, width);
        
        // X: движемся от центра к краю (на восток)
        const x = startOffset + (i * stepD); 
        
        // Y: поднимаемся от верха плиты
        const y = plateRatio + (i * stepH) + (stepH / 2);
        
        step.translate(x, y, 0);
        geometries.push(step);
    }

    return mergeGeometries(geometries);
}

/**
 * Возвращает геометрию лестницы нужного направления
 * @param {'stair_north'|'stair_south'|'stair_east'|'stair_west'} type 
 */
export function getStairGeometry(type) {
    if (geomCache[type]) return geomCache[type];

    let geo = createEastStairGeometry();

    // Поворачиваем базовую (восточную) геометрию вокруг вертикальной оси Z
    if (type === 'stair_west') {
        geo.rotateZ(Math.PI);
    } else if (type === 'stair_north') {
        geo.rotateZ(Math.PI / 2);
    } else if (type === 'stair_south') {
        geo.rotateZ(-Math.PI / 2);
    }
    // 'stair_east' — базовое направление, поворот не нужен

    geomCache[type] = geo;
    return geo;
}
