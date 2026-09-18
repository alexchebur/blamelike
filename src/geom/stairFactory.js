// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Создает геометрию платформы со встроенной лестницей (единичные размеры)
 * Платформа: [-0.5 .. 0.5], Лестница: [0.66 .. 1.66] (смещена вправо на 2/3)
 */
function createBaseStairPlatform() {
    const geometries = [];
    
    // 1. Платформа (основание): 1x1x0.1, центр в (0,0,0.05)
    const base = new THREE.BoxGeometry(1, 1, 0.1);
    base.translate(0, 0, 0.05);
    geometries.push(base);

    // 2. Лестница
    const steps = 20; 
    const stairLength = 1.0; // Длина лестницы = 1 клетка
    
    // === ИЗМЕНЕНИЯ ЗДЕСЬ ===
    // Начало лестницы: 0.5 (грань) + 0.166 (1/6 клетки) = 0.666 (2/3 от центра до края)
    // Это ставит начало ровно на 2/3 длины ребра платформы
    const startOffset = 0.5 + (1 / 6); 
    
    // Ширина лестницы: уменьшена с 0.6 до 0.3 для более узкого вида
    const width = 0.3; 
    // =====================
    
    const stepH = (1 - 0.1) / steps; 
    const stepD = stairLength / steps;

    for (let i = 0; i < steps; i++) {
        const step = new THREE.BoxGeometry(stepD, width, stepH);
        
        // X: Начинаем СТРОГО от startOffset (2/3 ребра) и идем до startOffset + 1.0
        const x = startOffset + (i * stepD) + (stepD / 2);
        
        // Z: От 0.1 (верх базы) до 1.0 (верх яруса)
        const z = 0.1 + (i * stepH) + (stepH / 2);
        
        step.translate(x, 0, z);
        geometries.push(step);
    }
    
    return mergeGeometries(geometries);
}

const geomCache = {};

export function getPlatformStairGeometry(direction) {
    if (geomCache[direction]) return geomCache[direction];

    let geo = createBaseStairPlatform();
    
    // Поворот вокруг центра (0,0), который является центром БАЗОВОЙ платформы
    // При повороте смещение "вправо" корректно перейдет в нужное направление
    if (direction === 'x_neg') geo.rotateZ(Math.PI);
    else if (direction === 'y_pos') geo.rotateZ(-Math.PI / 2);
    else if (direction === 'y_neg') geo.rotateZ(Math.PI / 2);

    geomCache[direction] = geo;
    return geo;
}
