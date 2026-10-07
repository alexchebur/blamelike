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
        
        // Raycaster для проверки пола
        this.raycaster = new THREE.Raycaster();
        this.downVector = new THREE.Vector3(0, -1, 0);
        
        this.playerHeight = config.playerHeight || 1.8;
        this.speed = (config.moveSpeed || 50) / 1.5; 
        this.fallSpeed = config.fallSpeed || 10; // Увеличим скорость падения для отзывчивости
        this.climbSpeed = config.ladderClimbSpeed || 4;
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

        // Предварительная новая позиция X/Z
        const nextX = this.position.x + moveVec.x;
        const nextZ = this.position.z + moveVec.z;

        // 2. Проверка пола через Raycast (самый надежный способ для многоярусности)
        this.checkGround(nextX, nextZ);

        // 3. Логика высоты
        let targetY = this.position.y;

        if (this.onGround) {
            // Если мы на лестнице и движемся
            if (this.onLadder && (this.moveForward || this.moveBackward)) {
                const climbDir = this.moveForward ? 1 : -1;
                targetY += climbDir * this.climbSpeed * dt;
            } else {
                // Просто стоим на полу. 
                // Мы не меняем Y здесь, он был установлен в checkGround при приземлении.
                // Или если мы уже стояли, он остается прежним.
                // Важно: если мы на лестнице, но не движемся, мы тоже стоим.
            }
        } else {
            // Падаем
            this.isFalling = true;
            targetY -= this.fallSpeed * dt;
        }

        // Применяем позицию
        this.position.set(nextX, targetY, nextZ);

        // 4. Камера
        camera.position.set(this.position.x, this.position.y + this.playerHeight * 0.9, this.position.z);
        camera.quaternion.setFromEuler(this.cameraEuler);
    }

    checkGround(x, z) {
        this.onGround = false;
        this.onLadder = false;

        // Луч пускаем чуть выше текущей позиции ног, чтобы не застревать
        const rayOrigin = new THREE.Vector3(x, this.position.y + 0.5, z);
        
        this.raycaster.set(rayOrigin, this.downVector);
        // Ищем пересечения только на расстоянии до 2-3 метров вниз
        this.raycaster.far = 3.0; 

        const collisionLayer = this.sceneManager.collisionLayer;
        if (!collisionLayer) return;

        // recursive: true обязательно, так как коллайдеры внутри групп чанков
        const intersects = this.raycaster.intersectObjects(collisionLayer.children, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            
            // Проверяем, что мы падаем вниз или стоим, а не прыгаем вверх сквозь пол
            // И что расстояние до пола меньше роста игрока (с запасом)
            if (this.velocity.y <= 0 && hit.distance < this.playerHeight) {
                
                // Определяем, что это за поверхность
                const isLadder = hit.object.userData.isLadder;
                
                if (isLadder) {
                    this.onLadder = true;
                    this.onGround = true;
                    // На лестнице мы можем "прилипать" к поверхности, 
                    // но лучше позволять гравитации работать, если не жмем кнопки
                    // Для простоты пока просто ставим на поверхность
                    this.position.y = hit.point.y + this.playerHeight * 0.5;
                    this.velocity.y = 0;
                } else {
                    // Обычный пол
                    this.onGround = true;
                    this.isFalling = false;
                    // Жестко ставим на пол + половина роста (центр капсулы)
                    this.position.y = hit.point.y + this.playerHeight * 0.5;
                    this.velocity.y = 0;
                }
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
