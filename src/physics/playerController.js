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
        
        // Параметры "толстого луча"
        this.footRadius = 0.3; // Радиус проверки пола (в мировых единицах)
        this.maxFallDistance = 2.5; // Максимальная дистанция поиска пола вниз
        
        this.playerHeight = config.playerHeight || 1.8;
        this.speed = (config.moveSpeed || 50) / 1.5; 
        this.fallSpeed = config.fallSpeed || 10;
        this.climbSpeed = config.ladderClimbSpeed || 4;
        
        // Кэшируемые объекты для AABB (чтобы не создавать их каждый кадр)
        this._playerBox = new THREE.Box3();
        this._tempBox = new THREE.Box3();
        this._tempVec = new THREE.Vector3();
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

        // 2. Проверка пола "толстым лучом" (AABB Intersection)
        this.checkGroundAABB(nextX, nextZ);

        // 3. Логика высоты
        let targetY = this.position.y;

        if (this.onGround) {
            if (this.onLadder && (this.moveForward || this.moveBackward)) {
                const climbDir = this.moveForward ? 1 : -1;
                targetY += climbDir * this.climbSpeed * dt;
            }
            // Если стоим на полу, Y корректируется внутри checkGroundAABB
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
     * Проверяет наличие пола под ногами используя объемный тест (Box vs Box)
     * Это игнорирует микро-щели между платформами
     */
    checkGroundAABB(x, z) {
        this.onGround = false;
        this.onLadder = false;

        const collisionLayer = this.sceneManager.collisionLayer;
        if (!collisionLayer) return;

        // Создаем "столб" под ногами игрока
        // Центр столба: (x, позиция_ног, z)
        // Размер: footRadius * 2 по X/Z, maxFallDistance по Y
        const feetY = this.position.y - (this.playerHeight * 0.5) + 0.2; // Чуть выше ног, чтобы не застревать
        
        this._playerBox.setFromCenterAndSize(
            this._tempVec.set(x, feetY - (this.maxFallDistance / 2), z),
            this._tempVec.set(this.footRadius * 2, this.maxFallDistance, this.footRadius * 2)
        );

        let closestHitY = -Infinity;
        let isLadderHit = false;

        // Проходим по всем коллайдерам в слое
        // Оптимизация: в реальном проекте здесь нужен Spatial Hash / Octree
        // Но для MVP перебор children допустим, если чанков немного
        for (const child of collisionLayer.children) {
            if (!child.isMesh) continue;
            
            // Получаем мировой BoundingBox меша
            // Важно: computeBoundingBox должен быть вызван после изменения матрицы
            if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
            
            // Применяем мировую трансформацию к локальному BB
            this._tempBox.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);

            // Проверяем пересечение нашего "столба" с коллайдером
            if (this._playerBox.intersectsBox(this._tempBox)) {
                // Нас интересует только верхняя грань коллайдера, которая ниже нас
                const colliderTopY = this._tempBox.max.y;
                
                // Условие: коллайдер должен быть под ногами, но не слишком далеко
                if (colliderTopY <= feetY + 0.1 && colliderTopY > closestHitY) {
                    closestHitY = colliderTopY;
                    isLadderHit = child.userData.isLadder || false;
                }
            }
        }

        // Если нашли ближайшую поверхность
        if (closestHitY > -Infinity) {
            this.onGround = true;
            this.isFalling = false;
            this.onLadder = isLadderHit;
            
            // Жестко ставим игрока на найденную поверхность
            // + половина роста (так как position - это центр капсулы/тела)
            this.position.y = closestHitY + (this.playerHeight * 0.5);
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
