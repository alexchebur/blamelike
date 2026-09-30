// @ts-check
/**
 * Главная точка входа приложения Blame! Industrial Landscape Generator
 * Инициализирует сцену, менеджер чанков, панель управления и запускает цикл рендеринга
 */
import * as THREE from 'three'; // <--- ДОБАВЬТЕ ЭТУ СТРОКУ
import SceneManager from './render/sceneManager.js';
import ControlPanel from './ui/controlPanel.js';
import ChunkManager from './world/chunkManager.js';

class App {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.loading = document.getElementById('loading');
        
        // Основные компоненты
        this.sceneManager = null;
        this.controlPanel = null;
        this.chunkManager = null;
        
        // Состояние
        this.isInitialized = false;
        
        this.init();
    }

// src/main.js

    async init() {
        try {
            console.log('🚀 Initializing Blame! Generator...');
            
            // 1. Создаем менеджер сцены (Three.js)
            this.sceneManager = new SceneManager(this.container);
            console.log('✅ SceneManager initialized');
            
            // 2. Создаем менеджер чанков (стриминг мира)
            this.chunkManager = new ChunkManager(this.sceneManager);
            console.log('✅ ChunkManager initialized');

            // === ВАЖНО: Связываем ChunkManager с PlayerController ===
            if (this.sceneManager.playerController) {
                this.sceneManager.playerController.sceneManager.chunkManager = this.chunkManager;
                console.log('✅ PlayerController linked to ChunkManager');
            }
            // =========================================================
            
            // 3. Создаем панель управления
            this.controlPanel = new ControlPanel(
                this.sceneManager,
                this.chunkManager,
                (config) => this.onConfigChange(config)
            );
            console.log('✅ ControlPanel initialized');
            
            // 4. Запускаем стриминг чанков вокруг начальной позиции камеры
            this.updateChunks();
            
            // 5. Находим точку спавна
            const spawnPos = this.chunkManager.findSpawnPoint(new THREE.Vector3(0, 0, 0));
            
            if (spawnPos) {
                console.log(`✅ Spawn point found at: ${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)}`);
                
                if (this.sceneManager.playerController) {
                    this.sceneManager.playerController.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
                    this.sceneManager.playerController.velocity.set(0, 0, 0);
                }
            } else {
                console.warn('⚠️ No spawn point found! Keeping default position.');
            }

            // 6. Скрываем индикатор загрузки
            this.loading.style.display = 'none';
            this.isInitialized = true;
            
            console.log('✅ Blame! Generator ready!');
            
            // 7. Запускаем цикл рендеринга
            this.animate();
            
        } catch (error) {
            console.error('❌ Initialization error:', error);
            this.loading.textContent = 'Ошибка загрузки! Проверьте консоль.';
            this.loading.style.color = '#ff4444';
        }
    }

    /**
     * Обновление чанков вокруг камеры
     */
    updateChunks() {
        if (!this.chunkManager || !this.sceneManager) return;
        
        const cameraPos = this.sceneManager.camera.position;
        const config = this.controlPanel.getConfig();
        
        this.chunkManager.update(cameraPos, config);
    }

    /**
     * Обработчик изменения конфигурации из панели
     * @param {Object} config 
     */
    onConfigChange(config) {
        console.log('️ Config changed, regenerating world...');
        
        // Обновляем настройки сцены (туман, фон, тени)
        this.sceneManager.updateConfig({
            backgroundColor: config.backgroundColor,
            fogDensity: config.fogDensity,
            enableShadows: config.enableShadows
        });
        
        // Пересоздаем все чанки с новыми параметрами
        this.chunkManager.clear();
        this.updateChunks();
    }

    /**
     * Цикл анимации и рендеринга
     */
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // === КРИТИЧЕСКИ ВАЖНО: Обновляем OrbitControls каждый кадр ===
        // Без этого камера не обновляет свои матрицы, что приводит к ошибкам
        // при получении позиции и рендеринге
        if (this.sceneManager && this.sceneManager.controls) {
            this.sceneManager.controls.update();
        }
        // ============================================================
        
        // Обновляем чанки при движении камеры
        if (this.isInitialized) {
            this.updateChunks();
        }
        
        // Рендерим сцену
        this.sceneManager.render();
    }
}

// Запускаем приложение когда DOM готов
document.addEventListener('DOMContentLoaded', () => {
    new App();
});

export default App;
