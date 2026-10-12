// src/physics/playerController.js
import * as THREE from 'three';

class PlayerController {
    constructor(sceneManager, config, physicsManager) {
        this.sceneManager = sceneManager;
        this.config = config;
        this.physicsManager = physicsManager;
        
        this.position = new THREE.Vector3(0, 50, 0);
        this.onGround = false;
        
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        
        this.direction = new THREE.Vector3();
        this.cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.speed = config.moveSpeed || 10;
        
        // Инициализация тела после готовности физики
        this.physicsManager.waitForReady().then(() => {
            this.physicsManager.createPlayerBody(this.position);
        });
    }

    update(deltaTime, camera) {
        if (!camera) return;
        
        // Синхронизация позиции из физики
        this.position.copy(this.physicsManager.getPlayerPosition());
        this.onGround = this.physicsManager.isPlayerOnGround();

        // Горизонтальное движение
        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.normalize();

        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();
        
        const camRight = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0));
        const moveVec = new THREE.Vector3();
        
        if (this.direction.z !== 0) moveVec.addScaledVector(camDir, this.direction.z);
        if (this.direction.x !== 0) moveVec.addScaledVector(camRight, this.direction.x);
        
        if (moveVec.lengthSq() > 0) {
            this.physicsManager.setPlayerVelocity(moveVec.x * this.speed, moveVec.z * this.speed);
        } else {
            this.physicsManager.setPlayerVelocity(0, 0);
        }

        // Камера
        camera.position.set(
            this.position.x, 
            this.position.y + this.config.playerHeight * 0.9, 
            this.position.z
        );
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
