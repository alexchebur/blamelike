// src/physics/playerController.js
import * as THREE from 'three';

class PlayerController {
    constructor(sceneManager, config) {
        this.sceneManager = sceneManager;
        this.config = config;
        this.position = new THREE.Vector3(0, 50, 0); 
        this.velocity = new THREE.Vector3();
        this.onGround = false;
        this.isFalling = false;
        this.onLadder = false;
        
        // Управление
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        
        this.direction = new THREE.Vector3();
        this.cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        
        // Параметры
        this.playerHeight = config.playerHeight || 1.8;
        this.speed = 15.0; 
        this.fallSpeed = config.fallSpeed || 25; 
        this.climbSpeed = config.ladderClimbSpeed || 6;

        // Debug variables for UI
        this.debugFloorY = '...';
        this.debugGridKey = '...';
        this.debugCellSize = '...';
        this.debugHmSize = 0;
        this.debugChunkLoaded = false;
    }

    updateCollisionCache() {} // Пустой метод для совместимости

    update(deltaTime, camera) {
        if (!camera) return;
        const dt = Math.min(deltaTime, 0.05);

        // === SAFETY NET: Если упали слишком глубоко, телепортируем наверх ===
        if (this.position.y < -1000) {
            console.warn("⚠️ SAFETY NET: Teleporting player to Y=100");
            this.position.set(0, 100, 0);
            this.isFalling = false;
            this.onGround = true;
            return;
        }

        // 1. Горизонтальное движение
        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.normalize();

        const moveSpeed = this.speed * dt;
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();
        
        const camRight = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0));
        const moveVec = new THREE.Vector3();
        
        if (this.direction.z !== 0) moveVec.addScaledVector(camDir, this.direction.z * moveSpeed);
        if (this.direction.x !== 0) moveVec.addScaledVector(camRight, this.direction.x * moveSpeed);

        const nextX = this.position.x + moveVec.x;
        const nextZ = this.position.z + moveVec.z;

        // 2. Проверка пола через HeightMap
        this.checkGroundViaHeightMap(nextX, nextZ);

        // 3. Вертикальное движение
        let targetY = this.position.y;
        if (this.onGround) {
            this.isFalling = false;
            if (this.onLadder && (this.moveForward || this.moveBackward)) {
                const climbDir = this.moveForward ? 1 : -1;
                targetY += climbDir * this.climbSpeed * dt;
            }
        } else {
            this.isFalling = true;
            targetY -= this.fallSpeed * dt;
        }

        this.position.set(nextX, targetY, nextZ);

        // 4. Камера
        camera.position.set(this.position.x, this.position.y + this.playerHeight * 0.9, this.position.z);
        camera.quaternion.setFromEuler(this.cameraEuler);
    }

    checkGroundViaHeightMap(x, z) {
        this.onGround = false;
        this.onLadder = false;

        const cm = this.sceneManager.chunkManager;
        
        // Сброс debug-значений
        this.debugFloorY = '...';
        this.debugGridKey = '...';
        this.debugCellSize = '...';
        this.debugHmSize = cm?.heightMap?.size || 0;
        this.debugChunkLoaded = false;

        if (!cm || !cm.heightMap || !cm.config || !cm.config.chunkSize || !cm.config.gridSize) {
            return;
        }

        const cellSize = cm.config.chunkSize / cm.config.gridSize;
        this.debugCellSize = cellSize.toFixed(2);

        const gridX = Math.floor(x / cellSize);
        const gridZ = Math.floor(z / cellSize);
        const key = `${gridX},${gridZ}`;
        this.debugGridKey = key;
        
        // === ИСПРАВЛЕНИЕ 1: Правильный поиск чанка и данных ===
        const chunkX = Math.floor(x / cm.config.chunkSize);
        const chunkZ = Math.floor(z / cm.config.chunkSize);
        
        let activeChunk = null;
        let bestChunkY = null;
        let floorData = null;
        
        // Проверяем текущий уровень и соседние вниз/вверх
        // При падении важно проверить и чанки выше, так как heightMap может быть заполнена для них
        const currentChunkY = Math.floor(this.position.y / cm.config.chunkSize);
        for (let dy = 2; dy >= -3; dy--) { 
            const testChunkY = currentChunkY + dy;
            const testKey = `${chunkX},${testChunkY},${chunkZ}`;
            const testChunk = cm.activeChunks.get(testKey);
            
            if (testChunk && !activeChunk) {
                activeChunk = testChunk;
                bestChunkY = testChunkY;
            }
            
            // Пытаемся найти данные о поле в этом чанке
            // Важно: heightMap глобальная, но мы должны убедиться, что данные актуальны для текущего уровня
            if (!floorData) {
                 const testData = cm.heightMap.get(key);
                 // Проверяем, что найденный пол находится в разумных пределах по Y относительно игрока
                 // или что это действительно пол из текущего/соседнего чанка
                 if (testData) {
                     floorData = testData;
                 }
            }
        }
        
        this.debugChunkLoaded = !!activeChunk;

        // === ИСПРАВЛЕНИЕ 2: Агрессивная, но безопасная логика приземления ===
        if (floorData) {
            const floorY = floorData.y;
            this.debugFloorY = floorY.toFixed(1);
            
            const distToFloor = this.position.y - floorY;
            
            // Условие приземления:
            // 1. Пол ниже игрока (distToFloor > 0) ИЛИ игрок чуть провалился (до -2.0)
            // 2. Пол не слишком далеко внизу (до 10.0 единиц), чтобы не прилипать к дну мира
            // 3. Пол не над головой (distToFloor < 5.0)
            if (distToFloor > -2.0 && distToFloor < 10.0) {
                this.onGround = true;
                this.isFalling = false;
                this.onLadder = floorData.isLadder || false;
                
                // Жесткая коррекция позиции
                this.position.y = floorY + (this.playerHeight * 0.5);
                
                if (distToFloor < -1.0 && performance.now() % 2000 < 20) {
                    console.log(`✅ Tunneling fixed! Dist: ${distToFloor.toFixed(1)}, FloorY: ${floorY.toFixed(1)}, ChunkY: ${bestChunkY}`);
                }
            }
        } else {
            // Если данных нет, используем страховку
            if (activeChunk) {
                this.debugFloorY = 'Empty Cell';
            } else {
                this.debugFloorY = 'No Chunk';
            }
            
            const levelHeight = cm.config.levelHeight || 20;
            const nearestLevelY = Math.floor((this.position.y - 2) / levelHeight) * levelHeight;
            
            // Страховка срабатывает ТОЛЬКО если мы очень близко к математическому уровню
            // и НЕТ данных в heightMap (значит, это реальная пропасть или баг генерации)
            if (Math.abs(this.position.y - (nearestLevelY + 1)) < 1.5) {
                 this.onGround = true;
                 this.position.y = nearestLevelY + 1 + (this.playerHeight * 0.5);
                 this.debugFloorY = `Fallback:${nearestLevelY + 1}`;
            }
        }
    }

    onMouseMove(movementX, movementY) {
        const sensitivity = 0.002;
        this.cameraEuler.y -= movementX * sensitivity;
        this.cameraEuler.x -= movementY * sensitivity;
        this.cameraEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraEuler.x));
    }
} // <--- ЗАКРЫВАЮЩАЯ СКОБКА КЛАССА PlayerController

export default PlayerController;
