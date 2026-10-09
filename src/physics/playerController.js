// src/physics/playerController.js
import * as THREE from 'three';

class PlayerController {
    constructor(sceneManager, config) {
        this.sceneManager = sceneManager;
        this.config = config;
        this.position = new THREE.Vector3(0, 50, 0); 
        this.previousPosition = new THREE.Vector3(0, 50, 0); // Для расчета пути падения
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
        
        // Raycaster
        this.raycaster = new THREE.Raycaster();
        this.downVector = new THREE.Vector3(0, -1, 0);
        
        // Параметры
        this.footRadius = 0.35; 
        this.playerHeight = config.playerHeight || 1.8;
        this.speed = 15.0; 
        this.fallSpeed = config.fallSpeed || 25; 
        this.climbSpeed = config.ladderClimbSpeed || 6;

        // Локальный кэш коллизий
        this.localColliders = []; 
    }

    updateCollisionCache(activeChunksMap, cameraPos, chunkSize) {
        this.localColliders = [];
        
        const cx = Math.floor(this.position.x / chunkSize);
        const cy = Math.floor(this.position.y / chunkSize);
        const cz = Math.floor(this.position.z / chunkSize);

        // === УВЕЛИЧИВАЕМ РАДИУС ДО 2 ЧАНКОВ ===
        // Это гарантирует, что мы захватим платформы, которые находятся на ярус ниже
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                for (let dz = -2; dz <= 2; dz++) {
                    const key = `${cx + dx},${cy + dy},${cz + dz}`;
                    const chunk = activeChunksMap.get(key);
                    
                    if (chunk && chunk.userData.collisionGroup) {
                        this.localColliders.push(...chunk.userData.collisionGroup.children);
                    }
                }
            }
        }
    }
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

        // Сохраняем позицию ДО движения для расчета сканирования
        this.previousPosition.copy(this.position);

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

        // 2. Вертикальное движение
        let targetY = this.position.y;
        if (!this.onGround) {
            this.isFalling = true;
            targetY -= this.fallSpeed * dt;
        } else {
            this.isFalling = false;
            // Логика лестниц
            if (this.onLadder && (this.moveForward || this.moveBackward)) {
                const climbDir = this.moveForward ? 1 : -1;
                targetY += climbDir * this.climbSpeed * dt;
            }
        }

        // Временно обновляем Y для проверки коллизий
        const tempY = this.position.y;
        this.position.y = targetY;

        // 3. Проверка пола (SCANNING RAYCAST)
        // Мы проверяем не просто "под ногами", а ВЕСЬ путь от previousPosition до targetY
        this.checkGroundWithOffsets(nextX, nextZ, tempY, targetY);

        // Если мы приземлились, checkGroundWithOffsets уже скорректировал this.position.y
        // Если нет, оставляем targetY (падение продолжается)

        // Обновляем X и Z окончательно
        this.position.x = nextX;
        this.position.z = nextZ;

        // 4. Камера
        camera.position.set(this.position.x, this.position.y + this.playerHeight * 0.9, this.position.z);
        camera.quaternion.setFromEuler(this.cameraEuler);
    }

    /**
     * Сканирует пол по всему пути падения
     * @param {number} x - новая X
     * @param {number} z - новая Z
     * @param {number} startY - позиция в начале кадра
     * @param {number} endY - позиция в конце кадра (до коррекции)
     */
    /**
     * Проверяет наличие пола через плотную сетку из 9 лучей.
     * Это решает проблему проваливания в узкие щели и между ступеньками.
     */
    checkGroundWithOffsets(x, z) {
        this.onGround = false;
        this.onLadder = false;

        const collisionLayer = this.sceneManager.collisionLayer;
        if (!collisionLayer) return;

        // === ПЛОТНАЯ СЕТКА ИЗ 9 ЛУЧЕЙ ===
        // Центр + 8 точек вокруг (квадрат 3x3)
        const r = this.footRadius * 0.8; // Немного уменьшаем радиус, чтобы лучи не уходили слишком далеко от тела
        const offsets = [
            { x: 0, z: 0 },          // Центр
            { x: r, z: 0 },          // Право
            { x: -r, z: 0 },         // Лево
            { x: 0, z: r },          // Вперед
            { x: 0, z: -r },         // Назад
            { x: r, z: r },          // Правый передний угол
            { x: -r, z: r },         // Левый передний угол
            { x: r, z: -r },         // Правый задний угол
            { x: -r, z: -r }         // Левый задний угол
        ];

        let highestHitY = -Infinity;
        let isLadderFound = false;
        const maxCheckDist = this.playerHeight + 0.5; // Запас для проверки

        for (const offset of offsets) {
            // Луч пускаем чуть выше текущей позиции ног
            const rayOrigin = new THREE.Vector3(x + offset.x, this.position.y + 0.2, z + offset.z);
            
            this.raycaster.set(rayOrigin, this.downVector);
            this.raycaster.far = maxCheckDist;

            // recursive: true важен, так как коллайдеры внутри групп чанков
            const intersects = this.raycaster.intersectObjects(collisionLayer.children, true);

            if (intersects.length > 0) {
                const hit = intersects[0];
                // Проверяем, что это пол под ногами, а не стена сбоку
                if (hit.distance < this.playerHeight * 0.9) {
                    const hitY = hit.point.y;
                    // Ищем самую высокую точку (ближайший пол)
                    if (hitY > highestHitY) {
                        highestHitY = hitY;
                        isLadderFound = hit.object.userData.isLadder || false;
                    }
                }
            }
        }

        // Если хоть один луч нашел землю
        if (highestHitY > -Infinity) {
            this.onGround = true;
            this.isFalling = false;
            this.onLadder = isLadderFound;
            
            // Жестко ставим игрока на поверхность + половина роста
            this.position.y = highestHitY + (this.playerHeight * 0.5);
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
