// @ts-check
/**
 * SceneManager — управление сценой Three.js
 * Отвечает за создание сцены, камеры, рендерера, освещения и тумана
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
        this.controls = null;
        
        // Освещение
        this.directionalLight = null;
        this.hemisphereLight = null;
        
        // Туман
        this.fog = null;

        // === ВИЗУАЛИЗАЦИЯ ОСЕЙ ДЛЯ ОТЛАДКИ ===
        this.axisHelper = null;
        // =====================================
        
        this.init();
    }
    
    /**
     * Инициализация всех компонентов сцены
     */
    init() {
        // 1. Создаем сцену
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.config.backgroundColor);
        
        // 2. Настраиваем туман (экспоненциальный для эффекта глубины)
        this.updateFog();
        
        // 3. Создаем камеру
        this.camera = new THREE.PerspectiveCamera(
            75, // FOV
            window.innerWidth / window.innerHeight,
            0.1,
            2000 // Дальность отсечения
        );
        
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
        
        // 5. Добавляем управление камерой (OrbitControls)
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxDistance = 500;
        this.controls.minDistance = 10;
        
        // === НАЧАЛЬНАЯ ОРИЕНТАЦИЯ КАМЕРЫ (Z = ВЫСОТА) ===
        
        // КЛЮЧЕВОЙ МОМЕНТ: Указываем, что "верх" для камеры — это ось Z (синяя)
        // Без этого OrbitControls будет пытаться выровнять камеру по Y и перевернет её
        this.camera.up.set(0, 0, 1); 
        
        // Точка фокуса: центр мира на уровне пола (Z=0)
        this.controls.target.set(0, 0, 0); 
        
        // Камера стоит чуть выше пола (Z=5), смещена назад по глубине (Y=150)
        // Она смотрит строго вперед-вниз под небольшим углом вдоль оси -Y
        this.camera.position.set(0, 150, 5); 
        
        // Ограничиваем угол обзора, чтобы камера не уходила под пол и не переворачивалась
        // PolarAngle в OrbitControls считается относительно camera.up (теперь это Z)
        this.controls.minPolarAngle = Math.PI / 6;   // ~30° (не даем опуститься ниже горизонта)
        this.controls.maxPolarAngle = Math.PI / 2 + 0.1; // ~90°+ (не даем задрать выше зенита)
        
        this.controls.update(); 
        // ==============================================

        // === СОЗДАНИЕ МАНИФЕСТА ОСЕЙ ===
        // Длина осей 30 единиц. Красный=X, Зеленый=Y, Синий=Z (высота!)
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
     * Настройка освещения (Hemisphere + Directional)
     */
    setupLighting() {
        // Hemisphere light для общего мягкого света
        this.hemisphereLight = new THREE.HemisphereLight(
            0xffffff, // цвет неба
            0x444444, // цвет земли
            0.6       // интенсивность
        );
        this.scene.add(this.hemisphereLight);
        
        // Directional light для направления и теней
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(100, 200, 100);
        this.directionalLight.castShadow = this.config.enableShadows;
        
        if (this.config.enableShadows) {
            this.directionalLight.shadow.mapSize.width = 2048;
            this.directionalLight.shadow.mapSize.height = 2048;
            this.directionalLight.shadow.camera.near = 0.5;
            this.directionalLight.shadow.camera.far = 500;
            
            // Настройка области теней под размер чанка
            const d = 200;
            this.directionalLight.shadow.camera.left = -d;
            this.directionalLight.shadow.camera.right = d;
            this.directionalLight.shadow.camera.top = d;
            this.directionalLight.shadow.camera.bottom = -d;
        }
        
        this.scene.add(this.directionalLight);
    }
    
    /**
     * Обновление параметров тумана
     */
    updateFog() {
        if (this.fog) {
            this.scene.fog = null;
        }
        
        this.fog = new THREE.FogExp2(
            this.config.backgroundColor,
            this.config.fogDensity
        );
        this.scene.fog = this.fog;
    }
    
    /**
     * Обновление настроек сцены из конфига
     * @param {Object} newConfig 
     */
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        
        // Обновляем фон и туман
        this.scene.background = new THREE.Color(this.config.backgroundColor);
        this.updateFog();
        
        // Обновляем тени
        this.renderer.shadowMap.enabled = this.config.enableShadows;
        if (this.directionalLight) {
            this.directionalLight.castShadow = this.config.enableShadows;
        }
    }
    
    /**
     * Обработчик изменения размера окна браузера
     */
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    /**
     * Рендеринг текущего кадра
     * Вызывается каждый кадр в главном цикле приложения
     */
    render() {
        this.controls.update();

        // === ЗАЩИТНАЯ ФИКСАЦИЯ ПОЗИЦИИ КАМЕРЫ ПО Z ===
        // Даже с ограничениями polarAngle иногда полезно иметь жесткий лимит
        if (this.camera.position.z < 0.5) this.camera.position.z = 0.5;
        if (this.camera.position.z > 200) this.camera.position.z = 200;
        
        // Фиксируем target по Z, чтобы он не уходил под пол
        if (this.controls.target.z < 0) this.controls.target.z = 0;
        // ============================================================

        // Обновление позиции осей перед камерой
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
