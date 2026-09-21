// @ts-check
/**
 * SceneManager — управление сценой Three.js
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import defaultConfig from '../core/config.js';

class SceneManager {
    constructor(container) {
        this.container = container;
        this.config = { ...defaultConfig };
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.directionalLight = null;
        this.hemisphereLight = null;
        this.fog = null;
        this.axisHelper = null;
        this.init();
    }

    init() {
        // 1. Сцена
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.config.backgroundColor);
        this.updateFog();

        // 2. Камера
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        
        // === ИСПРАВЛЕНИЕ ОРИЕНТАЦИИ ===
        // Указываем, что "потолок" находится в направлении оси Z
        this.camera.up.set(0, 0, 1); 
        // ==============================

        // 3. Рендерер
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = this.config.enableShadows;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // 4. Управление (OrbitControls)
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        // === СИНХРОНИЗАЦИЯ КОНТРОЛОВ ===
        // Контролы тоже должны знать, что "верх" — это Z
        this.controls.up.set(0, 0, 1); 
        // Точка, куда смотрит камера (центр мира)
        this.controls.target.set(0, 0, 0); 
        // Начальная позиция камеры
        this.camera.position.set(0, 150, 20); 
        // Ограничиваем углы, чтобы не уходить под пол
        this.controls.minPolarAngle = Math.PI / 6; 
        this.controls.maxPolarAngle = Math.PI / 2 + 0.2; 
        this.controls.update();
        // ===============================

        // 5. Оси координат
        this.axisHelper = new THREE.AxesHelper(30);
        this.scene.add(this.axisHelper);

        // 6. Свет
        this.setupLighting();

        // 7. Resize
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupLighting() {
        this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        this.scene.add(this.hemisphereLight);
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(100, 200, 100);
        this.directionalLight.castShadow = this.config.enableShadows;
        if (this.config.enableShadows) {
            const d = 200;
            this.directionalLight.shadow.camera.left = -d;
            this.directionalLight.shadow.camera.right = d;
            this.directionalLight.shadow.camera.top = d;
            this.directionalLight.shadow.camera.bottom = -d;
        }
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
        this.controls.update();
        
        // Обновление позиции осей перед камерой
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
