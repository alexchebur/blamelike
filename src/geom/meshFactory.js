// src/geom/meshFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const geomCache = {};

/**
 * Создает базовую геометрию L-образного кабеля (уголок)
 * Pivot находится ровно в точке крепления к платформе (0,0,0)
 */
export function createLCableGeometry() {
    const cacheKey = 'l_cable_v1';
    if (geomCache[cacheKey]) return geomCache[cacheKey];

    const geometries = [];
    
    // Верхний горизонтальный сегмент (крепление к платформе)
    // Длина 0.5, Толщина 0.1, Ширина 0.1
    const topSeg = new THREE.BoxGeometry(0.5, 0.1, 0.1);
    // Сдвигаем центр так, чтобы угол оказался в точке (0,0,0)
    topSeg.translate(0.25, 0, 0); 
    geometries.push(topSeg);
    
    // Нижний свисающий сегмент
    // Длина 1.0 (будет скейлиться через scale.x), Толщина 0.1, Ширина 0.1
    const botSeg = new THREE.BoxGeometry(0.1, 1.0, 0.1);
    // Сдвигаем вниз от угла на половину высоты
    botSeg.translate(0, -0.5, 0); 
    geometries.push(botSeg);
    
    const mergedGeo = mergeGeometries(geometries);
    geomCache[cacheKey] = mergedGeo;
    return mergedGeo;
}
