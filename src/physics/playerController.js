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
        this.gravity = config.gravity || 30.0; // Увеличена для более четкого ощущения падения
        this.maxFallDistance = 5.0; // Максимальная дистанция "шага" вниз без падения
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

        // 2. Проверка пола с учетом ТЕКУЩЕЙ ВЫСОТЫ игрока
        const floorHeight = this.getFloorHeightAtLevel(nextX, nextZ, this.position.y);

        // 3. Вертикальное движение
        if (floorHeight !== null) {
            const distToFloor = this.position.y - (floorHeight + this.playerHeight / 2);
            
            // Если мы близко к полу (в пределах шага или падения)
            if (distToFloor >= -0.1 && distToFloor <= this.maxFallDistance) {
                this.onGround = true;
                this.isFalling = false;
                this.velocity.y = 0;
                // Плавная коррекция позиции, а не телепортация
                this.position.y = floorHeight + (this.playerHeight / 2);
            } else if (distToFloor < -0.1) {
                // Мы ЗАСТРЯЛИ В ПОЛУ (например, после спуска по лестнице)
                this.onGround = true;
                this.position.y = floorHeight + (this.playerHeight / 2);
            } else {
                // Пол слишком далеко внизу -> падаем
                this.onGround = false;
                this.isFalling = true;
            }
        } else {
            // Пола нет вообще -> падаем
            this.onGround = false;
            this.isFalling = true;
        }

        if (this.isFalling) {
            this.velocity.y -= this.gravity * dt;
            this.position.y += this.velocity.y * dt;
            
            // Ресет при падении в бездну
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

    /**
     * Получает высоту пола ТОЛЬКО если она находится в разумном диапазоне от игрока.
     * Это предотвращает "прилипание" к платформам на других ярусах.
     */
    getFloorHeightAtLevel(x, z, currentY) {
        const chunkManager = this.sceneManager.chunkManager;
        if (!chunkManager) return null;
        
        const data = chunkManager.getLogicalHeight(x, z);
        if (!data) return null;

        // Проверяем, находится ли этот пол "под нами", а не где-то в другом ярусе
        // Допускаем пол, который находится от -2 (немного ниже ног) до +maxFallDistance выше головы
        const playerFeetY = currentY - this.playerHeight / 2;
        if (data.y <= playerFeetY + 0.5 && data.y >= playerFeetY - this.maxFallDistance) {
            return data.y;
        }
        
        return null;
    }

    onMouseMove(movementX, movementY) {
        const sensitivity = 0.002;
        this.cameraEuler.y -= movementX * sensitivity;
        this.cameraEuler.x -= movementY * sensitivity;
        this.cameraEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraEuler.x));
    }
}

export default PlayerController;
