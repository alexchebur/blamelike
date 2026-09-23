// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const geomCache = {};

/**
 * Создает нормализованную геометрию "Платформа + Лестница"
 * Вся высота укладывается в диапазон [0, 1].
 * При масштабировании на levelHeight она даст идеальную стыковку между ярусами.
 */
function createBaseStairPlatform() {
    const geometries = [];
    
    // Пропорции: толщина плиты / общая высота яруса
    // По умолчанию thickness=2, levelHeight=20 -> ratio=0.1
    // Это гарантирует, что плита лестницы будет такой же толщины, как и обычные платформы
    const plateRatio = 2 / 20; 
    
    // 1. ПЛИТА ОСНОВАНИЯ
    // Занимает нижнюю часть [0 .. plateRatio]
    const base = new THREE.BoxGeometry(1, plateRatio, 1);
    base.translate(0, plateRatio / 2, 0); // Низ на 0, центр на plateRatio/2
    geometries.push(base);

    // 2. ЛЕСТНИЦА
    // Занимает пространство от plateRatio до 1.0
    const steps = 16; 
    const stairLength = 0.8; // Не во всю клетку, чтобы оставить зазоры
    const width = 0.4;
    
    const startOffset = 0.5; // Начинаем от центра клетки (край плиты)
    
    const availableHeight = 1.0 - plateRatio;
    const stepH = availableHeight / steps;
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, stepH, width);
        
        // X: движемся от центра клетки к краю
        const x = startOffset + (i * stepD); 
        
        // Y: поднимаемся от верха плиты
        const y = plateRatio + (i * stepH) + (stepH / 2);
        
        step.translate(x, y, 0);
        geometries.push(step);
    }

    return mergeGeometries(geometries);
}

/**
 * Возвращает геометрию лестницы, повернутую в нужном направлении
 * @param {'east'|'west'|'north'|'south'} direction 
 */
export function getPlatformStairGeometry(direction) {
    if (geomCache[direction]) return geomCache[direction];

    let geo = createBaseStairPlatform();

    // Поворот вокруг вертикальной оси Y (Y-up система)
    if (direction === 'west') geo.rotateY(Math.PI);
    else if (direction === 'north') geo.rotateY(-Math.PI / 2);
    else if (direction === 'south') geo.rotateY(Math.PI / 2);
    // 'east' — базовое направление, поворот 0

    geomCache[direction] = geo;
    return geo;
}
