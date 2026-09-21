// @ts-check
/**
 * SceneManager — управление сценой Three.js
 * Отвечает за создание сцены, камеры, рендерера, освещения и тумана
 */
import * as THREE from 'three';
import defaultConfig from '../core/config.js';

class SceneManager {
    /**
     * @param {HTMLElement} container - DOM-элемент для канваса
     */
    constructor(container) {
        this.container = container;
        this.config = { ...defaultConfig };
        // Основные компоненты сцены
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // === КАСТОМНОЕ УПРАВЛЕНИЕ ===
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ'); // Порядок вращения YXZ важен для FPS-стиля
        this.PI_2 = Math.PI / 2;
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.moveUp = false;      // Q
        this.moveDown = false;    // E
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.prevTime = performance.now();
        this.isPointerLocked = false; // Флаг захвата указателя (опционально)
        // ============================

        // Освещение
        this.directionalLight = null;
        this.hemisphereLight = null;
        // Туман
        this.fog = null;
        // === ВИЗУАЛИЗАЦИЯ ОСЕЙ ДЛЯ ОТЛАДКИ ===
        this.axisHelper = null;
        // =====================================
        this.init();
        
        // Добавляем слушатели событий для клавиатуры и мыши
        this._bindEvents();
    }

    _bindEvents() {
        document.addEventListener('keydown', (event) => this.onKeyDown(event));
        document.addEventListener('keyup', (event) => this.onKeyUp(event));
        document.addEventListener('mousemove', (event) => this.onMouseMove(event));
        
        // Обработчики для захвата/освобождения курсора (опционально, для удобства)
        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = !!document.pointerLockElement;
        });
        
        // Клик по канвасу для захвата курсора (если нужно)
        this.renderer?.domElement.addEventListener('click', () => {
             if (!this.isPointerLocked) {
                 this.container.requestPointerLock();
             }
        });
    }

    onKeyDown(event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                this.moveForward = true;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                this.moveLeft = true;
                break;
            case 'ArrowDown':
            case 'KeyS':
                this.moveBackward = true;
                break;
            case 'ArrowRight':
            case 'KeyD':
                this.moveRight = true;
                break;
            case 'KeyQ':
                this.moveUp = true;
                break;
            case 'KeyE':
                this.moveDown = true;
                break;
        }
    }

    onKeyUp(event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                this.moveForward = false;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                this.moveLeft = false;
                break;
            case 'ArrowDown':
            case 'KeyS':
                this.moveBackward = false;
                break;
            case 'ArrowRight':
            case 'KeyD':
                this.moveRight = false;
                break;
            case 'KeyQ':
                this.moveUp = false;
                break;
            case 'KeyE':
                this.moveDown = false;
                break;
        }
    }

    onMouseMove(event) {
        // Вращение только при зажатой ЛКМ (buttons === 1)
        if (event.buttons !== 1) return;

        const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

        // Чувствительность мыши
        const sensitivity = 0.002;

        this.euler.setFromQuaternion(this.camera.quaternion);

        this.euler.y -= movementX * sensitivity;
        this.euler.x -= movementY * sensitivity;

        // Ограничиваем вертикальный угол (чтобы не перевернуться)
        this.euler.x = Math.max(-this.PI_2, Math.min(this.PI_2, this.euler.x));

        this.camera.quaternion.setFromEuler(this.euler);
    }

    /**
     * Обновление позиции камеры на основе WASD
     */
    updateCameraMovement() {
        const time = performance.now();
        const delta = (time - this.prevTime) / 1000;

        // Замедление (трение)
        this.velocity.x -= this.velocity.x * 10.0 * delta;
        this.velocity.z -= this.velocity.z * 10.0 * delta;
        this.velocity.y -= this.velocity.y * 10.0 * delta;

        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.y = Number(this.moveUp) - Number(this.moveDown); 
        
        this.direction.normalize(); 

        const speed = 100.0; 

        if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * speed * delta;
        if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * speed * delta;
        if (this.moveUp || this.moveDown) this.velocity.y -= this.direction.y * speed * delta;

        const moveSpeed = 50.0 * delta;
        
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        
        if (this.moveForward) this.camera.position.addScaledVector(forward, moveSpeed);
        if (this.moveBackward) this.camera.position.addScaledVector(forward, -moveSpeed);
        if (this.moveRight) this.camera.position.addScaledVector(right, moveSpeed);
        if (this.moveLeft) this.camera.position.addScaledVector(right, -moveSpeed);
        
        // Вертикальное движение строго по мировой оси Z
        if (this.moveUp) this.camera.position.z += moveSpeed;
        if (this.moveDown) this.camera.position.z -= moveSpeed;

        this.prevTime = time;
    }

    /**
     * Инициализация всех компонентов сцены
     */
    init() {
        // 1. Создаем сцену
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.config.backgroundColor);
        // 2. Настраиваем туман
        this.updateFog();
        // 3. Создаем камеру
        this.camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight,
            0.1,
            2000 
        );
        
        // === НАЧАЛЬНАЯ ПОЗИЦИЯ И УГОЛ ===
        // Важно: указываем, что "верх" для камеры — это ось Z
        this.camera.up.set(0, 0, 1);
        
        // Начальная позиция: чуть выше пола (Z=20), смещена назад по Y
        this.camera.position.set(0, 150, 20); 
        
        // Начальный угол: 0,0,0 означает, что камера смотрит вдоль своей локальной оси -Z.
        // При camera.up=(0,0,1) и позиции (0,150,20), локальная -Z направлена вдоль мировой -Y.
        // Это дает вид "прямо перед собой" (голова вверху).
        this.euler.set(0, 0, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(this.euler);
        // =================================

        // 4. Создаем рендерер
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = this.config.enableShadows;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // === СОЗДАНИЕ МАНИФЕСТА ОСЕЙ ===
        this.axisHelper = new THREE.AxesHelper(30);
        if (this.axisHelper.material) {
            this.axisHelper.material.linewidth = 2; 
        }
        this.scene.add(this.axisHelper);
        // ================================
        // 6. Настраиваем освещение
        this.setupLighting();
        // 7. Обработчик изменения размера окна
        window.addEventListener('resize', () => this.onWindowResize());
    }

    /**
     * Настройка освещения
     */
    setupLighting() {
        this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        this.scene.add(this.hemisphereLight);
        
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(100, 200, 100);
        this.directionalLight.castShadow = this.config.enableShadows;
        if (this.config.enableShadows) {
            this.directionalLight.shadow.mapSize.width = 2048;
            this.directionalLight.shadow.mapSize.height = 2048;
            this.directionalLight.shadow.camera.near = 0.5;
            this.directionalLight.shadow.camera.far = 500;
            const d = 200;
            this.directionalLight.shadow.camera.left = -d;
            this.directionalLight.shadow.camera.right = d;
            this.directionalLight.shadow.camera.top = d;
            this.directionalLight.shadow.camera.bottom = -d;
        }
        this.scene.add(this.directionalLight);
    }

    updateFog() {
        if (this.fog) {
            this.scene.fog = null;
        }
        this.fog = new THREE.FogExp2(this.config.backgroundColor, this.config.fogDensity);
        this.scene.fog = this.fog;
    }

    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        this.scene.background = new THREE.Color(this.config.backgroundColor);
        this.updateFog();
        this.renderer.shadowMap.enabled = this.config.enableShadows;
        if (this.directionalLight) {
            this.directionalLight.castShadow = this.config.enableShadows;
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        this.updateCameraMovement();
        
        if (this.axisHelper && this.camera) {
            const direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction);
            const axisPos = new THREE.Vector3()
                .copy(this.camera.position)
                .add(direction.multiplyScalar(60)); 
            this.axisHelper.position.copy(axisPos);
        }
        this.renderer.render(this.scene, this.camera);
    }
}

export default SceneManager;
