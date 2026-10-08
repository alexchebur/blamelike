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
        
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.jump = false;
        
        this.direction = new THREE.Vector3();
        this.cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        
        // Параметры
        this.playerHeight = config.playerHeight || 1.8;
        // УВЕЛИЧИВАЕМ СКОРОСТЬ: было / 1.5, стало * 1.5 от базы
        this.speed = (config.moveSpeed || 50) * 1.5; 
        
        this.fallSpeed = config.fallSpeed || 10;
        this.climbSpeed = config.ladderClimbSpeed || 4;
        
        // Максимальная дистанция, на которой мы считаем, что "пол существует"
        // Если пол ниже этого значения, мы должны падать
        this.maxFloorDistance = 10.0; 
    }

    update(deltaTime, camera) {
        if (!camera) return;
        if (!this.sceneManager.chunkManager) return;

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

        // 2. Логика высоты с проверкой дистанции
        const logicalData = this.sceneManager.chunkManager.getLogicalHeight(nextX, nextZ);
        let targetY = this.position.y;
        let foundValidFloor = false;

        if (logicalData) {
            const floorY = logicalData.y;
            const distToFloor = this.position.y - floorY;

            // ПРОВЕРКА: Пол должен быть близко (мы стоим на нем или чуть выше)
            // И мы не должны быть глубоко под землей (distToFloor < playerHeight)
            if (distToFloor >= -0.5 && distToFloor <= this.maxFloorDistance) {
                foundValidFloor = true;
                this.isFalling = false;
                this.onLadder = logicalData.isLadder;
                
                if (this.onLadder && (this.moveForward || this.moveBackward)) {
                    const climbDir = this.moveForward ? 1 : -1;
                    targetY += climbDir * this.climbSpeed * dt;
                } else {
                    // Ставим на пол
                    targetY = floorY + this.playerHeight * 0.5;
                }
            }
        }

        if (!foundValidFloor) {
            // Нет валидного пола рядом -> ПАДАЕМ
            this.isFalling = true;
            this.onLadder = false;
            this.onGround = false;
            targetY -= this.fallSpeed * dt;
        } else {
            this.onGround = true;
        }

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
