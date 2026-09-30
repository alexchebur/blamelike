// @ts-check
import * as THREE from 'three';
import defaultConfig from '../core/config.js';
import ScreenManager from './screenManager.js';
import PlayerController from '../physics/playerController.js';

class SceneManager {
    constructor(container) {
        this.container = container;
        this.config = { ...defaultConfig };
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        // === FPS CONTROLS STATE ===
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.PI_2 = Math.PI / 2;
        
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.moveUp = false;
        this.moveDown = false;
        
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.prevTime = performance.now();
        // ==========================

        this.directionalLight = null;
        this.hemisphereLight = null;
        this.fog = null;
        this.axisHelper = null;

        // === SCREEN MANAGER STATE ===
        this.screenManager = null;
        // ============================
        
        // === НОВЫЕ ПОЛЯ ===
        // Создаем группу сейчас, но добавим в сцену позже в init()
        this.collisionLayer = new THREE.Group();
        this.collisionLayer.name = "CollisionLayer";
        
        this.playerController = null; 
        // ==================

        this.init();
        this._bindEvents();
    }

    _bindEvents() {
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        // Блокируем контекстное меню для использования ПКМ как прыжка
        document.addEventListener('contextmenu', event => event.preventDefault());
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
    }

    onKeyDown(event) {
        // Старое управление камерой (если нужно)
        switch (event.code) {
            case 'KeyW': this.moveForward = true; break;
            case 'KeyA': this.moveLeft = true; break;
            case 'KeyS': this.moveBackward = true; break;
            case 'KeyD': this.moveRight = true; break;
            case 'KeyQ': this.moveUp = true; break;
            case 'KeyE': this.moveDown = true; break;
            case 'Space': 
                if (this.playerController) this.playerController.jump = true; 
                break;
        }
    }

    onKeyUp(event) {
        switch (event.code) {
            case 'KeyW': this.moveForward = false; break;
            case 'KeyA': this.moveLeft = false; break;
            case 'KeyS': this.moveBackward = false; break;
            case 'KeyD': this.moveRight = false; break;
            case 'KeyQ': this.moveUp = false; break;
            case 'KeyE': this.moveDown = false; break;
            case 'Space': 
                if (this.playerController) this.playerController.jump = false; 
                break;
        }
    }

    onMouseMove(event) {
        // Если есть контроллер игрока, используем его для вращения
        if (this.playerController) {
            this.playerController.onMouseMove(event.movementX || 0, event.movementY || 0);
        } else {
            // Фолбэк на старую логику Orbit-like если контроллер не создан
            if (event.buttons !== 1) return;
            const movementX = event.movementX || 0;
            const movementY = event.movementY || 0;
            const sensitivity = 0.002;
            this.euler.setFromQuaternion(this.camera.quaternion);
            this.euler.y -= movementX * sensitivity;
            this.euler.x -= movementY * sensitivity;
            this.euler.x = Math.max(-this.PI_2, Math.min(this.PI_2, this.euler.x));
            this.camera.quaternion.setFromEuler(this.euler);
        }
    }

    onMouseDown(event) {
        // ПКМ (button 2) для прыжка
        if (event.button === 2 && this.playerController) {
            this.playerController.jump = true;
        }
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.config.backgroundColor);
        this.updateFog();
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.up.set(0, 1, 0); 
        this.camera.position.set(0, 50, 100); 
        
        this.euler.set(0, 0, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(this.euler);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = this.config.enableShadows;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.axisHelper = new THREE.AxesHelper(30);
        this.scene.add(this.axisHelper);
        
        // Добавляем слой коллизий в сцену (теперь сцена существует)
        this.scene.add(this.collisionLayer);

        this.setupLighting();
        
        // === ИНИЦИАЛИЗАЦИЯ МЕНЕДЖЕРОВ ===
        this.screenManager = new ScreenManager(this.scene);
        
        // Инициализируем контроллер игрока
        this.playerController = new PlayerController(this, this.config);
        
        // ====================================
        
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupLighting() {
        this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        this.scene.add(this.hemisphereLight);

        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(100, 200, 100);
        this.directionalLight.castShadow = this.config.enableShadows;
        this.scene.add(this.directionalLight);
    }

    updateFog() {
        if (this.fog) this.scene.fog = null;
        this.fog = new THREE.FogExp2(this.config.backgroundColor, this.config.fogDensity);
        this.scene.fog = this.fog;
    }

    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        this.scene.background = new THREE.Color(this.config.backgroundColor);
        this.updateFog();
        this.renderer.shadowMap.enabled = this.config.enableShadows;
        if (this.directionalLight) this.directionalLight.castShadow = this.config.enableShadows;
        
        // Обновляем параметры игрока если они изменились
        if (this.playerController) {
            this.playerController.speed = (this.config.moveSpeed || 50) / 1.5;
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        const time = performance.now();
        const delta = (time - this.prevTime) / 1000;
        this.prevTime = time;

        // Обновляем физику игрока вместо старого движения камеры
        if (this.playerController && this.camera) {
            this.playerController.update(delta, this.camera);
        }

        // Обновляем позицию осей
        if (this.axisHelper && this.camera) {
            const direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction);
            const axisPos = new THREE.Vector3().copy(this.camera.position).add(direction.multiplyScalar(60)); 
            this.axisHelper.position.copy(axisPos);
        }

        // Обновляем анимацию экранов
        if (this.screenManager) {
            this.screenManager.update();
        }

        this.renderer.render(this.scene, this.camera);
    }
}

export default SceneManager;
