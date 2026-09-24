// src/gen/chunkGenerator.js
// @ts-check
import { createRNG, hash3D } from '../core/rng.js';
import { chunkToBounds } from '../core/chunkKey.js';
import edgeAgreement from './edgeAgreement.js';

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

    // === ЭТАП F: Декор (Y-up) ===
    if (instanceCount < maxInstances) {
        const decor = generateDecor(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...decor);
        instanceCount += decor.length;
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
        if (hash3D(cx, cy, level, seed) > roomDensity) continue;
        
        const yBase = level * levelHeight;
        const yWallCenter = yBase + platformThickness + (levelHeight - platformThickness) / 2; 

        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const wx = bounds.min.x + (gx + 0.5) * cellSize;
                const wz = bounds.min.z + (gy + 0.5) * cellSize;

                const wallHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level + 0.5, seed);
                if (wallHash < wallDensity) {
                    primitives.push({
                        type: 'box',
                        position: { x: wx, y: yWallCenter, z: wz },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize * 0.9, y: levelHeight, z: cellSize * 0.1 },
                        paletteSlot: 'baseDark',
                        role: 'frame'
                    });
                }

                const pillarHash = hash3D(cx * gridSize + gx + 0.5, cy * gridSize + gy + 0.5, level, seed);
                if (pillarHash < pillarDensity) {
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

// src/gen/chunkGenerator.js

// ... (импорты остаются прежними)

/**
 * Этап C: Горизонтальные мосты (Y-up) с гарантированной магистралью
 */
function generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { gridSize, levelHeight, roomDensity, bridgeChance, bridgeWidth, bridgeThickness } = config;
    
    // Определяем диапазон уровней
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        // Пропускаем уровень, если он слишком пустой
        if (hash3D(cx, cy, level, seed) > roomDensity) continue;

        const yBase = level * levelHeight;
        
        // 1. Собираем все доступные платформы на этом уровне
        const platforms = [];
        const platformSet = new Set();
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                if (hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed) < roomDensity) {
                    platforms.push({ gx, gy });
                    platformSet.add(`${gx},${gy}`);
                }
            }
        }

        if (platforms.length < 2) continue;

        // 2. Строим ГАРАНТИРОВАННУЮ МАГИСТРАЛЬ (Main Artery)
        // Ищем путь от левой границы (gx=0) к правой (gx=gridSize-1) или снизу вверх
        const arteryPath = findMainArtery(platforms, platformSet, gridSize, rng);
        
        // Создаем мосты для магистрали
        for (let i = 0; i < arteryPath.length - 1; i++) {
            const p1 = arteryPath[i];
            const p2 = arteryPath[i+1];
            
            createBridgePrimitive(primitives, p1, p2, bounds, cellSize, yBase, bridgeThickness, bridgeWidth, 'bridge', true);
        }

        // 3. Строим случайные локальные связи (для плотности)
        // Используем упрощенный Prim's для оставшихся изолированных кластеров
        const connected = new Set(arteryPath.map(p => `${p.gx},${p.gy}`));
        const localEdges = [];
        
        // Если есть несвязанные платформы, пробуем их соединить
        if (connected.size < platforms.length) {
             let safety = 0;
             while (connected.size < platforms.length && safety++ < 100) {
                 const keys = Array.from(connected);
                 const srcKey = keys[Math.floor(rng() * keys.length)];
                 const [sx, sy] = srcKey.split(',').map(Number);
                 
                 let nearest = null, minDist = Infinity;
                 for (let dx = -1; dx <= 1; dx++) {
                     for (let dy = -1; dy <= 1; dy++) {
                         if (dx===0 && dy===0) continue;
                         const nx = sx+dx, ny = sy+dy;
                         const k = `${nx},${ny}`;
                         if (platformSet.has(k) && !connected.has(k)) {
                             const d = Math.abs(dx)+Math.abs(dy);
                             if (d < minDist) { minDist = d; nearest = {gx:nx, gy:ny}; }
                         }
                     }
                 }
                 
                 if (nearest && rng() < bridgeChance) {
                     connected.add(`${nearest.gx},${nearest.gy}`);
                     createBridgePrimitive(primitives, {gx:sx, gy:sy}, nearest, bounds, cellSize, yBase, bridgeThickness, bridgeWidth, 'accent', false);
                 } else if (nearest) {
                     connected.add(`${nearest.gx},${nearest.gy}`); // Просто добавляем в связность, даже без моста иногда
                 }
             }
        }
    }
    
    return primitives;
}

/**
 * Поиск главного пути через чанк (Greedy Best-First)
 */
function findMainArtery(platforms, platformSet, gridSize, rng) {
    // Находим стартовую точку (ближайшую к левому краю)
    let startNode = null;
    let minX = gridSize;
    for (const p of platforms) {
        if (p.gx < minX) {
            minX = p.gx;
            startNode = p;
        }
    }
    
    if (!startNode) return [];

    const path = [startNode];
    const visited = new Set([`${startNode.gx},${startNode.gy}`]);
    let current = startNode;
    
    // Целевая сторона (правый край)
    const targetX = gridSize - 1;
    
    let safety = 0;
    while (current.gx < targetX && safety++ < 50) {
        const neighbors = [
            { gx: current.gx + 1, gy: current.gy },     // Вправо
            { gx: current.gx, gy: current.gy + 1 },     // Вверх
            { gx: current.gx, gy: current.gy - 1 },     // Вниз
            { gx: current.gx + 1, gy: current.gy + 1 }, // Диагональ
            { gx: current.gx + 1, gy: current.gy - 1 }  // Диагональ
        ];
        
        // Фильтруем существующие платформы и непосещенные
        const validNeighbors = neighbors.filter(n => 
            n.gx >= 0 && n.gx < gridSize && 
            n.gy >= 0 && n.gy < gridSize &&
            platformSet.has(`${n.gx},${n.gy}`) &&
            !visited.has(`${n.gx},${n.gy}`)
        );
        
        if (validNeighbors.length === 0) break; // Тупик
        
        // Выбираем соседа, который ближе всего к правому краю (targetX)
        // Добавляем немного случайности, чтобы путь не был всегда прямым
        validNeighbors.sort((a, b) => {
            const distA = Math.abs(targetX - a.gx) + (rng() * 0.5);
            const distB = Math.abs(targetX - b.gx) + (rng() * 0.5);
            return distA - distB;
        });
        
        const next = validNeighbors[0];
        path.push(next);
        visited.add(`${next.gx},${next.gy}`);
        current = next;
    }
    
    return path;
}

/**
 * Создает примитив моста между двумя платформами
 */
function createBridgePrimitive(primitives, p1, p2, bounds, cellSize, yBase, thickness, widthRatio, paletteSlot, isMainArtery) {
    const x1 = bounds.min.x + (p1.gx + 0.5) * cellSize;
    const z1 = bounds.min.z + (p1.gy + 0.5) * cellSize;
    const x2 = bounds.min.x + (p2.gx + 0.5) * cellSize;
    const z2 = bounds.min.z + (p2.gy + 0.5) * cellSize;
    
    // Вектор направления
    const dx = x2 - x1;
    const dz = z2 - z1;
    const dist = Math.sqrt(dx*dx + dz*dz);
    
    if (dist < 0.1) return; // Защита от деления на ноль
    
    // Центр моста
    const midX = (x1 + x2) / 2;
    const midZ = (z1 + z2) / 2;
    
    // Угол поворота
    const angleRad = Math.atan2(dz, dx);
    const angleDeg = angleRad * (180 / Math.PI);
    
    // Корректировка длины: мост должен начинаться от края платформы
    // Платформа имеет размер cellSize, значит от центра до края cellSize/2
    // Мост должен быть короче расстояния между центрами на сумму половин размеров платформ
    // Но мы хотим, чтобы он упирался в ребра. 
    // Для простоты: длина = dist - cellSize * 0.8 (небольшой нахлест для красоты)
    const bridgeLength = Math.max(dist - cellSize * 0.8, 0.5);
    
    primitives.push({
        type: 'box',
        position: { 
            x: midX, 
            y: yBase + 1.5, // Чуть выше платформы, чтобы не проваливался
            z: midZ 
        },
        rotation: { 
            tiltX: 0, 
            tiltY: angleDeg, 
            twistZ: 0 
        },
        scale: { 
            x: bridgeLength,      // Длина вдоль оси X (после поворота)
            y: thickness,         // Толщина
            z: cellSize * widthRatio // Ширина
        },
        paletteSlot: paletteSlot, // 'bridge' для ярких, 'accent' для обычных
        role: 'connector'
    });
}

// ... остальной код файла (generateMegaStructures и т.д.) остается без изменений

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

function generateDecor(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { decorDensity } = config;
    if (!decorDensity) return primitives;

    const w = bounds.max.x-bounds.min.x;
    const d = bounds.max.z-bounds.min.z;

    for (let i=0; i<Math.floor(w*(decorDensity.antennas||0)); i++) {
        primitives.push({
            type: 'cylinder',
            position: { x: bounds.min.x+rng()*w, y: bounds.min.y+10, z: bounds.min.z+rng()*d },
            rotation: { tiltX:0, tiltY:0, twistZ:0 },
            scale: { x:0.5, y:10+rng()*20, z:0.5 },
            paletteSlot: 'baseLight', role: 'decor'
        });
    }
    for (let i=0; i<Math.floor(w*(decorDensity.spheres||0)); i++) {
        primitives.push({
            type: 'sphere',
            position: { x: bounds.min.x+rng()*w, y: bounds.min.y+rng()*(bounds.max.y-bounds.min.y), z: bounds.min.z+rng()*d },
            rotation: { tiltX:0, tiltY:0, twistZ:0 },
            scale: { x:2+rng()*3, y:2+rng()*3, z:2+rng()*3 },
            paletteSlot: 'glow', role: 'decor'
        });
    }
    return primitives;
}

export default { generateChunk };
