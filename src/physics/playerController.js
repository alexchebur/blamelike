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
        this.fallSpeed = config.fallSpeed || 25; // Увеличил скорость падения для динамики
        this.climbSpeed = config.ladderClimbSpeed || 6;

        // Локальный кэш коллизий (только ближайшие чанки)
        this.localColliders = []; 
    }

    updateCollisionCache(activeChunksMap, cameraPos, chunkSize) {
        this.localColliders = [];
        
        const cx = Math.floor(this.position.x / chunkSize);
        const cy = Math.floor(this.position.y / chunkSize);
        const cz = Math.floor(this.position.z / chunkSize);

        // Берем радиус 1 вокруг игрока
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const key = `${cx + dx},${cy + dy},${cz + dz}`;
                    const chunk = activeChunksMap.get(key);
                    
                    if (chunk && chunk.userData.collisionGroup) {
                        this.localColliders.push(...chunk.userData.collisionGroup.children);
                    }
                }
            }
        }
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

        // 2. Проверка пола (единая точка входа)
        // Мы вызываем проверку ВСЕГДА, но внутри она оптимизирована
        this.checkGroundWithOffsets(nextX, nextZ);

        let targetY = this.position.y;

        if (this.onGround) {
            this.isFalling = false;
            // Логика лестниц
            if (this.onLadder && (this.moveForward || this.moveBackward)) {
                const climbDir = this.moveForward ? 1 : -1;
                targetY += climbDir * this.climbSpeed * dt;
            }
        } else {
            // Если мы не на земле -> падаем
            this.isFalling = true;
            targetY -= this.fallSpeed * dt;
        }

        this.position.set(nextX, targetY, nextZ);

        // 3. Камера
        camera.position.set(this.position.x, this.position.y + this.playerHeight * 0.9, this.position.z);
        camera.quaternion.setFromEuler(this.cameraEuler);
    }

    checkGroundWithOffsets(x, z) {
        this.onGround = false;
        this.onLadder = false;

        // Если коллайдеров нет (игрок в пустоте), сразу выходим
        if (this.localColliders.length === 0) return;

        // Оптимизация: проверяем только 3 точки (центр и две диагонали) вместо 5
        const offsets = [
            { x: 0, z: 0 },
            { x: this.footRadius, z: this.footRadius },
            { x: -this.footRadius, z: -this.footRadius }
        ];

        let highestHitY = -Infinity;
        let isLadderFound = false;
        
        // Ограничиваем дальность луча высотой игрока + небольшой запас
        // Это критично для производительности: луч не будет сканировать всю глубину мира
        const maxCheckDist = this.playerHeight + 1.0; 

        for (const offset of offsets) {
            // Луч пускаем чуть выше текущей позиции ног, чтобы не застревать в полу
            const rayOrigin = new THREE.Vector3(x + offset.x, this.position.y + 0.2, z + offset.z);
            
            this.raycaster.set(rayOrigin, this.downVector);
            this.raycaster.far = maxCheckDist;

            // recursive: false, так как мы уже развернули детей в localColliders
            const intersects = this.raycaster.intersectObjects(this.localColliders, false);

            if (intersects.length > 0) {
                const hit = intersects[0];
                // Проверяем, что пересечение произошло ниже нас, но в пределах досягаемости
                if (hit.distance < maxCheckDist) {
                    const hitY = hit.point.y;
                    // Ищем самую высокую точку опоры (ближайшую к ногам снизу)
                    if (hitY > highestHitY) {
                        highestHitY = hitY;
                        isLadderFound = hit.object.userData.isLadder || false;
                    }
                }
            }
        }

        // Если нашли землю
        if (highestHitY > -Infinity) {
            // Проверяем, что земля действительно под нами, а не над головой (баг при прыжке вверх)
            if (highestHitY < this.position.y + 0.5) {
                this.onGround = true;
                this.onLadder = isLadderFound;
                
                // Корректируем позицию, чтобы ноги стояли на поверхности
                // Добавляем половину высоты игрока, чтобы камера была на уровне глаз
                this.position.y = highestHitY + (this.playerHeight * 0.5);
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
