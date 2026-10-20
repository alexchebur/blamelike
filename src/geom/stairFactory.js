// src/geom/stairFactory.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const geomCache = {};

/**
 * Создает простую геометрию рампы (наклонный бокс)
 * Вместо сложных ступенек делаем честную наклонную плоскость
 */
function createRampGeometry(plateThickness, levelHeight) {
    const safeThickness = (typeof plateThickness === 'number' && plateThickness > 0) ? plateThickness : 0.5;
    const safeLevelHeight = (typeof levelHeight === 'number' && levelHeight > 0) ? levelHeight : 20;
    
    // Размеры рампы в локальных координатах (до масштабирования примитивом)
    // Примитив в chunkGenerator имеет scale: { x: cellSize, y: levelHeight, z: cellSize }
    // Нам нужно, чтобы после масштабирования получилась рампа толщиной ~0.5
    
    // Базовая ширина (по X) - чуть уже клетки
    const width = 0.8; 
    // Базовая толщина (по Y) - очень тонкая, так как scale.y будет большим (levelHeight)
    // Но подождите! Если scale.y = 20, а мы хотим толщину 0.5, то базовая толщина должна быть 0.5 / 20 = 0.025
    const thicknessRatio = safeThickness / safeLevelHeight;
    // Базовая длина (по Z) - чуть длиннее клетки, чтобы покрыть пролет по диагонали
    const length = 1.1; 

    const geo = new THREE.BoxGeometry(width, thicknessRatio, length);
    
    // Сдвигаем геометрию так, чтобы pivot был в центре нижней грани платформы
    // В chunkGenerator position.y = yBase (низ яруса)
    // Геометрия центрирована в 0. Нам нужно сдвинуть её вверх на половину толщины
    geo.translate(0, thicknessRatio / 2, 0);
    
    return geo;
}

/**
 * Создает простую геометрию моста Север-Юг
 */
function createBridgeNSGeometry() {
    const geo = new THREE.BoxGeometry(0.2, 0.1, 1.0);
    return geo;
}

/**
 * Создает простую геометрию моста Восток-Запад
 */
function createBridgeEWGeometry() {
    const geo = new THREE.BoxGeometry(1.0, 0.1, 0.2);
    return geo;
}

/**
 * Создает геометрию арки
 */
function createArchGeometry() {
    const geometries = [];
    const width = 0.5;
    const height = 0.5;
    const thickness = 0.10;
    
    const leftLeg = new THREE.BoxGeometry(thickness, height, thickness);
    leftLeg.translate(-width / 2 + thickness / 2, height / 2, 0);
    geometries.push(leftLeg);
    
    const rightLeg = new THREE.BoxGeometry(thickness, height, thickness);
    rightLeg.translate(width / 2 - thickness / 2, height / 2, 0);
    geometries.push(rightLeg);
    
    const topBar = new THREE.BoxGeometry(width, thickness, thickness);
    topBar.translate(0, height - thickness / 2, 0);
    geometries.push(topBar);
    
    return mergeGeometries(geometries);
}

/**
 * Возвращает геометрию нужного типа
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
    } else if (type === 'arch') {
        geo = createArchGeometry();
    } else {
        // Для всех типов лестниц используем простую рампу
        geo = createRampGeometry(safePT, safeLH);
        
        // Поворачиваем рампу в нужном направлении
        // Базовая рампа направлена вдоль Z (North)
        if (type === 'stair_west') geo.rotateY(Math.PI / 2);
        else if (type === 'stair_east') geo.rotateY(-Math.PI / 2);
        else if (type === 'stair_south') geo.rotateY(Math.PI);
        // stair_north остается без поворота (вдоль +Z)
        
        // Наклоняем рампу вокруг оси X
        // Угол наклона: atan(levelHeight / cellSize). 
        // Но так как геометрия будет масштабироваться по Y на levelHeight, а по Z на cellSize,
        // нам нужно наклонить её в локальных координатах так, чтобы после масштабирования она соединяла углы.
        // В локальных координатах (до scale): высота = 1 (условно), длина = 1.
        // Нам нужно поднять дальний край (Z+) на высоту 1 (в локальных единицах, которые станут levelHeight).
        // applyMatrix4 или rotateX?
        // Проще использовать shear (сдвиг) или просто повернуть и растянуть?
        // Нет, самый надежный способ для InstancedMesh - это сделать геометрию уже наклонной.
        
        // Вычисляем угол наклона в локальных координатах
        // Локальная высота подъема = 1.0 (так как scale.y = levelHeight, а мы хотим подняться на levelHeight)
        // Локальная длина = 1.0 (так как scale.z = cellSize)
        // Угол = atan(1 / 1) = 45 градусов? Нет.
        // В chunkGenerator scale: { x: cellSize, y: levelHeight, z: cellSize }.
        // Если мы сделаем геометрию длиной 1 по Z и высотой 1 по Y, то после scale она станет cellSize x levelHeight.
        // Нам нужно, чтобы при Z=0.5 (конец) Y был 1.0 (верх). При Z=-0.5 (начало) Y был 0.
        // Это линейная зависимость Y = Z + 0.5.
        // Three.js не имеет встроенного shear для BufferGeometry легко.
        // Но мы можем просто повернуть бокс и растянуть его? Нет, это исказит толщину.
        
        // АЛЬТЕРНАТИВА: Не использовать поворот в геометрии. Использовать поворот в InstancedMesh.
        // Но InstancedMesh поворачивает весь объект.
        // Давайте сделаем геометрию просто длинной балкой, а наклон зададим в chunkManager через rotation?
        // Нет, в chunkGenerator rotation для лестниц {0,0,0}.
        
        // САМОЕ ПРОСТОЕ РЕШЕНИЕ ДЛЯ РАМПЫ:
        // Создать бокс, и вручную сдвинуть вершины (shear).
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const z = pos.getZ(i);
            const y = pos.getY(i);
            // Сдвигаем Y в зависимости от Z. 
            // z идет от -0.55 до 0.55 (length 1.1).
            // Нам нужно, чтобы при z > 0 y увеличивался.
            // Коэффициент наклона: 1.0 (подъем на 1 локальную единицу при длине 1)
            // newY = y + z * 1.0; 
            // Но это поднимет центр. Нам нужно, чтобы низ остался на 0.
            // При z = -0.55, сдвиг = -0.55. newY = y - 0.55.
            // При z = 0.55, сдвиг = 0.55. newY = y + 0.55.
            // Это создаст наклон.
            pos.setY(i, y + z * 0.9); // 0.9 - коэффициент наклона
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
    }
    
    if (!geo) {
        console.warn(`Unknown geometry type: ${type}`);
        geo = new THREE.BoxGeometry(1, 1, 1);
    }
    
    geomCache[cacheKey] = geo;
    return geo;
}
