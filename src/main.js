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
        
        this.sceneManager = new SceneManager(this.container);
        console.log('✅ SceneManager initialized');
        
        this.chunkManager = new ChunkManager(this.sceneManager);
        console.log('✅ ChunkManager initialized');

        this.controlPanel = new ControlPanel(
            this.sceneManager,
            this.chunkManager,
            (config) => this.onConfigChange(config)
        );
        console.log('✅ ControlPanel initialized');

        if (this.sceneManager.playerController) {
            this.sceneManager.chunkManager = this.chunkManager;
            console.log('✅ PlayerController linked to ChunkManager');
        }
        
        this.updateChunks();
        await new Promise(resolve => setTimeout(resolve, 0));

        // В методе init() замените блок спавна на:
        const spawnPos = this.chunkManager.findSpawnPoint(new THREE.Vector3(0, 0, 0));
        if (spawnPos && this.sceneManager.physicsManager.playerBody) {
            console.log(`✅ Spawn point found at: ${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)}`);
    
            // Телепортируем физическое тело Cannon-es
            this.sceneManager.physicsManager.playerBody.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
            this.sceneManager.physicsManager.playerBody.velocity.set(0, 0, 0);
        } else {
            console.warn('⚠️ No spawn point found or Physics not ready!');
        }

        const debugHud = document.getElementById('debug-hud');
        if (debugHud) {
            debugHud.style.display = 'block';
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

    animate() {
        try {
            requestAnimationFrame(() => this.animate());
        
            if (this.isInitialized) {
                this.updateChunks();
                this.updateDebugHUD();
            }
        
            this.sceneManager.render();
        } catch (e) {
            console.error('❌ Animation loop error:', e);
            // Не прерываем цикл, просто логируем
        }
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
