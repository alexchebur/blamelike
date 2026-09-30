// @ts-check
/**
 * Главная точка входа приложения Blame! Industrial Landscape Generator
 * Инициализирует сцену, менеджер чанков, панель управления и запускает цикл рендеринга
 */
import SceneManager from './render/sceneManager.js';
import ControlPanel from './ui/controlPanel.js';
import ChunkManager from './world/chunkManager.js';

// ... imports

class App {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.loading = document.getElementById('loading');
        this.sceneManager = null;
        this.controlPanel = null;
        this.chunkManager = null;
        this.isInitialized = false;
        this.init();
    }

    async init() {
        try {
            console.log('🚀 Initializing Blame! Generator...');
            
            this.sceneManager = new SceneManager(this.container);
            console.log('✅ SceneManager initialized');
            
            this.chunkManager = new ChunkManager(this.sceneManager);
            console.log('✅ ChunkManager initialized');
            
            this.controlPanel = new ControlPanel(
                this.sceneManager,
                this.chunkManager,
                (config) => this.onConfigChange(config)
            );
            
            // 1. Загружаем начальные чанки
            this.updateChunks();
            
            // 2. НАХОДИМ ТОЧКУ СПАВНА
            const spawnPos = this.chunkManager.findSpawnPoint(new THREE.Vector3(0, 0, 0));
            
            if (spawnPos) {
                console.log(`✅ Spawn point found at: ${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)}`);
                
                // Телепортируем камеру игрока
                if (this.sceneManager.playerController) {
                    this.sceneManager.playerController.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
                    // Сбрасываем скорость, чтобы не было инерции падения
                    this.sceneManager.playerController.velocity.set(0, 0, 0);
                }
            } else {
                console.warn('⚠️ No spawn point found! Keeping default position.');
            }

            this.loading.style.display = 'none';
            this.isInitialized = true;
            console.log('✅ Blame! Generator ready!');
            
            this.animate();
        } catch (error) {
            console.error('❌ Initialization error:', error);
            this.loading.textContent = 'Ошибка загрузки! Проверьте консоль.';
            this.loading.style.color = '#ff4444';
        }
    }

    updateChunks() {
        if (!this.chunkManager || !this.sceneManager) return;
        // Используем позицию камеры из контроллера, если он есть, иначе дефолтную
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
