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

    async init() {
        try {
            console.log('🚀 Initializing Blame! Generator...');
            
            // 1. Create SceneManager (starts Physics WASM loading)
            this.sceneManager = new SceneManager(this.container);
            console.log('✅ SceneManager initialized');
            
            // === WAIT FOR PHYSICS (RAPIER WASM) TO LOAD ===
            await this.sceneManager.physicsManager.waitForReady();
            console.log('✅ Physics Engine (Rapier) ready');
            // =================================================

            // 2. Create ChunkManager
            this.chunkManager = new ChunkManager(this.sceneManager);
            console.log('✅ ChunkManager initialized');

            // 3. Create ControlPanel
            this.controlPanel = new ControlPanel(
                this.sceneManager,
                this.chunkManager,
                (config) => this.onConfigChange(config)
            );
            console.log('✅ ControlPanel initialized');

            // Link ChunkManager
            if (this.sceneManager.playerController) {
                this.sceneManager.chunkManager = this.chunkManager;
                console.log('✅ PlayerController linked to ChunkManager');
            }
            
            // 4. Initial Chunk Load
            this.updateChunks();
            
            // Small delay to ensure chunks are processed
            await new Promise(resolve => setTimeout(resolve, 0));

            // 5. Find Spawn Point & Teleport Player
            const spawnPos = this.chunkManager.findSpawnPoint(new THREE.Vector3(0, 0, 0));
            
            if (spawnPos && this.sceneManager.physicsManager.playerBody) {
                console.log(`✅ Spawn point found at: ${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)}`);
                
                // Teleport Rapier body
                this.sceneManager.physicsManager.playerBody.setTranslation({
                    x: spawnPos.x,
                    y: spawnPos.y,
                    z: spawnPos.z
                }, true);
                
                // Reset velocity
                this.sceneManager.physicsManager.playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
            } else {
                console.warn('⚠️ No spawn point found or Physics not ready!');
            }

            // 6. Show Debug HUD
            const debugHud = document.getElementById('debug-hud');
            if (debugHud) {
                debugHud.style.display = 'block';
            }

            // 7. Hide Loading
            this.loading.style.display = 'none';
            this.isInitialized = true;
            
            console.log('✅ Blame! Generator ready!');
            
            // 8. Start Loop
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
        let pos;
        if (this.sceneManager.playerController) {
            // Для Cannon-es берем позицию из физического тела
            if (this.sceneManager.playerController.body) {
                pos = new THREE.Vector3().copy(this.sceneManager.playerController.body.position);
            } else {
                pos = this.sceneManager.playerController.position;
            }
        } else {
            pos = this.sceneManager.camera.position;
        }
            
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
        
        // Очищаем физический мир перед перегенерацией
        if (this.sceneManager.clearPhysics) {
            this.sceneManager.clearPhysics();
        }

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
        const pm = this.sceneManager?.physicsManager;
        
        if (!pc || !cm) return;

        // State
        let stateText = '❓ UNKNOWN';
        let statusClass = '';
        
        // Для Cannon-es проверяем onGround флаг из контроллера
        if (pc.onGround) { 
            stateText = '✅ ON GROUND'; 
            statusClass = 'status-ok'; 
        } else {
            stateText = '⬇️ FALLING'; 
            statusClass = 'status-error';
        }
        
        const hudState = document.getElementById('hud-state');
        if (hudState) {
            hudState.textContent = stateText;
            hudState.className = `hud-value ${statusClass}`;
        }

        // Position (берем из физического тела)
        const hudPos = document.getElementById('hud-pos');
        if (hudPos) {
            const p = pc.body ? pc.body.position : pc.position;
            hudPos.textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
        }

        // HeightMap Size
        const hudMap = document.getElementById('hud-map');
        if (hudMap) hudMap.textContent = cm.heightMap?.size || 0;
        
        // Physics Bodies Count (для отладки)
        const hudFloor = document.getElementById('hud-floor');
        if (hudFloor && pm) {
            hudFloor.textContent = `Bodies: ${pm.totalBodies || 0}`;
        }
    }
}

// Запускаем приложение когда DOM готов
document.addEventListener('DOMContentLoaded', () => {
    new App();
});

export default App;
