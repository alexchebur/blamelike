// @ts-check
/**
 * Главная точка входа приложения Blame! Industrial Landscape Generator
 */
import * as THREE from 'three';
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

    /**
     * Инициализация приложения
     */
    async init() {
        try {
            console.log('🚀 Initializing Blame! Generator...');
            
            // 1. Создаем менеджер сцены (Three.js)
            this.sceneManager = new SceneManager(this.container);
            console.log('✅ SceneManager initialized');
            
            // 2. Создаем менеджер чанков (стриминг мира)
            this.chunkManager = new ChunkManager(this.sceneManager);
            console.log('✅ ChunkManager initialized');

            // 3. Создаем панель управления
            this.controlPanel = new ControlPanel(
                this.sceneManager,
                this.chunkManager,
                (config) => this.onConfigChange(config)
            );
            console.log('✅ ControlPanel initialized');

            // === ВАЖНО: Связываем ChunkManager с PlayerController ===
            if (this.sceneManager.playerController) {
                // Передаем ссылку на chunkManager внутрь sceneManager, 
                // чтобы playerController мог его видеть через sceneManager
                this.sceneManager.chunkManager = this.chunkManager;
                console.log('✅ PlayerController linked to ChunkManager');
            }
            // =========================================================
            
            // 4. Запускаем стриминг чанков вокруг начальной позиции камеры
            // Это заполнит heightMap в chunkManager, необходимый для спавна
            this.updateChunks();
            
            // Небольшая задержка, чтобы гарантировать обработку всех микрозадач генерации
            await new Promise(resolve => setTimeout(resolve, 0));

            // 5. Находим точку спавна
            const spawnPos = this.chunkManager.findSpawnPoint(new THREE.Vector3(0, 0, 0));
            
            if (spawnPos && this.sceneManager.playerController) {
                console.log(`✅ Spawn point found at: ${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)}`);
                
                // Телепортируем игрока
                this.sceneManager.playerController.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
                // Сбрасываем скорость, чтобы не было инерции падения при старте
                this.sceneManager.playerController.velocity.set(0, 0, 0);
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
        
        // Используем позицию игрока, если он есть, иначе позицию камеры
        const pos = this.sceneManager.playerController 
            ? this.sceneManager.playerController.position 
            : this.sceneManager.camera.position;
            
        const config = this.controlPanel.getConfig();
        this.chunkManager.update(pos, config);
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
        
        // Обновляем чанки при движении камеры/игрока
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
