// src/physics/playerController.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

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
        
        // Создаем тело сразу (Cannon синхронный)
        this.physicsManager.createPlayerBody(this.position);
    }

    update(deltaTime, camera) {
        if (!camera || !this.physicsManager.playerBody) return;
        
        const body = this.physicsManager.playerBody;
        
        // === БЕЗОПАСНАЯ ПРОВЕРКА ЗЕМЛИ ЧЕРЕЗ RAYCAST ===
        this.onGround = false;
        
        // Луч пускаем из центра тела вниз
        const rayFrom = body.position.clone();
        const rayTo = new CANNON.Vec3(rayFrom.x, rayFrom.y - 1.0, rayFrom.z);
        const result = new CANNON.RaycastResult();
        
        // hasHit возвращает boolean, если луч во что-то попал
        if (this.physicsManager.world.raycastClosest(rayFrom, rayTo, {}, result)) {
            // Проверяем, что поверхность достаточно горизонтальна (нормаль смотрит вверх)
            if (result.normal.dot(new CANNON.Vec3(0,1,0)) > 0.5) {
                this.onGround = true;
            }
        }
        // =================================================

        // Синхронизация позиции Three.js с физикой
        this.position.copy(body.position);

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
        
        // Применяем скорость напрямую к телу
        if (moveVec.lengthSq() > 0) {
            body.velocity.x = moveVec.x * this.speed;
            body.velocity.z = moveVec.z * this.speed;
        } else {
            // Плавное торможение
            body.velocity.x *= 0.8;
            body.velocity.z *= 0.8;
        }

        // Камера следует за игроком
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
