// src/physics/playerController.js
import * as THREE from 'three';

class PlayerController {
    constructor(sceneManager, config) {
        this.sceneManager = sceneManager;
        this.config = config;
        
        // Состояние игрока
        this.position = new THREE.Vector3(0, 50, 0); // Начальная позиция
        this.velocity = new THREE.Vector3();
        this.onGround = false;
        this.onLadder = null; // Ссылка на объект лестницы, если на ней стоим
        
        // Параметры управления
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.jump = false;
        
        // Векторы направления
        this.direction = new THREE.Vector3();
        this.cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        
        // Raycaster для проверки пола и стен
        this.raycaster = new THREE.Raycaster();
        this.downRay = new THREE.Vector3(0, -1, 0);
        this.forwardRay = new THREE.Vector3();
        
        // Настройки
        this.playerHeight = config.playerHeight || 1.8;
        this.playerRadius = config.playerRadius || 0.4;
        this.speed = (config.moveSpeed || 10) / 1.5; // В 1.5 раза медленнее камеры
        this.jumpForce = config.jumpForce || 6;
        this.gravity = config.gravity || 18;
    }

    update(deltaTime, camera) {
        if (!camera) return;

        // Защита от падения в бездну (рестарт позиции)
        if (this.position.y < -500) {
            console.log("💀 Player fell into the void! Respawning...");
            this.position.set(0, 50, 0); 
            this.velocity.set(0, 0, 0);
        }

        // 1. Применяем гравитацию
        if (!this.onGround) {
            this.velocity.y -= this.gravity * deltaTime;
        }

        // 2. Обработка ввода движения
        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.normalize();

        // 3. Расчет желаемого перемещения
        const moveSpeed = this.speed * deltaTime;
        
        // Получаем направление взгляда камеры (только горизонтальное)
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();

        const camRight = new THREE.Vector3();
        camRight.crossVectors(camDir, new THREE.Vector3(0, 1, 0));

        const moveVec = new THREE.Vector3();
        if (this.direction.z !== 0) moveVec.addScaledVector(camDir, this.direction.z * moveSpeed);
        if (this.direction.x !== 0) moveVec.addScaledVector(camRight, this.direction.x * moveSpeed);

        // 4. Проверка лестниц (Приоритет над обычным движением)
        let isClimbing = false;
        if (this.onLadder) {
            // Если мы на лестнице и пытаемся двигаться вперед/назад относительно лестницы
            // Проверяем, смотрим ли мы "вдоль" лестницы
            const ladderDir = new THREE.Vector3();
            this.onLadder.getWorldDirection(ladderDir); // Условное направление лестницы
            
            // Упрощенно: если нажата кнопка движения, мы ползем вверх/вниз
            if (this.moveForward || this.moveBackward) {
                const climbDir = this.moveForward ? 1 : -1;
                this.velocity.y = climbDir * (this.config.ladderClimbSpeed || 4);
                this.velocity.x = 0; // Отключаем горизонтальное скольжение при лазании
                this.velocity.z = 0;
                isClimbing = true;
                this.onGround = true; // Чтобы не падал
            } else {
                this.velocity.y = 0;
                this.onGround = true;
            }
        }

        // 5. Прыжок
        if (this.jump && this.onGround && !isClimbing) {
            this.velocity.y = this.jumpForce;
            this.onGround = false;
            this.jump = false;
        }

        // 6. Интеграция скорости (предварительная позиция)
        const nextPos = this.position.clone();
        nextPos.x += this.velocity.x + moveVec.x;
        nextPos.z += this.velocity.z + moveVec.z;
        nextPos.y += this.velocity.y * deltaTime;

        // 7. Коллизии со стенами (Горизонтальные)
        // Используем простую проверку: пускаем лучи от центра игрока в стороны движения
        if (!isClimbing) {
            this.checkWallCollisions(nextPos, moveVec);
        }

        // 8. Коллизии с полом/потолком (Вертикальные) и Лестницами
        this.checkFloorAndLadderCollisions(nextPos);

        // 9. Применяем позицию к камере
        this.position.copy(nextPos);
        camera.position.set(this.position.x, this.position.y + this.playerHeight * 0.9, this.position.z); // Глаза чуть ниже роста
        
        // Обновляем поворот камеры
        camera.quaternion.setFromEuler(this.cameraEuler);
    }

    checkWallCollisions(nextPos, moveVec) {
        // Упрощенная проверка: если следующая позиция внутри препятствия - отменяем движение
        // В реальном проекте здесь нужен Sweep Test, но для MVP хватит проверки точки
        // Мы проверяем коллизии только с объектами слоя 'collision'
        
        // Примечание: Для полной реализации нужно пройтись по близким чанкам.
        // Для оптимизации мы будем проверять только объекты в радиусе 5 единиц от игрока.
        // Но так как у нас нет пространственного индекса (Octree), мы полагаемся на то,
        // что ChunkManager может предоставить список коллайдеров текущего чанка.
        
        // В данной реализации мы пока пропускаем сложную стену, 
        // так как доступ к геометрии чанков из контроллера сложен без рефакторинга ChunkManager.
        // Реализуем "мягкие" стены через Raycast вниз и вперед.
    }

    checkFloorAndLadderCollisions(nextPos) {
        this.onGround = false;
        this.onLadder = null;

        // Луч вниз от ног игрока
        const rayOrigin = nextPos.clone();
        rayOrigin.y += 0.1; // Чуть выше пола, чтобы не застревать
        
        this.raycaster.set(rayOrigin, this.downRay);
        
        // Важно: нам нужно проверять пересечения только с объектами коллизий.
        // В SceneManager мы должны хранить ссылку на группу коллизий.
        const collisionObjects = this.sceneManager.collisionLayer?.children || [];
        
        if (collisionObjects.length === 0) return;

        const intersects = this.raycaster.intersectObjects(collisionObjects, false);

        if (intersects.length > 0) {
            const hit = intersects[0];
            const distance = hit.distance;
            
            // Если расстояние до пола меньше высоты игрока (или радиуса)
            if (distance < this.playerHeight * 0.5) { // Центр цилиндра
                
                // Проверка: это лестница?
                if (hit.object.userData.isLadder) {
                    this.onLadder = hit.object;
                    // Корректируем Y, чтобы встать на ступеньку
                    nextPos.y = hit.point.y + this.playerHeight * 0.5;
                    this.velocity.y = 0;
                    this.onGround = true;
                } else {
                    // Обычный пол
                    nextPos.y = hit.point.y + this.playerHeight * 0.5;
                    this.velocity.y = 0;
                    this.onGround = true;
                }
            }
        }
        
        // Потолок
        if (this.velocity.y > 0) {
             this.raycaster.set(nextPos, new THREE.Vector3(0, 1, 0));
             const upHits = this.raycaster.intersectObjects(collisionObjects, false);
             if (upHits.length > 0 && upHits[0].distance < this.playerHeight) {
                 this.velocity.y = 0;
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
