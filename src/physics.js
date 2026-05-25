/**
 * ==========================================================================
 * physics.js - 物理碰撞引擎与动态关卡生成算法
 * ==========================================================================
 */

const Physics = (function() {
    
    // 1. AABB 碰撞检测辅助函数
    function isColliding(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }

    function isFlightProtected(player) {
        return typeof player.isFlightProtected === 'function'
            ? player.isFlightProtected()
            : player.hasRocket || player.hasPropeller || player.flightProtectionTimer > 0;
    }

    function isEnemyCrashProtected(player) {
        return typeof player.isEnemyCrashProtected === 'function'
            ? player.isEnemyCrashProtected()
            : isFlightProtected(player) || player.isSpinning || player.trampolineProtectionTimer > 0;
    }

    // 2. 处理游戏内所有的物理碰撞
    function checkCollisions(player, platforms, items, enemies, bullets, particles, camera, triggerScreenShake, onScoreChange, onPlayerDeath) {
        if (player.isDead) return;
        let playerFlightProtected = isFlightProtected(player);
        let playerEnemyCrashProtected = isEnemyCrashProtected(player);

        // ------------------------------------------------------------------
        // A. 玩家与平台的踩踏碰撞 (只有下落 vy > 0 时才计算)
        // ------------------------------------------------------------------
        if (player.vy > 0 && !playerFlightProtected) {
            for (let i = 0; i < platforms.length; i++) {
                const plat = platforms[i];
                if (!plat.active || plat.isBroken) continue;

                // 限制踩踏只能在屏幕内发生：如果平台在屏幕下边缘之外，则不允许踩踏
                if (plat.y > camera.y + player.canvasHeight) continue;

                // 宽松判定：玩家左右侧有一小部分压在平台上方即可
                const isAlignX = player.x + player.width - 6 > plat.x && player.x + 6 < plat.x + plat.width;
                
                // 精准高度相交：上一帧的脚在平台上方，当前帧脚穿过了平台表面 (允许 10px 判定带)
                const playerFootY = player.y + player.height;
                const prevFootY = playerFootY - player.vy;
                const isCrossingTop = playerFootY >= plat.y && prevFootY <= plat.y + 10;

                if (isAlignX && isCrossingTop) {
                    // 如果平台上有飞行道具(火箭或竹蜻蜓)，且玩家和道具重合，则不判定平台踩踏，让道具拾取逻辑去处理
                    let hasFlyingItem = false;
                    for (let j = 0; j < items.length; j++) {
                        const item = items[j];
                        if (item.active && item.platformRef === plat && (item.type === 'rocket' || item.type === 'propeller')) {
                            if (isColliding(player, item)) {
                                hasFlyingItem = true;
                                break;
                            }
                        }
                    }
                    if (hasFlyingItem) continue;

                    // 如果是易碎平台，踩中后直接断裂，不能弹起
                    if (plat.type === 'brown') {
                        plat.breakPlatform(particles);
                        break; // 踩碎后本次踩踏结束，继续下落
                    }

                    // 如果是白色一次性平台，踩中后正常弹起起跳，但在下一帧瞬间裂开爆粉瓦解
                    if (plat.type === 'white') {
                        player.y = plat.y - player.height; // 贴合表面
                        player.jump(14.6); // 普通跳跃 (跳跃高度 +20%)
                        player.dustExplosion(particles);
                        plat.breakPlatform(particles, '#ffffff'); // 产生白色粒子并裂开
                        break;
                    }

                    // 如果是黄色限时渐隐平台，踩中后弹起，并立刻破裂自毁
                    if (plat.type === 'fade') {
                        player.y = plat.y - player.height; // 贴合表面
                        player.jump(14.6); // 普通跳跃 (跳跃高度 +20%)
                        player.dustExplosion(particles);
                        plat.breakPlatform(particles, '#facc15'); // 产生黄色粒子并裂开
                        break;
                    }

                    // 检查是否踩到了平台上的附加装置（弹簧或蹦床）
                    let steppedOnAddon = false;
                    if (plat.addon) {
                        const ax = plat.x + plat.addonOffsetX;
                        const aw = plat.addonWidth;
                        // 判定横向是否重合 (更宽松的范围检测，只要有交集即判定踩中)
                        const isAlignAddonX = player.x < ax + aw && player.x + player.width > ax;
                        
                        if (isAlignAddonX) {
                            steppedOnAddon = true;
                            plat.addonState = 'stepped';
                            plat.addonTimer = 0;

                            if (plat.addon === 'spring') {
                                player.vy = -20.3; // 弹簧起飞 (恢复原力度)
                                Assets.Sound.playSpring();
                            } else if (plat.addon === 'trampoline') {
                                player.vy = -29.0; // 蹦床超级起飞 (+20% 高度)
                                Assets.Sound.playTrampoline();
                                player.isSpinning = true;
                                player.spinAngle = 0;
                                player.trampolineProtectionTimer = 45;
                                triggerScreenShake(10, 18); // 强烈震屏
                            }
                            
                            // 产生大量跳跃火花粒子
                            for (let p = 0; p < 12; p++) {
                                particles.push(new Particle(player.x + player.width / 2, plat.y, {
                                    vx: Math.random() * 8 - 4,
                                    vy: Math.random() * -10 - 5,
                                    color: plat.addon === 'spring' ? '#ef4444' : '#ff7b00',
                                    radius: Math.random() * 3 + 2,
                                    gravity: 0.25,
                                    decay: 0.03
                                }));
                            }
                        }
                    }

                    // 如果没踩到弹跳道具，就是普通的踩踏
                    if (!steppedOnAddon) {
                        player.y = plat.y - player.height; // 贴合表面
                        player.jump(14.6); // 普通跳跃力 (跳跃高度 +20%)
                        player.dustExplosion(particles);
                    }
                    break; // 一次下落只触发一次踩踏
                }
            }
        }

        // ------------------------------------------------------------------
        // B. 玩家与道具的拾取碰撞
        // ------------------------------------------------------------------
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.active) continue;

            if (isColliding(player, item)) {
                item.active = false;
                player.useItem(item.type);
                
                // 拾取火箭或竹蜻蜓时震动屏幕（克制力度，避免镜头抖到卡顿感）
                if (item.type === 'rocket') {
                    triggerScreenShake(2, 8);
                } else if (item.type === 'propeller') {
                    triggerScreenShake(3, 10);
                }

                // 爆发晶莹亮光粒子
                for (let p = 0; p < 15; p++) {
                    particles.push(new Particle(item.x + item.width / 2, item.y + item.height / 2, {
                        vx: Math.random() * 6 - 3,
                        vy: Math.random() * -6 - 1,
                        color: item.type === 'rocket' ? '#f59e0b' : '#60a5fa',
                        radius: Math.random() * 4 + 2,
                        gravity: 0.15,
                        decay: 0.035
                    }));
                }
            }
        }

        // ------------------------------------------------------------------
        // C. 玩家、子弹与怪物的碰撞判定
        // ------------------------------------------------------------------
        playerFlightProtected = isFlightProtected(player);
        playerEnemyCrashProtected = isEnemyCrashProtected(player);

        for (let i = 0; i < enemies.length; i++) {
            const enemy = enemies[i];
            if (!enemy.active) continue;

            // 1. 子弹打怪物
            for (let j = 0; j < bullets.length; j++) {
                const bullet = bullets[j];
                if (!bullet.active) continue;

                // 简化的圆/矩形重合判定
                const isBulletHit = bullet.x > enemy.x && bullet.x < enemy.x + enemy.width &&
                                    bullet.y > enemy.y && bullet.y < enemy.y + enemy.height;
                
                if (isBulletHit) {
                    bullet.active = false;
                    enemy.active = false;
                    enemy.explode(particles);
                    triggerScreenShake(5, 10);
                    if (onScoreChange) onScoreChange(100); // 子弹击杀
                    break;
                }
            }

            if (!enemy.active) continue;

            // 2. 玩家碰怪物 (或者黑洞)
            if (isColliding(player, enemy)) {
                // 黑洞处理
                if (enemy.type === 'blackhole') {
                    // 火箭/竹蜻蜓/蹦床冲撞保护中碰到黑洞：直接撞碎黑洞，不算死亡
                    if (playerEnemyCrashProtected) {
                        enemy.active = false;
                        enemy.explode(particles);
                        triggerScreenShake(8, 15);
                        if (onScoreChange) onScoreChange(75);
                    } else if (!player.isDead) {
                        // 普通状态贴边即死
                        player.isDead = true;
                        player.vy = 2;
                        player.vx = 0;
                        Assets.Sound.playGameOver();
                        triggerScreenShake(15, 40);
                        if (onPlayerDeath) onPlayerDeath();
                    }
                    continue;
                }

                // 如果是怪物，判断交互类型
                if (playerEnemyCrashProtected) {
                    // 飞行道具或蹦床冲撞保护中，撞飞怪物
                    enemy.active = false;
                    enemy.explode(particles);
                    triggerScreenShake(6, 12);
                    if (onScoreChange) onScoreChange(75); // 无敌撞死
                } else if (player.vy > 0 && player.y + player.height - 8 <= enemy.y + 12) {
                    // 正在下落，且脚踩在怪物头部 (踩头击杀)
                    enemy.active = false;
                    enemy.stompExplode(particles);
                    player.jump(15.8); // 踩怪物跳得比平时稍高 (跳跃高度 +20%)
                    player.dustExplosion(particles);
                    triggerScreenShake(6, 12);
                    if (onScoreChange) onScoreChange(150); // 踩头击杀（最高奖励）
                } else {
                    // 普通撞击：判断是否有护盾抵御
                    if (player.hasShield) {
                        player.hasShield = false; // 碎盾
                        enemy.active = false;     // 同时击碎怪物
                        enemy.explode(particles);
                        Assets.Sound.playBreak(); // 碎裂音
                        triggerScreenShake(8, 15);
                        if (onScoreChange) onScoreChange(50); // 护盾撞死
                    } else {
                        // 真的被怪物杀死了
                        player.isDead = true;
                        player.vy = -7; // 死亡时往上震一下，然后无力坠落
                        Assets.Sound.playGameOver();
                        triggerScreenShake(14, 30);
                        if (onPlayerDeath) onPlayerDeath();
                    }
                }
            }
        }
    }

    // 3. 相机卷动与高度分数累计
    function updateCamera(player, camera, onScoreChange) {
        if (player.isDead) return;

        // 当主角位置超过屏幕正中（自适应逻辑高度的50%）时，相机跟随机往上移
        const threshold = camera.y + player.canvasHeight * 0.5; 
        if (player.y < threshold) {
            const diff = threshold - player.y;
            const maxCameraStep = player.hasRocket ? 18 : (player.hasPropeller ? 14 : (player.vy < -18 ? 18 : 26));
            const cameraStep = Math.min(diff, maxCameraStep);
            camera.y -= cameraStep; // 相机向上滚动，因为坐标系向下是正数，所以向上滚动是减少
            
            // 将滚动的像素按比例计入分数
            const addedScore = Math.floor(cameraStep * 0.15);
            if (addedScore > 0) {
                onScoreChange(addedScore);
            }
        }
    }

    // 4. 清理飞出视口底部的过期实体 (支持高度自适应)
    function cleanOutOfBounds(platforms, items, enemies, bullets, particles, cameraY, canvasHeight) {
        const bottomLimit = cameraY + canvasHeight + 40; // 屏幕底部下方一点点

        // 清理离开底部的平台、道具、怪物
        for (let i = platforms.length - 1; i >= 0; i--) {
            if (platforms[i].y > bottomLimit) {
                platforms.splice(i, 1);
            }
        }
        for (let i = items.length - 1; i >= 0; i--) {
            if (items[i].y > bottomLimit) {
                items.splice(i, 1);
            }
        }
        for (let i = enemies.length - 1; i >= 0; i--) {
            if (enemies[i].y > bottomLimit) {
                enemies.splice(i, 1);
            }
        }
        // 清理离开顶部的子弹
        for (let i = bullets.length - 1; i >= 0; i--) {
            if (!bullets[i].active) {
                bullets.splice(i, 1);
            }
        }
        // 清理废弃的粒子
        for (let i = particles.length - 1; i >= 0; i--) {
            if (!particles[i].active) {
                particles.splice(i, 1);
            }
        }
    }

    // 5. 动态可达性关卡生成算法
    function generateLevel(platforms, items, enemies, camera, canvasWidth, levelState) {
        function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
            return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
        }

        function hasOverlapWithPlatform(px, py, pw, ph, marginX = 10, marginY = 12) {
            for (let i = 0; i < platforms.length; i++) {
                const p = platforms[i];
                if (!p.active || p.isBroken) continue;
                if (rectsOverlap(px - marginX, py - marginY, pw + marginX * 2, ph + marginY * 2, p.x, p.y, p.width, p.height)) {
                    return true;
                }
            }
            return false;
        }

        // 辅助：判断一个候选台阶 (x, y, w, h) 是否与现有道具或弹簧/蹦床附加装置发生视觉重叠
        // 返回 true 表示有冲突，应当重新选位
        function hasOverlapWithDecor(px, py, pw, ph) {
            // 1. 检查与可拾取道具图标的重叠
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                if (!it.active || !it.platformRef) continue;
                const itemTop = it.platformRef.y - it.height - 25; // 上沿再加 25px 缓冲
                const itemBottom = it.platformRef.y + 5;
                const itemLeft = it.platformRef.x + it.offsetX - 8;
                const itemRight = it.platformRef.x + it.offsetX + it.width + 8;

                if (px < itemRight && px + pw > itemLeft &&
                    py < itemBottom && py + ph > itemTop) {
                    return true;
                }
            }
            // 2. 检查与弹簧/蹦床附加装置的重叠
            for (let i = 0; i < platforms.length; i++) {
                const p = platforms[i];
                if (!p.active || !p.addon) continue;
                const aTop = p.y - p.addonHeight - 25; // 装置上沿再加 25px 缓冲
                const aBottom = p.y + 5;
                const aLeft = p.x + p.addonOffsetX - 8;
                const aRight = p.x + p.addonOffsetX + p.addonWidth + 8;

                if (px < aRight && px + pw > aLeft &&
                    py < aBottom && py + ph > aTop) {
                    return true;
                }
            }
            return false;
        }

        function hasPlacementConflict(px, py, pw, ph) {
            return hasOverlapWithPlatform(px, py, pw, ph) || hasOverlapWithDecor(px, py, pw, ph);
        }

        function findSafePlatformSpot(startX, startY, minX, maxX, width, height, maxAttempts = 12) {
            let candidateX = startX;
            let candidateY = startY;

            for (let attempts = 0; attempts < maxAttempts; attempts++) {
                if (!hasPlacementConflict(candidateX, candidateY, width, height)) {
                    return { x: candidateX, y: candidateY, resolved: true };
                }
                candidateX = Math.random() * (maxX - minX) + minX;
            }

            for (let attempts = 0; attempts < 8; attempts++) {
                candidateY -= 18;
                candidateX = Math.random() * (maxX - minX) + minX;
                if (!hasPlacementConflict(candidateX, candidateY, width, height)) {
                    return { x: candidateX, y: candidateY, resolved: true };
                }
            }

            return { x: candidateX, y: candidateY, resolved: false };
        }

        // 动态校准最高平台作为生成基准，防止因高速跳跃或相机跳变导致的 lastY 追溯滞后
        let currentY = 0;
        let currentX = canvasWidth / 2 - 44; // 默认居中

        if (platforms.length > 0) {
            // 找出 Y 坐标最小的平台（即物理上最高的平台）
            // 同时优先选择稳定平台（green/blue）作为主路径锚点，杜绝在不稳定平台基础上做拓扑外推
            let highestStable = null;
            let highestAny = platforms[0];
            for (let i = 0; i < platforms.length; i++) {
                const p = platforms[i];
                if (p.y < highestAny.y) highestAny = p;
                if ((p.type === 'green' || p.type === 'blue') && (!highestStable || p.y < highestStable.y)) {
                    highestStable = p;
                }
            }
            const anchor = highestStable || highestAny;
            currentY = anchor.y;
            currentX = anchor.x;
        } else {
            // 如果平台为空，使用 levelState 默认的追踪点
            currentY = levelState.lastY || 0;
            currentX = levelState.lastX || (canvasWidth / 2 - 44);
        }

        // 当生成的最高高度距离相机顶端不足 1000px 时，往上预测生成
        const targetY = camera.y - 1000;

        while (currentY > targetY) {
            // 根据当前深度计算难度 (Y 坐标是负数，所以取绝对值)
            const absoluteHeight = Math.abs(currentY);

            // 垂直间距计算：高度增加逐渐拉大间距，但最大不超过 130 像素保证绝对可达性
            // 跳跃高度提升 20% 后，单跳净空 ≈ 235px，仍留有充足容错
            let minGap = 35;
            let maxGap = 70;

            if (absoluteHeight > 3000) {
                minGap = 55; maxGap = 95;
            }
            if (absoluteHeight > 8000) {
                minGap = 75; maxGap = 115;
            }
            if (absoluteHeight > 15000) {
                minGap = 90; maxGap = 130;
            }

            let gap = Math.random() * (maxGap - minGap) + minGap;

            // 前行间距保护：扫描整个平台数组，找出"装饰平台"（含弹簧/蹦床/可拾取道具）中最高的那个
            // 这一步替代了原来"只看 lastPlat"的简化判定，避免分支台阶遮挡导致 gap 保护失效
            let highestDecoratedY = Infinity;
            for (let i = 0; i < platforms.length; i++) {
                const p = platforms[i];
                if (!p.active) continue;
                const pHasAddon = p.addon === 'spring' || p.addon === 'trampoline';
                if (pHasAddon && p.y < highestDecoratedY) {
                    highestDecoratedY = p.y;
                }
            }
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                if (!it.active || !it.platformRef) continue;
                if (it.platformRef.y < highestDecoratedY) {
                    highestDecoratedY = it.platformRef.y;
                }
            }
            
            // 锚点 Y 上方或恰好相等都要触发净空保护：装饰平台的道具图标向上延伸 30~55px，
            // 必须强制下一台阶往上至少 105px 才能彻底避开道具占位框
            if (highestDecoratedY <= currentY) {
                currentY = highestDecoratedY;
                gap = Math.max(gap, 105);
            }

            // 难度生成类型概率 (包含 green, blue, brown, white, fade 五种)
            // 重要：白色一次性台阶在低空几乎不出现，只有飞得极高才稍微多一点（但仍然不会泛滥）
            let probGreen = 1.0;
            let probBlue = 0.0;
            let probBrown = 0.0;
            let probWhite = 0.0;
            let probFade = 0.0;

            if (absoluteHeight > 2000) {
                // 2000-5000px：开始出现少量蓝色移动台阶和棕色易碎台阶，白色台阶完全不出现
                probGreen = 0.78;
                probBlue = 0.15;
                probBrown = 0.07;
                probWhite = 0.00;
                probFade = 0.00;
            }
            if (absoluteHeight > 5000) {
                // 5000-10000px：黄色时效台阶进入，仍无白色台阶
                probGreen = 0.65;
                probBlue = 0.15;
                probBrown = 0.12;
                probWhite = 0.00;
                probFade = 0.08;
            }
            if (absoluteHeight > 10000) {
                // 10000-18000px：白色一次性台阶首次少量出现
                probGreen = 0.55;
                probBlue = 0.15;
                probBrown = 0.13;
                probWhite = 0.05;
                probFade = 0.12;
            }
            if (absoluteHeight > 18000) {
                // 18000-28000px：白色台阶略微增加，但仍受限
                probGreen = 0.40;
                probBlue = 0.18;
                probBrown = 0.18;
                probWhite = 0.10;
                probFade = 0.14;
            }
            if (absoluteHeight > 28000) {
                // 28000+px：终极挑战段，白色台阶最高占比，但绝不超过 12%
                probGreen = 0.30;
                probBlue = 0.20;
                probBrown = 0.20;
                probWhite = 0.12;
                probFade = 0.18;
            }

            // 随机选择平台类型
            let type = 'green';
            const r = Math.random();
            if (r < probGreen) {
                type = 'green';
            } else if (r < probGreen + probBlue) {
                type = 'blue';
            } else if (r < probGreen + probBlue + probBrown) {
                type = 'brown';
            } else if (r < probGreen + probBlue + probBrown + probWhite) {
                type = 'white';
            } else {
                type = 'fade';
            }

            const nextY = currentY - gap; // 垂直坐标往上递减

            // 横坐标生成：限制新旧平台的最大横向偏置在 110px 以内
            const platWidth = 88;
            let minX = Math.max(10, currentX - 110);
            let maxX = Math.min(canvasWidth - platWidth - 10, currentX + 110);
            let nextX = Math.random() * (maxX - minX) + minX;

            // 关键防护：确保新平台不会与现有平台、道具图标、弹簧、蹦床等发生重叠
            const platHeight = 20;
            const mainSpot = findSafePlatformSpot(nextX, nextY, minX, maxX, platWidth, platHeight);
            nextX = mainSpot.x;
            let placedNextY = mainSpot.y;
            let resolved = mainSpot.resolved;
            // 若彻底无解 (极端情况)，把 nextY 直接拉到所有道具上方再加 30px 安全距离
            if (!resolved) {
                let lowestObstacleTop = currentY;
                for (let i = 0; i < platforms.length; i++) {
                    const p = platforms[i];
                    if (!p.active || p.isBroken) continue;
                    const platformTop = p.y - 32;
                    if (platformTop < lowestObstacleTop) lowestObstacleTop = platformTop;
                }
                for (let i = 0; i < items.length; i++) {
                    const it = items[i];
                    if (!it.active || !it.platformRef) continue;
                    const itemTop = it.platformRef.y - it.height - 25;
                    if (itemTop < lowestObstacleTop) lowestObstacleTop = itemTop;
                }
                for (let i = 0; i < platforms.length; i++) {
                    const p = platforms[i];
                    if (!p.active || !p.addon) continue;
                    const aTop = p.y - p.addonHeight - 25;
                    if (aTop < lowestObstacleTop) lowestObstacleTop = aTop;
                }
                placedNextY = lowestObstacleTop - 30;
            }
            // 重新覆盖 nextY 让后续逻辑全部基于安全的最终位置
            const safeNextY = placedNextY;

            // 不稳定平台 (brown/white/fade) 强制双轨保障：在相反方向同时生成稳定 green 平台作为绝对安全通路
            // 这样杜绝了"唯一通路是不稳定台阶导致无路可跳"的情况
            const isUnstable = (type === 'brown' || type === 'white' || type === 'fade');

            if (isUnstable) {
                // 1. 生成不稳定平台
                const newPlat = new Platform(nextX, safeNextY, type);
                platforms.push(newPlat);

                // 2. 强制在相反方向生成一个绿色稳定平台作为安全通路
                let safeX = nextX > canvasWidth / 2 ? nextX - 160 : nextX + 160;
                // 二次约束：确保安全平台和不稳定平台的横向间距至少为 120px (避免视觉重叠)
                if (Math.abs(safeX - nextX) < 120) {
                    safeX = nextX > canvasWidth / 2 ? nextX - 140 : nextX + 140;
                }
                safeX = Math.max(10, Math.min(canvasWidth - platWidth - 10, safeX));
                let safeY = safeNextY + (Math.random() * 30 - 15);

                const safeMinX = Math.max(10, safeX - 80);
                const safeMaxX = Math.min(canvasWidth - platWidth - 10, safeX + 80);
                const safeSpot = findSafePlatformSpot(safeX, safeY, safeMinX, safeMaxX, platWidth, 20, 8);
                safeX = safeSpot.x;
                safeY = safeSpot.y;
                let safeValid = safeSpot.resolved;
                
                if (safeValid) {
                    const safePlat = new Platform(safeX, safeY, 'green');
                    platforms.push(safePlat);
                    // 3. 把追踪锚点移到安全平台上，下一轮基于稳定路径继续生成
                    currentY = safeY;
                    currentX = safeX;
                } else {
                    // 安全平台被装饰物挡住了，把锚点回退到不稳定平台并加大下一轮 gap
                    currentY = safeNextY;
                    currentX = nextX;
                }
            } else {
                // 普通平台生成逻辑（green / blue）
                const newPlat = new Platform(nextX, safeNextY, type);

                // 决定是否在当前平台挂载踩踏附加装置 (弹簧/蹦床)
                let hasAddon = false;
                let addonType = null;
                const addR = Math.random();
                if (addR < 0.12) {
                    addonType = 'spring';
                    hasAddon = true;
                } else if (addR < 0.17 && absoluteHeight > 3000) {
                    addonType = 'trampoline';
                    hasAddon = true;
                }

                if (hasAddon) {
                    newPlat.attachAddon(addonType);
                } else {
                    // 没有附加弹跳装置时，才可能挂载可拾取飞行/防御道具
                    // 第一屏内不刷任何道具，纯净跳跳乐入场
                    let itemSpawnRate = 0;
                    const firstScreenSafeHeight = Math.max(900, camera.y + levelState.startCanvasHeight);
                    if (absoluteHeight < firstScreenSafeHeight) itemSpawnRate = 0;
                    else if (absoluteHeight < 1500) itemSpawnRate = 0.07;
                    else if (absoluteHeight < 5000) itemSpawnRate = 0.13;
                    else itemSpawnRate = 0.15;

                    if (itemSpawnRate > 0 && Math.random() < itemSpawnRate) {
                        let itemType = null;
                        const itemR = Math.random();

                        if (absoluteHeight < 1500) {
                            // 第一屏之后到 1500：60% 竹蜻蜓 / 25% 火箭 / 15% 护盾
                            if (itemR < 0.60) itemType = 'propeller';
                            else if (itemR < 0.85) itemType = 'rocket';
                            else itemType = 'shield';
                        } else if (absoluteHeight < 5000) {
                            // 1500-5000：25% 竹蜻蜓 / 60% 火箭 / 15% 护盾
                            if (itemR < 0.25) itemType = 'propeller';
                            else if (itemR < 0.85) itemType = 'rocket';
                            else itemType = 'shield';
                        } else {
                            // 5000+：20% 竹蜻蜓 / 60% 火箭 / 20% 护盾
                            if (itemR < 0.20) itemType = 'propeller';
                            else if (itemR < 0.80) itemType = 'rocket';
                            else itemType = 'shield';
                        }

                        const item = new Item(0, 0, itemType);
                        item.platformRef = newPlat;
                        item.offsetX = Math.random() * (newPlat.width - item.width - 6) + 3;
                        // 立即同步初始位置，避免首帧渲染在世界 (0, 0) 出现"道具乱闪"
                        item.x = newPlat.x + item.offsetX;
                        item.y = newPlat.y - item.height;
                        items.push(item);
                    }
                }

                platforms.push(newPlat);

                // 分支台阶 (低难度路线丰富化容错)
                let branchChance = 0.50;
                if (absoluteHeight > 3500) branchChance = 0.30;
                if (absoluteHeight > 8000 || type === 'blue') branchChance = 0.0;

                if (Math.random() < branchChance) {
                    let branchX = 0;
                    if (nextX < canvasWidth / 2) {
                        branchX = nextX + 150 + Math.random() * 80;
                    } else {
                        branchX = nextX - 150 - Math.random() * 80;
                    }
                    branchX = Math.max(10, Math.min(canvasWidth - platWidth - 10, branchX));
                    let branchY = safeNextY + (Math.random() * 30 - 15);

                    const branchMinX = Math.max(10, branchX - 70);
                    const branchMaxX = Math.min(canvasWidth - platWidth - 10, branchX + 70);
                    const branchSpot = findSafePlatformSpot(branchX, branchY, branchMinX, branchMaxX, platWidth, 20, 8);

                    if (branchSpot.resolved) {
                        branchX = branchSpot.x;
                        branchY = branchSpot.y;
                        const branchPlat = new Platform(branchX, branchY, 'green');
                        if (Math.random() < 0.08) {
                            branchPlat.attachAddon('spring');
                        }
                        platforms.push(branchPlat);
                    }
                }

                // 更新追踪锚点
                currentY = safeNextY;
                currentX = nextX;
            }

            // 动态生成怪物和黑洞 (新手保护区：3500px 以下概率为 0)
            let monsterChance = 0;
            if (absoluteHeight > 3500) monsterChance = 0.03;
            if (absoluteHeight > 8000) monsterChance = 0.06;
            if (absoluteHeight > 15000) monsterChance = 0.09;
            if (absoluteHeight > 25000) monsterChance = 0.12;

            if (monsterChance > 0 && Math.random() < monsterChance && type !== 'brown') {
                let enemyType = 'monster';

                // 黑洞要避免聚团：附近 600px 内已存在黑洞时，本轮强制改为普通怪物
                if (absoluteHeight > 10000 && Math.random() < 0.4) {
                    let nearbyBlackhole = false;
                    for (let i = 0; i < enemies.length; i++) {
                        const e = enemies[i];
                        if (e.active && e.type === 'blackhole' && Math.abs(e.y - safeNextY) < 600) {
                            nearbyBlackhole = true;
                            break;
                        }
                    }
                    enemyType = nearbyBlackhole ? 'monster' : 'blackhole';
                }

                const enemyWidth = enemyType === 'monster' ? 56 : 70;
                const ey = safeNextY - (Math.random() * 80 + 70);
                const ex = Math.random() * (canvasWidth - enemyWidth);

                enemies.push(new Enemy(ex, ey, enemyType));
            }
        }

        // 最终更新追踪状态，确保与全局 levelState 同步
        levelState.lastY = currentY;
        levelState.lastX = currentX;
    }

    return {
        checkCollisions,
        updateCamera,
        cleanOutOfBounds,
        generateLevel
    };
})();
