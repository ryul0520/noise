window.onload = function() {
    const canvas = document.getElementById('mainCanvas');
    const ctx = canvas.getContext('2d');

    let width, height;
    let viewWidth, viewHeight;
    const CAMERA_ZOOM = 1.5; 

    ctx.imageSmoothingEnabled = false;

    const BASE_GRAVITY = 1.0; 
    const BASE_JUMP_FORCE = -18;
    const BASE_PLAYER_ACCEL = 1.8; 
    const BASE_FRICTION = 0.90;
    const BASE_MAX_SPEED = 8;
    
    let GRAVITY = BASE_GRAVITY; 
    let JUMP_FORCE = BASE_JUMP_FORCE; 
    let PLAYER_ACCEL = BASE_PLAYER_ACCEL;
    let FRICTION = BASE_FRICTION; 
    let MAX_SPEED = BASE_MAX_SPEED;

    const PLAYER_TEXTURE_SIZE = 128; 
    const PORTAL_BORDER_SIZE = 16; 
    const STAGE_RESET_DELAY = 3000;
    
    const SPAWN_CHECK_INTERVAL = 4000;
    const MAX_ICE_COINS = 2;
    const MAX_RAINBOW_COINS = 1;
    // ✨ 무지개 발판 생성 확률 절반으로 감소
    const RAINBOW_PLATFORM_CHANCE = 0.075;

    const player = {
        worldX: 200, worldY: 0, dx: 0, dy: 0, radius: 24, onGround: false,
        rotationAngle: 0, initialX: 200, initialY: 0,
        isFrozen: false, freezeEndTime: 0,
        isBoosted: false, boostEndTime: 0,
        // ✨ timed-boost 상태는 제거하고, 현재 밟고 있는 발판을 저장할 변수 추가
        standingOnPlatform: null,
    };
    const camera = { x: 0, y: 0 };
    
    let worldObjects = [], portal = null;
    let iceCoins = []; 
    let rainbowCoins = [];
    let spawnCheckTimer = null; 
    let highestX = 0, sessionRecordX = 0, recordPlatform = null;

    let currentStage = 1; 
    let gameCleared = false; 
    let fireworksLaunched = false;
    let rockets = []; 
    let particles = [];
    
    const bgCanvas = document.createElement('canvas'), bgCtx = bgCanvas.getContext('2d');
    let bgPattern;
    const playerTextureCanvas = document.createElement('canvas');
    const pTextureCtx = playerTextureCanvas.getContext('2d');
    playerTextureCanvas.width = PLAYER_TEXTURE_SIZE;
    playerTextureCanvas.height = PLAYER_TEXTURE_SIZE;

    let portalBorderCanvas, portalNoiseMaskCanvas, portalCompositeCanvas;

    const keys = {};
    window.addEventListener('keydown', (e) => { keys[e.code.toLowerCase()] = true; });
    window.addEventListener('keyup', (e) => { keys[e.code.toLowerCase()] = false; });
    
    let isTouchingLeft = false, isTouchingRight = false, isTryingToJump = false;
    const jumpButton = { x: 0, y: 0, radius: 50 };
    const leftButton = { x: 0, y: 0, radius: 40 };
    const rightButton = { x: 0, y: 0, radius: 40 };
    const resetButton = { x: 0, y: 0, radius: 25 };

    function updateControlButtonsPosition() { 
        jumpButton.x = width - 90; 
        jumpButton.y = height - 90; 
        jumpButton.radius = 50; 
        leftButton.x = 90; 
        leftButton.y = height - 90; 
        leftButton.radius = 40; 
        rightButton.x = leftButton.x + leftButton.radius * 2 + 20; 
        rightButton.y = height - 90; 
        rightButton.radius = 40; 
        resetButton.x = width - 40;
        resetButton.y = 40;
    }
    
    function handleTouches(e) { 
        e.preventDefault(); 
        isTouchingLeft = false; 
        isTouchingRight = false; 
        isTryingToJump = false;

        for (let i = 0; i < e.touches.length; i++) { 
            const touch = e.touches[i]; 
            const distJump = Math.sqrt((touch.clientX - jumpButton.x)**2 + (touch.clientY - jumpButton.y)**2); 
            if (distJump < jumpButton.radius) { 
                isTryingToJump = true;
                continue; 
            } 
            const distLeft = Math.sqrt((touch.clientX - leftButton.x)**2 + (touch.clientY - leftButton.y)**2); 
            if (distLeft < leftButton.radius) { 
                isTouchingLeft = true; 
                continue; 
            } 
            const distRight = Math.sqrt((touch.clientX - rightButton.x)**2 + (touch.clientY - rightButton.y)**2); 
            if (distRight < rightButton.radius) { 
                isTouchingRight = true; 
                continue; 
            }
            const distReset = Math.sqrt((touch.clientX - resetButton.x)**2 + (touch.clientY - resetButton.y)**2);
            if (distReset < resetButton.radius) {
                resetGame();
                continue;
            }
        } 
    }

    window.addEventListener('touchstart', handleTouches, { passive: false }); 
    window.addEventListener('touchmove', handleTouches, { passive: false }); 
    window.addEventListener('touchend', (e) => { handleTouches(e); }, { passive: false });

    window.addEventListener('click', (e) => {
        const distReset = Math.sqrt((e.clientX - resetButton.x)**2 + (e.clientY - resetButton.y)**2);
        if (distReset < resetButton.radius && !gameCleared) {
            resetGame();
        }
    });

    function getStaticNoiseValue(x, y) { let seed = Math.floor(x) * 1357 + Math.floor(y) * 2468; let t = seed += 1831565813; t = Math.imul(t ^ t >>> 15, 1 | t); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) % 2 === 0 ? 0 : 255; }
    
    function createPlayerTexture() { 
        const iD = pTextureCtx.createImageData(PLAYER_TEXTURE_SIZE, PLAYER_TEXTURE_SIZE);
        const d = iD.data;
        for (let i = 0; i < d.length; i+=4) {
            const s = Math.random() < 0.5 ? 0 : 255;
            d[i]=s; d[i+1]=s; d[i+2]=s; d[i+3]=255;
        }
        pTextureCtx.putImageData(iD, 0, 0);
    }
    
    function createBackgroundPattern() {
        const pS = 1024;
        bgCanvas.width=pS;
        bgCanvas.height=pS;
        const iD=bgCtx.createImageData(pS, pS);
        const d = iD.data;
        for(let i=0; i<d.length; i+=4) {
            const s = getStaticNoiseValue(i%pS, Math.floor(i/pS));
            d[i]=s; d[i+1]=s; d[i+2]=s; d[i+3]=255;
        }
        bgCtx.putImageData(iD, 0, 0);
        bgPattern = ctx.createPattern(bgCanvas, 'repeat');
    }

    function updatePlayer(time) {
        if (gameCleared) return;
        
        // ✨ 매 프레임 능력치를 기본값으로 초기화
        JUMP_FORCE = BASE_JUMP_FORCE;
        PLAYER_ACCEL = BASE_PLAYER_ACCEL;
        MAX_SPEED = BASE_MAX_SPEED;

        if (player.isFrozen) { 
            if (time > player.freezeEndTime) player.isFrozen = false; 
            return; 
        }

        // 레인보우 코인으로 인한 부스트 (timed)
        if (player.isBoosted) {
            if (time > player.boostEndTime) {
                player.isBoosted = false;
            } else {
                MAX_SPEED = BASE_MAX_SPEED * 1.5;
                JUMP_FORCE = BASE_JUMP_FORCE * 1.5;
            }
        }
        
        // ✨ 무지개 발판 위에서만 적용되는 부스트 (instant)
        if (player.onGround && player.standingOnPlatform && player.standingOnPlatform.type === 'rainbow') {
            JUMP_FORCE = BASE_JUMP_FORCE * 1.8;
            PLAYER_ACCEL = BASE_PLAYER_ACCEL * 1.5;
            MAX_SPEED = BASE_MAX_SPEED * 1.5;
        }

        if (keys['keya'] || keys['arrowleft'] || isTouchingLeft) player.dx -= PLAYER_ACCEL;
        if (keys['keyd'] || keys['arrowright'] || isTouchingRight) player.dx += PLAYER_ACCEL;

        if ((keys['keyw'] || keys['arrowup'] || keys['space'] || isTryingToJump) && player.onGround) { 
            player.dy = JUMP_FORCE; 
            player.onGround = false; 
        }

        player.dx *= FRICTION;
        if (Math.abs(player.dx) < 0.1) player.dx = 0;
        if (Math.abs(player.dx) > MAX_SPEED) player.dx = Math.sign(player.dx) * MAX_SPEED;
        if (!player.onGround) player.dy += GRAVITY;
        
        const physicalObjects = worldObjects.filter(o => o.isPhysical);
        const lastPlayerY = player.worldY;
        player.worldX += player.dx;
        for (const p of physicalObjects) { 
            if (checkPlatformCollision(player, p)) { 
                if (player.dx > 0) player.worldX = p.worldX - player.radius; 
                else if (player.dx < 0) player.worldX = p.worldX + p.width + player.radius; 
                player.dx = 0; 
            } 
        }
        player.worldY += player.dy;
        player.onGround = false;
        player.standingOnPlatform = null; // ✨ 매 프레임 초기화
        for (const p of physicalObjects) { 
            if (checkPlatformCollision(player, p)) { 
                if (player.dy >= 0 && lastPlayerY + player.radius <= p.worldY + 1) { 
                    player.worldY = p.worldY - player.radius; 
                    player.dy = 0; 
                    player.onGround = true; 
                    player.standingOnPlatform = p; // ✨ 밟고 있는 발판 정보 저장
                } else if (player.dy < 0) { 
                    player.worldY = p.worldY + p.height + player.radius; 
                    player.dy = 0; 
                } 
            } 
        }
        
        for (const coin of iceCoins) { if (coin.active) { const distSq = (player.worldX - coin.worldX)**2 + (player.worldY - coin.worldY)**2; if (distSq < (player.radius + coin.radius)**2) { coin.active = false; player.isFrozen = true; player.freezeEndTime = time + 3000; player.dx = 0; player.dy = 0; } } }
        for (const coin of rainbowCoins) { if (coin.active) { const distSq = (player.worldX - coin.worldX)**2 + (player.worldY - coin.worldY)**2; if (distSq < (player.radius + coin.radius)**2) { coin.active = false; player.isBoosted = true; player.boostEndTime = time + 5000; } } }

        if (portal && !gameCleared) { if (checkPlatformCollision(player, portal)) clearGame(); }
        player.rotationAngle += player.dx * 0.02;
        if (player.worldX > highestX) highestX = player.worldX;
        if (player.worldY > viewHeight / 2 + height + 800) { if (!gameCleared) init(currentStage); }
    }
    
    function checkPlatformCollision(p, plat) { const cX = Math.max(plat.worldX, Math.min(p.worldX, plat.worldX + plat.width)); const cY = Math.max(plat.worldY, Math.min(p.worldY, plat.worldY + plat.height)); return ((p.worldX - cX)**2 + (p.worldY - cY)**2) < (p.radius**2); }
    
    function resetPlayer() { 
        if (highestX > sessionRecordX) sessionRecordX = highestX; 
        highestX = 0; 
        updateRecordPlatform(); 
        player.worldX = player.initialX; 
        player.worldY = player.initialY; 
        player.dx = 0; 
        player.dy = 0; 
        player.isFrozen = false; 
        player.freezeEndTime = 0; 
        player.isBoosted = false; 
        player.boostEndTime = 0;
        player.standingOnPlatform = null; // ✨ 초기화
        // 기본 값 복원은 updatePlayer 시작 시 매번 하므로 여기서 제거
    }
    
    function renderWorld(time) {
        ctx.save();
        const scaledViewWidth = viewWidth;
        const scaledViewHeight = viewHeight;
        ctx.translate(-(camera.x * 0.2) % 1024, -(camera.y * 0.2) % 1024);
        ctx.fillStyle = bgPattern;
        ctx.fillRect((camera.x * 0.2) % 1024, (camera.y * 0.2) % 1024, scaledViewWidth + 1024, scaledViewHeight + 1024);
        ctx.restore();

        const physicalObjects = worldObjects.filter(o => o.isPhysical);
        physicalObjects.forEach(obj => {
            const screenX = Math.floor(obj.worldX - camera.x);
            const screenY = Math.floor(obj.worldY - camera.y);
            if (screenX + obj.width < 0 || screenX > scaledViewWidth || screenY + obj.height < 0 || screenY > scaledViewHeight) return;
            
            if (obj.type === 'rainbow') {
                const gradient = ctx.createLinearGradient(screenX, 0, screenX + obj.width, 0);
                const hue = (time / 10) % 360;
                for (let i = 0; i <= 10; i++) {
                    gradient.addColorStop(i / 10, `hsl(${(hue + i * 36) % 360}, 100%, 70%)`);
                }
                ctx.fillStyle = gradient;
                ctx.fillRect(screenX, screenY, obj.width, obj.height);
            } else {
                ctx.save();
                ctx.beginPath();
                ctx.rect(screenX, screenY, obj.width, obj.height);
                ctx.clip();
                ctx.translate(-(camera.x % 1024), -(camera.y % 1024));
                ctx.fillStyle = bgPattern;
                ctx.fillRect(camera.x % 1024, camera.y % 1024, scaledViewWidth + 1024, scaledViewHeight + 1024);
                ctx.restore();
            }
        });
    }

    function createPortalAssets() { const outerWidth = portal.width + PORTAL_BORDER_SIZE * 2; const outerHeight = portal.height + PORTAL_BORDER_SIZE * 2; portalBorderCanvas = document.createElement('canvas'); portalBorderCanvas.width = outerWidth; portalBorderCanvas.height = outerHeight; const borderCtx = portalBorderCanvas.getContext('2d'); for(let y=0; y<outerHeight; y++) for(let x=0; x<outerWidth; x++) if (x<PORTAL_BORDER_SIZE || x>=outerWidth-PORTAL_BORDER_SIZE || y<PORTAL_BORDER_SIZE || y>=outerHeight-PORTAL_BORDER_SIZE) if(getStaticNoiseValue(x,y)>128) { const lightness=15+Math.random()*15; borderCtx.fillStyle=`hsl(0, 75%, ${lightness}%)`; borderCtx.fillRect(x,y,1,1); } portalNoiseMaskCanvas = document.createElement('canvas'); portalNoiseMaskCanvas.width = portal.width; portalNoiseMaskCanvas.height = portal.height; const maskCtx = portalNoiseMaskCanvas.getContext('2d'); for (let y=0; y<portal.height; y++) for (let x=0; x<portal.width; x++) if(getStaticNoiseValue(x,y)>128) { maskCtx.fillStyle='black'; maskCtx.fillRect(x,y,1,1); } portalCompositeCanvas = document.createElement('canvas'); portalCompositeCanvas.width = outerWidth; portalCompositeCanvas.height = outerHeight; }
    function drawPortal(time) { if (!portal || !portalCompositeCanvas) return; const pCtx = portalCompositeCanvas.getContext('2d'); const outerWidth = portalCompositeCanvas.width; const outerHeight = portalCompositeCanvas.height; pCtx.clearRect(0, 0, outerWidth, outerHeight); const gradient = pCtx.createLinearGradient(0, PORTAL_BORDER_SIZE, 0, PORTAL_BORDER_SIZE + portal.height); const hue = (time / 20) % 360; gradient.addColorStop(0, `hsla(${hue}, 80%, 40%, 0.8)`); gradient.addColorStop(1, `hsla(${(hue + 40) % 360}, 80%, 40%, 0.8)`); pCtx.fillStyle = gradient; pCtx.fillRect(PORTAL_BORDER_SIZE, PORTAL_BORDER_SIZE, portal.width, portal.height); pCtx.globalCompositeOperation = 'destination-in'; pCtx.drawImage(portalNoiseMaskCanvas, PORTAL_BORDER_SIZE, PORTAL_BORDER_SIZE); pCtx.globalCompositeOperation = 'source-over'; pCtx.drawImage(portalBorderCanvas, 0, 0); const screenX = Math.floor(portal.worldX - camera.x); const screenY = Math.floor(portal.worldY - camera.y); ctx.drawImage(portalCompositeCanvas, screenX - PORTAL_BORDER_SIZE, screenY - PORTAL_BORDER_SIZE); }
    function updateCoins() { [...iceCoins, ...rainbowCoins].forEach(coin => { if (coin.active) { coin.worldX += coin.dx; coin.worldY += coin.dy; const screenLeft = camera.x + coin.radius; const screenRight = camera.x + viewWidth - coin.radius; const screenTop = camera.y + coin.radius; const screenBottom = camera.y + viewHeight - coin.radius; if (coin.worldX < screenLeft || coin.worldX > screenRight) { coin.dx *= -1; coin.worldX = Math.max(screenLeft, Math.min(coin.worldX, screenRight)); } if (coin.worldY < screenTop || coin.worldY > screenBottom) { coin.dy *= -1; coin.worldY = Math.max(screenTop, Math.min(coin.worldY, screenBottom)); } } }); }
    function drawCoins(time) { ctx.save(); iceCoins.forEach(coin => { if (coin.active) { const screenX = coin.worldX - camera.x; const screenY = coin.worldY - camera.y; ctx.fillStyle = 'black'; ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(screenX, screenY, coin.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; ctx.beginPath(); ctx.arc(screenX - coin.radius * 0.3, screenY - coin.radius * 0.3, coin.radius * 0.3, 0, Math.PI * 2); ctx.fill(); } }); rainbowCoins.forEach(coin => { if (coin.active) { const screenX = coin.worldX - camera.x; const screenY = coin.worldY - camera.y; const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, coin.radius); const hue = (time / 10) % 360; gradient.addColorStop(0, `hsl(${hue}, 100%, 70%)`); gradient.addColorStop(0.5, `hsl(${(hue + 120) % 360}, 100%, 70%)`); gradient.addColorStop(1, `hsl(${(hue + 240) % 360}, 100%, 70%)`); ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(screenX, screenY, coin.radius, 0, Math.PI * 2); ctx.fill(); } }); ctx.restore(); }
    
    function drawPlayer(time) {
        const screenX = viewWidth / 2, screenY = viewHeight / 2;
        ctx.save();

        // ✨ 무지개 발판 위에 있을 때 오라 효과
        if (player.onGround && player.standingOnPlatform && player.standingOnPlatform.type === 'rainbow') {
            const auraRadius = player.radius + 12 + Math.sin(time / 80) * 5;
            const gradient = ctx.createRadialGradient(screenX, screenY, player.radius, screenX, screenY, auraRadius);
            const hue = (time / 10) % 360;
            gradient.addColorStop(0, `hsla(${hue}, 100%, 80%, 0.7)`);
            gradient.addColorStop(0.5, `hsla(${(hue + 180) % 360}, 100%, 80%, 0.4)`);
            gradient.addColorStop(1, `hsla(${(hue + 180) % 360}, 100%, 80%, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(screenX, screenY, auraRadius, 0, 2 * Math.PI);
            ctx.fill();
        } else if (player.isBoosted) { // 코인 부스트 오라
            const auraRadius = player.radius + 8 + Math.sin(time / 100) * 3;
            const gradient = ctx.createRadialGradient(screenX, screenY, player.radius, screenX, screenY, auraRadius);
            const hue = (time / 15) % 360;
            gradient.addColorStop(0, `hsla(${hue}, 90%, 70%, 0.5)`);
            gradient.addColorStop(1, `hsla(${(hue + 60) % 360}, 90%, 70%, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(screenX, screenY, auraRadius, 0, 2 * Math.PI);
            ctx.fill();
        }
        if (player.isFrozen) {
            ctx.fillStyle = 'black'; ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(screenX, screenY, player.radius, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.arc(screenX, screenY, player.radius, 0, 2 * Math.PI); ctx.clip();
            ctx.translate(screenX, screenY); ctx.rotate(player.rotationAngle);
            ctx.drawImage(playerTextureCanvas, -player.radius, -player.radius, player.radius * 2, player.radius * 2);
        }
        ctx.restore();
    }
    
    function clearGame() { 
        if(gameCleared) return; 
        gameCleared = true; 
        const nextStage = currentStage + 1;
        const savedHighestStage = parseInt(localStorage.getItem('highestStage')) || 1;
        if (nextStage > savedHighestStage) {
            localStorage.setItem('highestStage', nextStage);
        }
        setTimeout(() => { init(nextStage); }, STAGE_RESET_DELAY); 
    }

    function launchFireworks() { const numRockets = 12; for (let i = 0; i < numRockets; i++) { setTimeout(() => { rockets.push({ x: Math.random() * width, y: height, dx: Math.random() * 6 - 3, dy: -(Math.random() * 8 + 15), targetY: Math.random() * (height / 2.5), hue: Math.random() * 360 }); }, i * 150); } }
    function createExplosion(x, y, hue) { const particleCount = 40 + Math.random() * 20; for (let i = 0; i < particleCount; i++) { const angle = Math.random() * Math.PI * 2; const speed = Math.random() * 12 + 4; particles.push({ x: x, y: y, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed, life: Math.random() * 60 + 60, size: Math.random() * 5 + 4, hue: hue + (Math.random() * 60 - 30) }); } }
    function updateAndDrawClearEffects() { if (!fireworksLaunched) { launchFireworks(); fireworksLaunched = true; } for (let i = rockets.length - 1; i >= 0; i--) { const r = rockets[i]; r.x += r.dx; r.y += r.dy; r.dy += 0.2; ctx.fillStyle = `hsl(${r.hue}, 100%, 75%)`; ctx.beginPath(); ctx.arc(r.x, r.y, 3, 0, Math.PI * 2); ctx.fill(); if (r.y <= r.targetY) { createExplosion(r.x, r.y, r.hue); rockets.splice(i, 1); } } let lastCompositeOperation = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.dx; p.y += p.dy; p.dy += GRAVITY * 0.08; p.dx *= 0.98; p.life--; if (p.life <= 0) { particles.splice(i, 1); continue; } ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${p.life / 90})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); } ctx.globalCompositeOperation = lastCompositeOperation; ctx.font = 'bold 70px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'white'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 8; ctx.strokeText('NEXT STAGE', width / 2, height / 2); ctx.fillText('NEXT STAGE', width / 2, height / 2); }
    
    function drawStageUI() {
        const cX = width / 2;
        const cY = 25;
        const bW = 160; const bH = 50; const mW = 110; const mH = 40;
        const wR = 8 * (currentStage - 1); const hR = 2 * (currentStage - 1);
        const uW = Math.max(mW, bW - wR); const uH = Math.max(mH, bH - hR);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = 2;
        ctx.fillRect(cX - uW / 2, cY - uH / 2, uW, uH); ctx.strokeRect(cX - uW / 2, cY - uH / 2, uW, uH);
        ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('STAGE ' + currentStage, cX, cY);
    }

    function drawResetButton() {
        const r = resetButton;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius * 0.6, Math.PI * 0.3, Math.PI * 1.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(r.x + r.radius * 0.6 * Math.cos(Math.PI * 0.3), r.y + r.radius * 0.6 * Math.sin(Math.PI * 0.3));
        ctx.lineTo(r.x + r.radius * 0.6 * Math.cos(Math.PI * 0.3) + 8, r.y + r.radius * 0.6 * Math.sin(Math.PI * 0.3) - 8);
        ctx.lineTo(r.x + r.radius * 0.6 * Math.cos(Math.PI * 0.3) + 8, r.y + r.radius * 0.6 * Math.sin(Math.PI * 0.3) + 2);
        ctx.stroke();
    }

    function drawControlButtons() { const bS = 'rgba(255, 255, 255, 0.35)'; const brS = 'rgba(255, 255, 255, 0.7)'; const iS = 'rgba(255, 255, 255, 0.9)'; ctx.lineWidth = 2; ctx.fillStyle = bS; ctx.strokeStyle = brS; ctx.beginPath(); ctx.arc(jumpButton.x, jumpButton.y, jumpButton.radius, 0, 2*Math.PI); ctx.fill(); ctx.stroke(); ctx.fillStyle = iS; ctx.beginPath(); ctx.moveTo(jumpButton.x, jumpButton.y-jumpButton.radius*0.4); ctx.lineTo(jumpButton.x-jumpButton.radius*0.5, jumpButton.y+jumpButton.radius*0.3); ctx.lineTo(jumpButton.x+jumpButton.radius*0.5, jumpButton.y+jumpButton.radius*0.3); ctx.closePath(); ctx.fill(); ctx.fillStyle = bS; ctx.strokeStyle = brS; ctx.beginPath(); ctx.arc(leftButton.x, leftButton.y, leftButton.radius, 0, 2*Math.PI); ctx.fill(); ctx.stroke(); ctx.fillStyle = iS; ctx.beginPath(); ctx.moveTo(leftButton.x-leftButton.radius*0.4, leftButton.y); ctx.lineTo(leftButton.x+leftButton.radius*0.4, leftButton.y-leftButton.radius*0.5); ctx.lineTo(leftButton.x+leftButton.radius*0.4, leftButton.y+leftButton.radius*0.5); ctx.closePath(); ctx.fill(); ctx.fillStyle = bS; ctx.strokeStyle = brS; ctx.beginPath(); ctx.arc(rightButton.x, rightButton.y, rightButton.radius, 0, 2*Math.PI); ctx.fill(); ctx.stroke(); ctx.fillStyle = iS; ctx.beginPath(); ctx.moveTo(rightButton.x+rightButton.radius*0.4, rightButton.y); ctx.lineTo(rightButton.x-rightButton.radius*0.4, rightButton.y-rightButton.radius*0.5); ctx.lineTo(rightButton.x-rightButton.radius*0.4, rightButton.y+rightButton.radius*0.5); ctx.closePath(); ctx.fill(); }
    function drawRecordFlag() { if (!recordPlatform) return; const fW = 40, fH = 25, pH = 50, pWd = 2; const pCX = recordPlatform.worldX + recordPlatform.width / 2; const pTY = recordPlatform.worldY; const sPX = Math.floor((pCX - camera.x) / CAMERA_ZOOM); const sPTY = Math.floor((pTY - pH - camera.y) / CAMERA_ZOOM); if (sPX + fW < 0 || sPX - pWd > width) return; const pID = ctx.createImageData(pWd, pH); const pD = pID.data; for (let y = 0; y < pH; y++) for (let x = 0; x < pWd; x++) { const s=getStaticNoiseValue(x, y+100); const i=(y*pWd+x)*4; pD[i]=s; pD[i+1]=s; pD[i+2]=s; pD[i+3]=255; } ctx.putImageData(pID, sPX - Math.floor(pWd/2), sPTY); const fID = ctx.createImageData(fW, fH); const fD = fID.data; for (let y = 0; y < fH; y++) for (let x = 0; x < fW; x++) { const s=getStaticNoiseValue(x, y); const i=(y*fW+x)*4; fD[i]=s; fD[i+1]=s; fD[i+2]=s; fD[i+3]=255; } ctx.putImageData(fID, sPX, sPTY); }
    function updateRecordPlatform() { const phys = worldObjects.filter(o => o.isPhysical); let best = null; for (const p of phys) { if (p.worldX <= sessionRecordX) best = p; else break; } recordPlatform = best; }

    let lastTime = 0;
    function animate(time) {
        if(!lastTime) lastTime = time;
        updatePlayer(time);
        updateCoins();
        camera.x = player.worldX - (viewWidth / 2);
        camera.y = player.worldY - (viewHeight / 2);

        ctx.save();
        ctx.scale(1 / CAMERA_ZOOM, 1 / CAMERA_ZOOM);
        
        renderWorld(time);
        drawPortal(time);
        drawCoins(time); 
        drawPlayer(time);

        ctx.restore(); 

        if (!gameCleared) {
            drawRecordFlag();
            drawControlButtons();
            drawStageUI();
            drawResetButton();
        }
        if (gameCleared) {
            updateAndDrawClearEffects();
        }
        requestAnimationFrame(animate);
    }
    
    function spawnManager() {
        if (iceCoins.filter(c => c.active).length < MAX_ICE_COINS) {
            if (Math.random() < 0.2) generateCoin('ice');
        }
        if (rainbowCoins.filter(c => c.active).length < MAX_RAINBOW_COINS) {
            if (Math.random() < 0.02) generateCoin('rainbow');
        }
    }

    function generateCoin(type) {
        let dx, dy;
        if (type === 'ice') {
            dx = (Math.random() - 0.5) * 60; dy = (Math.random() - 0.5) * 30;
        } else { 
            dx = (Math.random() - 0.5) * 12; dy = (Math.random() - 0.5) * 6;
        }
        const newCoin = {
            worldX: camera.x + Math.random() * viewWidth,
            worldY: camera.y + Math.random() * viewHeight,
            radius: 15, active: true, dx: dx, dy: dy,
        };
        if (type === 'ice') iceCoins.push(newCoin);
        else if (type === 'rainbow') rainbowCoins.push(newCoin);
    }

    function resetGame() {
        localStorage.removeItem('highestStage');
        init(1);
    }

    function loadProgress() {
        const savedStage = localStorage.getItem('highestStage');
        return parseInt(savedStage, 10) || 1;
    }

    function init(stageLevel = 1) {
        currentStage = stageLevel;
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        
        viewWidth = width * CAMERA_ZOOM;
        viewHeight = height * CAMERA_ZOOM;

        updateControlButtonsPosition();
        gameCleared = false; fireworksLaunched = false;
        rockets = []; particles = []; highestX = 0;
        recordPlatform = null; sessionRecordX = 0;
        resetPlayer();

        if (!spawnCheckTimer) {
            iceCoins = []; rainbowCoins = [];
            spawnCheckTimer = setInterval(spawnManager, SPAWN_CHECK_INTERVAL);
        }

        const startPlatformY = viewHeight - 100;
        
        const platforms = [];
        let currentX = -200; let prevY = startPlatformY;
        const startPlatformSegmentWidth = 100; const startPlatformSegmentHeight = startPlatformSegmentWidth / 1.7;
        for (let i = 0; i < 10; i++) {
            platforms.push({ worldX: currentX, worldY: prevY, width: startPlatformSegmentWidth, height: startPlatformSegmentHeight, isPhysical: true });
            currentX += startPlatformSegmentWidth;
        }
        player.initialX = 150; player.initialY = startPlatformY - 150;
        player.worldX = player.initialX; player.worldY = player.initialY;

        const s = stageLevel - 1;
        const platformCount = 10 + s * 5;
        const MIN_X_GAP_BASE = 110 + s * 15;
        const MAX_X_GAP_BASE = 160 + s * 20;
        const MAX_Y_CHANGE = 40 + s * 15;
        const platformMaxWidth = Math.max(60, 200 - s * 15);
        const platformMinWidth = Math.max(40, 100 - s * 10);

        let previousPlatformWasRainbow = false;

        for (let i = 0; i < platformCount; i++) {
            let MIN_X_GAP = MIN_X_GAP_BASE;
            let MAX_X_GAP = MAX_X_GAP_BASE;

            // ✨ 이전 발판이 무지개였으면 다음 간격을 훨씬 더 멀게 설정
            if (previousPlatformWasRainbow) {
                MIN_X_GAP *= 2.2;
                MAX_X_GAP *= 2.5;
                previousPlatformWasRainbow = false;
            }

            const xGap = MIN_X_GAP + Math.random() * (MAX_X_GAP - MIN_X_GAP);
            const yChange = (Math.random() - 0.45) * 2 * MAX_Y_CHANGE;
            let pW = platformMinWidth + Math.random() * (platformMaxWidth - platformMinWidth);
            let pH = pW / 1.7;
            currentX += xGap; let newY = prevY + yChange;
            if (newY > viewHeight - pH - 20) newY = viewHeight - pH - 20; if (newY < 150) newY = 150;
            
            const newPlatform = { worldX: currentX, worldY: newY, width: pW, height: pH, isPhysical: true };
            
            if (i > 0 && Math.random() < RAINBOW_PLATFORM_CHANCE) {
                newPlatform.type = 'rainbow';
                previousPlatformWasRainbow = true;
            }

            platforms.push(newPlatform);
            prevY = newY;
        }
        
        const portalX = currentX + MAX_X_GAP_BASE + 100;
        const portalHeight = 300; const portalWidth = 120;
        portal = { worldX: portalX, worldY: prevY - portalHeight / 2, width: portalWidth, height: portalHeight, isPhysical: false };
        worldObjects = [ { worldX: -100000, worldY: -10000, width: 200000, height: 20000, isPhysical: false }, ...platforms ];
        
        createPortalAssets();
    }
    
    createPlayerTexture();
    createBackgroundPattern(); 
    
    window.addEventListener('resize', () => init(currentStage));
    init(loadProgress());
    animate(0);
};