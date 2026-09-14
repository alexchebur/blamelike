// @ts-check
/**
 * Панель управления параметрами генерации (lil-gui)
 * Позволяет менять настройки мира в реальном времени
 */

import GUI from 'lil-gui';
import defaultConfig, { getPaletteNames } from '../core/config.js';

class ControlPanel {
    /**
     * @param {import('../render/sceneManager.js').default} sceneManager 
     * @param {import('../world/chunkManager.js').default} chunkManager 
     * @param {(config: Object) => void} onChange - колбэк при изменении настроек
     */
    constructor(sceneManager, chunkManager, onChange) {
        this.sceneManager = sceneManager;
        this.chunkManager = chunkManager;
        this.onChange = onChange;
        
        // Глубокая копия конфига для редактирования
        this.config = JSON.parse(JSON.stringify(defaultConfig));
        
        this.gui = null;
        
        this.init();
    }
    
    /**
     * Инициализация панели управления
     */
    init() {
        this.gui = new GUI({ title: 'Blame! Generator' });
        
        // --- Seed & World ---
        const worldFolder = this.gui.addFolder('Seed & World');
        worldFolder.add(this.config, 'seed', 0, 99999, 1).name('Seed');
        worldFolder.add(this.config, 'chunkSize', 50, 200, 10).name('Chunk Size');
        worldFolder.add(this.config, 'gridSize', 5, 20, 1).name('Grid Size');
        worldFolder.add(this.config, 'levelHeight', 10, 50, 5).name('Level Height');
        worldFolder.add(this.config, 'zMin', -200, 0, 10).name('Z Min');
        worldFolder.add(this.config, 'zMax', 0, 200, 10).name('Z Max');
        worldFolder.add(this.config, 'viewChunksXY', 1, 5, 1).name('View Chunks XY');
        worldFolder.add(this.config, 'viewChunksZ', 1, 5, 1).name('View Chunks Z');
        
        // --- Layout ---
        const layoutFolder = this.gui.addFolder('Layout');
        layoutFolder.add(this.config, 'roomDensity', 0, 1, 0.05).name('Room Density');
        layoutFolder.add(this.config, 'wallDensity', 0, 1, 0.05).name('Wall Density');
        layoutFolder.add(this.config, 'pillarDensity', 0, 1, 0.05).name('Pillar Density');
        layoutFolder.add(this.config, 'platformThickness', 1, 5, 0.5).name('Platform Thick');
        
        // --- Look ---
        const lookFolder = this.gui.addFolder('Look');
        lookFolder.add(this.config, 'palette', getPaletteNames()).name('Palette')
            .onChange(() => this.applyChanges());
        lookFolder.add(this.config, 'fogDensity', 0.001, 0.02, 0.001).name('Fog Density')
            .onChange(() => this.applyChanges());
        lookFolder.addColor(this.config, 'backgroundColor').name('Background')
            .onChange(() => this.applyChanges());
        lookFolder.add(this.config, 'shadingMode', ['basic', 'lambert', 'standard']).name('Shading');
        lookFolder.add(this.config, 'enableShadows').name('Shadows')
            .onChange(() => this.applyChanges());
            
        // --- Performance ---
        const perfFolder = this.gui.addFolder('Performance');
        perfFolder.add(this.config, 'maxInstancesPerChunk', 5000, 50000, 1000).name('Max Instances');
        perfFolder.add(this.config, 'cacheSize', 10, 100, 5).name('Cache Size');
        
        // --- Actions ---
        const actionsFolder = this.gui.addFolder('Actions');
        actionsFolder.add({ regenerate: () => this.onRegenerate() }, 'regenerate').name('🎲 Regenerate');
        actionsFolder.add({ newSeed: () => this.onNewSeed() }, 'newSeed').name('🎲 New Seed');
        
        // Открываем основные папки
        worldFolder.open();
        lookFolder.open();
    }
    
    /**
     * Применение визуальных изменений (без перегенерации)
     */
    applyChanges() {
        this.sceneManager.updateConfig({
            backgroundColor: this.config.backgroundColor,
            fogDensity: this.config.fogDensity,
            enableShadows: this.config.enableShadows
        });
    }
    
    /**
     * Полная регенерация мира (смена сида или параметров генерации)
     */
    onRegenerate() {
        console.log('⚙️ Regenerating world...');
        if (this.onChange) {
            this.onChange(this.config);
        }
    }
    
    /**
     * Генерация нового случайного сида
     */
    onNewSeed() {
        this.config.seed = Math.floor(Math.random() * 99999);
        // Обновляем отображение в GUI
        for (const c of this.gui.controllers) {
            if (c.property === 'seed') {
                c.updateDisplay();
            }
        }
        this.onRegenerate();
    }
    
    /**
     * Получение текущей конфигурации
     * @returns {Object}
     */
    getConfig() {
        return { ...this.config };
    }
}

export default ControlPanel;
