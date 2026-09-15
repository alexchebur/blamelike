// @ts-check 
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Создает геометрию лестницы с фиксированным количеством ступеней
 * @param {number} levels - количество ярусов (1, 2 или 3)
 * @param {number} levelHeight - высота одного яруса
 * @param {number} width - ширина лестницы
 * @param {number} stepDepth - глубина одной ступени
 * @returns {THREE.BufferGeometry}
 */
export function createStairGeometry(levels, levelHeight, width, stepDepth) {
    const geometries = [];
    const totalSteps = Math.floor((levelHeight * levels) / 1.5); // Примерный расчет кол-ва ступеней
    
    for (let i = 0; i < totalSteps; i++) {
        const stepGeo = new THREE.BoxGeometry(width, 1.5, stepDepth);
        stepGeo.translate(0, i * 1.5 + 0.75, -i * stepDepth);
        geometries.push(stepGeo);
    }
    
    // Добавляем боковые стенки для прочности конструкции
    const sideGeo = new THREE.BoxGeometry(0.2, levelHeight * levels, stepDepth * totalSteps);
    sideGeo.translate(-width/2 - 0.1, (levelHeight * levels)/2, -(stepDepth * totalSteps)/2);
    geometries.push(sideGeo);
    
    const sideGeo2 = sideGeo.clone();
    sideGeo2.translate(width + 0.2, 0, 0);
    geometries.push(sideGeo2);

    return mergeGeometries(geometries);
}

// Экспортируем готовые геометрии для InstancedMesh
export const stairGeometries = {
    1: createStairGeometry(1, 20, 2, 1.5), // Примерные размеры, будут масштабироваться
    2: createStairGeometry(2, 20, 2, 1.5),
    3: createStairGeometry(3, 20, 2, 1.5)
};
