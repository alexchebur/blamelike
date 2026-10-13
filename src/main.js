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
            
            // 1. Инициализация менеджеров (Cannon-es готов сразу после new)
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

            // Связываем чанк-менеджер с контроллером для доступа к физике
            if (this.sceneManager.playerController) {
                this.sceneManager.chunkManager = this.chunkManager;
                console.log('✅ PlayerController linked to ChunkManager');
            }
            
            // 2. Первая загрузка чанков (синхронно создает физические тела)
            this.updateChunks();
            
            // Даем браузеру отрисовать первый кадр и обработать микрозадачи
            await new Promise(resolve => requestAnimationFrame(() => resolve()));

            // 3. Спавн игрока
            const spawnPos = this.chunkManager.findSpawnPoint(new THREE.Vector3(0, 0, 0));
            const pm = this.sceneManager.physicsManager;
            
            // Проверяем наличие физического тела перед телепортацией
            if (spawnPos && pm && pm.playerBody) {
                console.log(`✅ Spawn point found at: ${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)}`);
                
                // Телепортируем физическое тело Cannon-es
                pm.playerBody.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
                pm.playerBody.velocity.set(0, 0, 0);
                pm.playerBody.angularVelocity.set(0, 0, 0);
            } else {
                console.warn('⚠️ No spawn point found or Physics body missing! Using default position.');
            }

            // 4. UI и старт
            const debugHud = document.getElementById('debug-hud');
            if (debugHud) debugHud.style.display = 'block';

            if (this.loading) {
                this.loading.style.display = 'none';
            }
            
            this.isInitialized = true;
            console.log('✅ Blame! Generator ready!');
            
            // Запускаем цикл только после полной инициализации
            this.animate();
            
        } catch (error) {
            console.error('❌ Initialization error:', error);
            if (this.loading) {
                this.loading.textContent = 'Ошибка загрузки! Проверьте консоль.';
                this.loading.style.color = '#ff4444';
            }
        }
    }

    /**
     * Обновление чанков вокруг камеры
     */
    updateChunks() {
        if (!this.chunkManager || !this.sceneManager || !this.controlPanel) return;
        
        let pos = this.sceneManager.camera?.position;
        
        // Безопасное получение позиции из физики
        if (this.sceneManager.playerController) {
            const pc = this.sceneManager.playerController;
            // Для Cannon-es берем позицию из физического тела
            if (pc.body && pc.body.position) {
                pos = pc.body.position; // Используем ссылку напрямую, чтобы избежать аллокации
            } else if (pc.position) {
                pos = pc.position;
            }
        }
            
        if (pos) {
            const config = this.controlPanel.getConfig();
            this.chunkManager.update(pos, config);
        }
    }

    /**
     * Обработчик изменения конфигурации из панели
     */
    onConfigChange(config) {
        console.log('⚙️ Config changed, regenerating world...');
        
        if (this.sceneManager) {
            this.sceneManager.updateConfig({
                backgroundColor: config.backgroundColor,
                fogDensity: config.fogDensity,
                enableShadows: config.enableShadows
            });
        }
        
        // Очищаем физический мир перед перегенерацией
        if (this.sceneManager?.clearPhysics) {
            this.sceneManager.clearPhysics();
        }

        // Пересоздаем все чанки
        if (this.chunkManager) {
            this.chunkManager.clear();
            this.updateChunks();
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (!this.isInitialized) return;

        try {
            // Проверяем существование менеджеров перед вызовом
            if (this.chunkManager && this.controlPanel) {
                this.updateChunks();
            }
            
            if (this.sceneManager) {
                this.updateDebugHUD();
                this.sceneManager.render();
            }
        } catch (e) {
            console.error('❌ Animation loop error:', e);
            // Можно временно раскомментировать для отладки:
            // debugger; 
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
        
        // Проверяем onGround только если свойство существует
        if (typeof pc.onGround === 'boolean') { 
            stateText = pc.onGround ? '✅ ON GROUND' : '⬇️ FALLING'; 
            statusClass = pc.onGround ? 'status-ok' : 'status-error';
        }
        
        const hudState = document.getElementById('hud-state');
        if (hudState) {
            hudState.textContent = stateText;
            hudState.className = `hud-value ${statusClass}`;
        }

        // Position
        const hudPos = document.getElementById('hud-pos');
        if (hudPos) {
            let p = null;
            // Безопасное получение позиции из физического тела
            if (pc.body && typeof pc.body.position !== 'undefined') {
                p = pc.body.position;
            } else if (pc.position) {
                p = pc.position;
            }
            
            if (p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number') {
                hudPos.textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
            }
        }

        // HeightMap Size
        const hudMap = document.getElementById('hud-map');
        if (hudMap && typeof cm.heightMap?.size === 'number') {
            hudMap.textContent = cm.heightMap.size;
        }
        
        // Physics Bodies Count - ЗАЩИТА ОТ ОШИБКИ .length
        const hudFloor = document.getElementById('hud-floor');
        if (hudFloor && pm) {
            // Проверяем, существует ли totalBodies и является ли числом
            const count = (typeof pm.totalBodies === 'number') ? pm.totalBodies : 0;
            hudFloor.textContent = `Bodies: ${count}`;
        }
    }
}

// Запускаем приложение когда DOM готов
document.addEventListener('DOMContentLoaded', () => {
    new App();
});

export default App;
