// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createChunkKey, worldToChunk } from '../core/chunkKey.js';
import { generateChunk } from '../gen/chunkGenerator.js';
import ChunkCache from './chunkCache.js';
import { palettes } from '../core/config.js';

class ChunkManager {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.activeChunks = new Map();
        this.cache = new ChunkCache(50);
        this.lastCameraChunk = null;
        this.config = null;
    }
    
    update(cameraPos, config) {
        this.config = config;
        const currentChunk = worldToChunk(cameraPos.x, cameraPos.y, cameraPos.z, config.chunkSize);
        
        if (!this.lastCameraChunk || 
            currentChunk.cx !== this.lastCameraChunk.cx ||
            currentChunk.cy !== this.lastCameraChunk.cy ||
            currentChunk.cz !== this.lastCameraChunk.cz) {
            
            this.lastCameraChunk = currentChunk;
            this.updateVisibleChunks(currentChunk, config, cameraPos);
        }
    }
    
    updateVisibleChunks(centerChunk, config, cameraPos) {
        const { viewChunksXY, viewChunksZ } = config;
        const desiredChunks = new Set();
        
        for (let dx = -viewChunksXY; dx <= viewChunksXY; dx++) {
            for (let dy = -viewChunksXY; dy <= viewChunksXY; dy++) {
                for (let dz = -viewChunksZ; dz <= viewChunksZ; dz++) {
                    const cx = centerChunk.cx + dx;
                    const cy = centerChunk.cy + dy;
                    const cz = centerChunk.cz + dz;
                    const key = createChunkKey(cx, cy, cz);
                    desiredChunks.add(key);
                    
                    if (!this.activeChunks.has(key)) {
                        this.loadChunk(cx, cy, cz, config, cameraPos);
                    } else {
                        this.updateChunkLOD(key, cameraPos, config);
                    }
                }
            }
        }
        this.unloadUnusedChunks(desiredChunks);
    }
    
    loadChunk(cx, cy, cz, config, cameraPos) {
        const key = createChunkKey(cx, cy, cz);
        let chunkData = this.cache.get(key);
        
        if (!chunkData) {
            console.log(`🔄 Generating data for chunk [${cx}, ${cy}, ${cz}]`);
            chunkData = generateChunk(cx, cy, cz, config.seed, config);
            this.cache.set(key, chunkData);
        }
        
        const group = this.createChunkMesh(chunkData, config);
        this.activeChunks.set(key, group);
        this.sceneManager.scene.add(group);
    }

    updateChunkLOD(key, cameraPos, config) { /* Заглушка */ }
    
    createChunkMesh(primitives, config) {
        const group = new THREE.Group();
        
        // Линии
        const linePrimitives = primitives.filter(p => p.type === 'line');
        if (linePrimitives.length > 0) {
            const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff3333, linewidth: 2 });
            const lineGeometry = new THREE.BufferGeometry();
            const positions = [];
            
            for (const p of linePrimitives) {
                positions.push(p.position.x, p.position.y, p.position.z);
                positions.push(p.scale.x, p.scale.y, p.scale.z);
            }
            
            lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
            lines.frustumCulled = false; 
            group.add(lines);
        }

        // Меши
        const meshPrimitives = primitives.filter(p => p.type !== 'line');
        const grouped = this.groupPrimitives(meshPrimitives);
        
        for (const [typeSlot, items] of Object.entries(grouped)) {
            const [type, slot] = typeSlot.split('|');
            const mesh = this.createInstancedMesh(type, slot, items, config);
            if (mesh) group.add(mesh);
        }
        
        return group;
    }
    
    groupPrimitives(primitives) {
        const grouped = {};
        for (const prim of primitives) {
            const key = `${prim.type}|${prim.paletteSlot}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(prim);
        }
        return grouped;
    }
    
    /**
     * Создание InstancedMesh для группы примитивов
     * @param {string} type - тип геометрии
     * @param {string} slot - цветовой слот
     * @param {Array} items - массив примитивов
     * @param {Object} config 
     * @returns {THREE.InstancedMesh|null}
     */
    createInstancedMesh(type, slot, items, config) {
        if (items.length === 0) return null;
        
        const activePalette = palettes[config.palette] || palettes.blame;
        const colorHex = activePalette[slot] || activePalette.base;
        
        const geometry = this.createGeometry(type, config);
        const material = new THREE.MeshLambertMaterial({
            color: new THREE.Color(colorHex), flatShading: true, side: THREE.DoubleSide
        });
        
        const mesh = new THREE.InstancedMesh(geometry, material, items.length);
        mesh.frustumCulled = true;
        
        const dummy = new THREE.Object3D();
        // Вспомогательные векторы для построения матрицы ориентации
        const xAxis = new THREE.Vector3();
        const yAxis = new THREE.Vector3();
        const zAxis = new THREE.Vector3();
        const tempMatrix = new THREE.Matrix4();
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            let posX = item.position.x;
            let posY = item.position.y;
            let posZ = item.position.z;
            let scaleX = item.scale.x;
            let scaleY = item.scale.y;
            let scaleZ = item.scale.z;
            
            // === ОБРАБОТКА ЛЕСТНИЦ И РАМП (ВЕКТОРНЫЙ ПОДХОД / ANCHOR MODE) ===
            if (type.startsWith('stair_') || type === 'ramp') {
                const hasLineData = item.lineStart && item.lineEnd;
                
                if (hasLineData) {
                    // 1. Вычисляем направление подъема (локальная ось X)
                    xAxis.set(
                        item.lineEnd.x - item.lineStart.x,
                        item.lineEnd.y - item.lineStart.y,
                        item.lineEnd.z - item.lineStart.z
                    ).normalize();
                    
                    // 2. Вертикаль мира (ось Z)
                    zAxis.set(0, 0, 1);
                    
                    // 3. Локальная ось Y (перпендикуляр к направлению и вертикали)
                    // Порядок crossVectors важен для правой системы координат
                    yAxis.crossVectors(zAxis, xAxis).normalize();
                    
                    // 4. Пересчитываем Z для полной ортонормированности
                    zAxis.crossVectors(xAxis, yAxis).normalize();
                    
                    // 5. Коррекция длины (масштабирование вдоль оси X)
                    if (item.lineLength && config.stairLengthScale) {
                        const baseLength = geometry.boundingBox ? 
                            geometry.boundingBox.max.x - geometry.boundingBox.min.x : 1;
                        
                        // Защита от деления на ноль и NaN
                        if (baseLength > 0.001) {
                            scaleX = (item.lineLength * config.stairLengthScale) / baseLength;
                        } else {
                            scaleX = 1.0;
                        }
                    }
                    
                    // 6. Строим матрицу поворота напрямую из осей
                    tempMatrix.makeBasis(xAxis, yAxis, zAxis);
                    
                    // 7. Применяем трансформации
                    dummy.position.set(posX, posY, posZ);
                    dummy.scale.set(scaleX, scaleY, scaleZ);
                    dummy.quaternion.setFromRotationMatrix(tempMatrix);
                    
                } else {
                    // Fallback для старых данных без lineStart/lineEnd
                    let tiltX = item.rotation.tiltX || 0;
                    let twistZ = item.rotation.twistZ || 0;
                    
                    // Применяем ручные коррекции из панели отладки
                    tiltX += config.stairTiltOffset || 0;
                    twistZ += config.stairTwistOffset || 0;
                    
                    dummy.position.set(posX, posY, posZ);
                    dummy.rotation.set(
                        THREE.MathUtils.degToRad(tiltX), 
                        0, 
                        THREE.MathUtils.degToRad(twistZ)
                    );
                    dummy.scale.set(scaleX, scaleY, scaleZ);
                }
            } else {
                // === СТАНДАРТНАЯ ОБРАБОТКА ДЛЯ ОСТАЛЬНЫХ ОБЪЕКТОВ ===
                let tiltX = item.rotation.tiltX || 0;
                let tiltY = item.rotation.tiltY || 0;
                let twistZ = item.rotation.twistZ || 0;
                
                dummy.position.set(posX, posY, posZ);
                dummy.rotation.set(
                    THREE.MathUtils.degToRad(tiltX),
                    THREE.MathUtils.degToRad(tiltY),
                    THREE.MathUtils.degToRad(twistZ)
                );
                dummy.scale.set(scaleX, scaleY, scaleZ);
            }
            
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        
        mesh.instanceMatrix.needsUpdate = true;
        return mesh;
    }

    /**
     * Создание геометрии по типу
     * @param {string} type 
     * @param {Object} config 
     * @returns {THREE.BufferGeometry}
     */
    createGeometry(type, config) {
        const segments = config.maxSegments || 16;
        const levelHeight = config.levelHeight || 20;
        
        switch (type) {
            case 'box': return new THREE.BoxGeometry(1, 1, 1);
            case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, segments);
            case 'cone': return new THREE.ConeGeometry(0.5, 1, segments);
            case 'octahedron': return new THREE.OctahedronGeometry(0.5);
            case 'capsule': return new THREE.CapsuleGeometry(0.5, 1, 4, segments);
            case 'torus': return new THREE.TorusGeometry(0.5, 0.2, 8, segments);
            case 'prism': return new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
            case 'sphere': return new THREE.SphereGeometry(0.5, segments, segments);
            case 'obelisk': return new THREE.ConeGeometry(0.4, 1, 4); 
            case 'spire': return new THREE.ConeGeometry(0.2, 1, 8);
            
            // === НОВАЯ ГЕОМЕТРИЯ РАМПЫ (для Anchor Mode) ===
            case 'ramp': {
                const width = Math.max(0.5, (config.stairWidthRatio || 0.1) * (config.chunkSize / config.gridSize));
                const thickness = 0.5;
                
                // Создаем рампу длиной 1, которая будет растягиваться по lineLength
                // Pivot находится в начале (x=0), рост идет по +X
                const geo = new THREE.BoxGeometry(1, thickness, width);
                // Сдвигаем так, чтобы левый нижний угол был в (0,0,0)
                geo.translate(0.5, thickness / 2, 0);
                return geo;
            }
            
            // === ИСПРАВЛЕННАЯ ГЕОМЕТРИЯ ЛЕСТНИЦ ===
            case 'stair_1':
            case 'stair_2':
            case 'stair_3': {
                const levels = parseInt(type.split('_')[1]);
                const totalHeight = levels * levelHeight;
                
                // Фиксированные параметры ступени
                const stepH = 1.5; 
                const stepD = 1.5;  
                const width = Math.max(0.5, (config.stairWidthRatio || 0.1) * (config.chunkSize / config.gridSize));
                
                const stepsCount = Math.max(1, Math.floor(totalHeight / stepH));
                const totalLength = stepsCount * stepD;
                
                const geometries = [];
                
                // Создаем ступени так, чтобы (0,0,0) был внизу первой ступени
                for (let i = 0; i < stepsCount; i++) {
                    const stepGeo = new THREE.BoxGeometry(stepD, stepH, width);
                    // Смещение: X вдоль подъема, Y вверх
                    // Первая ступенька начинается ровно в (0,0,0) по нижнему краю
                    const xLocal = (i * stepD) + (stepD / 2);
                    const yLocal = (i * stepH) + (stepH / 2);
                    
                    stepGeo.translate(xLocal, yLocal, 0);
                    geometries.push(stepGeo);
                }
                
                // Боковые стенки (выровнены относительно нового начала координат)
                if (stepsCount > 0) {
                    const sideGeo = new THREE.BoxGeometry(totalLength, totalHeight, 0.2);
                    // Центр стенки: половина длины, половина высоты, смещение по Z
                    sideGeo.translate(totalLength / 2, totalHeight / 2, -width / 2 - 0.1);
                    geometries.push(sideGeo);
                    
                    const sideGeo2 = sideGeo.clone();
                    sideGeo2.translate(0, 0, width + 0.2);
                    geometries.push(sideGeo2);
                }
                
                return mergeGeometries(geometries);
            }
            
            default:
                console.warn(`Unknown geometry type: ${type}`);
                return new THREE.BoxGeometry(1, 1, 1);
        }
    }

    unloadUnusedChunks(desiredKeys) {
        for (const [key, chunk] of this.activeChunks) {
            if (!desiredKeys.has(key)) {
                this.sceneManager.scene.remove(chunk);
                this.disposeChunk(chunk);
                this.activeChunks.delete(key);
            }
        }
    }
    
    disposeChunk(chunk) {
        chunk.traverse((child) => {
            if (child.isInstancedMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
    }
    
    clear() {
        for (const [key, chunk] of this.activeChunks) {
            this.sceneManager.scene.remove(chunk);
            this.disposeChunk(chunk);
        }
        this.activeChunks.clear();
        this.cache.clear();
        this.lastCameraChunk = null;
        console.log('🧹 All chunks cleared');
    }
}

export default ChunkManager;
