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

            // 6. ВКЛЮЧАЕМ DEBUG HUD
            const debugHud = document.getElementById('debug-hud');
            if (debugHud) {
                debugHud.style.display = 'block';
            }

            // 7. Скрываем индикатор загрузки
            this.loading.style.display = 'none';
            this.isInitialized = true;
            
            console.log('✅ Blame! Generator ready!');
            
            // 8. Запускаем цикл рендеринга
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
        
        const pos = this.sceneManager.playerController 
            ? this.sceneManager.playerController.position 
            : this.sceneManager.camera.position;
            
        const config = this.controlPanel.getConfig();
        this.chunkManager.update(pos, config);

        // === НОВОЕ: Обновляем кэш коллизий для игрока ===
        if (this.sceneManager.playerController) {
            this.sceneManager.playerController.updateCollisionCache(
                this.chunkManager.activeChunks,
                pos,
                config.chunkSize
            );
        }
        // ==============================================
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
        
        if (this.isInitialized) {
            this.updateChunks();
            this.updateDebugHUD(); // Обновляем HUD каждый кадр
        }
        
        this.sceneManager.render();
    }

    /**
     * Обновление данных в Debug HUD
     */
    updateDebugHUD() {
        const pc = this.sceneManager?.playerController;
        const cm = this.chunkManager;
        if (!pc || !cm) return;
        
        // Теперь мы не можем легко получить Floor Y без дублирования логики Raycast,
        // поэтому просто покажем состояние.
        // Или можно добавить метод getPlayerFloorHeight() в контроллер.
        
        let stateText = '❓ UNKNOWN';
        let statusClass = '';
        if (pc.onLadder) { stateText = '🪜 ON LADDER'; statusClass = 'status-warn'; }
        else if (pc.onGround) { stateText = '✅ ON GROUND'; statusClass = 'status-ok'; }
        else { stateText = '⬇️ FALLING'; statusClass = 'status-error'; }
        
        const hudState = document.getElementById('hud-state');
        if (hudState) {
            hudState.textContent = stateText;
            hudState.className = `hud-value ${statusClass}`;
        }
        
        // Остальные поля можно оставить, но Floor Y теперь неактуален в старом виде
        const hudPos = document.getElementById('hud-pos');
        if (hudPos) hudPos.textContent = `${pc.position.x.toFixed(1)}, ${pc.position.y.toFixed(1)}, ${pc.position.z.toFixed(1)}`;
        
        // HeightMap size все еще полезен для отладки генерации
        const hudMap = document.getElementById('hud-map');
        if (hudMap) hudMap.textContent = cm.heightMap?.size || 0;
    }
}

// Запускаем приложение когда DOM готов
document.addEventListener('DOMContentLoaded', () => {
    new App();
});

export default App;
