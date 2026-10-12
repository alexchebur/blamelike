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

        // === DEBUG VARIABLES FOR UI ===
        // Эти значения будут отображаться в Physics Debug HUD
        this.debugFloorY = '...';
        this.debugGridKey = '...';
        this.debugCellSize = '...';
        this.debugHmSize = 0;
        this.debugChunkLoaded = false;
        // ==============================
    }

    // Этот метод теперь пустой, так как мы больше не используем кэш мешей
    updateCollisionCache() {}

    update(deltaTime, camera) {
        if (!camera) return;
        const dt = Math.min(deltaTime, 0.05);
        // === АВАРИЙНЫЙ ПОЛ (SAFETY NET) ===
        // Если игрок упал ниже -500, телепортируем его обратно на безопасную высоту
        // Это предотвращает бесконечное падение в пустоту при багах генерации
        if (this.position.y < -500) {
            console.warn("⚠️ SAFETY NET: Игрок упал слишком низко! Телепортация на Y=100");
            this.position.set(0, 100, 0);
            this.velocity.set(0, 0, 0);
            this.isFalling = false;
            this.onGround = true;
            return; // Пропускаем остальную логику в этом кадре
        }
        // ==================================
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

        // 2. Проверка пола через HeightMap (МГНОВЕННО, БЕЗ RAYCASTING)
        this.checkGroundViaHeightMap(nextX, nextZ);

        // 3. Вертикальное движение
        let targetY = this.position.y;
        if (this.onGround) {
            this.isFalling = false;
            // Логика лестниц
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
            console.warn("❌ ChunkManager/Config/HeightMap отсутствуют!");
            return;
        }

        const cellSize = cm.config.chunkSize / cm.config.gridSize;
        this.debugCellSize = cellSize.toFixed(2);

        const gridX = Math.floor(x / cellSize);
        const gridZ = Math.floor(z / cellSize);
        const key = `${gridX},${gridZ}`;
        this.debugGridKey = key;
        
        // Проверка наличия чанка
        const chunkX = Math.floor(x / cm.config.chunkSize);
        const chunkZ = Math.floor(z / cm.config.chunkSize);
        const chunkY = Math.floor(this.position.y / cm.config.chunkSize); 
        const chunkKey = `${chunkX},${chunkY},${chunkZ}`;
        const activeChunk = cm.activeChunks.get(chunkKey);
        
        this.debugChunkLoaded = !!activeChunk;

        // === ИСПРАВЛЕННАЯ ЛОГИКА: Ищем пол НИЖЕ игрока ===
        const floorData = cm.heightMap.get(key);

        if (!floorData) {
            // Чанк может быть загружен, но ячейка пуста (пропасть)
            if (activeChunk) {
                this.debugFloorY = 'Empty Cell (Gap)';
            } else {
                this.debugFloorY = 'No Chunk';
                console.warn(`⚠️ Чанк ${chunkKey} не загружен! Player Y=${this.position.y.toFixed(1)}`);
            }
            
            // СТРАХОВКА: Математические уровни
            const levelHeight = cm.config.levelHeight || 20;
            const nearestLevelY = Math.floor((this.position.y - 2) / levelHeight) * levelHeight;
            
            // Приземляемся, если близко к математическому уровню
            if (Math.abs(this.position.y - (nearestLevelY + 1)) < 2.0) {
                 this.onGround = true;
                 this.position.y = nearestLevelY + 1 + (this.playerHeight * 0.5);
                 this.debugFloorY = `Fallback:${nearestLevelY + 1}`;
                 console.log(`✅ Fallback catch at Y=${nearestLevelY + 1}`);
            }
            return;
        }

        const floorY = floorData.y;
        this.debugFloorY = floorY.toFixed(1);
        
        // === КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ ===
        // Раньше было: this.position.y >= floorY - 0.5
        // Теперь: Проверяем, что пол НИЖЕ игрока, но в пределах досягаемости
        // Это позволяет приземлиться даже если игрок уже "под" полом из-за быстрого падения
        const distToFloor = this.position.y - floorY;
        
        if (distToFloor >= -0.5 && distToFloor <= 2.0) {
            this.onGround = true;
            this.onLadder = floorData.isLadder || false;
            this.position.y = floorY + (this.playerHeight * 0.5);
            console.log(`✅ Приземление на heightMap: FloorY=${floorY.toFixed(1)}, Dist=${distToFloor.toFixed(1)}`);
        } else if (distToFloor < -0.5) {
            // Игрок УЖЕ ниже пола (проскочил). Это баг туннелирования.
            // Принудительно ставим на пол, если разница не слишком велика
            if (distToFloor > -5.0) {
                console.warn(`⚠️ Туннелирование! Игрок ниже пола на ${Math.abs(distToFloor).toFixed(1)}. Коррекция.`);
                this.onGround = true;
                this.position.y = floorY + (this.playerHeight * 0.5);
            } else {
                console.warn(`❌ Игрок слишком глубоко под полом (${distToFloor.toFixed(1)}). Продолжаем падение.`);
            }
        }
        // Если distToFloor > 2.0, игрок слишком высоко над полом — продолжаем падать
    }

    onMouseMove(movementX, movementY) {
        const sensitivity = 0.002;
        this.cameraEuler.y -= movementX * sensitivity;
        this.cameraEuler.x -= movementY * sensitivity;
        this.cameraEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraEuler.x));
    }
}

export default PlayerController;
