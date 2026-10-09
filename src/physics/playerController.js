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
        
        // Управление движением
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        
        this.direction = new THREE.Vector3();
        this.cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        
        // Raycaster
        this.raycaster = new THREE.Raycaster();
        this.downVector = new THREE.Vector3(0, -1, 0);
        
        // Параметры игрока
        this.footRadius = 0.35; 
        this.playerHeight = config.playerHeight || 1.8;
        this.speed = 15.0; 
        this.fallSpeed = config.fallSpeed || 15;
        this.climbSpeed = config.ladderClimbSpeed || 6;

        // === НОВОЕ: Локальный кэш коллизий ===
        this.localColliders = []; 
    }

    /**
     * Обновляет список коллайдеров, которые нужно проверять.
     * Вызывается из ChunkManager или App каждый кадр.
     */
    updateCollisionCache(activeChunksMap, cameraPos, chunkSize) {
        this.localColliders = [];
        
        // Определяем текущий чанк игрока
        const cx = Math.floor(this.position.x / chunkSize);
        const cy = Math.floor(this.position.y / chunkSize);
        const cz = Math.floor(this.position.z / chunkSize);

        // Берем только текущий чанк и его соседей (радиус 1)
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    // Простая генерация ключа, как в chunkKey.js
                    const key = `${cx + dx},${cy + dy},${cz + dz}`;
                    const chunk = activeChunksMap.get(key);
                    
                    if (chunk && chunk.userData.collisionGroup) {
                        // Добавляем детей группы коллизий в наш локальный массив
                        // Это намного быстрее, чем рекурсивный поиск по всей сцене
                        this.localColliders.push(...chunk.userData.collisionGroup.children);
                    }
                }
            }
        }
    }

// src/physics/playerController.js

    update(deltaTime, camera) {
        if (!camera) return;
        const dt = Math.min(deltaTime, 0.05);

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

        // 2. Логика вертикального движения
        let targetY = this.position.y;

        if (this.isFalling) {
            // === ОПТИМИЗАЦИЯ ПАДЕНИЯ ===
            // Во время падения НЕ проверяем пол каждый кадр.
            // Просто применяем гравитацию.
            targetY -= this.fallSpeed * dt;

            // Проверяем, не достигли ли мы примерной высоты следующего этажа
            // Используем HeightMap для быстрого поиска опоры БЕЗ Raycasting
            const cm = this.sceneManager.chunkManager;
            if (cm && cm.heightMap) {
                const cellSize = cm.config.chunkSize / cm.config.gridSize;
                const gridX = Math.floor(nextX / cellSize);
                const gridZ = Math.floor(nextZ / cellSize);
                const key = `${gridX},${gridZ}`;
                const floorData = cm.heightMap.get(key);

                // Если есть данные о полу и мы упали НИЖЕ его уровня (+ небольшой допуск)
                if (floorData && targetY <= floorData.y + 0.1) {
                    // ПРИЗЕМЛЕНИЕ: Включаем точную проверку один раз
                    this.checkGroundWithOffsets(nextX, nextZ);
                    
                    // Если после проверки мы все еще в воздухе (например, heightMap ошибся),
                    // продолжаем падать. Но обычно здесь isFalling станет false.
                }
            } else {
                // Fallback: если heightMap недоступен, проверяем редко (раз в N кадров)
                // или просто надеемся на удачу. Для надежности лучше проверить раз в 10 кадров.
                if (Math.random() < 0.1) { 
                    this.checkGroundWithOffsets(nextX, nextZ);
                }
            }
            // ============================

        } else {
            // Обычное состояние: стоим или идем
            this.checkGroundWithOffsets(nextX, nextZ);

            if (this.onGround) {
                if (this.onLadder && (this.moveForward || this.moveBackward)) {
                    const climbDir = this.moveForward ? 1 : -1;
                    targetY += climbDir * this.climbSpeed * dt;
                }
            } else {
                // Только что потеряли опору -> начинаем падение
                this.isFalling = true;
                targetY -= this.fallSpeed * dt;
            }
        }

        this.position.set(nextX, targetY, nextZ);

        // 4. Камера
        camera.position.set(this.position.x, this.position.y + this.playerHeight * 0.9, this.position.z);
        camera.quaternion.setFromEuler(this.cameraEuler);
    }
    checkGroundWithOffsets(x, z) {
        this.onGround = false;
        this.onLadder = false;

        // === ШАГ 1: Быстрая проверка через HeightMap ===
        const cm = this.sceneManager.chunkManager;
        if (cm && cm.heightMap) {
            const cellSize = cm.config.chunkSize / cm.config.gridSize;
            const gridX = Math.floor(x / cellSize);
            const gridZ = Math.floor(z / cellSize);
            const key = `${gridX},${gridZ}`;
            const data = cm.heightMap.get(key);

            // Если мы близко к высоте из карты, доверяем ей полностью
            if (data && Math.abs(this.position.y - data.y) < 1.5) {
                this.onGround = true;
                this.isFalling = false;
                this.onLadder = data.isLadder;
                this.position.y = data.y + (this.playerHeight * 0.5);
                this.velocity.y = 0;
                return; // Выходим, экономя ресурсы CPU
            }
        }

        // === ШАГ 2: Точная проверка через Raycast (только если HeightMap не сработала) ===
        // Используем ТОЛЬКО локальные коллайдеры, а не весь слой
        if (this.localColliders.length === 0) return;

        const offsets = [
            { x: 0, z: 0 },
            { x: this.footRadius, z: this.footRadius },
            { x: -this.footRadius, z: this.footRadius },
            { x: this.footRadius, z: -this.footRadius },
            { x: -this.footRadius, z: -this.footRadius }
        ];

        let highestHitY = -Infinity;
        let isLadderFound = false;
        const maxCheckDist = this.playerHeight + 0.5;

        for (const offset of offsets) {
            const rayOrigin = new THREE.Vector3(x + offset.x, this.position.y + 0.5, z + offset.z);
            this.raycaster.set(rayOrigin, this.downVector);
            this.raycaster.far = maxCheckDist;

            // Пускаем лучи только по локальному списку
            const intersects = this.raycaster.intersectObjects(this.localColliders, false);

            if (intersects.length > 0) {
                const hit = intersects[0];
                if (hit.distance < this.playerHeight * 0.8) {
                    const hitY = hit.point.y;
                    if (hitY > highestHitY) {
                        highestHitY = hitY;
                        isLadderFound = hit.object.userData.isLadder || false;
                    }
                }
            }
        }

        if (highestHitY > -Infinity) {
            this.onGround = true;
            this.isFalling = false;
            this.onLadder = isLadderFound;
            this.position.y = highestHitY + (this.playerHeight * 0.5);
            this.velocity.y = 0;
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
