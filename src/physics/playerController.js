// src/physics/playerController.js
import * as THREE from 'three';

class PlayerController {
    constructor(sceneManager, config) {
        this.sceneManager = sceneManager;
        this.config = config;
        this.position = new THREE.Vector3(0, 50, 0); 
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.onGround = false;
        this.isFalling = false;
        
        // Параметры движения
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        
        this.direction = new THREE.Vector3();
        this.cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        
        // Физические константы
        this.playerHeight = config.playerHeight || 1.8;
        this.speed = config.moveSpeed || 15.0;
        this.fallSpeed = config.fallSpeed || 25.0;
        this.gravity = config.gravity || 9.8;
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

        // 2. Проверка пола через HeightMap (Быстро и точно!)
        this.checkGroundWithHeightMap(nextX, nextZ);

        // 3. Вертикальное движение
        if (this.onGround) {
            this.isFalling = false;
            this.velocity.y = 0;
            // Жесткая привязка к высоте платформы + половина роста игрока
            const floorHeight = this.getFloorHeight(nextX, nextZ);
            if (floorHeight !== null) {
                this.position.y = floorHeight + (this.playerHeight / 2);
            }
        } else {
            this.isFalling = true;
            this.velocity.y -= this.gravity * dt; // Простая гравитация
            this.position.y += this.velocity.y * dt;
            
            // Проверка, не упали ли мы ниже какого-то предела (ресет)
            if (this.position.y < -100) {
                this.position.set(0, 50, 0);
                this.velocity.set(0, 0, 0);
            }
        }

        // Применяем горизонтальное смещение
        this.position.x = nextX;
        this.position.z = nextZ;

        // 4. Камера
        camera.position.set(this.position.x, this.position.y + this.playerHeight * 0.4, this.position.z);
        camera.quaternion.setFromEuler(this.cameraEuler);
    }

    checkGroundWithHeightMap(x, z) {
        const chunkManager = this.sceneManager.chunkManager;
        if (!chunkManager) return;

        const floorHeight = this.getFloorHeight(x, z);
        
        if (floorHeight !== null) {
            // Если мы падали и достигли пола
            if (this.isFalling && this.position.y <= floorHeight + this.playerHeight) {
                this.onGround = true;
            } else if (!this.isFalling) {
                this.onGround = true;
            }
        } else {
            this.onGround = false;
        }
    }

    getFloorHeight(x, z) {
        const chunkManager = this.sceneManager.chunkManager;
        if (!chunkManager) return null;
        
        // Получаем данные из логической карты высот
        const data = chunkManager.getLogicalHeight(x, z);
        return data ? data.y : null;
    }

    onMouseMove(movementX, movementY) {
        const sensitivity = 0.002;
        this.cameraEuler.y -= movementX * sensitivity;
        this.cameraEuler.x -= movementY * sensitivity;
        this.cameraEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraEuler.x));
    }
}

export default PlayerController;
