// @ts-check
import * as THREE from 'three';
import defaultConfig from '../core/config.js';

class SceneManager {
    constructor(container) {
        this.container = container;
        this.config = { ...defaultConfig };
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // === FPS CONTROLS STATE ===
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ'); // Порядок YXZ важен для FPS
        this.PI_2 = Math.PI / 2;
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.moveUp = false; // Q
        this.moveDown = false; // E
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.prevTime = performance.now();
        // ==========================

        this.directionalLight = null;
        this.hemisphereLight = null;
        this.fog = null;
        this.axisHelper = null;
        
        this.init();
        this._bindEvents();
    }

    _bindEvents() {
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    }

    onKeyDown(event) {
        switch (event.code) {
            case 'KeyW': this.moveForward = true; break;
            case 'KeyA': this.moveLeft = true; break;
            case 'KeyS': this.moveBackward = true; break;
            case 'KeyD': this.moveRight = true; break;
            case 'KeyQ': this.moveUp = true; break;
            case 'KeyE': this.moveDown = true; break;
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
        }
    }

    onMouseMove(event) {
        // Вращение только при зажатой ЛКМ (buttons === 1)
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

    updateCameraMovement() {
        const time = performance.now();
        const delta = (time - this.prevTime) / 1000;
        
        // Трение
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

        // Движение относительно взгляда камеры
        const moveSpeed = 50.0 * delta;
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        
        if (this.moveForward) this.camera.position.addScaledVector(forward, moveSpeed);
        if (this.moveBackward) this.camera.position.addScaledVector(forward, -moveSpeed);
        if (this.moveRight) this.camera.position.addScaledVector(right, moveSpeed);
        if (this.moveLeft) this.camera.position.addScaledVector(right, -moveSpeed);
        
        // Вертикальное движение строго по Z
        if (this.moveUp) this.camera.position.z += moveSpeed;
        if (this.moveDown) this.camera.position.z -= moveSpeed;

        this.prevTime = time;
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.config.backgroundColor);
        this.updateFog();

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        
        // === КЛЮЧЕВОЙ МОМЕНТ: ВЕРХ ЭТО Z ===
        this.camera.up.set(0, 0, 1); 
        
        // Начальная позиция: смотрим вдоль оси Y, Z=20 (чуть выше пола)
        this.camera.position.set(0, 150, 20); 
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

        this.setupLighting();
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
            const axisPos = new THREE.Vector3().copy(this.camera.position).add(direction.multiplyScalar(60)); 
            this.axisHelper.position.copy(axisPos);
        }
        this.renderer.render(this.scene, this.camera);
    }
}

export default SceneManager;
