/**
 * ==========================================================================
 * entities.js - 游戏实体与粒子系统定义
 * ==========================================================================
 */

// --------------------------------------------------------------------------
// 1. 粒子 (Particle) 类
// --------------------------------------------------------------------------
class Particle {
    constructor(x, y, options = {}) {
        this.x = x;
        this.y = y;
        this.vx = options.vx !== undefined ? options.vx : (Math.random() * 6 - 3);
        this.vy = options.vy !== undefined ? options.vy : (Math.random() * -6 - 2);
        this.radius = options.radius || Math.random() * 4 + 2;
        this.width = options.width || this.radius * 2;
        this.height = options.height || this.radius * 2;
        this.color = options.color || '#fff';
        this.alpha = 1;
        this.decay = options.decay || Math.random() * 0.03 + 0.015;
        this.gravity = options.gravity !== undefined ? options.gravity : 0.2;
        this.type = options.type || 'circle'; // 'circle', 'rect'
        this.rotation = Math.random() * Math.PI * 2;
        this.rotSpeed = Math.random() * 0.2 - 0.1;
        this.active = true;
    }

    update() {
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        this.rotation += this.rotSpeed;
        this.alpha -= this.decay;
        if (this.alpha <= 0) {
            this.active = false;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;

        if (this.type === 'circle') {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (this.type === 'rect') {
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.beginPath();
            ctx.rect(-this.width / 2, -this.height / 2, this.width, this.height);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }
}

// --------------------------------------------------------------------------
// 2. 子弹 (Bullet) 类
// --------------------------------------------------------------------------
class Bullet {
    constructor(x, y, angle = -Math.PI / 2) {
        this.x = x;
        this.y = y;
        // 子弹速度大幅提升，确保任何角度都能明显跑赢摄像机和角色跳跃，视觉上保持笔直
        const speed = 32;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.radius = 6;
        this.active = true;
        // 子弹按帧寿命衰减，避免在世界坐标系中用绝对边界判定误杀
        this.life = 50;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
        if (this.life <= 0) {
            this.active = false;
        }
    }

    draw(ctx) {
        Assets.Draw.bullet(ctx, this.x, this.y, this.radius);
    }
}

// --------------------------------------------------------------------------
// 3. 道具 (Item) 类
// --------------------------------------------------------------------------
class Item {
    constructor(x, y, type) {
        this.x = x; // 相对平台或绝对横坐标
        this.y = y;
        this.type = type; // 'propeller', 'rocket', 'shield'
        this.width = 30;
        this.height = 30;
        this.active = true;
        this.platformRef = null; // 绑定的平台对象
        this.offsetX = 0;        // 相对绑定的平台的横向偏置
    }

    // 与绑定的平台同步移动
    update() {
        if (this.platformRef) {
            this.x = this.platformRef.x + this.offsetX;
            this.y = this.platformRef.y - this.height;
            // 如果平台碎了或消失了，道具也可以消失
            if (this.platformRef.isBroken || this.platformRef.y > 850) {
                this.active = false;
            }
        }
    }

    draw(ctx) {
        if (!this.active) return;
        if (this.type === 'propeller') {
            Assets.Draw.propellerItem(ctx, this.x, this.y, this.width, this.height);
        } else if (this.type === 'rocket') {
            Assets.Draw.rocketItem(ctx, this.x, this.y, this.width, this.height);
        } else if (this.type === 'shield') {
            Assets.Draw.shieldItem(ctx, this.x, this.y, this.width, this.height);
        }
    }
}

// --------------------------------------------------------------------------
// 4. 障碍物/敌人 (Enemy) 类
// --------------------------------------------------------------------------
class Enemy {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type; // 'monster', 'blackhole'
        this.width = type === 'monster' ? 56 : 70;
        this.height = type === 'monster' ? 48 : 70;
        this.active = true;
        this.frame = Math.random() * 100; // 动画随机初始帧

        // 怪物巡逻参数
        if (type === 'monster') {
            this.startX = x;
            this.range = Math.random() * 60 + 30; // 巡逻半径
            this.speed = Math.random() * 0.03 + 0.02; // 移动速度
        }
    }

    update(player, particles) {
        this.frame++;

        if (this.type === 'monster') {
            // 怪物左右摇晃移动，加轻微的上下起伏
            this.x = this.startX + Math.sin(this.frame * this.speed) * this.range;
            this.y += Math.sin(this.frame * 0.08) * 0.3;
        } else if (this.type === 'blackhole') {
            // 黑洞对玩家施加吸引引力场（吸引范围 = 黑洞自身可视半径，让贴近才被吸）
            const dx = this.x + this.width / 2 - (player.x + player.width / 2);
            const dy = this.y + this.height / 2 - (player.y + player.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);

            // 黑洞可视半径约 width/2 ≈ 35px，再加一点点缓冲使吸引感不太突兀
            const pullRadius = this.width / 2 + 10;

            const isEnemyCrashProtected = typeof player.isEnemyCrashProtected === 'function'
                ? player.isEnemyCrashProtected()
                : player.hasRocket || player.hasPropeller || player.isSpinning;

            // 当玩家进入可视范围且未处于飞行/蹦床冲撞保护状态时，产生强吸引
            if (dist < pullRadius && !isEnemyCrashProtected) {
                const force = (pullRadius - dist) / pullRadius * 0.55; // 短距高强度
                player.vx += (dx / dist) * force;
                player.vy += (dy / dist) * force;

                // 产生黑洞尘埃粒子
                if (Math.random() < 0.25) {
                    particles.push(new Particle(
                        player.x + player.width / 2 + Math.random() * 20 - 10,
                        player.y + player.height / 2 + Math.random() * 20 - 10,
                        {
                            vx: (dx / dist) * 4 + Math.random() * 2 - 1,
                            vy: (dy / dist) * 4 + Math.random() * 2 - 1,
                            color: '#c084fc',
                            radius: Math.random() * 2 + 1,
                            gravity: 0,
                            decay: 0.03
                        }
                    ));
                }
            }
        }
    }

    draw(ctx) {
        if (!this.active) return;
        if (this.type === 'monster') {
            Assets.Draw.monster(ctx, this.x, this.y, this.width, this.height, this.frame);
        } else if (this.type === 'blackhole') {
            Assets.Draw.blackhole(ctx, this.x, this.y, this.width, this.height, this.frame);
        }
    }

    // 怪物被踩扁或被子弹打爆，喷溅出大量的卡通糖果状粒子
    explode(particles) {
        Assets.Sound.playExplode();
        const pColor = this.type === 'monster' ? '#d946ef' : '#c084fc';
        const numParticles = this.type === 'monster' ? 20 : 35;
        
        for (let i = 0; i < numParticles; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8 + 3;
            particles.push(new Particle(
                this.x + this.width / 2,
                this.y + this.height / 2,
                {
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 2,
                    color: i % 2 === 0 ? pColor : '#fff',
                    type: 'rect',
                    width: Math.random() * 6 + 4,
                    height: Math.random() * 6 + 4,
                    gravity: 0.25,
                    decay: 0.02
                }
            ));
        }
    }

    // 怪物被玩家用脚踩死时的特有扁平压爆特效
    stompExplode(particles) {
        Assets.Sound.playSquish(); // 播放踩扁专用噗嗤音效

        const pColor = this.type === 'monster' ? '#d946ef' : '#c084fc';
        const numParticles = 24;

        // 1. 横向喷射压扁的碎黏糊纸屑粒子
        for (let i = 0; i < numParticles; i++) {
            const isLeft = Math.random() < 0.5;
            // 强横向移动，弱纵向移动
            const vx = (isLeft ? -1 : 1) * (Math.random() * 8 + 4);
            const vy = Math.random() * -3 - 1;

            particles.push(new Particle(
                this.x + this.width / 2,
                this.y + this.height / 2,
                {
                    vx: vx,
                    vy: vy,
                    color: i % 2 === 0 ? pColor : '#fff',
                    type: 'rect',
                    width: Math.random() * 9 + 6,  // 较宽的粒子
                    height: Math.random() * 3 + 1.5, // 扁长形状
                    gravity: 0.22,
                    decay: 0.025
                }
            ));
        }

        // 2. 溅出金色的小亮星表示华丽痛击
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 2;
            particles.push(new Particle(
                this.x + this.width / 2,
                this.y + this.height / 2,
                {
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 1.5,
                    color: '#fbbf24', // 金色
                    type: 'circle',
                    radius: Math.random() * 3.5 + 2.5,
                    gravity: 0.16,
                    decay: 0.03
                }
            ));
        }
    }
}

// --------------------------------------------------------------------------
// 5. 平台 (Platform) 类
// --------------------------------------------------------------------------
class Platform {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type; // 'green', 'blue', 'brown', 'white', 'fade'
        this.width = 88;
        this.height = 20;
        this.active = true;

        // 移动平台参数
        if (type === 'blue') {
            this.vx = Math.random() < 0.5 ? -1.8 : 1.8;
        } else {
            this.vx = 0;
        }

        // 限时消失平台寿命 (3秒 = 180帧)
        // 寿命只有在台阶进入屏幕视口后才开始倒计时
        if (type === 'fade') {
            this.life = 180;
            this.hasEnteredView = false;
        } else {
            this.life = 0;
        }

        // 易碎平台碎裂动画状态
        this.isBroken = false;
        this.breakProgress = 0;

        // 附加装置 (弹簧/蹦床) 状态
        this.addon = null; // 'spring' 或 'trampoline'
        this.addonState = 'idle'; // 'idle', 'stepped', 'bounce'
        this.addonWidth = 0;
        this.addonHeight = 0;
        this.addonOffsetX = 0;
        this.addonTimer = 0;
    }

    // 附着弹簧/蹦床
    attachAddon(type) {
        this.addon = type;
        this.addonState = 'idle';
        if (type === 'spring') {
            this.addonWidth = 18;
            this.addonHeight = 14;
            this.addonOffsetX = Math.random() * (this.width - this.addonWidth - 10) + 5;
        } else if (type === 'trampoline') {
            this.addonWidth = 40;
            this.addonHeight = 12;
            this.addonOffsetX = (this.width - this.addonWidth) / 2; // 居中
        }
    }

    update(canvasWidth, particles, cameraY, canvasHeight) {
        // 蓝平台左右移动
        if (this.type === 'blue' && !this.isBroken) {
            this.x += this.vx;
            // 边缘碰壁反弹
            if (this.x <= 0) {
                this.x = 0;
                this.vx = -this.vx;
            } else if (this.x + this.width >= canvasWidth) {
                this.x = canvasWidth - this.width;
                this.vx = -this.vx;
            }
        }

        // 限时消失平台生命衰减及自毁判定
        // 寿命只在台阶**当前位于相机视口内**时才递减，
        // 一旦滚到屏幕外（上或下）立即暂停倒计时，避免视口外自毁播放音效
        if (this.type === 'fade' && !this.isBroken) {
            let inView = true;
            if (cameraY !== undefined && canvasHeight !== undefined) {
                inView = (this.y + this.height >= cameraY) && (this.y <= cameraY + canvasHeight);
                if (inView) {
                    this.hasEnteredView = true;
                }
            }
            if (this.hasEnteredView && inView) {
                this.life--;
                if (this.life <= 0) {
                    this.breakPlatform(particles, '#facc15');
                }
            }
        }

        // 棕色断裂平台更新
        if (this.isBroken) {
            this.breakProgress += 1;
            // 动画播放完毕或掉出屏幕后失效
            if (this.breakProgress > 60) {
                this.active = false;
            }
        }

        // 弹跳道具的动画回弹计时
        if (this.addonState !== 'idle') {
            this.addonTimer++;
            if (this.addonState === 'stepped' && this.addonTimer > 4) {
                this.addonState = 'bounce';
                this.addonTimer = 0;
            } else if (this.addonState === 'bounce' && this.addonTimer > 20) {
                this.addonState = 'idle';
                this.addonTimer = 0;
            }
        }
    }

    draw(ctx) {
        if (!this.active) return;

        // 1. 绘制平台主体
        if (this.type === 'green') {
            Assets.Draw.greenPlatform(ctx, this.x, this.y, this.width, this.height);
        } else if (this.type === 'blue') {
            Assets.Draw.bluePlatform(ctx, this.x, this.y, this.width, this.height);
        } else if (this.type === 'brown') {
            Assets.Draw.brownPlatform(ctx, this.x, this.y, this.width, this.height, this.isBroken, this.breakProgress);
        } else if (this.type === 'white') {
            Assets.Draw.whitePlatform(ctx, this.x, this.y, this.width, this.height, this.isBroken, this.breakProgress);
        } else if (this.type === 'fade') {
            Assets.Draw.fadePlatform(ctx, this.x, this.y, this.width, this.height, this.life, this.isBroken, this.breakProgress);
        }

        // 2. 绘制附加踩踏道具 (只有没碎时才绘制)
        if (this.addon && !this.isBroken) {
            const ax = this.x + this.addonOffsetX;
            const ay = this.y - this.addonHeight;
            if (this.addon === 'spring') {
                Assets.Draw.spring(ctx, ax, ay, this.addonWidth, this.addonHeight, this.addonState);
            } else if (this.addon === 'trampoline') {
                Assets.Draw.trampoline(ctx, ax, ay, this.addonWidth, this.addonHeight, this.addonState);
            }
        }
    }

    // 易碎平台踏空/时效爆裂碎屑
    breakPlatform(particles, customColor = '#f87171') {
        this.isBroken = true;
        Assets.Sound.playBreak();
        // 溅出对应颜色的碎片粒子
        for (let i = 0; i < 8; i++) {
            particles.push(new Particle(
                this.x + this.width / 2 + Math.random() * 20 - 10,
                this.y + this.height / 2,
                {
                    vx: Math.random() * 4 - 2,
                    vy: Math.random() * -3 + 1,
                    color: customColor,
                    type: 'rect',
                    width: Math.random() * 8 + 3,
                    height: Math.random() * 4 + 2,
                    gravity: 0.2,
                    decay: 0.02
                }
            ));
        }
    }
}

// --------------------------------------------------------------------------
// 6. 主角 (Player) 类
// --------------------------------------------------------------------------
class Player {
    constructor(canvasWidth, canvasHeight) {
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;

        this.width = 58;  // 逻辑物理碰撞宽
        this.height = 52; // 逻辑物理碰撞高

        // 旋转空翻动画状态
        this.isSpinning = false;
        this.spinAngle = 0;

        // 护盾时效定时器
        this.shieldTimer = 0;

        this.reset();
    }

    reset() {
        this.x = this.canvasWidth / 2 - this.width / 2;
        this.y = this.canvasHeight * 0.6; // 初始在屏幕下方
        this.vx = 0;
        this.vy = 0;
        this.dir = 1; // 1代表右，-1代表左
        this.skin = 'default';

        // 各种道具计时器与状态
        this.hasRocket = false;
        this.rocketTimer = 0;
        this.rocketRampTimer = 0;
        this.rocketRampStartVy = -10;
        this.hasPropeller = false;
        this.propellerTimer = 0;
        this.flightProtectionTimer = 0;
        this.trampolineProtectionTimer = 0;
        this.hasShield = false;
        this.shieldTimer = 0;

        this.isShooting = false;
        this.shootCooldown = 0;
        this.shootAnimTimer = 0;
        this.isDead = false;

        this.isSpinning = false;
        this.spinAngle = 0;
    }

    // 玩家弹跳
    jump(power = 12) {
        if (this.isDead) return;
        this.vy = -power;
        Assets.Sound.playJump();
    }

    isFlightProtected() {
        return this.hasRocket || this.hasPropeller || this.flightProtectionTimer > 0;
    }

    isBounceProtected() {
        return this.isSpinning || this.trampolineProtectionTimer > 0;
    }

    isEnemyCrashProtected() {
        return this.isFlightProtected() || this.isBounceProtected();
    }

    // 发射子弹 (附带枪口火花动画粒子)
    shoot(bulletsList, angle = -Math.PI / 2, particles = null) {
        if (this.isDead || this.shootCooldown > 0 || this.hasRocket || this.hasPropeller) return;

        // 嘴巴在角色本地坐标系中从 width/4 向 +x 方向延伸 26px，所以嘴巴尖端距离身体中心约 width/4 + 26 ≈ 40px
        // 自定义图片皮肤时，嘴巴整体外移 14px，子弹起点跟随
        const isImageSkin = (typeof Assets !== 'undefined' && Assets.SkinImages && Assets.SkinImages[this.skin]);
        const mouthShift = isImageSkin ? 14 : 0;
        const mouthTipDist = this.width / 4 + 26 + mouthShift;

        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const bx = centerX + Math.cos(angle) * mouthTipDist;
        const by = centerY + Math.sin(angle) * mouthTipDist;
        
        bulletsList.push(new Bullet(bx, by, angle));

        // 枪口火花动画：在嘴巴尖端外侧几像素处喷出黄白色亮粒子
        if (particles) {
            const muzzleX = centerX + Math.cos(angle) * (mouthTipDist + 4);
            const muzzleY = centerY + Math.sin(angle) * (mouthTipDist + 4);
            for (let i = 0; i < 10; i++) {
                // 在发射方向上前后扇形扩散 ±0.6 弧度
                const spread = (Math.random() - 0.5) * 1.2;
                const fAngle = angle + spread;
                const fSpeed = Math.random() * 5 + 2.5;
                particles.push(new Particle(muzzleX, muzzleY, {
                    vx: Math.cos(fAngle) * fSpeed,
                    vy: Math.sin(fAngle) * fSpeed,
                    color: i % 2 === 0 ? '#facc15' : '#fde68a',
                    radius: Math.random() * 3 + 1.5,
                    gravity: 0,
                    decay: 0.08
                }));
            }
            // 中心一颗大白光闪
            particles.push(new Particle(muzzleX, muzzleY, {
                vx: Math.cos(angle) * 1.5,
                vy: Math.sin(angle) * 1.5,
                color: '#ffffff',
                radius: 7,
                gravity: 0,
                decay: 0.16
            }));
        }
        
        // 激活射击姿态：延长动画窗口让"抬头朝上射击"动作更明显
        this.isShooting = true;
        this.shootAngle = angle;
        this.shootCooldown = 18;     // 增加冷却便于视觉反馈
        this.shootAnimTimer = 14;    // 14 帧的姿态动画窗口（约 0.23 秒）
        Assets.Sound.playShoot();
    }

    // 获得道具
    useItem(type) {
        if (this.isDead) return;
        
        if (type === 'shield') {
            this.hasShield = true;
            this.shieldTimer = 900; // 护盾维持 15 秒 (900 帧)
            Assets.Sound.playShield();
        } else if (type === 'propeller') {
            // 如果已经在火箭状态，则不降级
            if (this.hasRocket) return;
            this.hasPropeller = true;
            this.hasRocket = false;
            this.propellerTimer = 240; // 维持4秒
            this.flightProtectionTimer = 8;
            this.vy = -10; // 起步推力
            Assets.Sound.stopRocket();
            Assets.Sound.startPropeller();
        } else if (type === 'rocket') {
            this.hasRocket = true;
            this.hasPropeller = false;
            this.rocketTimer = 240; // 维持4秒极速
            this.rocketRampTimer = 8;
            this.flightProtectionTimer = 8;
            // 起步推力先平滑进入极速，避免拾取瞬间速度和相机同时跳变造成抖动感
            if (this.vy > 0) this.vy = 0;
            this.rocketRampStartVy = Math.min(this.vy, -10);
            this.vy = this.rocketRampStartVy;
            Assets.Sound.stopPropeller();
            Assets.Sound.startRocket();
        }
    }

    update(particles) {
        if (this.isDead) {
            // 死亡下坠物理，停止所有持续性音效
            Assets.Sound.stopRocket();
            Assets.Sound.stopPropeller();
            this.vy += 0.35;
            this.y += this.vy;
            this.x += this.vx;
            return;
        }

        // 护盾时效衰减自动消失
        if (this.hasShield) {
            this.shieldTimer--;
            if (this.shieldTimer <= 0) {
                this.hasShield = false;
                this.shieldTimer = 0;
                Assets.Sound.playShieldFade(); // 时效到期，播放淡出消失音效
            }
        }

        if (this.trampolineProtectionTimer > 0) {
            this.trampolineProtectionTimer--;
        }

        // 1. 冷却与射击姿态恢复
        if (this.shootCooldown > 0) {
            this.shootCooldown--;
        }
        if (this.shootAnimTimer > 0) {
            this.shootAnimTimer--;
            if (this.shootAnimTimer <= 0) {
                this.isShooting = false;
            }
        }

        // 2. 道具时效计算
        if (this.hasRocket) {
            this.flightProtectionTimer = 8;
            if (this.rocketRampTimer > 0) {
                const rampProgress = 1 - this.rocketRampTimer / 8;
                this.vy = this.rocketRampStartVy + (-16 - this.rocketRampStartVy) * rampProgress;
                this.rocketRampTimer--;
            } else {
                this.vy = -16; // 维持极高上升速度
            }
            this.rocketTimer--;
            
            // 喷射粒子火焰：火箭尾部喷出真实窄锥火焰流 (集中朝下，幅度收敛)
            const nozzleX = this.x + (this.dir === 1 ? -6 : this.width + 6);
            const nozzleY = this.y + this.height - 6;

            // 每帧只喷 1~2 颗，模拟真实火箭尾焰
            if (Math.random() < 0.85) {
                const isCore = Math.random() < 0.45;
                particles.push(new Particle(
                    nozzleX + (Math.random() - 0.5) * 3,
                    nozzleY,
                    {
                        vx: (Math.random() - 0.5) * 0.8, // 几乎不横向扩散
                        vy: Math.random() * 2 + 5,        // 直直朝下喷
                        color: isCore ? '#fef3c7' : (Math.random() < 0.5 ? '#f97316' : '#ef4444'),
                        radius: isCore ? Math.random() * 2 + 1.5 : Math.random() * 3 + 2,
                        gravity: 0.02,
                        decay: 0.06
                    }
                ));
            }

            if (this.rocketTimer <= 0) {
                this.hasRocket = false;
                Assets.Sound.stopRocket();
            }
        } else if (this.hasPropeller) {
            this.flightProtectionTimer = 8;
            this.vy = -8.5; // 维持平滑中速上升
            this.propellerTimer--;

            // 产生一些微弱的风粒子
            if (Math.random() < 0.25) {
                particles.push(new Particle(this.x + this.width / 2, this.y - 12, {
                    vx: Math.random() * 2 - 1,
                    vy: Math.random() * 2 + 1,
                    color: 'rgba(255,255,255,0.7)',
                    radius: Math.random() * 3 + 1,
                    gravity: 0,
                    decay: 0.05
                }));
            }

            if (this.propellerTimer <= 0) {
                this.hasPropeller = false;
                Assets.Sound.stopPropeller();
            }
        } else {
            if (this.flightProtectionTimer > 0) {
                this.flightProtectionTimer--;
            }
            // 普通重力物理
            this.vy += 0.38; // 重力加速度 g (由0.36微调提升，手感更扎实)
            // 终端速度（最大落速限制）
            if (this.vy > 14) this.vy = 14;
        }

        // 旋转空翻动画更新
        if (this.isSpinning) {
            this.spinAngle += 0.21;
            if (this.spinAngle >= Math.PI * 2) {
                this.isSpinning = false;
                this.spinAngle = 0;
            }
        }

        // 3. 应用速度位移
        this.y += this.vy;
        this.x += this.vx;

        // 横向磨擦力（让键盘操控有缓冲惯性，手感滑润）
        this.vx *= 0.84;

        // 4. 左右边缘无限穿梭
        if (this.x + this.width < 0) {
            this.x = this.canvasWidth;
        } else if (this.x > this.canvasWidth) {
            this.x = -this.width;
        }
    }

    draw(ctx) {
        // 卡通绘制 Doodler 状态
        const state = {
            isShooting: this.isShooting,
            shootAngle: this.shootAngle,
            // 射击动画进度 (0=刚发射, 1=动画结束)，绘制端用它控制后坐力位移和枪口闪光
            shootAnimProgress: this.shootAnimTimer > 0 ? 1 - this.shootAnimTimer / 14 : 1,
            hasRocket: this.hasRocket,
            rocketTimer: this.rocketTimer,
            hasPropeller: this.hasPropeller,
            propellerTimer: this.propellerTimer,
            hasShield: this.hasShield,
            shieldTimer: this.shieldTimer,
            spinAngle: this.spinAngle
        };
        Assets.Draw.player(ctx, this.x, this.y, this.width, this.height, this.dir, this.vy, state, this.skin);
    }

    // 落地扬尘粒子
    dustExplosion(particles) {
        for (let i = 0; i < 6; i++) {
            particles.push(new Particle(
                this.x + this.width / 2,
                this.y + this.height - 2,
                {
                    vx: Math.random() * 4 - 2,
                    vy: Math.random() * -1.5 - 0.5,
                    color: 'rgba(255,255,255,0.6)',
                    radius: Math.random() * 4 + 3,
                    gravity: 0.05,
                    decay: 0.05
                }
            ));
        }
    }
}
