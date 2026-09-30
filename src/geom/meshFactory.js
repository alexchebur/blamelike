// src/geom/meshFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cableGeomCache = {};

/**
 * Создает геометрию L-образного кабеля (уголок)
 * Верхняя часть крепится к платформе, нижняя свисает под углом
 * Pivot находится ровно в точке крепления (0,0,0)
 */
export function createLCableGeometry() {
    const cacheKey = 'l_cable_v1';
    if (cableGeomCache[cacheKey]) return cableGeomCache[cacheKey];

    const geometries = [];
    
    // Верхний горизонтальный сегмент (крепление)
    // Длина 0.5, Толщина 0.1, Ширина 0.1
    const topSeg = new THREE.BoxGeometry(0.5, 0.1, 0.1);
    topSeg.translate(0.25, 0, 0); // Сдвигаем центр, чтобы угол был в (0,0,0)
    geometries.push(topSeg);
    
    // Нижний вертикальный/наклонный сегмент
    // Длина 1.0 (будет скейлиться), Толщина 0.1, Ширина 0.1
    const botSeg = new THREE.BoxGeometry(0.1, 1.0, 0.1);
    botSeg.translate(0, -0.5, 0); // Сдвигаем вниз от угла
    geometries.push(botSeg);
    
    // Объединяем в одну геометрию для InstancedMesh
    const mergedGeo = mergeGeometries(geometries);
    cableGeomCache[cacheKey] = mergedGeo;
    return mergedGeo;
}
