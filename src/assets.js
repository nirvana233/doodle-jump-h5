/**
 * ==========================================================================
 * assets.js - 卡通视觉绘制器与 Web Audio 合成音效引擎
 * ==========================================================================
 */

const Assets = (function() {
    // ----------------------------------------------------------------------
    // 1. Web Audio 音效引擎
    // ----------------------------------------------------------------------
    let audioCtx = null;
    let soundEnabled = true;
    let activeRocketSound = null;
    let activePropellerTimer = null;

    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    // 播放频率渐变的正弦波/三角波音效
    function playTone(startFreq, endFreq, duration, type = 'sine', volume = 0.1) {
        if (!soundEnabled) return;
        initAudio();
        if (!audioCtx) return;

        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, audioCtx.currentTime);
        // 频率随时间平滑过渡
        osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + duration);

        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    // 播放白噪音爆破音效（用于怪物爆炸、撞击）
    function playNoise(duration, startVolume = 0.15) {
        if (!soundEnabled) return;
        initAudio();
        if (!audioCtx) return;

        const bufferSize = audioCtx.sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        // 生成随机白噪音
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = audioCtx.createBufferSource();
        noiseNode.buffer = buffer;

        // 带通滤波器让爆炸声更扎实
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 400;

        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(startVolume, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

        noiseNode.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        noiseNode.start();
    }

    const Sound = {
        playJump() {
            // 短促跳跃音：频率快速从 300Hz 升到 600Hz
            playTone(300, 700, 0.15, 'triangle', 0.15);
        },
        playSpring() {
            // 弹簧强力起飞：LFO 频率调制模拟“Boing”金属回弹颤音
            if (!soundEnabled) return;
            initAudio();
            if (!audioCtx) return;

            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(300, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.35);

            // 快速的低频颤动调制
            const lfo = audioCtx.createOscillator();
            const lfoGain = audioCtx.createGain();
            lfo.type = 'sine';
            lfo.frequency.value = 25; // 25Hz 颤音
            lfoGain.gain.value = 80;

            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);

            gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);

            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc.start();
            lfo.start();
            osc.stop(audioCtx.currentTime + 0.35);
            lfo.stop(audioCtx.currentTime + 0.35);
        },
        playTrampoline() {
            // 蹦床强力起飞：LFO 频率调制模拟橡胶面低沉大颤音
            if (!soundEnabled) return;
            initAudio();
            if (!audioCtx) return;

            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.45);

            const lfo = audioCtx.createOscillator();
            const lfoGain = audioCtx.createGain();
            lfo.type = 'sine';
            lfo.frequency.value = 16; // 16Hz 颤音
            lfoGain.gain.value = 40;

            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);

            gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.45);

            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc.start();
            lfo.start();
            osc.stop(audioCtx.currentTime + 0.45);
            lfo.stop(audioCtx.currentTime + 0.45);
        },
        playSquish() {
            // 踩扁怪物的卡通黏滑噗嗤音效：频率快速下行 550Hz -> 80Hz
            playTone(550, 80, 0.18, 'triangle', 0.22);
            playNoise(0.08, 0.08); // 叠加一丁点白噪音增加浆糊感
        },
        playShieldFade() {
            // 护盾时效到期自动消失音效
            playTone(1400, 300, 0.25, 'sine', 0.08);
        },
        startRocket() {
            if (!soundEnabled) return;
            initAudio();
            if (!audioCtx) return;

            if (activeRocketSound) {
                try { activeRocketSound.stop(); } catch(e){}
                activeRocketSound = null;
            }

            // 白噪音节点
            const bufferSize = audioCtx.sampleRate * 4; // 火箭最大可能持续时间
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noiseNode = audioCtx.createBufferSource();
            noiseNode.buffer = buffer;
            noiseNode.loop = true;

            const noiseFilter = audioCtx.createBiquadFilter();
            noiseFilter.type = 'lowpass';
            noiseFilter.frequency.value = 800; // 低通滤掉高频，模拟沉闷喷气声

            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0.08, audioCtx.currentTime);

            // 轰鸣声锯齿波
            const osc = audioCtx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, audioCtx.currentTime);
            
            const oscGain = audioCtx.createGain();
            oscGain.gain.setValueAtTime(0.05, audioCtx.currentTime);

            noiseNode.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            osc.connect(oscGain);
            
            const mainGain = audioCtx.createGain();
            mainGain.gain.setValueAtTime(0.12, audioCtx.currentTime);

            noiseGain.connect(mainGain);
            oscGain.connect(mainGain);
            mainGain.connect(audioCtx.destination);

            noiseNode.start();
            osc.start();

            activeRocketSound = {
                stop() {
                    const now = audioCtx.currentTime;
                    mainGain.gain.setValueAtTime(mainGain.gain.value, now);
                    mainGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                    setTimeout(() => {
                        try {
                            noiseNode.stop();
                            osc.stop();
                        } catch(e){}
                    }, 350);
                }
            };
        },
        stopRocket() {
            if (activeRocketSound) {
                activeRocketSound.stop();
                activeRocketSound = null;
            }
        },
        startPropeller() {
            if (!soundEnabled) return;
            initAudio();
            if (!audioCtx) return;

            if (activePropellerTimer) {
                clearInterval(activePropellerTimer);
                activePropellerTimer = null;
            }

            activePropellerTimer = setInterval(() => {
                playTone(550, 750, 0.05, 'triangle', 0.06);
            }, 80);
        },
        stopPropeller() {
            if (activePropellerTimer) {
                clearInterval(activePropellerTimer);
                activePropellerTimer = null;
            }
        },
        playShoot() {
            // 射击音：高频快速下滑 1000Hz -> 200Hz
            playTone(1100, 300, 0.1, 'sine', 0.12);
        },
        playExplode() {
            // 怪物爆炸：低沉噪音砰声
            playNoise(0.4, 0.25);
            playTone(200, 60, 0.3, 'sawtooth', 0.15);
        },
        playGameOver() {
            // 游戏结束：低沉频率下行
            playTone(400, 80, 0.6, 'sine', 0.25);
            setTimeout(() => {
                playTone(250, 50, 0.7, 'triangle', 0.15);
            }, 100);
        },
        playShield() {
            // 护盾水晶音效
            playTone(800, 1600, 0.25, 'sine', 0.1);
            setTimeout(() => {
                playTone(1200, 2000, 0.2, 'sine', 0.08);
            }, 60);
        },
        playBreak() {
            // 踏空/易碎平台碎裂
            playNoise(0.2, 0.15);
            playTone(150, 50, 0.2, 'sawtooth', 0.1);
        }
    };

    // ----------------------------------------------------------------------
    // 2. Canvas 卡通图形动态绘制器
    // ----------------------------------------------------------------------
    const SkinColors = {
        default: { body: '#a3e635', dark: '#84cc16', accent: '#65a30d' },  // 经典绿
        pink: { body: '#f472b6', dark: '#ec4899', accent: '#db2777' },      // 蜜桃粉
        blue: { body: '#60a5fa', dark: '#3b82f6', accent: '#2563eb' },      // 天空蓝
        gold: { body: '#fbbf24', dark: '#f59e0b', accent: '#d97706' },      // 黄金色
        kuromi: { body: '#f5f5f4', dark: '#27272a', accent: '#52525b' },    // 库洛米：白身 + 黑帽 + 粉点缀
        doraemon: { body: '#3b82f6', dark: '#1e40af', accent: '#1e3a8a' },  // 哆啦A梦：经典蓝
        spongebob: { body: '#fde047', dark: '#ca8a04', accent: '#a16207' }, // 海绵宝宝：明黄
        pikachu: { body: '#facc15', dark: '#f59e0b', accent: '#b45309' },   // 皮卡丘：电气黄
        girl: { body: '#fde7d2', dark: '#c2410c', accent: '#7c2d12' }       // 真人女孩：肤色暖色调（图片加载前的降级显示）
    };

    // 真人/自定义图片皮肤：异步加载图片到 Image 对象，渲染时直接 drawImage 裁剪到椭圆区域
    // 图片要放在项目根目录的 assets/<name>.png，加载失败将自动降级到 SkinColors 纯色渲染
    const SkinImages = {};
    function loadSkinImage(name, src) {
        const img = new Image();
        img.onload = () => { SkinImages[name] = img; };
        img.onerror = () => { console.warn(`皮肤图片 ${name} 加载失败 (${src})，将使用纯色降级渲染。请把图片放到 ${src} 位置。`); };
        img.src = src;
    }
    loadSkinImage('girl', 'assets/skin-girl.png');

    // 辅助：绘制带描边的卡通圆角矩形
    function drawCartoonRect(ctx, x, y, width, height, radius, fillColor, strokeColor = '#000', strokeWidth = 3) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();

        // 卡通立体投影 (阴影偏置)
        ctx.fillStyle = strokeColor;
        ctx.fill();

        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;

        // 稍微往上偏一点点绘制主体，留出下方作为卡通实底阴影
        ctx.save();
        ctx.translate(-1, -3);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.restore();
    }

    const Draw = {
        // 绘制 Doodler (角色)
        player(ctx, x, y, width, height, dir, vy, state, skinName = 'default') {
            const colors = SkinColors[skinName] || SkinColors.default;
            const outline = state.outline !== false;
            ctx.save();
            ctx.translate(x + width / 2, y + height / 2);

            // 射击后坐力位移：朝发射方向反方向弹一下，强化"开火"反馈
            // shootAnimTimer 范围 0~14，正在动画时取归一化进度
            let recoilDx = 0;
            let recoilDy = 0;
            if (state.isShooting && state.shootAngle !== undefined && state.shootAnimProgress !== undefined) {
                const t = state.shootAnimProgress; // 0~1, 0=刚发射, 1=动画结束
                const intensity = (1 - t) * 2.2; // 只保留轻微横向后坐力，避免误以为角色被子弹推得加速
                recoilDx = -Math.cos(state.shootAngle) * intensity;
                recoilDy = 0;
                ctx.translate(recoilDx, recoilDy);
            }

            // 1. 跳跃形变 (Squash & Stretch) - 经典轻快形变
            let scaleX = 1;
            let scaleY = 1;

            // 踩到蹦床空翻、有火箭、有螺旋桨时，角色比例保持 1:1，不做任何拉伸形变
            const lockScale = state.hasRocket || state.hasPropeller || (state.spinAngle && state.spinAngle > 0);

            if (!lockScale) {
                if (vy < 0) {
                    // 上升：纵向拉伸，限制最大拉伸至 1.15，最大收缩至 0.88
                    scaleY = 1 + Math.min(Math.abs(vy) * 0.01, 0.15);
                    scaleX = 1 - Math.min(Math.abs(vy) * 0.008, 0.12);
                } else if (vy > 0) {
                    // 下落准备着陆：纵向压缩最大 0.92，横向膨胀最大 1.06
                    scaleY = 1 - Math.min(vy * 0.008, 0.08);
                    scaleX = 1 + Math.min(vy * 0.006, 0.06);
                }
            }

            ctx.scale(scaleX * dir, scaleY); // dir 控制朝向 1(右) 或 -1(左)

            // 卡通蹦床空翻动画旋转
            if (state.spinAngle && state.spinAngle > 0) {
                ctx.rotate(state.spinAngle);
            }

            // 2. 绘制腿部 (小鸡爪)
            if (outline) {
                ctx.fillStyle = '#000';
                ctx.fillRect(-22, height / 2 - 4, 10, 12);
                ctx.fillRect(12, height / 2 - 4, 10, 12);
            }
            ctx.fillStyle = colors.accent;
            ctx.fillRect(-21, height / 2 - 3, 8, 8);
            ctx.fillRect(13, height / 2 - 3, 8, 8);

            // 3. 身体本体 (圆底蛋形)
            ctx.beginPath();
            ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
            ctx.fillStyle = colors.body;
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#000';
            ctx.fill();
            if (outline) ctx.stroke();

            // 3.5 自定义图片皮肤：将图片裁剪到椭圆区域，覆盖纯色身体
            if (SkinImages[skinName]) {
                ctx.save();
                // 椭圆裁剪区域
                ctx.beginPath();
                ctx.ellipse(0, 0, width / 2 - 1, height / 2 - 1, 0, 0, Math.PI * 2);
                ctx.clip();
                
                // 计算图片填充椭圆的最佳尺寸 (cover 模式，超出部分被裁剪掉)
                const img = SkinImages[skinName];
                const targetW = width;
                const targetH = height;
                const imgRatio = img.width / img.height;
                const targetRatio = targetW / targetH;
                let drawW, drawH;
                if (imgRatio > targetRatio) {
                    drawH = targetH;
                    drawW = drawH * imgRatio;
                } else {
                    drawW = targetW;
                    drawH = drawW / imgRatio;
                }
                
                // dir = -1 时画布做了 X 镜像，需要翻回来再绘图，避免人脸左右反
                if (dir === -1) {
                    ctx.scale(-1, 1);
                }
                ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
                ctx.restore();
                
                if (outline) {
                    // 重新画一遍黑色边框 (clip 后边框被覆盖)
                    ctx.beginPath();
                    ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = '#000';
                    ctx.stroke();
                }
            }

            // 4. 阴影亮部细化 (卡通微光) - 自定义图片皮肤跳过 (避免叠在照片上像污点)
            if (!SkinImages[skinName]) {
                ctx.beginPath();
                ctx.ellipse(-width/6, -height/6, width/4, height/4, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
                ctx.fill();
            }

            // 5. 经典长嘴巴 (向上/前方突出的圆管)
            ctx.save();
            // 如果玩家在射击状态，使嘴巴朝向对应的子弹发射角 (世界坐标系)
            // 由于外层已经做了 ctx.scale(scaleX * dir, scaleY)，要把镜像撤销才能用世界 angle
            if (state.isShooting && state.shootAngle !== undefined) {
                if (dir === -1) {
                    // 撤销外层 X 轴镜像
                    ctx.scale(-1, 1);
                }
                ctx.rotate(state.shootAngle);
            } else {
                ctx.rotate(0.1); // 微微朝前倾斜
            }
            ctx.fillStyle = colors.dark;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 4;

            // 自定义图片皮肤时，嘴巴管子整体外移 14px，避免遮挡人脸
            const mouthShift = SkinImages[skinName] ? 14 : 0;
            // 嘴巴管子
            ctx.beginPath();
            ctx.roundRect(width / 4 + mouthShift, -8, 26, 16, 6);
            ctx.fill();
            ctx.stroke();
            // 嘴巴口径
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(width / 4 + 26 + mouthShift, 0, 3, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // 射击瞬间在嘴巴尖端绘制一个明亮闪光圈，强化"开火"视觉
            if (state.isShooting && state.shootAnimProgress !== undefined && state.shootAnimProgress < 0.55) {
                const flashAlpha = 1 - state.shootAnimProgress / 0.55;
                ctx.save();
                ctx.globalAlpha = flashAlpha;
                ctx.fillStyle = '#fef3c7';
                ctx.shadowColor = '#fde047';
                ctx.shadowBlur = 18;
                ctx.beginPath();
                ctx.arc(width / 4 + 28 + mouthShift, 0, 7 + (1 - flashAlpha) * 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            ctx.restore();

            // 6. 大眼睛 (根据运动方向会有小滚动) - 自定义图片皮肤跳过 (照片已自带五官)
            if (!SkinImages[skinName]) {
                const eyeOffsetX = width / 6;
                const eyeOffsetY = -height / 5;
                const eyeRadius = 9;

            // 两只眼睛
            const drawEye = (ox) => {
                ctx.save();
                ctx.translate(ox, eyeOffsetY);
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, 0, eyeRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // 眼珠 (注视方向：跳跃时看上方，下落时看下方，射击看上方)
                let lookX = 1;
                let lookY = 0;
                if (state.isShooting) {
                    lookX = 0; lookY = -3;
                } else if (vy < 0) {
                    lookX = 2; lookY = -2;
                } else {
                    lookX = 2; lookY = 2;
                }
                
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(lookX, lookY, 4, 0, Math.PI * 2);
                ctx.fill();
                // 瞳孔高光
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(lookX - 1, lookY - 1, 1.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            };

            drawEye(-eyeOffsetX);
            drawEye(eyeOffsetX);
            } // end if (!SkinImages[skinName])

            // 6.5 库洛米皮肤专属装饰：黑色尖角小丑帽耳 (带绒球) + 额头粉色大骷髅 + 双颊腮红
            if (skinName === 'kuromi') {
                // ----- 库洛米标志：左右两根尖角形小丑帽耳，尖端各有一颗黑绒球 -----
                ctx.fillStyle = '#1a1a1f';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2.5;

                // 左尖角耳 (向左上倾斜的高瘦三角，根部宽 ~12px，尖端窄)
                ctx.beginPath();
                ctx.moveTo(-width * 0.30, -height * 0.40);   // 根部内侧
                ctx.lineTo(-width * 0.05, -height * 0.42);   // 根部外侧 (靠近头顶中线)
                ctx.lineTo(-width * 0.42, -height * 1.05);   // 尖端
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 左尖角顶端绒球
                ctx.fillStyle = '#1a1a1f';
                ctx.beginPath();
                ctx.arc(-width * 0.42, -height * 1.05, 4.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 绒球高光
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.beginPath();
                ctx.arc(-width * 0.43, -height * 1.07, 1.6, 0, Math.PI * 2);
                ctx.fill();

                // 右尖角耳 (镜像)
                ctx.fillStyle = '#1a1a1f';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(width * 0.30, -height * 0.40);
                ctx.lineTo(width * 0.05, -height * 0.42);
                ctx.lineTo(width * 0.42, -height * 1.05);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 右尖角顶端绒球
                ctx.fillStyle = '#1a1a1f';
                ctx.beginPath();
                ctx.arc(width * 0.42, -height * 1.05, 4.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 绒球高光
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.beginPath();
                ctx.arc(width * 0.41, -height * 1.07, 1.6, 0, Math.PI * 2);
                ctx.fill();

                // ----- 额头招牌粉色大骷髅 (Kuromi 灵魂标记) -----
                ctx.save();
                const skullCx = 0;
                const skullCy = -height * 0.32;

                // 颅骨主体阴影 (黑色描边底)
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.ellipse(skullCx, skullCy, 9, 8, 0, 0, Math.PI * 2);
                ctx.fill();

                // 颅骨主体 (粉红色，圆胖萌版)
                ctx.fillStyle = '#fbcfe8';
                ctx.beginPath();
                ctx.ellipse(skullCx, skullCy - 0.5, 8, 7, 0, 0, Math.PI * 2);
                ctx.fill();

                // 颅骨下颌 (梯形，露出两颗小牙)
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.moveTo(skullCx - 5, skullCy + 5);
                ctx.lineTo(skullCx - 4, skullCy + 9);
                ctx.lineTo(skullCx + 4, skullCy + 9);
                ctx.lineTo(skullCx + 5, skullCy + 5);
                ctx.closePath();
                ctx.fill();

                ctx.fillStyle = '#fbcfe8';
                ctx.beginPath();
                ctx.moveTo(skullCx - 4, skullCy + 5);
                ctx.lineTo(skullCx - 3, skullCy + 8);
                ctx.lineTo(skullCx + 3, skullCy + 8);
                ctx.lineTo(skullCx + 4, skullCy + 5);
                ctx.closePath();
                ctx.fill();

                // 牙齿分割小竖线
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(skullCx, skullCy + 5);
                ctx.lineTo(skullCx, skullCy + 8);
                ctx.stroke();

                // 黑色叉形双眼 (X X) - Kuromi 招牌
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1.8;
                ctx.lineCap = 'round';
                // 左眼 X
                ctx.beginPath();
                ctx.moveTo(skullCx - 4.5, skullCy - 2.5);
                ctx.lineTo(skullCx - 1.5, skullCy + 0.5);
                ctx.moveTo(skullCx - 1.5, skullCy - 2.5);
                ctx.lineTo(skullCx - 4.5, skullCy + 0.5);
                ctx.stroke();
                // 右眼 X
                ctx.beginPath();
                ctx.moveTo(skullCx + 1.5, skullCy - 2.5);
                ctx.lineTo(skullCx + 4.5, skullCy + 0.5);
                ctx.moveTo(skullCx + 4.5, skullCy - 2.5);
                ctx.lineTo(skullCx + 1.5, skullCy + 0.5);
                ctx.stroke();

                // 鼻孔倒三角小黑斑
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.moveTo(skullCx, skullCy + 1.8);
                ctx.lineTo(skullCx - 1, skullCy + 3.5);
                ctx.lineTo(skullCx + 1, skullCy + 3.5);
                ctx.closePath();
                ctx.fill();

                ctx.restore();

                // ----- 双脸颊粉色腮红 -----
                ctx.fillStyle = 'rgba(244, 114, 182, 0.7)';
                ctx.beginPath();
                ctx.ellipse(-width * 0.33, height * 0.05, 5, 3, 0, 0, Math.PI * 2);
                ctx.ellipse(width * 0.33, height * 0.05, 5, 3, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            // 6.6 哆啦A梦皮肤专属装饰：白色脸 + 红色项圈 + 黄色铃铛 + 头顶一对小圆耳
            if (skinName === 'doraemon') {
                // ----- 头顶左右一对小蓝圆耳 -----
                ctx.fillStyle = colors.body; // 蓝色身体同色
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2.5;
                // 左耳
                ctx.beginPath();
                ctx.arc(-width * 0.30, -height * 0.45, 5.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 右耳
                ctx.beginPath();
                ctx.arc(width * 0.30, -height * 0.45, 5.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 耳朵内侧的小亮光
                ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.beginPath();
                ctx.arc(-width * 0.30, -height * 0.46, 2, 0, Math.PI * 2);
                ctx.arc(width * 0.30, -height * 0.46, 2, 0, Math.PI * 2);
                ctx.fill();

                // 大白圆脸 (覆盖在蓝身体上)
                ctx.save();
                ctx.fillStyle = '#fafaf9';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.ellipse(0, height * 0.05, width * 0.42, height * 0.30, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 红色鼻头
                ctx.fillStyle = '#dc2626';
                ctx.beginPath();
                ctx.arc(0, -height * 0.05, 2.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 黑色嘴胡 (3 道竖线)
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1.2;
                for (let i = -1; i <= 1; i++) {
                    ctx.beginPath();
                    ctx.moveTo(-8 + i * 4, height * 0.02);
                    ctx.lineTo(-12 + i * 5, height * 0.05);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(8 - i * 4, height * 0.02);
                    ctx.lineTo(12 - i * 5, height * 0.05);
                    ctx.stroke();
                }
                ctx.restore();

                // 红色项圈带 (横跨腰部)
                ctx.fillStyle = '#dc2626';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.rect(-width * 0.45, height * 0.32, width * 0.9, 5);
                ctx.fill();
                ctx.stroke();
                // 黄色小铃铛
                ctx.fillStyle = '#fbbf24';
                ctx.beginPath();
                ctx.arc(0, height * 0.40, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 铃铛底部一道横线
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(-3, height * 0.40);
                ctx.lineTo(3, height * 0.40);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(0, height * 0.42, 0.8, 0, Math.PI * 2);
                ctx.fillStyle = '#000';
                ctx.fill();
            }

            // 6.7 海绵宝宝皮肤专属装饰：明显的海绵孔 + 棕色短裤 + 红领带
            if (skinName === 'spongebob') {
                // 海绵孔放在脸下半部分以及身体两侧，避免遮住眼睛和嘴
                // 眼睛在 (±width/6, -height/5)，半径 9，所以孔的 y 严格控制在 0 以下区域
                const pores = [
                    [-width * 0.36, height * 0.05, 4.0],
                    [width * 0.36, height * 0.04, 3.6],
                    [-width * 0.10, height * 0.18, 3.0],
                    [width * 0.18, height * 0.22, 3.4],
                    [-width * 0.32, height * 0.25, 3.2],
                    [width * 0.05, height * 0.32, 2.6],
                    [-width * 0.18, height * 0.34, 2.8]
                ];
                for (const p of pores) {
                    // 黑色描边
                    ctx.fillStyle = '#000';
                    ctx.beginPath();
                    ctx.arc(p[0], p[1], p[2] + 0.6, 0, Math.PI * 2);
                    ctx.fill();
                    // 棕色孔身
                    ctx.fillStyle = '#a16207';
                    ctx.beginPath();
                    ctx.arc(p[0], p[1], p[2], 0, Math.PI * 2);
                    ctx.fill();
                    // 内部更深的洞影
                    ctx.fillStyle = '#451a03';
                    ctx.beginPath();
                    ctx.arc(p[0] - p[2] * 0.2, p[1] - p[2] * 0.2, p[2] * 0.55, 0, Math.PI * 2);
                    ctx.fill();
                    // 顶部高光
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                    ctx.beginPath();
                    ctx.arc(p[0] + p[2] * 0.3, p[1] + p[2] * 0.3, p[2] * 0.25, 0, Math.PI * 2);
                    ctx.fill();
                }

                // ----- 棕色方形短裤 -----
                ctx.fillStyle = '#a16207';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.rect(-width * 0.45, height * 0.30, width * 0.9, 8);
                ctx.fill();
                ctx.stroke();

                // 黑色腰带
                ctx.fillStyle = '#000';
                ctx.fillRect(-width * 0.45, height * 0.30, width * 0.9, 2);

                // 红色领带 (脖子上)
                ctx.fillStyle = '#dc2626';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(-3, height * 0.22);
                ctx.lineTo(3, height * 0.22);
                ctx.lineTo(2, height * 0.32);
                ctx.lineTo(-2, height * 0.32);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }

            // 6.8 皮卡丘皮肤专属装饰：黑色尖耳 + 红色腮红 + 闪电尾巴尖
            if (skinName === 'pikachu') {
                // 头顶一对黑尖耳朵 (耳尖黑色三角)
                ctx.fillStyle = '#facc15';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2.5;
                // 左耳
                ctx.beginPath();
                ctx.moveTo(-width * 0.32, -height * 0.42);
                ctx.lineTo(-width * 0.45, -height * 0.78);
                ctx.lineTo(-width * 0.10, -height * 0.45);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 左耳黑尖
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.moveTo(-width * 0.45, -height * 0.78);
                ctx.lineTo(-width * 0.36, -height * 0.62);
                ctx.lineTo(-width * 0.28, -height * 0.65);
                ctx.closePath();
                ctx.fill();

                // 右耳
                ctx.fillStyle = '#facc15';
                ctx.beginPath();
                ctx.moveTo(width * 0.32, -height * 0.42);
                ctx.lineTo(width * 0.45, -height * 0.78);
                ctx.lineTo(width * 0.10, -height * 0.45);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 右耳黑尖
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.moveTo(width * 0.45, -height * 0.78);
                ctx.lineTo(width * 0.36, -height * 0.62);
                ctx.lineTo(width * 0.28, -height * 0.65);
                ctx.closePath();
                ctx.fill();

                // 双脸颊红色圆腮红 (皮卡丘招牌)
                ctx.fillStyle = '#ef4444';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(-width * 0.34, height * 0.06, 4.5, 0, Math.PI * 2);
                ctx.arc(width * 0.34, height * 0.06, 4.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }

            const showRocket = !state.hasRocket ||
                state.rocketTimer === undefined ||
                state.rocketTimer > 60 ||
                Math.floor(state.rocketTimer / 8) % 2 === 0;
            const showPropeller = !state.hasPropeller ||
                state.propellerTimer === undefined ||
                state.propellerTimer > 120 ||
                Math.floor(state.propellerTimer / 8) % 2 === 0;

            // 7. 绘制背上的道具装备
            if (state.hasRocket && showRocket) {
                // 绘制火箭喷气包 (背在背上，无绑带版本，杜绝任何线条穿过身体)
                ctx.save();
                // 火箭包贴合背部偏左方 (当 scaleX 乘以 dir 时，无论朝左朝右，背部始终在左侧本地坐标系中)
                ctx.translate(-width / 2, 4);

                // 1. 火箭主体罐体 (红橙金属渐变，加长版)
                let bodyGrad = ctx.createLinearGradient(-13, -32, 2, 10);
                bodyGrad.addColorStop(0, '#ef4444');
                bodyGrad.addColorStop(0.6, '#dc2626');
                bodyGrad.addColorStop(1, '#991b1b');
                ctx.fillStyle = bodyGrad;
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.roundRect(-13, -32, 15, 42, [6, 6, 2, 2]);
                ctx.fill();
                ctx.stroke();

                // 2. 火箭金属银白头盔帽
                let tipGrad = ctx.createLinearGradient(-13, -32, 2, -22);
                tipGrad.addColorStop(0, '#f1f5f9');
                tipGrad.addColorStop(0.5, '#cbd5e1');
                tipGrad.addColorStop(1, '#94a3b8');
                ctx.fillStyle = tipGrad;
                ctx.beginPath();
                ctx.roundRect(-13, -32, 15, 9, [6, 6, 0, 0]);
                ctx.fill();
                ctx.stroke();

                // 2.1 中段红白条纹环 (经典火箭装饰)
                ctx.fillStyle = '#fafafa';
                ctx.fillRect(-13, -16, 15, 4);
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(-13, -16);
                ctx.lineTo(2, -16);
                ctx.moveTo(-13, -12);
                ctx.lineTo(2, -12);
                ctx.stroke();

                // 3. 侧边黄色尾翼 (黄橙色，位置贴底)
                let wingGrad = ctx.createLinearGradient(-20, 0, -13, 0);
                wingGrad.addColorStop(0, '#facc15');
                wingGrad.addColorStop(1, '#f97316');
                ctx.fillStyle = wingGrad;
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = '#000';
                ctx.beginPath();
                ctx.moveTo(-13, 2);
                ctx.lineTo(-21, 9);
                ctx.lineTo(-13, 7);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // 4. 中间发光的能量核心 (亮蓝色，往上挪到罐体居中位置)
                ctx.fillStyle = '#38bdf8';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(-5.5, -3, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // 5. 底部喷嘴
                ctx.fillStyle = '#334155';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(-10, 10);
                ctx.lineTo(-12, 14);
                ctx.lineTo(-1, 14);
                ctx.lineTo(-3, 10);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                ctx.restore();
            } else if (state.hasPropeller && showPropeller) {
                // 哆啦A梦竹蜻蜓帽子 (Premium 高画质版本)
                ctx.save();
                // 移动到头顶正中，略向下偏移 2px 贴紧身体边缘
                ctx.translate(0, -height / 2 + 2);

                // 1. 绘制吸盘底座 (黄橙渐变，带红条饰带)
                let capGrad = ctx.createLinearGradient(-7, -6, 7, 0);
                capGrad.addColorStop(0, '#f59e0b');
                capGrad.addColorStop(0.5, '#fbbf24');
                capGrad.addColorStop(1, '#d97706');
                ctx.fillStyle = capGrad;
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(0, 0, 8, Math.PI, 0);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // 红底饰环
                ctx.fillStyle = '#ef4444';
                ctx.fillRect(-7, -2, 14, 2);

                // 2. 绘制竖直连接轴 (金属铬色)
                let shaftGrad = ctx.createLinearGradient(-2, -15, 2, -15);
                shaftGrad.addColorStop(0, '#64748b');
                shaftGrad.addColorStop(0.5, '#cbd5e1');
                shaftGrad.addColorStop(1, '#475569');
                ctx.fillStyle = shaftGrad;
                ctx.fillRect(-2, -15, 4, 15);
                ctx.strokeRect(-2, -15, 4, 15);

                // 3. 绘制桨叶和空气流动圆盘 (3D 旋转与高频扇面特效)
                ctx.translate(0, -15);
                const rotAngle = Date.now() * 0.048;

                // 3.1 绘制高速旋转的空气气流圆盘 (Motion Blur)
                ctx.save();
                ctx.fillStyle = 'rgba(253, 224, 71, 0.22)';
                ctx.beginPath();
                ctx.ellipse(0, 0, 26, 4.5, 0, 0, Math.PI * 2);
                ctx.fill();
                // 气流盘的边缘白圈
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.restore();

                // 3.2 3D 旋转叶片
                ctx.save();
                ctx.scale(Math.cos(rotAngle), 1);
                
                // 桨叶叶片
                ctx.fillStyle = '#facc15';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.roundRect(-25, -2.5, 50, 5, 2.5);
                ctx.fill();
                ctx.stroke();

                // 桨叶中心盖帽 (红色圆帽扣)
                ctx.fillStyle = '#dc2626';
                ctx.beginPath();
                ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();

                ctx.restore();
            }

            ctx.restore(); // 恢复最外层保存的世界坐标系

            // 8. 护盾特效 (独立在角色最外层绘制，完全不随角色发生任何拉伸、朝向和空翻形变)
            if (state.hasShield) {
                let showShield = true;
                const isWarning = state.shieldTimer !== undefined && state.shieldTimer <= 120;
                if (isWarning) {
                    // 最后 2 秒闪烁：每 8 帧切换一次显隐 (颜色保持蓝色不变)
                    showShield = Math.floor(state.shieldTimer / 8) % 2 === 0;
                }
                if (showShield) {
                    ctx.save();
                    ctx.translate(x + width / 2, y + height / 2);
                    ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
                    ctx.lineWidth = 4;
                    ctx.shadowColor = '#60a5fa';
                    ctx.shadowBlur = 15;
                    ctx.beginPath();
                    ctx.arc(0, 0, width * 0.8, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(96, 165, 250, 0.15)';
                    ctx.fill();
                    ctx.restore();
                }
            }
        },

        // 绘制普通绿平台 (更干净简洁的现代圆角风格)
        greenPlatform(ctx, x, y, width, height) {
            let grad = ctx.createLinearGradient(x, y, x, y + height);
            grad.addColorStop(0, '#86efac'); // 柔和浅绿
            grad.addColorStop(1, '#22c55e'); // 清爽绿
            
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x, y, width, height, 8);
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.strokeStyle = '#14532d'; // 深绿细描边
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // 顶部清爽高光条
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath();
            ctx.roundRect(x + 4, y + 2, width - 8, 3, 1.5);
            ctx.fill();
            ctx.restore();
        },

        // 绘制移动蓝平台 (清爽极简蓝)
        bluePlatform(ctx, x, y, width, height) {
            let grad = ctx.createLinearGradient(x, y, x, y + height);
            grad.addColorStop(0, '#93c5fd'); // 柔和天空蓝
            grad.addColorStop(1, '#3b82f6'); // 清爽蓝
            
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x, y, width, height, 8);
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.strokeStyle = '#1e3a8a'; // 深蓝描边
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // 顶部高光条
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath();
            ctx.roundRect(x + 4, y + 2, width - 8, 3, 1.5);
            ctx.fill();
            
            // 中间极简移动圆点
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x + width / 2, y + height / 2, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        },

        // 绘制易碎棕平台 (清爽极简红)
        brownPlatform(ctx, x, y, width, height, isBroken = false, breakProgress = 0) {
            if (!isBroken) {
                let grad = ctx.createLinearGradient(x, y, x, y + height);
                grad.addColorStop(0, '#fca5a5'); // 柔和红
                grad.addColorStop(1, '#ef4444'); // 清爽红
                
                ctx.save();
                ctx.beginPath();
                ctx.roundRect(x, y, width, height, 8);
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.strokeStyle = '#7f1d1d'; // 深红描边
                ctx.lineWidth = 2.5;
                ctx.stroke();

                // 极简裂纹
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x + width / 2 - 3, y + 2);
                ctx.lineTo(x + width / 2 + 3, y + height / 2);
                ctx.lineTo(x + width / 2 - 2, y + height - 2);
                ctx.stroke();
                ctx.restore();
            } else {
                // 裂开两半，干净滑落
                ctx.save();
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = '#7f1d1d';

                // 左半边
                ctx.save();
                ctx.translate(x + width / 4 - breakProgress * 5, y + height / 2 + breakProgress * breakProgress * 0.15);
                ctx.rotate(-breakProgress * 0.02);
                let gradL = ctx.createLinearGradient(-width / 4, -height / 2, -width / 4, height / 2);
                gradL.addColorStop(0, '#fca5a5');
                gradL.addColorStop(1, '#ef4444');
                ctx.fillStyle = gradL;
                ctx.beginPath();
                ctx.roundRect(-width / 4, -height / 2, width / 2 + 1, height, [6, 0, 0, 6]);
                ctx.fill();
                ctx.stroke();
                ctx.restore();

                // 右半边
                ctx.save();
                ctx.translate(x + 3 * width / 4 + breakProgress * 5, y + height / 2 + breakProgress * breakProgress * 0.15);
                ctx.rotate(breakProgress * 0.02);
                let gradR = ctx.createLinearGradient(-width / 4, -height / 2, -width / 4, height / 2);
                gradR.addColorStop(0, '#fca5a5');
                gradR.addColorStop(1, '#ef4444');
                ctx.fillStyle = gradR;
                ctx.beginPath();
                ctx.roundRect(-width / 4 - 1, -height / 2, width / 2 + 1, height, [0, 6, 6, 0]);
                ctx.fill();
                ctx.stroke();
                ctx.restore();

                ctx.restore();
            }
        },

        // 绘制白色一次性台阶 (洁白压花，踩中单向裂开滑落)
        whitePlatform(ctx, x, y, width, height, isBroken = false, breakProgress = 0) {
            if (!isBroken) {
                let grad = ctx.createLinearGradient(x, y, x, y + height);
                grad.addColorStop(0, '#ffffff'); // 洁白
                grad.addColorStop(1, '#e2e8f0'); // 浅粉灰
                
                ctx.save();
                ctx.beginPath();
                ctx.roundRect(x, y, width, height, 8);
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.strokeStyle = '#475569'; // 稳重中灰描边
                ctx.lineWidth = 2.5;
                ctx.stroke();

                // 顶部白高光条
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.beginPath();
                ctx.roundRect(x + 4, y + 2, width - 8, 3, 1.5);
                ctx.fill();

                // 压花装饰 (两条可爱的白色细条纹)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.fillRect(x + width / 4 - 3, y + 6, 6, 8);
                ctx.fillRect(x + 3 * width / 4 - 3, y + 6, 6, 8);
                ctx.restore();
            } else {
                // 踩中裂开两半并滑落 (白银配置)
                ctx.save();
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = '#475569';

                // 左半边
                ctx.save();
                ctx.translate(x + width / 4 - breakProgress * 5, y + height / 2 + breakProgress * breakProgress * 0.15);
                ctx.rotate(-breakProgress * 0.02);
                let gradL = ctx.createLinearGradient(-width / 4, -height / 2, -width / 4, height / 2);
                gradL.addColorStop(0, '#ffffff');
                gradL.addColorStop(1, '#e2e8f0');
                ctx.fillStyle = gradL;
                ctx.beginPath();
                ctx.roundRect(-width / 4, -height / 2, width / 2 + 1, height, [6, 0, 0, 6]);
                ctx.fill();
                ctx.stroke();
                ctx.restore();

                // 右半边
                ctx.save();
                ctx.translate(x + 3 * width / 4 + breakProgress * 5, y + height / 2 + breakProgress * breakProgress * 0.15);
                ctx.rotate(breakProgress * 0.02);
                let gradR = ctx.createLinearGradient(-width / 4, -height / 2, -width / 4, height / 2);
                gradR.addColorStop(0, '#ffffff');
                gradR.addColorStop(1, '#e2e8f0');
                ctx.fillStyle = gradR;
                ctx.beginPath();
                ctx.roundRect(-width / 4 - 1, -height / 2, width / 2 + 1, height, [0, 6, 6, 0]);
                ctx.fill();
                ctx.stroke();
                ctx.restore();

                ctx.restore();
            }
        },

        // 绘制黄色时效渐隐台阶 (橙黄呼吸，根据 life 渐隐淡出并自动碎裂)
        fadePlatform(ctx, x, y, width, height, life = 180, isBroken = false, breakProgress = 0) {
            ctx.save();
            
            // 计算全局渐隐透明度 alpha
            let alpha = 1;
            if (life <= 90) {
                alpha = Math.max(0, life / 90);
            }
            ctx.globalAlpha = alpha;

            if (!isBroken) {
                // 1. 周围的时效警告虚线圈 (生命少于 60 帧时高频闪烁)
                let showGlow = true;
                if (life < 60) {
                    showGlow = Math.floor(life / 6) % 2 === 0;
                }
                if (showGlow) {
                    ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([3, 3]);
                    ctx.strokeRect(x - 3, y - 3, width + 6, height + 6);
                    ctx.setLineDash([]);
                }

                // 2. 绘制时效平台主体 (鲜艳橙黄渐变)
                let grad = ctx.createLinearGradient(x, y, x, y + height);
                grad.addColorStop(0, '#fde047'); // 明黄色
                grad.addColorStop(1, '#ca8a04'); // 橙褐色
                
                ctx.beginPath();
                ctx.roundRect(x, y, width, height, 8);
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.strokeStyle = '#854d0e'; // 浓黄褐色描边
                ctx.lineWidth = 2.5;
                ctx.stroke();

                // 顶部白高光条
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.beginPath();
                ctx.roundRect(x + 4, y + 2, width - 8, 3, 1.5);
                ctx.fill();

                // 绘制一个小沙漏/闹钟图标以示时效 (左右两侧，带微弱发光)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.fillRect(x + 8, y + 6, 2, 8);
                ctx.fillRect(x + width - 10, y + 6, 2, 8);
            } else {
                // 踩碎或寿命到期自毁碎裂
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = '#854d0e';

                // 左半边
                ctx.save();
                ctx.translate(x + width / 4 - breakProgress * 5, y + height / 2 + breakProgress * breakProgress * 0.15);
                ctx.rotate(-breakProgress * 0.02);
                let gradL = ctx.createLinearGradient(-width / 4, -height / 2, -width / 4, height / 2);
                gradL.addColorStop(0, '#fde047');
                gradL.addColorStop(1, '#ca8a04');
                ctx.fillStyle = gradL;
                ctx.beginPath();
                ctx.roundRect(-width / 4, -height / 2, width / 2 + 1, height, [6, 0, 0, 6]);
                ctx.fill();
                ctx.stroke();
                ctx.restore();

                // 右半边
                ctx.save();
                ctx.translate(x + 3 * width / 4 + breakProgress * 5, y + height / 2 + breakProgress * breakProgress * 0.15);
                ctx.rotate(breakProgress * 0.02);
                let gradR = ctx.createLinearGradient(-width / 4, -height / 2, -width / 4, height / 2);
                gradR.addColorStop(0, '#fde047');
                gradR.addColorStop(1, '#ca8a04');
                ctx.fillStyle = gradR;
                ctx.beginPath();
                ctx.roundRect(-width / 4 - 1, -height / 2, width / 2 + 1, height, [0, 6, 6, 0]);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }

            ctx.restore();
        },

        // 绘制弹簧 (踩中时具有动画) - 卡通极简金属胶囊版本
        spring(ctx, x, y, width, height, state = 'idle') {
            ctx.save();

            // 1. 弹簧寿命状态参数
            let springHeight = height - 4;
            let topYOffset = 0;
            if (state === 'stepped') {
                springHeight = 5; // 完全压扁
                topYOffset = 0;
            } else if (state === 'bounce') {
                springHeight = height * 1.7; // 大幅拉伸
                topYOffset = -height * 0.6;
            }

            const baseY = y + height;
            const topY = baseY - springHeight + topYOffset;

            // 2. 底座 - 深银灰金属底盘 (亮面渐变 + 黑描边)
            let baseGrad = ctx.createLinearGradient(x, baseY - 6, x, baseY);
            baseGrad.addColorStop(0, '#cbd5e1');
            baseGrad.addColorStop(1, '#475569');
            ctx.fillStyle = baseGrad;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.roundRect(x - 1, baseY - 5, width + 2, 6, 2);
            ctx.fill();
            ctx.stroke();

            // 3. 弹簧线圈 (用渐变盘绕的椭圆模拟立体感)
            // 计算合适的圈数 (压扁时 1 圈，正常 3 圈，拉伸 4 圈)
            let coilCount = 3;
            if (state === 'stepped') coilCount = 2;
            else if (state === 'bounce') coilCount = 4;

            const coilSpacing = springHeight / coilCount;
            const coilWidth = width - 6;
            const coilCx = x + width / 2;

            ctx.lineWidth = 3;
            ctx.strokeStyle = '#1e293b';
            for (let i = 0; i < coilCount; i++) {
                const cy = topY + coilSpacing * (i + 0.5);
                // 主线圈
                ctx.fillStyle = i % 2 === 0 ? '#94a3b8' : '#cbd5e1';
                ctx.beginPath();
                ctx.ellipse(coilCx, cy, coilWidth / 2, Math.max(2, coilSpacing * 0.6), 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }

            // 4. 顶部红色弹力盖板 (圆角矩形 + 顶部高光)
            let capGrad = ctx.createLinearGradient(x, topY - 6, x, topY);
            capGrad.addColorStop(0, '#fca5a5');
            capGrad.addColorStop(1, '#dc2626');
            ctx.fillStyle = capGrad;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.roundRect(x - 2, topY - 6, width + 4, 6, 3);
            ctx.fill();
            ctx.stroke();

            // 顶部白高光
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.beginPath();
            ctx.roundRect(x, topY - 5, width, 1.5, 1);
            ctx.fill();

            ctx.restore();
        },

        // 绘制蹦床 (踩中时下陷然后弹射) - 真实蹦床造型：椭圆框架 + 弹簧拉环 + 红色弹力面
        trampoline(ctx, x, y, width, height, state = 'idle') {
            ctx.save();

            // 受力下陷量
            let sag = 0;
            if (state === 'stepped') sag = 12;
            const cx = x + width / 2;
            const padTopY = y + 4 + sag;

            // ----- 1. 底部支腿 -----
            // 三脚架金属腿 + 黑色描边卡通风
            let legGrad = ctx.createLinearGradient(x, y + 8, x, y + height + 4);
            legGrad.addColorStop(0, '#cbd5e1');
            legGrad.addColorStop(1, '#475569');
            ctx.fillStyle = legGrad;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2.5;

            // 左腿 (倒梯形)
            ctx.beginPath();
            ctx.moveTo(x + 6, y + height);
            ctx.lineTo(x + 11, y + 8);
            ctx.lineTo(x + 16, y + 8);
            ctx.lineTo(x + 13, y + height);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // 右腿
            ctx.beginPath();
            ctx.moveTo(x + width - 6, y + height);
            ctx.lineTo(x + width - 11, y + 8);
            ctx.lineTo(x + width - 16, y + 8);
            ctx.lineTo(x + width - 13, y + height);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // ----- 2. 椭圆形外框（深银灰金属圈）-----
            const frameRX = width / 2 - 1;
            const frameRY = 7;
            // 阴影层（黑底偏移）
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(cx + 1, y + 8 + 2, frameRX, frameRY, 0, 0, Math.PI * 2);
            ctx.fill();
            // 主框架渐变
            let frameGrad = ctx.createLinearGradient(x, y + 4, x, y + 14);
            frameGrad.addColorStop(0, '#e2e8f0');
            frameGrad.addColorStop(0.5, '#94a3b8');
            frameGrad.addColorStop(1, '#334155');
            ctx.fillStyle = frameGrad;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(cx, y + 8, frameRX, frameRY, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // ----- 3. 红色弹力面（嵌在椭圆框中央，受力凹陷）-----
            // 6 条放射状连接弹簧（小钩子细节）
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1.5;
            const innerRX = frameRX - 6;
            const innerRY = 3.5;
            for (let i = 0; i < 7; i++) {
                const t = -1 + (i / 6) * 2; // -1 ~ 1
                const fx = cx + Math.cos(Math.PI / 2 + t * 1.2) * frameRX * 0.95;
                const fy = y + 8 + Math.sin(Math.PI / 2 + t * 1.2) * frameRY * 0.95;
                const ix = cx + t * innerRX;
                const iy = y + 8 + sag * (1 - Math.abs(t) * 0.6);
                ctx.beginPath();
                ctx.moveTo(fx, fy);
                ctx.lineTo(ix, iy);
                ctx.stroke();
            }

            // 弹力面主体 (红色椭圆胶囊带凹陷)
            let bedGrad = ctx.createRadialGradient(cx, padTopY - 2, 4, cx, padTopY, 22);
            bedGrad.addColorStop(0, '#fca5a5');
            bedGrad.addColorStop(0.5, '#ef4444');
            bedGrad.addColorStop(1, '#7f1d1d');
            ctx.fillStyle = bedGrad;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(cx, padTopY, innerRX, innerRY + sag * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // 弹力面顶部高光
            ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.beginPath();
            ctx.ellipse(cx - 4, padTopY - 1.5, innerRX * 0.45, 1.2, 0, 0, Math.PI * 2);
            ctx.fill();

            // ----- 4. 踩中能量震荡波 -----
            if (state === 'stepped') {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(cx, y + 6 + sag, 26, Math.PI, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.beginPath();
                ctx.arc(cx, y + 6 + sag, 38, Math.PI * 1.1, Math.PI * 1.9);
                ctx.stroke();
            }

            ctx.restore();
        },

        // 绘制悬浮怪兽 (会呼吸的微笑怪物)
        monster(ctx, x, y, width, height, frame) {
            ctx.save();
            ctx.translate(x + width / 2, y + height / 2);
            
            // 呼吸动效：利用 frame 缩放
            let breathe = Math.sin(frame * 0.1) * 0.05;
            ctx.scale(1 + breathe, 1 - breathe);

            // 身体：章鱼包子状，粉紫色
            ctx.fillStyle = '#d946ef';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3.5;
            
            ctx.beginPath();
            // 头部大圆弧加底部小爪子起伏
            ctx.moveTo(-width / 2, 4);
            ctx.bezierCurveTo(-width / 2, -height / 2 - 5, width / 2, -height / 2 - 5, width / 2, 4);
            // 底部章鱼爪子
            ctx.quadraticCurveTo(width / 3, height / 2 + Math.sin(frame * 0.2) * 3, width / 4, 6);
            ctx.quadraticCurveTo(0, height / 2 - Math.sin(frame * 0.2) * 3, -width / 4, 6);
            ctx.quadraticCurveTo(-width / 3, height / 2 + Math.sin(frame * 0.2) * 3, -width / 2, 4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 头顶的萌呆触角
            ctx.fillStyle = '#a21caf';
            ctx.beginPath();
            ctx.roundRect(-4, -height / 2 - 4, 8, 8, 4);
            ctx.fill();
            ctx.stroke();

            // 大独眼
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(0, -6, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // 独眼瞳孔
            ctx.fillStyle = '#e11d48';
            ctx.beginPath();
            ctx.arc(Math.sin(frame * 0.05) * 3, -6, 5, 0, Math.PI * 2);
            ctx.fill();
            // 瞳孔高光
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(Math.sin(frame * 0.05) * 3 - 1, -8, 1.5, 0, Math.PI * 2);
            ctx.fill();

            // 调皮的坏笑嘴巴
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 6, 8, 0, Math.PI);
            ctx.stroke();
            // 尖尖的恶魔虎牙
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(-4, 6);
            ctx.lineTo(-2, 10);
            ctx.lineTo(0, 6);
            ctx.moveTo(0, 6);
            ctx.lineTo(2, 10);
            ctx.lineTo(4, 6);
            ctx.fill();
            ctx.stroke();

            ctx.restore();
        },

        // 绘制黑洞 (螺旋紫色深渊)
        blackhole(ctx, x, y, width, height, frame) {
            ctx.save();
            ctx.translate(x + width / 2, y + height / 2);
            
            // 旋转特效
            ctx.rotate(frame * 0.03);

            // 绘制外圈光晕
            let glowRad = width / 2 + Math.sin(frame * 0.1) * 4;
            let grad = ctx.createRadialGradient(0, 0, width / 6, 0, 0, glowRad);
            grad.addColorStop(0, '#000');
            grad.addColorStop(0.3, '#701a75');
            grad.addColorStop(0.7, '#3b0764');
            grad.addColorStop(1, 'rgba(59, 7, 100, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, glowRad, 0, Math.PI * 2);
            ctx.fill();

            // 绘制内聚螺旋线
            ctx.strokeStyle = '#d946ef';
            ctx.lineWidth = 3.5;
            ctx.lineCap = 'round';
            for (let i = 0; i < 4; i++) {
                ctx.save();
                ctx.rotate(i * Math.PI / 2);
                ctx.beginPath();
                ctx.moveTo(8, 0);
                ctx.quadraticCurveTo(width / 3, width / 6, width / 2.2, -4);
                ctx.stroke();
                ctx.restore();
            }

            // 核心黑洞
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(0, 0, width / 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        },

        // 绘制竹蜻蜓帽子道具 (静置状态，附着在平台上)
        propellerItem(ctx, x, y, width, height) {
            ctx.save();
            
            // 1. 周围能量虚线光圈 (突出道具感)
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(x + width / 2, y + height - 10, 18, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]); // 还原

            // 2. 绘制吸盘帽壳 (渐变玩具黄，边缘黑粗卡通线)
            let capGrad = ctx.createLinearGradient(x + width / 2 - 10, y + height - 13, x + width / 2 + 10, y + height - 3);
            capGrad.addColorStop(0, '#f59e0b');
            capGrad.addColorStop(0.5, '#fbbf24');
            capGrad.addColorStop(1, '#d97706');

            ctx.fillStyle = capGrad;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x + width / 2, y + height - 3, 11, Math.PI, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 吸盘底部的红色线带装饰 (玩具细节)
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.rect(x + width / 2 - 10, y + height - 5, 20, 2);
            ctx.fill();

            // 3. 竖直连接轴杆 (金属铬色)
            let shaftGrad = ctx.createLinearGradient(x + width / 2 - 2, y + height - 13, x + width / 2 + 2, y + height - 13);
            shaftGrad.addColorStop(0, '#64748b');
            shaftGrad.addColorStop(0.5, '#cbd5e1');
            shaftGrad.addColorStop(1, '#475569');
            ctx.fillStyle = shaftGrad;
            ctx.fillRect(x + width / 2 - 2, y + height - 14, 4, 11);
            ctx.strokeRect(x + width / 2 - 2, y + height - 14, 4, 11);

            // 4. 双翼流线型螺旋桨叶 (竹质微翘叶片)
            ctx.translate(x + width / 2, y + height - 15);
            ctx.rotate(-0.06); // 稍微斜着更俏皮

            // 左叶片
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.ellipse(-11, -1, 10, 3.5, -0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // 右叶片
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.ellipse(11, -1, 10, 3.5, 0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // 桨叶轴中心顶帽 (红色圆帽扣)
            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.arc(0, -1, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.restore();
        },

        // 绘制火箭道具 (静置在平台上的可拾取道具) - 卡通三段式火箭：白机身 + 红头锥 + 蓝舷窗 + 飞翼火焰
        rocketItem(ctx, x, y, width, height) {
            ctx.save();
            ctx.translate(x + width / 2, y + height / 2);
            ctx.rotate(-0.15); // 微倾斜更动感

            // ----- 0. 周围能量虚线光圈 -----
            ctx.strokeStyle = 'rgba(248, 113, 113, 0.5)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(0, 0, 22, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // ----- 1. 双侧红色尾翼 (三角形飞翼) -----
            ctx.fillStyle = '#dc2626';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2.5;
            // 左尾翼
            ctx.beginPath();
            ctx.moveTo(-7, 4);
            ctx.lineTo(-13, 12);
            ctx.lineTo(-7, 10);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // 右尾翼
            ctx.beginPath();
            ctx.moveTo(7, 4);
            ctx.lineTo(13, 12);
            ctx.lineTo(7, 10);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // ----- 2. 火箭主机身 (白色胶囊渐变) -----
            let bodyGrad = ctx.createLinearGradient(-7, -10, 7, 10);
            bodyGrad.addColorStop(0, '#ffffff');
            bodyGrad.addColorStop(0.6, '#e2e8f0');
            bodyGrad.addColorStop(1, '#94a3b8');
            ctx.fillStyle = bodyGrad;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.roundRect(-7, -10, 14, 22, [7, 7, 5, 5]);
            ctx.fill();
            ctx.stroke();

            // ----- 3. 红色头锥 (尖顶) -----
            let noseGrad = ctx.createLinearGradient(-7, -16, 7, -10);
            noseGrad.addColorStop(0, '#fca5a5');
            noseGrad.addColorStop(1, '#dc2626');
            ctx.fillStyle = noseGrad;
            ctx.beginPath();
            ctx.moveTo(-7, -10);
            ctx.lineTo(0, -18);
            ctx.lineTo(7, -10);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // 头锥小亮光
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.beginPath();
            ctx.moveTo(-3, -11);
            ctx.lineTo(-1, -16);
            ctx.lineTo(0, -11);
            ctx.closePath();
            ctx.fill();

            // ----- 4. 蓝色舷窗 (中央圆形) -----
            ctx.fillStyle = '#1e3a8a';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(0, -2, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // 舷窗发光内核
            let portGrad = ctx.createRadialGradient(-1, -3, 0.5, 0, -2, 4);
            portGrad.addColorStop(0, '#bae6fd');
            portGrad.addColorStop(0.5, '#38bdf8');
            portGrad.addColorStop(1, '#0c4a6e');
            ctx.fillStyle = portGrad;
            ctx.beginPath();
            ctx.arc(0, -2, 3.2, 0, Math.PI * 2);
            ctx.fill();
            // 舷窗高光
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.beginPath();
            ctx.arc(-1, -3, 1, 0, Math.PI * 2);
            ctx.fill();

            // ----- 5. 机身红色线带 (中段两条平行环) -----
            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.rect(-7, 4, 14, 1.8);
            ctx.fill();
            ctx.fillStyle = '#fca5a5';
            ctx.beginPath();
            ctx.rect(-7, 6.2, 14, 0.8);
            ctx.fill();

            // ----- 6. 底部喷口 (深灰金属圈) -----
            ctx.fillStyle = '#334155';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-5, 12);
            ctx.lineTo(-6.5, 16);
            ctx.lineTo(6.5, 16);
            ctx.lineTo(5, 12);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // 喷口黄色火焰小尖（道具静置预热感）
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.moveTo(-4, 16);
            ctx.lineTo(-2.5, 19);
            ctx.lineTo(0, 17);
            ctx.lineTo(2.5, 19);
            ctx.lineTo(4, 16);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        },

        // 绘制护盾道具
        shieldItem(ctx, x, y, width, height) {
            ctx.save();
            ctx.translate(x + width / 2, y + height / 2);

            // 卡通盾牌：蓝色，带有十字徽章
            ctx.fillStyle = '#60a5fa';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-12, -12);
            ctx.lineTo(12, -12);
            ctx.lineTo(10, 2);
            ctx.quadraticCurveTo(0, 16, -10, 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 十字纹饰
            ctx.strokeStyle = '#eff6ff';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, -7);
            ctx.lineTo(0, 9);
            ctx.moveTo(-6, 0);
            ctx.lineTo(6, 0);
            ctx.stroke();

            ctx.restore();
        },

        // 绘制子弹 (带发光尾迹的卡通黄丸子)
        bullet(ctx, x, y, radius) {
            ctx.save();
            ctx.fillStyle = '#facc15';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // 亮部高光
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(x - 2, y - 2, 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    };

    return {
        Sound,
        Draw,
        SkinColors,
        SkinImages
    };
})();
