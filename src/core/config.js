// @ts-check
/**
 * Конфигурация мира Blame! Industrial Landscape Generator
 * Все параметры управляются через панель lil-gui и передаются в генератор чанков
 */

/**
 * @typedef {Object} Config
 * @property {number} seed - Сид мира для детерминированной генерации
 * @property {number} chunkSize - Размер чанка в мировых единицах
 * @property {number} gridSize - Размер логической сетки комнат внутри чанка
 * @property {number} levelHeight - Высота одного яруса (платформы)
 * @property {number} yMin - Минимальная высота мира (нижний ярус) [ИЗМЕНЕНО: было zMin]
 * @property {number} yMax - Максимальная высота мира (верхний ярус) [ИЗМЕНЕНО: было zMax]
 * @property {number} viewChunksXY - Радиус видимых чанков по X/Y
 * @property {number} viewChunksZ - Радиус видимых чанков по Z (глубина)
 * 
 * // Layout параметры
 * @property {number} roomDensity - Плотность комнат [0-1]
 * @property {number} wallDensity - Плотность стен [0-1]
 * @property {number} pillarDensity - Плотность колонн [0-1]
 * @property {number} minRoomSize - Минимальный размер комнаты в ячейках
 * @property {number} maxRoomSize - Максимальный размер комнаты в ячейках
 * @property {number} minConnectionsPerRoom - Минимум соединений на комнату
 * @property {number} platformThickness - Толщина платформы
 * 
 * // Connections параметры
 * @property {number} bridgeChance - Шанс появления моста между комнатами
 * @property {Object} bridgeWeights - Веса подтипов мостов
 * @property {number} stairsChance - Шанс появления лестницы
 * @property {Object} stairsWeights - Веса подтипов лестниц
 * @property {number} rampChance - Шанс появления рампы
 * @property {number} elevatorChance - Шанс появления лифта
 * @property {number} portalChance - Шанс появления портала
 * @property {boolean} forceEdgeAgreement - Принудительное согласование границ
 * 
 * // MegaStructures параметры
 * @property {number} megaBlockChance - Шанс появления монолита
 * @property {number} megaBlockMinHeight - Минимальная высота монолита (в ярусах)
 * @property {number} megaBlockMaxHeight - Максимальная высота монолита (в ярусах)
 * 
 * // Pierce параметры
 * @property {number} scatterDensity - Плотность протыкающих фигур
 * @property {Object} pierceWeights - Веса типов протыкающих фигур
 * @property {number} pierceMinHeight - Минимальная высота протыкающей фигуры
 * @property {number} pierceMaxHeight - Максимальная высота протыкающей фигуры
 * @property {number} pierceMaxTilt - Максимальный наклон протыкающей фигуры (градусы)
 * @property {number} pierceDepth - Глубина прохождения сквозь ярусы
 * @property {number} pierceExitChunk - Шанс выхода за пределы чанка
 * 
 * // Decor параметры
 * @property {Object} decorDensity - Плотности различных типов декора
 * @property {number} glowChance - Шанс светящегося элемента
 * @property {number} microDensity - Плотность микро-декора
 * @property {boolean} enableMicro - Включить микро-декор
 * 
 * // Prefabs параметры
 * @property {boolean} enablePrefabs - Включить библиотеку префабов
 * @property {Object} prefabWeights - Веса ролей префабов
 * @property {number} maxPrefabsPerChunk - Максимум префабов на чанк
 * @property {string} rarityFilter - Фильтр редкости (all/common/rare/epic)
 * 
 * // Look параметры
 * @property {string} palette - Название активной палитры
 * @property {number} fogDensity - Плотность тумана
 * @property {string} backgroundColor - Цвет фона
 * @property {string} shadingMode - Режим затенения (basic/lambert/standard)
 * @property {boolean} enableShadows - Включить тени
 * @property {boolean} enableVignette - Включить виньетку
 * 
 * // Performance параметры
 * @property {boolean} useWorker - Использовать Web Worker для генерации
 * @property {number} cacheSize - Размер LRU-кэша чанков
 * @property {number} maxInstancesPerChunk - Максимум инстансов на чанк
 * @property {number} lodNear - LOD для ближних чанков
 * @property {number} lodMid - LOD для средних чанков
 * @property {number} lodFar - LOD для дальних чанков
 * @property {number} maxSegments - Максимум сегментов для цилиндров/конусов
 * 
 * // Debug / Tuning параметры
 * @property {number} stairTwistOffset - Смещение поворота лестниц вокруг вертикальной оси (градусы)
 * @property {number} stairTiltOffset - Смещение угла наклона лестниц (градусы)
 */

/**
 * Конфигурация по умолчанию
 * @type {Config}
 */
export const defaultConfig = {
    // Seed & World
    seed: 12345,
    chunkSize: 100,
    gridSize: 10,
    levelHeight: 20,
    yMin: -100,   // ИЗМЕНЕНО: было zMin
    yMax: 100,    // ИЗМЕНЕНО: было zMax
    viewChunksXY: 3,
    viewChunksZ: 2,
    
    // Layout
    roomDensity: 0.3,
    wallDensity: 0.2,
    pillarDensity: 0.1,
    minRoomSize: 2,
    maxRoomSize: 5,
    minConnectionsPerRoom: 1,
    platformThickness: 4,
    
    // Connections
    bridgeChance: 0.4,
    bridgeWeights: {
        straight: 0.4,
        arched: 0.3,
        suspended: 0.2,
        tube: 0.1
    },
    
    stairsChance: 0.5,
    stairWidthRatio: 0.1,
    stepHeight: 1.5,
    stepDepth: 1.5,
    
    // Веса для высот лестниц (в уровнях ярусов)
    stairHeights: {
        oneLevel: 0.6,
        twoLevels: 0.3,
        threeLevels: 0.1
    },
    
    stairsWeights: {
        straight: 0.5,
        spiral: 0.3,
        zigzag: 0.2
    },
    
    rampChance: 0.2,
    elevatorChance: 0.1,
    portalChance: 0.05,
    forceEdgeAgreement: true,
    
    // MegaStructures
    megaBlockChance: 0.1,
    megaBlockMinHeight: 3,
    megaBlockMaxHeight: 8,
    
    // Pierce
    scatterDensity: 0.15,
    pierceWeights: {
        cylinder: 0.3,
        cone: 0.2,
        octahedron: 0.15,
        obelisk: 0.15,
        capsule: 0.1,
        spire: 0.1
    },
    pierceMinHeight: 20,
    pierceMaxHeight: 80,
    pierceMaxTilt: 15,
    pierceDepth: 3,
    pierceExitChunk: 0.3,
    
    // Decor
    decorDensity: {
        antennas: 0.05,
        spheres: 0.03,
        torus: 0.02,
        panels: 0.04,
        windows: 0.06,
        grilles: 0.03,
        brackets: 0.04,
        vents: 0.03,
        mushrooms: 0.02,
        crates: 0.05
    },
    glowChance: 0.1,
    microDensity: 0.1,
    enableMicro: true,
    
    // Prefabs
    enablePrefabs: true,
    prefabWeights: {
        platforms: 1.0,
        bridges: 0.8,
        stairs: 0.7,
        columns: 0.9,
        beams: 0.6,
        mega: 0.3,
        pierce: 0.5,
        decor: 0.4,
        micro: 0.2
    },
    maxPrefabsPerChunk: 100,
    rarityFilter: 'all',
    
    // Look
    palette: 'blame',
    fogDensity: 0.008,
    backgroundColor: '#0a0a0a',
    shadingMode: 'lambert',
    enableShadows: false,
    enableVignette: false,
    
    // Performance
    useWorker: true,
    cacheSize: 50,
    maxInstancesPerChunk: 30000,
    lodNear: 1,
    lodMid: 2,
    lodFar: 3,
    maxSegments: 16,

    // === DEBUG / TUNING (для ручной настройки лестниц) ===
    stairTwistOffset: 0,   // Смещение поворота вокруг вертикальной оси (градусы)
    stairTiltOffset: 0,    // Смещение угла наклона (градусы)
    
    // === STAIR DEBUG VISUALS (Маркеры для диагностики совпадения с линиями) ===
    showStairStarts: false,      // Зеленые сферы в точках старта
    showStairEnds: false,        // Синие сферы в точках финиша
    showStairCenters: false,     // Желтые сферы в расчетных центрах мешей
    
    // === STAIR GEOMETRY CORRECTIONS (Коррекция геометрии без изменения углов) ===
    stairPivotOffsetX: 0,        // Смещение центра лестницы вдоль её оси (единицы мира)
    stairPivotOffsetY: 0,        // Смещение центра лестницы перпендикулярно оси (единицы мира)
    stairLengthScale: 1.0        // Масштабирование длины лестницы (1.0 = оригинал)
};

/**
 * Доступные цветовые палитры
 */
export const palettes = {
    blame: {
        base: '#2a2a2a',
        baseLight: '#3a3a3a',
        baseDark: '#1a1a1a',
        accent: '#4a4a4a',
        glow: '#ff6600',
        shadow: '#0a0a0a'
    },
    rusted: {
        base: '#4a3728',
        baseLight: '#5c4533',
        baseDark: '#3a2a1f',
        accent: '#8b4513',
        glow: '#ff4500',
        shadow: '#1a0f0a'
    },
    coldSpace: {
        base: '#1a2a3a',
        baseLight: '#2a3a4a',
        baseDark: '#0a1a2a',
        accent: '#4a6a8a',
        glow: '#00ffff',
        shadow: '#050a0f'
    },
    sandCity: {
        base: '#8b7355',
        baseLight: '#a08968',
        baseDark: '#6b5344',
        accent: '#d4a574',
        glow: '#ffd700',
        shadow: '#3a2a1a'
    },
    neonCyber: {
        base: '#1a1a2e',
        baseLight: '#2a2a3e',
        baseDark: '#0a0a1e',
        accent: '#ff00ff',
        glow: '#00ff00',
        shadow: '#050510'
    },
    concrete: {
        base: '#5a5a5a',
        baseLight: '#6a6a6a',
        baseDark: '#4a4a4a',
        accent: '#7a7a7a',
        glow: '#ffffff',
        shadow: '#2a2a2a'
    },
    oxidized: {
        base: '#2a4a3a',
        baseLight: '#3a5a4a',
        baseDark: '#1a3a2a',
        accent: '#4a8a6a',
        glow: '#00ff88',
        shadow: '#0a1a10'
    },
    bloodMetal: {
        base: '#3a1a1a',
        baseLight: '#4a2a2a',
        baseDark: '#2a0a0a',
        accent: '#8a2a2a',
        glow: '#ff0000',
        shadow: '#1a0505'
    }
};

/**
 * Получить активную палитру по имени
 * @param {string} paletteName - Название палитры
 * @returns {Object|null} Объект палитры или null если не найдена
 */
export function getPalette(paletteName) {
    return palettes[paletteName] || palettes.blame;
}

/**
 * Получить список всех доступных палитр
 * @returns {string[]} Массив названий палитр
 */
export function getPaletteNames() {
    return Object.keys(palettes);
}

export default defaultConfig;
