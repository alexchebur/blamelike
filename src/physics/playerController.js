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
        
        // === ИСПРАВЛЕНИЕ: Правильный расчет координат чанка ===
        // В системе Y-up, чанки строятся по X, Y, Z.
        // Но для проверки пола нам важен только чанк по X и Z на ТЕКУЩЕЙ высоте игрока.
        // Однако, если игрок падает, он может быть между чанками по Y.
        // Лучший способ: искать чанк, который содержит точку (x, position.y, z)
        const chunkX = Math.floor(x / cm.config.chunkSize);
        const chunkY = Math.floor(this.position.y / cm.config.chunkSize); 
        const chunkZ = Math.floor(z / cm.config.chunkSize); 
        
        const chunkKey = `${chunkX},${chunkY},${chunkZ}`;
        const activeChunk = cm.activeChunks.get(chunkKey);
        
        this.debugChunkLoaded = !!activeChunk;

        // === ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: Ищем чанк НИЖЕ, если текущий пуст ===
        // Это критично при падении, когда игрок уже вышел из текущего чанка по Y
        let floorData = cm.heightMap.get(key);
        
        if (!floorData && activeChunk) {
            // Чанк есть, но ячейка пуста. Возможно, мы на краю или в дыре.
            // Попробуем проверить соседние чанки по Y (вниз)
            const lowerChunkKey = `${chunkX},${chunkY - 1},${chunkZ}`;
            const lowerChunk = cm.activeChunks.get(lowerChunkKey);
            if (lowerChunk) {
                // Если нижний чанк загружен, возможно, пол там
                // Но heightMap глобальная, так что просто пробуем найти пол в радиусе
            }
        }

        // === АГРЕССИВНАЯ ЛОГИКА ПРИЗЕМЛЕНИЯ ===
        if (floorData) {
            const floorY = floorData.y;
            this.debugFloorY = floorY.toFixed(1);
            
            // Проверяем, что пол действительно ниже игрока
            // Допускаем огромный запас снизу (-100 единиц!) для устранения туннелирования
            const distToFloor = this.position.y - floorY;
            
            if (distToFloor > -100.0 && distToFloor < 50.0) {
                this.onGround = true;
                this.isFalling = false;
                this.onLadder = floorData.isLadder || false;
                
                // Жесткая коррекция позиции
                this.position.y = floorY + (this.playerHeight * 0.5);
                
                // Логируем только редкие случаи туннелирования
                if (distToFloor < -2.0 && performance.now() % 2000 < 20) {
                    console.log(`✅ Tunneling fixed! Dist: ${distToFloor.toFixed(1)}, FloorY: ${floorY.toFixed(1)}`);
                }
            }
        } else {
            // Если в heightMap пусто, используем математическую страховку
            if (activeChunk) {
                this.debugFloorY = 'Empty Cell';
            } else {
                this.debugFloorY = 'No Chunk';
                // === ВАЖНО: Если чанка нет, значит игрок в пустоте ===
                // Нужно либо ждать загрузки, либо использовать fallback
            }
            
            const levelHeight = cm.config.levelHeight || 20;
            const nearestLevelY = Math.floor((this.position.y - 2) / levelHeight) * levelHeight;
            
            // Страховка срабатывает только если мы очень близко к уровню
            if (Math.abs(this.position.y - (nearestLevelY + 1)) < 2.0) {
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
}

export default PlayerController;
