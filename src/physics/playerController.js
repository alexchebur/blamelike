// src/physics/playerController.js
import * as THREE from 'three';

class PlayerController {
    constructor(sceneManager, config) {
        this.sceneManager = sceneManager;
        this.config = config;
        
        this.position = new THREE.Vector3(0, 50, 0); 
        this.velocity = new THREE.Vector3();
        
        // Состояние
        this.onGround = false;
        this.isFalling = false;
        this.onLadder = false;
        
        // Управление
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.jump = false;
        
        this.direction = new THREE.Vector3();
        this.cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        
        // Параметры
        this.playerHeight = config.playerHeight || 1.8;
        this.speed = (config.moveSpeed || 50) / 1.5; 
        this.fallSpeed = config.fallSpeed || 5; // Медленное падение
        this.climbSpeed = config.ladderClimbSpeed || 4;
    }

    update(deltaTime, camera) {
        if (!camera) return;
        
        // === ЗАЩИТА: Ждем инициализации ChunkManager ===
        if (!this.sceneManager.chunkManager) {
            return; 
        }

        const dt = Math.min(deltaTime, 0.05);

        // 1. Движение по горизонтали
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

        // Предварительная позиция X/Z
        const nextX = this.position.x + moveVec.x;
        const nextZ = this.position.z + moveVec.z;

        // 2. Логика высоты (Гравитация и Пол)
        const logicalData = this.sceneManager.chunkManager.getLogicalHeight(nextX, nextZ, this.config);
        let targetY = this.position.y;

        if (logicalData) {
            // Мы над твердой поверхностью
            this.isFalling = false;
            this.onLadder = logicalData.isLadder;
            
            const floorY = logicalData.y;
            
            if (this.onLadder && (this.moveForward || this.moveBackward)) {
                // ЛАЗАНИЕ ПО ЛЕСТНИЦЕ
                const climbDir = this.moveForward ? 1 : -1;
                targetY += climbDir * this.climbSpeed * dt;
                // Ограничиваем, чтобы не улететь выше потолка лестницы (упрощенно)
            } else {
                // СТОИМ НА ПОВЕРХНОСТИ
                // Плавно выравниваемся по высоте пола, если мы близко
                const desiredY = floorY + this.playerHeight * 0.5;
                
                // Если мы упали сверху, просто телепортируемся на пол
                if (this.position.y > desiredY) {
                     // Можно сделать плавное приземление, но для надежности лучше жестко:
                     if (this.position.y - desiredY < 2.0) {
                         targetY = desiredY;
                     } else {
                         // Если упали с большой высоты, все равно ставим на пол
                         targetY = desiredY;
                     }
                } else {
                    targetY = desiredY;
                }
            }
        } else {
            // МЫ В ПУСТОТЕ
            this.isFalling = true;
            this.onLadder = false;
            // Медленное падение
            targetY -= this.fallSpeed * dt;
        }

        // Применяем позицию
        this.position.set(nextX, targetY, nextZ);

        // 3. Камера
        camera.position.set(this.position.x, this.position.y + this.playerHeight * 0.9, this.position.z);
        camera.quaternion.setFromEuler(this.cameraEuler);
    }

    onMouseMove(movementX, movementY) {
        const sensitivity = 0.002;
        this.cameraEuler.y -= movementX * sensitivity;
        this.cameraEuler.x -= movementY * sensitivity;
        this.cameraEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraEuler.x));
    }
}

export default PlayerController;
