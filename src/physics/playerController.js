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
    }

    // Этот метод теперь пустой, но оставляем его для совместимости с main.js
    updateCollisionCache() {
        // Ничего не делаем, физика теперь основана на HeightMap
    }

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

        // 2. Проверка пола через HeightMap (БЕЗ RAYCASTING)
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

    /**
     * Проверяет пол, запрашивая данные из логической карты высот ChunkManager.
     * Это работает мгновенно, без нагрузки на CPU.
     */
    checkGroundViaHeightMap(x, z) {
        this.onGround = false;
        this.onLadder = false;

        const cm = this.sceneManager.chunkManager;
        if (!cm || !cm.heightMap) return;

        // Получаем размер клетки сетки
        const cellSize = cm.config.chunkSize / cm.config.gridSize;
        const gridX = Math.floor(x / cellSize);
        const gridZ = Math.floor(z / cellSize);
        const key = `${gridX},${gridZ}`;
        
        const floorData = cm.heightMap.get(key);

        // Если под нами есть платформа в карте высот
        if (floorData) {
            const floorY = floorData.y;
            
            // Если мы близко к полу (в пределах 1.5 единиц), считаем что стоим на нем
            // Это позволяет "прилипать" к полу при падении
            if (this.position.y <= floorY + 1.5 && this.position.y >= floorY - 0.5) {
                this.onGround = true;
                this.onLadder = floorData.isLadder;
                
                // Корректируем высоту, чтобы ноги стояли ровно на платформе
                // Добавляем половину роста, чтобы камера была на уровне глаз
                this.position.y = floorY + (this.playerHeight * 0.5);
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
