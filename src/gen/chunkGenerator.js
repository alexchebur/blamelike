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

// ... (импорты и начало файла остаются без изменений)

/**
 * Этап C: Горизонтальные мосты (Y-up) на основе заполнения пустых клеток
 */
function generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { gridSize, levelHeight, roomDensity, bridgeChance } = config;
    
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        const currentYBase = level * levelHeight;
        
        // 1. Строим карту занятости уровня
        const gridMap = new Map(); // ключ "gx,gy" -> true/false
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const isOccupied = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed) < roomDensity;
                gridMap.set(`${gx},${gy}`, isOccupied);
            }
        }

        // 2. Создаем ГАРАНТИРОВАННУЮ МАГИСТРАЛЬ (Wave Algorithm)
        // Мы просто "пробиваем" путь через пустые клетки, помечая их как требующие моста
        const requiredBridges = new Set(); // хранит "gx,gy|type"
        
        // Находим стартовую точку на левой границе
        let startX = 0;
        let startY = Math.floor(rng() * gridSize);
        while (!gridMap.get(`${startX},${startY}`) && startX < gridSize) startX++; // Ищем платформу или край
        
        // Простой жадный путь к правой границе
        let currX = startX;
        let currY = startY;
        let pathLength = 0;
        
        while (currX < gridSize - 1 && pathLength < 50) {
            // Пытаемся идти вправо
            let nextX = currX + 1;
            let nextY = currY;
            
            // Если справа занято платформой, пытаемся обойти (случайно вверх или вниз)
            if (gridMap.get(`${nextX},${nextY}`)) {
                const dir = rng() > 0.5 ? 1 : -1;
                if (currY + dir >= 0 && currY + dir < gridSize && !gridMap.get(`${currX},${currY + dir}`)) {
                    nextX = currX;
                    nextY = currY + dir;
                } else if (currY - dir >= 0 && currY - dir < gridSize && !gridMap.get(`${currX},${currY - dir}`)) {
                    nextX = currX;
                    nextY = currY - dir;
                } else {
                    break; // Тупик
                }
            }
            
            // Если следующая клетка пуста, она становится мостом магистрали
            if (!gridMap.get(`${nextX},${nextY}`)) {
                // Определяем тип моста: если мы двигались по X, то мост должен быть EW
                // Но мы ставим мост В текущую пустую клетку.
                // Если мы пришли из (currX, currY) и идем в (nextX, nextY):
                // Если изменился X, значит нам нужен мост EW в следующей клетке? 
                // Нет, мост ставится в пустую клетку, соединяя соседей.
                
                // Просто помечаем эту клетку как "требующую моста". Тип определим позже по соседям.
                requiredBridges.add(`${nextX},${nextY}`);
            }
            
            currX = nextX;
            currY = nextY;
            pathLength++;
        }

        // 3. Заполняем остальные пустые клетки по правилам
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const key = `${gx},${gy}`;
                if (gridMap.get(key)) continue; // Пропускаем занятые платформы

                const hasWest = gridMap.get(`${gx-1},${gy}`);
                const hasEast = gridMap.get(`${gx+1},${gy}`);
                const hasSouth = gridMap.get(`${gx},${gy-1}`);
                const hasNorth = gridMap.get(`${gx},${gy+1}`);

                let bridgeType = null;

                // Приоритет: если клетка в магистрали, стараемся её использовать
                const isRequired = requiredBridges.has(key);

                // Проверяем возможность соединения Восток-Запад
                if (hasWest && hasEast) {
                    bridgeType = 'bridge_ew';
                } 
                // Проверяем возможность соединения Север-Юг
                else if (hasNorth && hasSouth) {
                    bridgeType = 'bridge_ns';
                }
                // Случайные перпендикулярные связи (Т-образные), если есть шанс
                else if (!isRequired && rng() < bridgeChance) {
                    if (hasWest || hasEast) bridgeType = 'bridge_ew';
                    else if (hasNorth || hasSouth) bridgeType = 'bridge_ns';
                }

                if (bridgeType) {
                    const wx = bounds.min.x + (gx + 0.5) * cellSize;
                    const wz = bounds.min.z + (gy + 0.5) * cellSize;
                    
                    primitives.push({
                        type: bridgeType,
                        position: { x: wx, y: currentYBase + 0.6, z: wz }, // Чуть выше пола
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: 1, y: 1, z: 1 }, // Масштаб 1, т.к. геометрия уже подогнана под cellSize=1 в factory? Нет, в factory мы сделали размер 1.
                        // ВАЖНО: В chunkManager масштаб умножается на cellSize? 
                        // В текущем коде chunkManager использует scale напрямую. 
                        // Наша геометрия имеет размер 1. Нам нужно растянуть её на cellSize.
                        scale: { x: cellSize, y: 1, z: cellSize },
                        paletteSlot: isRequired ? 'bridge' : 'accent',
                        role: 'connector'
                    });
                }
            }
        }
    }
    
    return primitives;
}

// ... (остальной код файла)
/**
 * Поиск главного пути через чанк (Greedy Best-First с рандомизацией по сиду)
 */
function findMainArtery(platforms, platformSet, gridSize, rng, seed, level, cx, cy) {
    // Определяем стороны: 0=Left, 1=Right, 2=Top, 3=Bottom
    // Используем hash3D с cx и cy для детерминированного выбора сторон
    const sideHash = hash3D(seed, level, 999, cx + cy * 1000);
    const startSide = Math.floor(sideHash * 4); 
    const endSide = (startSide + 1 + Math.floor(hash3D(seed, level, 888, cx + cy * 1000) * 3)) % 4; 

    let startCandidates = platforms.filter(p => isOnSide(p, gridSize, startSide));
    let endCandidates = platforms.filter(p => isOnSide(p, gridSize, endSide));

    if (startCandidates.length === 0) startCandidates = platforms;
    if (endCandidates.length === 0) endCandidates = platforms;

    const startNode = startCandidates[Math.floor(rng() * startCandidates.length)];
    const targetNode = endCandidates[Math.floor(rng() * endCandidates.length)];

    if (!startNode || !targetNode) return [];

    const path = [startNode];
    const visited = new Set([`${startNode.gx},${startNode.gy}`]);
    let current = startNode;
    
    let safety = 0;
    while ((current.gx !== targetNode.gx || current.gy !== targetNode.gy) && safety++ < 150) {
        const candidates = [];
        
        // Расширенный поиск соседей (радиус 2)
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                if (dx===0 && dy===0) continue;
                
                const nx = current.gx + dx;
                const ny = current.gy + dy;
                
                if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                    const k = `${nx},${ny}`;
                    if (platformSet.has(k) && !visited.has(k)) {
                        // Манхэттенское расстояние до цели
                        const distToTarget = Math.abs(targetNode.gx - nx) + Math.abs(targetNode.gy - ny);
                        
                        // УСИЛЕННАЯ СЛУЧАЙНОСТЬ: используем cx и cy в хеше
                        const randomFactor = hash3D(nx + seed, ny + level, cx, cy) * 1.5;
                        
                        candidates.push({ gx: nx, gy: ny, score: distToTarget + randomFactor });
                    }
                }
            }
        }
        
        if (candidates.length === 0) break; 
        
        // Сортируем по score (меньше = лучше)
        candidates.sort((a, b) => a.score - b.score);
        
        // БЕРЕМ СЛУЧАЙНОГО ИЗ ЛУЧШИХ ТРЕХ! Это ломает линейность
        const topN = Math.min(3, candidates.length);
        const randomIndex = Math.floor(rng() * topN);
        const next = candidates[randomIndex];
        
        path.push(next);
        visited.add(`${next.gx},${next.gy}`);
        current = next;
    }
    
    return path;
}

/**
 * Проверяет, находится ли платформа на указанной стороне грида
 */
function isOnSide(p, gridSize, side) {
    const margin = 1; 
    switch (side) {
        case 0: return p.gx < margin; // Left (-X)
        case 1: return p.gx >= gridSize - margin; // Right (+X)
        case 2: return p.gy < margin; // Top/Back (-Z)
        case 3: return p.gy >= gridSize - margin; // Bottom/Front (+Z)
        default: return false;
    }
}

/**
 * Проверяет, есть ли между двумя точками пустое пространство (нет платформы)
 */
function hasEmptySpaceBetween(p1, p2, platformSet) {
    const midGx = (p1.gx + p2.gx) / 2;
    const midGy = (p1.gy + p2.gy) / 2;
    
    const dist = Math.abs(p1.gx - p2.gx) + Math.abs(p1.gy - p2.gy);
    if (dist <= 1.5) return true; 

    const checkX = Math.floor(midGx);
    const checkY = Math.floor(midGy);
    
    return !platformSet.has(`${checkX},${checkY}`);
}

/**
 * Создает примитив моста между двумя платформами
 */
function createBridgePrimitive(primitives, p1, p2, bounds, cellSize, yBase, platThick, thickness, widthRatio, paletteSlot) {
    const x1 = bounds.min.x + (p1.gx + 0.5) * cellSize;
    const z1 = bounds.min.z + (p1.gy + 0.5) * cellSize;
    const x2 = bounds.min.x + (p2.gx + 0.5) * cellSize;
    const z2 = bounds.min.z + (p2.gy + 0.5) * cellSize;
    
    const dx = x2 - x1;
    const dz = z2 - z1;
    const dist = Math.sqrt(dx*dx + dz*dz);
    
    if (dist < 0.1) return;
    
    const midX = (x1 + x2) / 2;
    const midZ = (z1 + z2) / 2;
    
    const angleRad = Math.atan2(dz, dx);
    const angleDeg = angleRad * (180 / Math.PI);
    
    const bridgeLength = Math.max(dist - cellSize * 0.9, 0.5);
    
    primitives.push({
        type: 'box',
        position: { 
            x: midX, 
            y: yBase + platThick + (thickness / 2), 
            z: midZ 
        },
        rotation: { 
            tiltX: 0, 
            tiltY: angleDeg, 
            twistZ: 0 
        },
        scale: { 
            x: bridgeLength,
            y: thickness,
            z: cellSize * widthRatio
        },
        paletteSlot: paletteSlot,
        role: 'connector'
    });
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
