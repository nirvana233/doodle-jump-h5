/**
 * ==========================================================================
 * game.js - 游戏主控制中心、渲染循环与输入绑定
 * ==========================================================================
 */

const Game = (function() {
    // Canvas 与渲染上下文
    let canvas = null;
    let ctx = null;

    // 游戏状态定义
    const STATES = { MENU: 0, PLAYING: 1, PAUSED: 2, GAMEOVER: 3 };
    let currentState = STATES.MENU;

    // 游戏核心实体列表
    let player = null;
    let platforms = [];
    let items = [];
    let enemies = [];
    let bullets = [];
    let particles = [];
    let scorePopups = []; // 加分飘字提示队列

    // 摄像机与关卡生成状态
    const camera = { x: 0, y: 0 };
    const levelState = { lastY: 0, lastX: 0 };

    // 游戏数据统计
    let score = 0;
    let highScore = 0;

    // 输入控制状态
    const keys = {};
    let tiltX = 0;             // 重力感应倾斜度 (gamma 轴角度值)
    let isTouchActive = false;
    let touchStartTime = 0;
    let lastTouchX = 0;        // 相对位移拖拽的上一帧触点物理横坐标
    let touchStartX = 0;       // 触屏起点的物理横坐标
    let touchStartY = 0;       // 触屏起点的物理纵坐标
    let touchXDelta = 0;       // 触屏滑动位移增量累加器（逻辑坐标系）
    let controlMode = 'keyboard'; // 操控模式: 'keyboard', 'touch', 'tilt'

    // 屏幕抖动（Screen Shake）系统
    let shakeIntensity = 0;
    let shakeDuration = 0;

    // 视差滚动背景元素 (云朵 & 星星)
    let clouds = [];
    let stars = [];

    function syncViewportSize() {
        const viewport = window.visualViewport;
        const width = Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth);
        const height = Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight);
        document.documentElement.style.setProperty('--viewport-width', `${width}px`);
        document.documentElement.style.setProperty('--viewport-height', `${height}px`);
    }

    // 动态重算 Canvas 视口比例：CSS 物理尺寸和 canvas 逻辑尺寸始终同宽高比，避免黑边、裁切和拉伸。
    function handleResize() {
        if (!canvas) return;
        syncViewportSize();

        const container = document.getElementById('game-container');
        if (!container) return;

        // 直接读取容器渲染后的物理宽高，绝对精准同步 CSS 的高宽比限幅
        const rect = container.getBoundingClientRect();
        const physicalW = rect.width || window.innerWidth;
        const physicalH = rect.height || window.innerHeight;
        const screenRatio = physicalH / physicalW;
        const baseW = 480;
        const baseH = 800;
        const baseRatio = baseH / baseW;
        const prevW = canvas.width || baseW;

        if (screenRatio >= baseRatio) {
            canvas.width = baseW;
            canvas.height = Math.round(baseW * screenRatio);
        } else {
            canvas.height = baseH;
            canvas.width = Math.round(baseH / screenRatio);
        }

        // 运行时若大小改变，动态更新 player 内部边界
        if (player) {
            const xScale = canvas.width / prevW;
            player.x *= xScale;
            player.canvasWidth = canvas.width;
            player.canvasHeight = canvas.height;
        }
    }

    // ----------------------------------------------------------------------
    // 1. 初始化入口
    // ----------------------------------------------------------------------
    function init() {
        canvas = document.getElementById('game-canvas');
        
        // 绑定窗口改变大小事件，实时保障物理比例一致
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', () => setTimeout(handleResize, 200));
        // iOS Safari 地址栏出现/隐藏时 visualViewport 会变，需要重新计算
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleResize);
            window.visualViewport.addEventListener('scroll', handleResize);
        }
        handleResize(); // 首次主动执行
        
        ctx = canvas.getContext('2d');

        // 读取本地历史最高分
        highScore = parseInt(localStorage.getItem('doodle_bounce_highscore') || '0');
        document.getElementById('menu-high-score').textContent = highScore;

        // 加载在线排行榜
        fetchGlobalLeaderboard('global-leaderboard');
        fetchGlobalLeaderboard('global-leaderboard-start');
        renderLocalRanking('local-ranking-start');

        // 恢复上次输入的昵称
        const savedName = getPlayerName();
        if (savedName) {
            document.getElementById('player-name-input').value = savedName;
        }

        // 确保匿名设备 ID 已创建
        getOrCreatePlayerId();

        // 初始化背景视差元素
        initBackgroundElements();

        // 绑定 DOM 按钮与交互
        bindUIEvents();

        // 绑定键盘、鼠标与触摸输入
        bindInputs();

        // 开启 requestAnimationFrame 渲染主循环
        requestAnimationFrame(gameLoop);
    }

    // ----------------------------------------------------------------------
    // 2. DOM 界面交互绑定
    // ----------------------------------------------------------------------
    function bindUIEvents() {
        const startMenu = document.getElementById('start-menu');
        const pauseMenu = document.getElementById('pause-menu');
        const gameoverMenu = document.getElementById('gameover-menu');
        const hud = document.getElementById('hud');

        // 开始冒险
        document.getElementById('btn-start').addEventListener('click', () => {
            startMenu.classList.add('hidden');
            hud.classList.remove('hidden');
            requestTiltPermission(); // 在手势回调内申请设备倾斜感应权限，以通过 iOS 安全拦截
            startGame();
        });

        // 暂停游戏
        document.getElementById('btn-pause').addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentState === STATES.PLAYING) {
                pauseGame();
            }
        });

        // 继续游戏
        document.getElementById('btn-resume').addEventListener('click', () => {
            resumeGame();
        });

        // 重新开始 (在暂停菜单中)
        document.getElementById('btn-restart-pause').addEventListener('click', () => {
            pauseMenu.classList.add('hidden');
            startGame();
        });

        // 返回主菜单 (在暂停菜单中)
        document.getElementById('btn-home-pause').addEventListener('click', () => {
            pauseMenu.classList.add('hidden');
            hud.classList.add('hidden');
            startMenu.classList.remove('hidden');
            currentState = STATES.MENU;
            Assets.Sound.stopRocket();
            Assets.Sound.stopPropeller();
            resetGameWorld();
        });

        // 重新开始 (在结算菜单中)
        document.getElementById('btn-restart').addEventListener('click', () => {
            gameoverMenu.classList.add('hidden');
            hud.classList.remove('hidden');
            startGame();
        });

        // 返回主菜单 (在结算菜单中)
        document.getElementById('btn-home').addEventListener('click', () => {
            gameoverMenu.classList.add('hidden');
            hud.classList.add('hidden');
            startMenu.classList.remove('hidden');
            currentState = STATES.MENU;
            Assets.Sound.stopRocket();
            Assets.Sound.stopPropeller();
            resetGameWorld();
            // 返回主菜单时刷新排行
            fetchGlobalLeaderboard('global-leaderboard-start');
            fetchGlobalLeaderboard('global-leaderboard');
            renderLocalRanking('local-ranking-start');
        });

        // 提交分数到全服排行
        document.getElementById('btn-submit-score').addEventListener('click', () => {
            const nameInput = document.getElementById('player-name-input');
            const name = nameInput.value.trim();
            if (!name) {
                const statusEl = document.getElementById('submit-status');
                statusEl.className = 'submit-status error';
                statusEl.textContent = '请输入昵称';
                statusEl.classList.remove('hidden');
                return;
            }
            savePlayerName(name);
            submitGlobalScore(name, score);
        });

        // 回车键提交分数
        document.getElementById('player-name-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('btn-submit-score').click();
            }
        });

        // 皮肤切换
        const skinBtns = document.querySelectorAll('.skin-btn');
        let previewSkinName = 'default';
        skinBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                skinBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const skinName = btn.getAttribute('data-skin');
                previewSkinName = skinName;

                // 如果玩家已经存在，切换皮肤
                if (player) {
                    player.skin = skinName;
                }
            });
        });

        // 主菜单角色预览：在专用 canvas 上调用游戏内同款 Assets.Draw.player 渲染，确保
        // 所有皮肤装饰（库洛米兔耳/海绵宝宝孔/皮卡丘耳朵等）与游戏内一致
        const previewCanvas = document.getElementById('character-preview-canvas');
        if (previewCanvas) {
            const previewCtx = previewCanvas.getContext('2d');
            const PW = 60;  // 预览角色逻辑宽
            const PH = 54;  // 预览角色逻辑高
            
            function drawPreview() {
                if (!previewCtx) return;
                previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
                // 预览角色固定姿态：vy=-2 表示轻微上升 (squash & stretch 微动效)
                const cx = previewCanvas.width / 2 - PW / 2;
                const cy = previewCanvas.height / 2 - PH / 2;
                const dummyState = {
                    isShooting: false,
                    hasRocket: false,
                    hasPropeller: false,
                    hasShield: false,
                    shieldTimer: 0,
                    spinAngle: 0
                };
                Assets.Draw.player(previewCtx, cx, cy, PW, PH, 1, -2, dummyState, previewSkinName);
            }
            
            // 持续刷新预览以适配动画 (例如 SkinImages 异步加载完成后能即时显示)
            setInterval(drawPreview, 100);
            drawPreview();
        }
    }

    // ----------------------------------------------------------------------
    // 3. 用户标识 + 本地排行 + 全服排行
    // ----------------------------------------------------------------------

    /** 生成唯一匿名设备 ID（首次访问时创建） */
    function getOrCreatePlayerId() {
        const KEY = 'bouncy_player_id';
        let id = localStorage.getItem(KEY);
        if (!id) {
            // 生成 v4 UUID
            id = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem(KEY, id);
        }
        return id;
    }

    function getLeaderboardApiUrl() {
        return '/api/score';
    }

    // 昵称存取
    function getPlayerName() {
        return localStorage.getItem('bouncy_player_name') || '';
    }
    function savePlayerName(name) {
        localStorage.setItem('bouncy_player_name', name);
    }

    // ---------- 本地排行（自己设备上的历史分数） ----------

    function getLocalScores() {
        try {
            return JSON.parse(localStorage.getItem('bouncy_local_scores')) || [];
        } catch { return []; }
    }

    function addLocalScore(score, name) {
        const scores = getLocalScores();
        scores.push({ score, name, date: new Date().toLocaleDateString() });
        // 按分数降序排列，最多保留 50 条
        scores.sort((a, b) => b.score - a.score);
        if (scores.length > 50) scores.length = 50;
        localStorage.setItem('bouncy_local_scores', JSON.stringify(scores));
    }

    function renderLocalRanking(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const scores = getLocalScores();
        if (scores.length === 0) {
            container.innerHTML = '<p class="leaderboard-loading">暂无本地记录</p>';
            return;
        }
        container.innerHTML = scores.slice(0, 10).map((entry, i) => {
            let rankText, rankClass = '';
            if (i === 0) { rankClass = 'gold'; rankText = '🥇'; }
            else if (i === 1) { rankClass = 'silver'; rankText = '🥈'; }
            else if (i === 2) { rankClass = 'bronze'; rankText = '🥉'; }
            else { rankText = '#' + (i + 1); }
            return `<div class="leaderboard-item">
                <span class="leaderboard-rank ${rankClass}">${rankText}</span>
                <span class="leaderboard-name">${escapeHtml(entry.name || '玩家')}</span>
                <span class="leaderboard-score">${entry.score.toLocaleString()}</span>
            </div>`;
        }).join('');
    }

    // ---------- 全服排行（在线 API） ----------

    function fetchGlobalLeaderboard(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        fetch(getLeaderboardApiUrl())
            .then(res => res.json())
            .then(data => {
                if (!data.success || !data.scores || data.scores.length === 0) {
                    container.innerHTML = '<p class="leaderboard-loading">暂无记录，快来挑战吧!</p>';
                    return;
                }
                container.innerHTML = data.scores.map((entry, i) => {
                    let rankText, rankClass = '';
                    if (i === 0) { rankClass = 'gold'; rankText = '🥇'; }
                    else if (i === 1) { rankClass = 'silver'; rankText = '🥈'; }
                    else if (i === 2) { rankClass = 'bronze'; rankText = '🥉'; }
                    else { rankText = '#' + (i + 1); }
                    return `<div class="leaderboard-item">
                        <span class="leaderboard-rank ${rankClass}">${rankText}</span>
                        <span class="leaderboard-name">${escapeHtml(entry.name)}</span>
                        <span class="leaderboard-score">${entry.score.toLocaleString()}</span>
                    </div>`;
                }).join('');
            })
            .catch(() => {
                container.innerHTML = '<p class="leaderboard-loading">全服排行暂时不可用</p>';
            });
    }

    // 提交分数到全服排行
    function submitGlobalScore(name, score) {
        const statusEl = document.getElementById('submit-status');
        const submitBtn = document.getElementById('btn-submit-score');
        if (!statusEl || !submitBtn) return;

        statusEl.classList.remove('hidden', 'success', 'error');
        statusEl.textContent = '提交中...';
        submitBtn.disabled = true;

        fetch(getLeaderboardApiUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                score,
                playerId: getOrCreatePlayerId()
            })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    let msg = data.personalBest
                        ? `个人最高 ${data.personalBest.toLocaleString()} 分，未更新`
                        : `🎉 全服排名第 ${data.rank} 名！`;
                    statusEl.className = 'submit-status success';
                    statusEl.textContent = msg;
                    fetchGlobalLeaderboard('global-leaderboard');
                } else {
                    statusEl.className = 'submit-status error';
                    statusEl.textContent = data.error || '提交失败';
                }
            })
            .catch(() => {
                statusEl.className = 'submit-status error';
                statusEl.textContent = '网络错误，请稍后重试';
            })
            .finally(() => {
                submitBtn.disabled = false;
            });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ----------------------------------------------------------------------
    // 4. 游戏手感输入处理器
    // ----------------------------------------------------------------------
    function bindInputs() {
        // 键盘按下
        window.addEventListener('keydown', (e) => {
            keys[e.code] = true;
            
            // 若按下左右移动按键，强制切换到键盘操控模式
            if (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'KeyD' || e.code === 'ArrowRight') {
                controlMode = 'keyboard';
            }

            // 空格键或 W 或 向上键 触发射击 (按键统一朝正上方发射)
            if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
                e.preventDefault();
                if (currentState === STATES.PLAYING && player && !player.isDead) {
                    player.shoot(bullets, -Math.PI / 2, particles);
                }
            }
            // P 键触发暂停
            if (e.code === 'KeyP') {
                if (currentState === STATES.PLAYING) pauseGame();
                else if (currentState === STATES.PAUSED) resumeGame();
            }
        });

        // 键盘抬起
        window.addEventListener('keyup', (e) => {
            keys[e.code] = false;
        });

        function getClickShootAngle(clientX, clientY) {
            const rect = canvas.getBoundingClientRect();
            const physicalX = clientX - rect.left;
            const physicalY = clientY - rect.top;
            const logicalX = (physicalX / rect.width) * canvas.width;
            const logicalY = (physicalY / rect.height) * canvas.height;

            const playerCenterX = player.x + player.width / 2;
            const playerCenterY = player.y + player.height / 2;
            const playerBottomY = player.y + player.height;
            let worldY = logicalY + camera.y;

            if (worldY >= playerBottomY) {
                const belowBottom = worldY - playerBottomY;
                worldY = player.y - belowBottom;
            }
            worldY = Math.min(worldY, playerCenterY - 1);

            return Math.atan2(worldY - playerCenterY, logicalX - playerCenterX);
        }

        // 鼠标点击射击：朝向点击位置；如果点在角色底部以下，则映射为对应的顶部方向
        canvas.addEventListener('mousedown', (e) => {
            if (currentState === STATES.PLAYING && e.button === 0 && player && !player.isDead) {
                player.shoot(bullets, getClickShootAngle(e.clientX, e.clientY), particles);
            }
        });

        // 绑定手机重力感应倾斜事件
        window.addEventListener('deviceorientation', handleDeviceOrientation);

        // 移动端：仅保留"轻点屏幕射击"，左右移动统一交给重力感应（不再用滑动手势）
        canvas.addEventListener('touchstart', (e) => {
            touchStartTime = Date.now();
            if (e.touches.length > 0) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
        }, { passive: true });

        canvas.addEventListener('touchend', (e) => {
            // 如果触摸持续时间极短（小于 250 毫秒），判断为轻点屏幕发射子弹
            const touchDuration = Date.now() - touchStartTime;
            if (touchDuration < 250 && currentState === STATES.PLAYING && player && !player.isDead) {
                player.shoot(bullets, getClickShootAngle(touchStartX, touchStartY), particles);
            }
        }, { passive: true });
    }

    // 重力感应倾斜事件回调
    function handleDeviceOrientation(e) {
        if (e.gamma !== null) {
            tiltX = e.gamma;
            // 收到陀螺仪数据即视为移动设备，自动切换到 tilt 模式
            controlMode = 'tilt';
        }
    }

    // iOS 设备重力感应主动授权申请
    function requestTiltPermission() {
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        window.addEventListener('deviceorientation', handleDeviceOrientation);
                        console.log('重力感应授权成功！');
                    }
                })
                .catch(err => {
                    console.warn('请求重力感应权限授权失败: ', err);
                });
        }
    }

    // ----------------------------------------------------------------------
    // 4. 背景视差元素初始化
    // ----------------------------------------------------------------------
    function initBackgroundElements() {
        clouds = [];
        // 生成5朵浮云
        for (let i = 0; i < 6; i++) {
            clouds.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                width: Math.random() * 60 + 50,
                height: Math.random() * 20 + 20,
                speed: Math.random() * 0.15 + 0.05
            });
        }

        stars = [];
        // 生成30颗小星星（宇宙用），闪烁速度大幅放缓让背景更宁静
        for (let i = 0; i < 40; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: Math.random() * 1.5 + 0.5,
                twinkleSpeed: Math.random() * 0.0015 + 0.0008, // 由 0.02~0.07 大幅降到 0.0008~0.0023，闪得慢一点
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    // ----------------------------------------------------------------------
    // 5. 游戏生命周期控制
    // ----------------------------------------------------------------------
    function resetGameWorld() {
        // 完全清理游戏世界，避免主菜单时画布残留上局画面
        player = null;
        platforms = [];
        items = [];
        enemies = [];
        bullets = [];
        particles = [];
        scorePopups = [];
        camera.x = 0;
        camera.y = 0;
        score = 0;
        shakeIntensity = 0;
        shakeDuration = 0;
    }

    function startGame() {
        // 重置核心实体与持续音效
        Assets.Sound.stopRocket();
        Assets.Sound.stopPropeller();
        player = new Player(canvas.width, canvas.height);
        
        // 应用当前选中的皮肤
        const activeSkinBtn = document.querySelector('.skin-btn.active');
        if (activeSkinBtn) {
            player.skin = activeSkinBtn.getAttribute('data-skin');
        }

        platforms = [];
        items = [];
        enemies = [];
        bullets = [];
        particles = [];
        scorePopups = [];

        score = 0;
        document.getElementById('hud-score').textContent = '0';

        // 重置相机坐标
        camera.x = 0;
        camera.y = 0;

        // 初始化关卡生成状态 (同步首个安全大平台的 Y 轴坐标，消除新手段落的间距偏差)
        levelState.lastY = canvas.height - 50;
        levelState.lastX = canvas.width / 2;
        levelState.startCanvasHeight = canvas.height;

        // 生成初始安全大平台，确保玩家一落地有安全跳跃缓冲
        const bottomSafety = new Platform(canvas.width / 2 - 40, canvas.height - 50, 'green');
        bottomSafety.width = 80;
        platforms.push(bottomSafety);

        // 生成一屏幕的初始平台
        Physics.generateLevel(platforms, items, enemies, camera, canvas.width, levelState);

        // 开局第一跳使用普通平台的同一套跳跃速度，避免单独调参造成体感不一致。
        player.jump(14.6);

        currentState = STATES.PLAYING;
    }

    function pauseGame() {
        currentState = STATES.PAUSED;
        document.getElementById('pause-menu').classList.remove('hidden');
    }

    function resumeGame() {
        currentState = STATES.PLAYING;
        document.getElementById('pause-menu').classList.add('hidden');
    }

    function gameOver() {
        currentState = STATES.GAMEOVER;
        Assets.Sound.stopRocket();
        Assets.Sound.stopPropeller();

        // 更新历史高分
        let isNewRecord = false;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('doodle_bounce_highscore', highScore);
            document.getElementById('menu-high-score').textContent = highScore;
            isNewRecord = true;
        }

        // 显示结算 UI
        document.getElementById('gameover-score').textContent = score;
        document.getElementById('gameover-high-score').textContent = highScore;

        const badge = document.getElementById('new-record-badge');
        if (isNewRecord) {
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        document.getElementById('gameover-menu').classList.remove('hidden');

        // 存储本地排行 + 刷新本地排行 UI
        const savedName = getPlayerName() || '玩家';
        addLocalScore(score, savedName);
        renderLocalRanking('local-ranking-gameover');

        // 加载全服排行榜
        fetchGlobalLeaderboard('global-leaderboard');

        // 清空上次提交状态
        const statusEl = document.getElementById('submit-status');
        statusEl.classList.add('hidden');
        // 自动填入已保存的昵称
        if (savedName) {
            document.getElementById('player-name-input').value = savedName;
        }
    }

    // 触发震屏
    function triggerScreenShake(intensity, duration) {
        shakeIntensity = intensity;
        shakeDuration = duration;
    }

    // 弹出 "+xxx" 飘字加分提示，挂在玩家头顶向上飘并淡出
    function spawnScorePopup(amount) {
        if (!player) return;
        scorePopups.push({
            x: player.x + player.width / 2,
            y: player.y - 8,
            amount: amount,
            life: 50, // 总寿命 50 帧
            maxLife: 50,
            vy: -1.4
        });
    }

    // ----------------------------------------------------------------------
    // 6. 游戏主更新引擎
    // ----------------------------------------------------------------------
    function update() {
        if (currentState !== STATES.PLAYING && currentState !== STATES.GAMEOVER) return;

        // 保存玩家上一帧的底部坐标，以便物理引擎精准判断踩踏
        player.lastY = player.y;

        // 1. 处理横向操控物理
        if (!player.isDead) {
            if (controlMode === 'tilt') {
                // 重力感应模式：将设备倾角映射为横向速度
                // 限制最大左右偏角为 25 度，乘系数 0.44 提供极为灵敏且不失稳重的手感
                const cappedTilt = Math.max(-25, Math.min(25, tiltX));
                player.vx = cappedTilt * 0.44;
            } else if (controlMode === 'keyboard') {
                // 键盘模式：按键惯性物理 (提升灵敏度以极速响应斜向跳跃)
                if (keys['KeyA'] || keys['ArrowLeft']) {
                    player.vx = -8.5;
                    player.dir = -1;
                } else if (keys['KeyD'] || keys['ArrowRight']) {
                    player.vx = 8.5;
                    player.dir = 1;
                }
            }

            // 确定角色身体朝向
            if (player.vx > 0.5) player.dir = 1;
            else if (player.vx < -0.5) player.dir = -1;
        }

        // 2. 更新主角状态
        player.update(particles);

        // 3. 怪物、黑洞更新 (可能对主角施加引力，产生粒子等)
        for (let i = 0; i < enemies.length; i++) {
            enemies[i].update(player, particles);
        }

        // 4. 更新子弹
        for (let i = 0; i < bullets.length; i++) {
            bullets[i].update();
        }

        // 5. 更新平台运动（蓝移动平台、黄限时平台生命衰减等）
        for (let i = 0; i < platforms.length; i++) {
            platforms[i].update(canvas.width, particles, camera.y, canvas.height);
        }

        // 6. 更新静置道具
        for (let i = 0; i < items.length; i++) {
            items[i].update();
        }

        // 7. 更新粒子
        for (let i = 0; i < particles.length; i++) {
            particles[i].update();
        }

        // 7.1 更新加分飘字提示
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const sp = scorePopups[i];
            sp.y += sp.vy;
            sp.life--;
            if (sp.life <= 0) scorePopups.splice(i, 1);
        }

        // 8. 物理碰撞核心判定
        Physics.checkCollisions(player, platforms, items, enemies, bullets, particles, camera, triggerScreenShake, (addedScore) => {
            score += addedScore;
            document.getElementById('hud-score').textContent = score;
            spawnScorePopup(addedScore);
        });

        // 9. 摄像机跟随向上滚动
        Physics.updateCamera(player, camera, (addedScore) => {
            score += addedScore;
            document.getElementById('hud-score').textContent = score;
        });

        // 10. 动态在上方生成更多平台
        Physics.generateLevel(platforms, items, enemies, camera, canvas.width, levelState);

        // 11. 垃圾回收：清理视口底部以下很远的过期实体，优化FPS (传入自适应高度)
        Physics.cleanOutOfBounds(platforms, items, enemies, bullets, particles, camera.y, canvas.height);

        // 12. 死亡坠出屏幕判定 (修改为 +20px 即刻触发，防止在屏幕外踩到台阶)
        if (player.y > camera.y + canvas.height + 20) {
            if (!player.isDead) {
                // 如果没触发怪物死亡但掉下去，也直接游戏结束
                player.isDead = true;
                Assets.Sound.playGameOver();
            }
            gameOver();
        }

        // 13. 更新屏幕震屏计时
        if (shakeDuration > 0) {
            shakeDuration--;
        } else {
            shakeIntensity = 0;
        }
    }

    // ----------------------------------------------------------------------
    // 7. 画面渲染中心
    // ----------------------------------------------------------------------
    function draw() {
        ctx.save();

        // 1. 屏幕抖动偏移 (Screen Shake Effect)
        if (shakeDuration > 0 && shakeIntensity > 0) {
            const dx = (Math.random() - 0.5) * shakeIntensity;
            const dy = (Math.random() - 0.5) * shakeIntensity;
            ctx.translate(dx, dy);
        }

        // 2. 绘制视差滚动背景
        drawBackground();

        // 3. 开启摄像机视角变换 (将物理世界坐标 y 转换为屏幕画布 canvas 像素 y)
        // 物理世界的 y 轴越向上数值越小值（例如 -10000），所以 canvas 绘制应减去 camera.y
        if (player) {
            ctx.save();
            ctx.translate(0, -camera.y);

            // A. 绘制平台
            for (let i = 0; i < platforms.length; i++) {
                platforms[i].draw(ctx);
            }

            // B. 绘制挂载的道具
            for (let i = 0; i < items.length; i++) {
                items[i].draw(ctx);
            }

            // C. 绘制怪物/黑洞
            for (let i = 0; i < enemies.length; i++) {
                enemies[i].draw(ctx);
            }

            // D. 绘制发射的子弹
            for (let i = 0; i < bullets.length; i++) {
                bullets[i].draw(ctx);
            }

            // E. 绘制粒子
            for (let i = 0; i < particles.length; i++) {
                particles[i].draw(ctx);
            }

            // F. 绘制主角 Doodler
            player.draw(ctx);

            // G. 绘制加分飘字提示 (黄色描边数字向上飘)
            for (let i = 0; i < scorePopups.length; i++) {
                const sp = scorePopups[i];
                const alpha = Math.min(1, sp.life / sp.maxLife * 1.4);
                const popupY = Math.max(sp.y, camera.y + 34);
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.font = 'bold 28px "Fredoka One", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.lineWidth = 5;
                ctx.strokeStyle = '#000';
                ctx.strokeText('+' + sp.amount, sp.x, popupY);
                ctx.fillStyle = '#fde047';
                ctx.fillText('+' + sp.amount, sp.x, popupY);
                ctx.restore();
            }

            ctx.restore(); // 恢复相机变换
        }

        ctx.restore(); // 恢复抖动变换
    }

    // ----------------------------------------------------------------------
    // 8. 视差滚动多渐变背景生成器
    // ----------------------------------------------------------------------
    function drawBackground() {
        const absHeight = Math.abs(camera.y);
        
        let grad = ctx.createLinearGradient(0, 0, 0, canvas.height);

        // 随高度过渡颜色 (0 -> 5000 -> 15000 -> 30000)
        if (absHeight < 5000) {
            // 清晨晴空 (浅蓝 -> 亮蓝)
            const ratio = absHeight / 5000;
            // 颜色从 [#bae6fd, #7dd3fc] 慢慢过渡到 [#fed7aa, #fdba74] (暖橙过渡)
            const c1 = lerpColor('#bae6fd', '#fed7aa', ratio);
            const c2 = lerpColor('#7dd3fc', '#fdbb2d', ratio);
            grad.addColorStop(0, c1);
            grad.addColorStop(1, c2);
        } else if (absHeight < 15000) {
            // 黄昏红霞 (橘红 -> 紫粉 -> 深蓝)
            const ratio = (absHeight - 5000) / 10000;
            const c1 = lerpColor('#fed7aa', '#f472b6', ratio);
            const c2 = lerpColor('#fdbb2d', '#3b0764', ratio);
            grad.addColorStop(0, c1);
            grad.addColorStop(1, c2);
        } else if (absHeight < 30000) {
            // 渐入星空 (深紫 -> 幽暗蓝 -> 纯黑)
            const ratio = (absHeight - 15000) / 15000;
            const c1 = lerpColor('#f472b6', '#1e1b4b', ratio);
            const c2 = lerpColor('#3b0764', '#020617', ratio);
            grad.addColorStop(0, c1);
            grad.addColorStop(1, c2);
        } else {
            // 深邃宇宙 (墨黑)
            grad.addColorStop(0, '#090514');
            grad.addColorStop(1, '#02010a');
        }

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 绘制对应的视差景物
        if (absHeight < 18000) {
            // 1. 浮云背景 (0.3 倍相机视差)
            ctx.save();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            // 如果到了黄昏，云彩变粉橙色
            if (absHeight > 4000) {
                ctx.fillStyle = 'rgba(253, 186, 116, 0.35)';
            }
            for (let i = 0; i < clouds.length; i++) {
                const cloud = clouds[i];
                // 视差高度计算 (让云向下移动慢一点，产生深邃感)
                let cy = (cloud.y - camera.y * 0.25) % (canvas.height + 100);
                if (cy < -50) cy += (canvas.height + 150);
                
                // 绘制卡通云朵 (三个叠放的圆角块)
                ctx.beginPath();
                ctx.roundRect(cloud.x, cy, cloud.width, cloud.height, cloud.height / 2);
                ctx.roundRect(cloud.x + 10, cy - 8, cloud.width * 0.6, cloud.height, cloud.height / 2);
                ctx.fill();
            }
            ctx.restore();
        }

        if (absHeight > 8000) {
            // 2. 闪烁繁星 (0.1 倍更慢的视差滚动，营造深邃感)
            ctx.save();
            const starAlphaLimit = Math.min((absHeight - 8000) / 5000, 1.0); // 随高度渐渐显现
            
            for (let i = 0; i < stars.length; i++) {
                const star = stars[i];
                let sy = (star.y - camera.y * 0.08) % canvas.height;
                if (sy < 0) sy += canvas.height;

                // 呼吸闪烁透明度
                const brightness = Math.sin(star.phase + Date.now() * star.twinkleSpeed) * 0.4 + 0.6;
                ctx.globalAlpha = brightness * starAlphaLimit;
                ctx.fillStyle = i % 3 === 0 ? '#fef08a' : '#ffffff'; // 黄白相间

                ctx.beginPath();
                ctx.arc(star.x, sy, star.radius, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        // 3. 绘制宇宙彩斑/极光流 (30000 分以上)
        if (absHeight > 25000) {
            ctx.save();
            const aurAlpha = Math.min((absHeight - 25000) / 10000, 0.25);
            ctx.globalAlpha = aurAlpha;
            // 绘制两道斜斜的宇宙星云彩带
            let gradAur = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            gradAur.addColorStop(0, '#d946ef');
            gradAur.addColorStop(0.5, '#6366f1');
            gradAur.addColorStop(1, '#06b6d4');
            ctx.fillStyle = gradAur;
            ctx.beginPath();
            ctx.moveTo(-50, 200 + Math.sin(Date.now() * 0.001) * 30);
            ctx.quadraticCurveTo(canvas.width / 2, 100 - Math.sin(Date.now() * 0.001) * 20, canvas.width + 50, 300);
            ctx.lineTo(canvas.width + 50, 450);
            ctx.quadraticCurveTo(canvas.width / 2, 250, -50, 350);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    // 颜色线性插值辅助函数 (HEX 颜色过渡)
    function lerpColor(color1, color2, percentage) {
        percentage = Math.max(0, Math.min(1, percentage));
        
        const hex = (x) => {
            const h = x.toString(16);
            return h.length === 1 ? '0' + h : h;
        };

        const r1 = parseInt(color1.substring(1, 3), 16);
        const g1 = parseInt(color1.substring(3, 5), 16);
        const b1 = parseInt(color1.substring(5, 7), 16);

        const r2 = parseInt(color2.substring(1, 3), 16);
        const g2 = parseInt(color2.substring(3, 5), 16);
        const b2 = parseInt(color2.substring(5, 7), 16);

        const r = Math.round(r1 + (r2 - r1) * percentage);
        const g = Math.round(g1 + (g2 - g1) * percentage);
        const b = Math.round(b1 + (b2 - b1) * percentage);

        return '#' + hex(r) + hex(g) + hex(b);
    }

    // ----------------------------------------------------------------------
    // 9. requestAnimationFrame 核心驱动循环
    // 物理固定 60Hz 步长（accumulator pattern），渲染保持屏幕刷新率。
    // 这样在 120Hz / 144Hz / ProMotion 屏幕上游戏速度也不会被成倍加快。
    // ----------------------------------------------------------------------
    const FIXED_DT = 1000 / 60;   // 物理基准帧长 ≈ 16.667ms
    const MAX_STEPS_PER_FRAME = 5; // 防止切后台/卡顿后追帧过猛把物理一次推太远
    let lastTime = 0;
    let physicsAccumulator = 0;

    function gameLoop(timestamp) {
        if (!lastTime) lastTime = timestamp;
        let dt = timestamp - lastTime;

        // 切后台/页面卡顿恢复时 dt 可能很大，先夹住
        if (dt > 100) dt = 100;
        lastTime = timestamp;

        physicsAccumulator += dt;

        // 用一个累加器在固定 60Hz 步长上推进物理，跟屏幕刷新率解耦
        let steps = 0;
        while (physicsAccumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
            if (currentState === STATES.PLAYING || currentState === STATES.GAMEOVER) {
                update();
            }
            physicsAccumulator -= FIXED_DT;
            steps++;
        }

        // 累加器被高刷屏溢出兜底（极端情况下不让它无限增长）
        if (physicsAccumulator > FIXED_DT * MAX_STEPS_PER_FRAME) {
            physicsAccumulator = 0;
        }

        // 渲染照样按屏幕刷新率走，画面依然丝滑
        draw();

        requestAnimationFrame(gameLoop);
    }

    // 暴露外部接口
    return {
        init
    };
})();

// 当 DOM 加载完成后，立即初始化游戏
window.addEventListener('DOMContentLoaded', () => {
    Game.init();
});
