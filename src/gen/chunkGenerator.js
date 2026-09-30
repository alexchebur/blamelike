// src/gen/chunkGenerator.js
// @ts-check
import { createRNG, hash3D } from '../core/rng.js';
import { chunkToBounds } from '../core/chunkKey.js';
import edgeAgreement from './edgeAgreement.js';
//import screenGenerator from './screenGenerator.js';



/**
 * Генерирует экраны, прикрепленные к нижней стороне платформ
 */
function generateScreensUnderPlatforms(platforms, cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { platformThickness } = config;
    
    // Плотность экранов (шанс появления экрана под платформой)
    const screenChance = config.decorDensity?.panels || 0.1; 
    const types = ['monitor', 'panel', 'display'];

    for (const platform of platforms) {
        // Нас интересуют только обычные платформы (type: 'box'), не лестницы
        if (platform.type !== 'box') continue;
        
        // Детерминированный шанс появления экрана
        const hash = hash3D(
            Math.floor(platform.position.x), 
            Math.floor(platform.position.y), 
            Math.floor(platform.position.z), 
            seed
        );
        
        if (hash < screenChance) {
            const type = types[Math.floor(hash * types.length)];
            
            // Позиция экрана: под платформой
            // Платформа имеет высоту platformThickness, центр в platform.position.y
            // Нижняя грань платформы: platform.position.y - platformThickness / 2
            // Экран вешаем чуть ниже нижней грани
            const screenOffset = 0.2; // Отступ от платформы
            const yPos = platform.position.y - (platformThickness / 2) - screenOffset;
            
            // Размеры экрана (чуть меньше платформы)
            const screenWidth = platform.scale.x * 0.8;
            const screenHeight = platform.scale.z * 0.8; // Используем Z как высоту текстуры
            
            primitives.push({
                type: 'screen',
                screenType: type,
                position: { 
                    x: platform.position.x, 
                    y: yPos, 
                    z: platform.position.z 
                },
                rotation: { 
                    tiltX: 85 + rng() * 10,     // Наклон 85-95° (почти вертикально, но с живым уклоном)
                    tiltY: 0, //rng() * 360,         // Случайный поворот вокруг вертикали
                    twistZ: 0  //(rng() - 0.5) * 10  // Легкий перекос для "индустриальной небрежности"
                },
                scale: { 
                    x: screenWidth, 
                    y: screenHeight, 
                    z: 1 
                },
                paletteSlot: 'glow',
                role: 'decor',
                flags: { emissive: true }
            });
        }
    }
    
    return primitives;
}

// ... (остальные функции generatePlatforms, generateRooms и т.д. без изменений) ...




// src/gen/chunkGenerator.js
// ... (предыдущий код остается без изменений)

/**
 * Этап G: Светящиеся экраны и панели
 */
function generateScreens(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { decorDensity } = config;
    
    // Используем плотность 'panels' из конфига, или задаем свою
    const screenDensity = 0.5; // Временно высокое значение для теста, было const screenDensity = decorDensity?.panels || 0.04;
    
    // Рассчитываем количество экранов на основе площади чанка
    const area = (bounds.max.x - bounds.min.x) * (bounds.max.z - bounds.min.z);
    const count = Math.floor(area * screenDensity / 500); // Делим на 500 для разумного количества
    
    const types = ['monitor', 'panel', 'display'];
    
    for (let i = 0; i < count; i++) {
        // Детерминированное решение о размещении каждого экрана
        const hash = hash3D(cx, cy, cz + i * 0.7, seed);
        
        if (hash < screenDensity) {
            const type = types[Math.floor(hash * types.length)];
            
            // Случайная позиция внутри чанка
            const wx = bounds.min.x + rng() * (bounds.max.x - bounds.min.x);
            const wy = bounds.min.y + rng() * (bounds.max.y - bounds.min.y);
            const wz = bounds.min.z + rng() * (bounds.max.z - bounds.min.z);
            
            // Случайные размеры экрана
            const screenWidth = 0.8 + rng() * 1.2;
            const screenHeight = 0.4 + rng() * 0.6;
            
            primitives.push({
                type: 'screen',
                screenType: type, // Важно! Передаем тип экрана
                position: { x: wx, y: wy, z: wz },
                rotation: { 
                    tiltX: (rng() - 0.5) * 30, // Небольшой случайный наклон
                    tiltY: rng() * 360,         // Случайный поворот вокруг Y
                    twistZ: 0 
                },
                scale: { 
                    x: screenWidth, 
                    y: screenHeight, 
                    z: 0.05 // Тонкая панель
                },
                paletteSlot: 'glow',
                role: 'decor',
                flags: { emissive: true }
            });
        }
    }
    console.log(`[ScreenGen] Chunk ${cx},${cy},${cz}: generated ${primitives.length} screens`);
    return primitives;
}



function generateArches(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { gridSize, levelHeight, roomDensity, wallDensity } = config;
    
    // Плотность арок берем из декораций или создадим новый параметр archChance
    const archChance = config.decorDensity?.antennas ? config.decorDensity.antennas * 2 : 0.1; 

    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        const yBase = level * levelHeight;
        
        for (let gx = 0; gx < gridSize - 1; gx++) {
            for (let gy = 0; gy < gridSize - 1; gy++) {
                // Проверяем наличие "комнаты" или свободного пространства
                const currentHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                
                if (currentHash < roomDensity && rng() < archChance) {
                    const wx = bounds.min.x + (gx + 0.5) * cellSize;
                    const wz = bounds.min.z + (gy + 0.5) * cellSize;
                    
                    // Арка ставится на уровень платформы
                    primitives.push({
                        type: 'arch',
                        position: { x: wx, y: yBase + (config.platformThickness || 0.5), z: wz },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize * 0.8, y: levelHeight * 0.6, z: cellSize * 0.8 },
                        paletteSlot: 'glow', // <-- ЯРКИЙ ЦВЕТ ДЛЯ ОТЛАДКИ
                        role: 'decor'
                    });
                }
            }
        }
    }
    return primitives;
}

export function generateChunk(cx, cy, cz, seed, config) {
    const primitives = [];
    const chunkSeed = hash3D(cx, cy, cz, seed);
    const rng = createRNG(Math.floor(chunkSeed * 1000000));
    const bounds = chunkToBounds(cx, cy, cz, config.chunkSize);
    const cellSize = config.chunkSize / config.gridSize;
    
    let instanceCount = 0;
    const maxInstances = config.maxInstancesPerChunk || 30000;

    // === ЭТАП A: Платформы + Встроенные лестницы (Y-up) ===
    const platforms = generatePlatforms(cx, cy, cz, seed, config, rng, bounds, cellSize);
    primitives.push(...platforms);
    instanceCount += platforms.length;

    // === ЭТАП B: Комнаты и стены (Y-up) ===
    if (instanceCount < maxInstances) {
        const rooms = generateRooms(cx, cy, cz, seed, config, rng, bounds, cellSize);
        primitives.push(...rooms);
        instanceCount += rooms.length;
    }

    // === ЭТАП C: Горизонтальные мосты (Y-up) ===
    if (instanceCount < maxInstances) {
        const connections = generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize);
        primitives.push(...connections);
        instanceCount += connections.length;
    }

    // === ЭТАП D: Монолиты (Y-up) ===
    if (instanceCount < maxInstances) {
        const mega = generateMegaStructures(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...mega);
        instanceCount += mega.length;
    }

    // === ЭТАП E: Протыкающие фигуры (Y-up) ===
    if (instanceCount < maxInstances) {
        const pierce = generatePierce(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...pierce);
        instanceCount += pierce.length;
    }
    // === ЭТАП F.5: Арки (для отладки) ===
    if (instanceCount < maxInstances) {
        const arches = generateArches(cx, cy, cz, seed, config, rng, bounds, cellSize);
        primitives.push(...arches);
        instanceCount += arches.length;
    }
    
    // === ЭТАП F: Декор (Y-up) ===
    if (instanceCount < maxInstances) {
        const decor = generateDecor(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...decor);
        instanceCount += decor.length;
    }
    // === ЭТАП G: Экраны и панели (ИСПРАВЛЕННЫЙ ВЫЗОВ) ===
    if (instanceCount < maxInstances) {
        // Вызываем ЛОКАЛЬНУЮ функцию, а не метод из screenGenerator
        const screens = generateScreens(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...screens);
        instanceCount += screens.length;
    }
    // === ЭТАП G: Экраны под платформами ===
    if (instanceCount < maxInstances) {
        // Передаем список платформ в генератор экранов
        const screens = generateScreensUnderPlatforms(platforms, cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...screens);
        instanceCount += screens.length;
    }
    
    return primitives;
}

/**
 * Этап A: Генерация платформ + ЛЕСТНИЦЫ ПО АЛГОРИТМУ "ПУСТОТА МЕЖДУ" (Y-up)
 */
function generatePlatforms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { levelHeight, platformThickness, gridSize, roomDensity, stairsChance } = config;
    
    // Диапазон уровней по Y (высота в системе Y-up)
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        const yBase = level * levelHeight; 
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const baseHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                if (baseHash >= roomDensity) continue;

                const wx = bounds.min.x + (gx + 0.5) * cellSize;
                const wz = bounds.min.z + (gy + 0.5) * cellSize; 
                
                // === АЛГОРИТМ ПОИСКА ЛЕСТНИЦЫ: [Платформа L] -> [Пусто L+1] -> [Платформа L+1] ===
                let stairType = null;
                
                if (level < endLevel && rng() < stairsChance) {
                    const targetLevel = level + 1;
                    
                    // Направления: [dx, dy, тип_лестницы]
                    const directions = [
                        { dx: 0, dy: -1, type: 'stair_south' }, // Юг (-Z)
                        { dx: 0, dy: 1, type: 'stair_north' },  // Север (+Z)
                        { dx: -1, dy: 0, type: 'stair_west' },  // Запад (-X)
                        { dx: 1, dy: 0, type: 'stair_east' }    // Восток (+X)
                    ];
                    
                    for (const dir of directions) {
                        const midX = gx + dir.dx;   // Промежуточная клетка (должна быть пустой на L+1)
                        const midY = gy + dir.dy;
                        const targetX = gx + dir.dx * 2; // Целевая клетка (должна быть занятой на L+1)
                        const targetY = gy + dir.dy * 2;

                        // Проверка границ грида для обеих клеток
                        if (targetX >= 0 && targetX < gridSize && targetY >= 0 && targetY < gridSize) {
                            // 1. Промежуток должен быть ПУСТЫМ на УРОВНЕ ВЫШЕ (L+1)
                            const midEmpty = hash3D(
                                cx * gridSize + midX, 
                                cy * gridSize + midY, 
                                targetLevel, 
                                seed
                            ) >= roomDensity;
                            
                            // 2. Цель должна быть ЗАНЯТА на УРОВНЕ ВЫШЕ (L+1)
                            const targetOccupied = hash3D(
                                cx * gridSize + targetX, 
                                cy * gridSize + targetY, 
                                targetLevel, 
                                seed
                            ) < roomDensity;
                            
                            if (midEmpty && targetOccupied) {
                                stairType = dir.type;
                                break; // Нашли первое подходящее направление по паттерну
                            }
                        }
                    }
                }

                if (stairType) {
                    // === ПЛАТФОРМА С ЛЕСТНИЦЕЙ ===
                    // КЛЮЧЕВОЙ МОМЕНТ: Передаем params для корректной сборки геометрии
                    primitives.push({
                        type: stairType,
                        position: { x: wx, y: yBase, z: wz }, 
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: levelHeight, z: cellSize },
                        paletteSlot: 'accent',
                        role: 'connector',
                        params: { platformThickness, levelHeight } // <-- Для фабрики
                    });
                } else {
                    // === ОБЫЧНАЯ ПЛАТФОРМА ===
                    primitives.push({
                        type: 'box',
                        position: { x: wx, y: yBase + platformThickness / 2, z: wz },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: platformThickness, z: cellSize },
                        paletteSlot: 'base',
                        role: 'frame'
                    });
                }
            }
        }
    }
    return primitives;
}

function generateRooms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { wallDensity, pillarDensity, levelHeight, gridSize, roomDensity, platformThickness } = config;
    
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);
    
    for (let level = startLevel; level <= endLevel; level++) {
        // Пропускаем уровень целиком, если он не активен
        if (hash3D(cx, cy, level, seed) > roomDensity) continue;
        
        const yBase = level * levelHeight;
        const yWallCenter = yBase + platformThickness + (levelHeight - platformThickness) / 2; 
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const wx = bounds.min.x + (gx + 0.5) * cellSize;
                const wz = bounds.min.z + (gy + 0.5) * cellSize;
                
                // Проверяем, занята ли эта ячейка комнатой
                const baseHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                const isRoom = baseHash < roomDensity;
                
                // === ИСПРАВЛЕНИЕ: Стены только внутри комнат ===
                const wallHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level + 0.5, seed);
                if (isRoom && wallHash < wallDensity) {
                    primitives.push({
                        type: 'box',
                        position: { x: wx, y: yWallCenter, z: wz },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize * 0.9, y: levelHeight, z: cellSize * 0.1 },
                        paletteSlot: 'baseDark',
                        role: 'frame'
                    });
                }
                
                // === ИСПРАВЛЕНИЕ: Колонны только внутри комнат ===
                const pillarHash = hash3D(cx * gridSize + gx + 0.5, cy * gridSize + gy + 0.5, level, seed);
                if (isRoom && pillarHash < pillarDensity) {
                    primitives.push({
                        type: 'cylinder',
                        position: { x: wx, y: yWallCenter, z: wz },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize * 0.15, y: levelHeight, z: cellSize * 0.15 },
                        paletteSlot: 'accent',
                        role: 'frame'
                    });
                }
            }
        }
    }
    return primitives;
}

// src/gen/chunkGenerator.js

/**
 * Этап C: Горизонтальные мосты (Y-up) с проверкой непосредственного соседства
 */
function generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { gridSize, levelHeight, roomDensity, bridgeChance } = config;
    
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        const currentYBase = level * levelHeight;
        
        // 1. Строим карту занятости уровня
        const gridMap = new Map(); 
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const isOccupied = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed) < roomDensity;
                gridMap.set(`${gx},${gy}`, isOccupied);
            }
        }

        // 2. Заполняем пустые клетки мостами ТОЛЬКО если они между непосредственными соседями
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const key = `${gx},${gy}`;
                
                // Пропускаем занятые клетки
                if (gridMap.get(key)) continue;

                // Проверяем НЕПОСРЕДСТВЕННЫХ соседей (dx=1, dy=0 и т.д.)
                const hasWest = gridMap.get(`${gx-1},${gy}`);
                const hasEast = gridMap.get(`${gx+1},${gy}`);
                const hasSouth = gridMap.get(`${gx},${gy-1}`);
                const hasNorth = gridMap.get(`${gx},${gy+1}`);

                let bridgeType = null;

                // Соединение Восток-Запад: только если слева И справа есть платформы
                // И они являются непосредственными соседями (что гарантировано проверкой gx-1 и gx+1)
                if (hasWest && hasEast) {
                    bridgeType = 'bridge_ew';
                } 
                // Соединение Север-Юг: только если сверху И снизу есть платформы
                else if (hasNorth && hasSouth) {
                    bridgeType = 'bridge_ns';
                }
                // Случайные Т-образные ответвления (опционально, можно убрать если нужно только сквозное соединение)
                else if (rng() < bridgeChance * 0.5) { // Уменьшил шанс для Т-образных, чтобы не захламлять
                    if (hasWest || hasEast) bridgeType = 'bridge_ew';
                    else if (hasNorth || hasSouth) bridgeType = 'bridge_ns';
                }

                if (bridgeType) {
                    const wx = bounds.min.x + (gx + 0.5) * cellSize;
                    const wz = bounds.min.z + (gy + 0.5) * cellSize;
                    
                    primitives.push({
                        type: bridgeType,
                        position: { x: wx, y: currentYBase + (config.platformThickness || 0.5) + 0.05, z: wz }, 
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: 1, z: cellSize }, 
                        paletteSlot: 'accent',
                        role: 'connector'
                    });
                }
            }
        }
    }
    
    return primitives;
}



function generateMegaStructures(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { megaBlockChance, megaBlockMinHeight, megaBlockMaxHeight, levelHeight } = config;
    
    for (let i = 0; i < 3; i++) {
        if (hash3D(cx, cy, cz + i*0.3, seed) < megaBlockChance) {
            const h = (megaBlockMinHeight + rng()*(megaBlockMaxHeight-megaBlockMinHeight)) * levelHeight;
            primitives.push({
                type: 'box',
                position: { 
                    x: bounds.min.x + rng()*(bounds.max.x-bounds.min.x), 
                    y: bounds.min.y + h/2, 
                    z: bounds.min.z + rng()*(bounds.max.z-bounds.min.z) 
                },
                rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                scale: { x: 10+rng()*20, y: h, z: 10+rng()*20 },
                paletteSlot: 'baseDark',
                role: 'frame'
            });
        }
    }
    return primitives;
}

function generatePierce(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { scatterDensity, pierceWeights, pierceMinHeight, pierceMaxHeight, pierceMaxTilt } = config;
    if (!pierceWeights) return primitives;

    const area = (bounds.max.x-bounds.min.x) * (bounds.max.z-bounds.min.z);
    const count = Math.floor(area * scatterDensity / 1000);
    
    const types = Object.entries(pierceWeights).map(([t,w]) => ({item:t, weight:w}));
    const totalW = types.reduce((s,t) => s+t.weight, 0);

    for (let i=0; i<count; i++) {
        if (hash3D(cx, cy, cz+i*0.7, seed) < scatterDensity) {
            let r = rng()*totalW, sel='cylinder';
            for (const t of types) { r-=t.weight; if(r<=0){sel=t.item; break;} }
            
            const h = pierceMinHeight + rng()*(pierceMaxHeight-pierceMinHeight);
            primitives.push({
                type: sel,
                position: { 
                    x: bounds.min.x + rng()*(bounds.max.x-bounds.min.x), 
                    y: bounds.min.y + h/2, 
                    z: bounds.min.z + rng()*(bounds.max.z-bounds.min.z) 
                },
                rotation: { 
                    tiltX: (rng()-0.5)*2*pierceMaxTilt, 
                    tiltY: (rng()-0.5)*2*pierceMaxTilt, 
                    twistZ: 0 
                },
                scale: { x: 2+rng()*3, y: h, z: 2+rng()*3 },
                paletteSlot: 'accent',
                role: 'pierce'
            });
        }
    }
    return primitives;
}

// src/gen/chunkGenerator.js
/**
 * Этап F: Декор (Y-up)
 */
// src/gen/chunkGenerator.js

function generateDecor(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { decorDensity, cableWeights, levelHeight, gridSize, roomDensity } = config;
    if (!decorDensity) return primitives;

    const w = bounds.max.x - bounds.min.x;
    const d = bounds.max.z - bounds.min.z;
    const h = bounds.max.y - bounds.min.y;
    const cellSize = config.chunkSize / gridSize;

    // 1. Антенны (вертикальные столбы)
    for (let i = 0; i < Math.floor(w * (decorDensity.antennas || 0)); i++) {
        primitives.push({
            type: 'cylinder',
            position: { x: bounds.min.x + rng() * w, y: bounds.min.y + 10, z: bounds.min.z + rng() * d },
            rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
            scale: { x: 0.5, y: 10 + rng() * 20, z: 0.5 },
            paletteSlot: 'baseLight', role: 'decor'
        });
    }

    // 2. Сферы-резервуары
    for (let i = 0; i < Math.floor(w * (decorDensity.spheres || 0)); i++) {
        primitives.push({
            type: 'sphere',
            position: { x: bounds.min.x + rng() * w, y: bounds.min.y + rng() * h, z: bounds.min.z + rng() * d },
            rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
            scale: { x: 2 + rng() * 3, y: 2 + rng() * 3, z: 2 + rng() * 3 },
            paletteSlot: 'glow', role: 'decor'
        });
    }

    // 3. ПУЧКИ КАБЕЛЕЙ (Исправленная логика)
    // Генерируем их только там, где есть платформы, чтобы они висели "под потолком" яруса
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        const yBase = level * levelHeight;
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                // Проверяем, есть ли здесь платформа
                const baseHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                if (baseHash >= roomDensity) continue;

                // Если платформа есть, решаем, будет ли здесь пучок кабелей
                if (rng() < (decorDensity.cables || 0)) {
                    // Количество кабелей в пучке: от 3 до 7
                    const bundleSize = 3 + Math.floor(rng() * 5); 
                    
                    for (let b = 0; b < bundleSize; b++) {
                        // Определяем тип кабеля внутри пучка
                        let r = rng() * ((cableWeights?.thick || 0.3) + (cableWeights?.medium || 0.5) + (cableWeights?.thin || 0.2));
                        let radius = 0.1;
                        let length = 5 + rng() * 10;
                        let slot = 'shadow';

                        if (r < (cableWeights?.thick || 0.3)) {
                            radius = 0.4; length = 12 + rng() * 15; slot = 'baseDark';
                        } else if (r < (cableWeights?.thick || 0.3) + (cableWeights?.medium || 0.5)) {
                            radius = 0.2; length = 8 + rng() * 10; slot = 'accent';
                        }

                        // Смещение внутри клетки платформы, чтобы кабели не сливались в одну линию
                        const offsetX = (rng() - 0.5) * cellSize * 0.6;
                        const offsetZ = (rng() - 0.5) * cellSize * 0.6;

                        primitives.push({
                            type: 'capsule',
                            position: { 
                                x: bounds.min.x + (gx + 0.5) * cellSize + offsetX, 
                                y: yBase - length / 2, // Висят вниз от уровня платформы
                                z: bounds.min.z + (gy + 0.5) * cellSize + offsetZ 
                            },
                            rotation: { 
                                tiltX: (rng() - 0.5) * 12, 
                                tiltY: (rng() - 0.5) * 12, 
                                twistZ: 0 
                            }, 
                            scale: { x: radius, y: length, z: radius },
                            paletteSlot: slot,
                            flags: {},
                            role: 'decor'
                        });
                    }
                }
            }
        }
    }

    // 4. Торусы
    for (let i = 0; i < Math.floor(w * (decorDensity.torus || 0)); i++) {
        primitives.push({
            type: 'torus',
            position: { x: bounds.min.x + rng() * w, y: bounds.min.y + rng() * h, z: bounds.min.z + rng() * d },
            rotation: { tiltX: rng() * 360, tiltY: rng() * 360, twistZ: 0 },
            scale: { x: 3 + rng() * 5, y: 3 + rng() * 5, z: 3 + rng() * 5 },
            paletteSlot: 'accent', role: 'decor'
        });
    }

    // 5. Панели
    for (let i = 0; i < Math.floor(w * (decorDensity.panels || 0)); i++) {
        primitives.push({
            type: 'box',
            position: { x: bounds.min.x + rng() * w, y: bounds.min.y + rng() * h, z: bounds.min.z + rng() * d },
            rotation: { tiltX: rng() > 0.5 ? 90 : 0, tiltY: rng() * 360, twistZ: 0 },
            scale: { x: 2 + rng() * 3, y: 0.2, z: 2 + rng() * 3 },
            paletteSlot: 'baseLight', role: 'decor'
        });
    }

    return primitives;
}

export default { generateChunk };
