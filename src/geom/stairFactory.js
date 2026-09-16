// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Создает геометрию лестницы, выровненную по вектору подъема
 * ВАЖНО: Локальный центр (0,0,0) теперь находится в НИЖНЕЙ ТОЧКЕ ПЕРВОЙ СТУПЕНЬКИ
 * Ось X направлена вдоль подъема, ось Y - вертикально вверх
 */
export function createStairGeometry(levels, levelHeight, width, stepDepth) {
    const geometries = [];
    const totalSteps = Math.floor((levelHeight * levels) / 1.5);
    
    for (let i = 0; i < totalSteps; i++) {
        // Ступенька создается относительно начала координат
        const stepGeo = new THREE.BoxGeometry(stepDepth, 1.5, width);
        
        // Смещаем ступеньку ВПЕРЕД по X и ВВЕРХ по Y
        // Первая ступенька начинается прямо в (0, 0.75, 0)
        stepGeo.translate(
            i * stepDepth + (stepDepth / 2), 
            i * 1.5 + 0.75, 
            0
        );
        geometries.push(stepGeo);
    }

    // Боковые стенки тоже смещаем относительно начала
    const sideHeight = levelHeight * levels;
    const sideLength = totalSteps * stepDepth;
    const sideGeo = new THREE.BoxGeometry(sideLength, sideHeight, 0.2);
    
    // Левая стенка
    sideGeo.translate(sideLength / 2, sideHeight / 2, -width / 2 - 0.1);
    geometries.push(sideGeo);
    
    // Правая стенка
    const sideGeo2 = sideGeo.clone();
    sideGeo2.translate(0, 0, width + 0.2);
    geometries.push(sideGeo2);

    return mergeGeometries(geometries);
}

// Экспортируем готовые геометрии
export const stairGeometries = {
    1: createStairGeometry(1, 20, 2, 1.5),
    2: createStairGeometry(2, 20, 2, 1.5),
    3: createStairGeometry(3, 20, 2, 1.5)
};
