// script.js

// ✨ 모든 코드를 전역 스코프에 배치하고, 실행 순서를 명확하게 제어
const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');

let width, height;
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

const player = {
    worldX: 200, worldY: 0, dx: 0, dy: 0, radius: 24, onGround: false,
    rotationAngle: 0, initialX: 200, initialY: 0,
    isFrozen: false, freezeEndTime: 0,
    isBoosted: false, boostEndTime: 0,
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

let portalBorderCanvas, portalNoiseMaskCanvas, portalCompositeCanvas;

const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.code.toLowerCase()] = false; });

let isTouchingLeft = false, isTouchingRight = false;
const jumpButton = { x: 0, y: 0, radius: 50 };
const leftButton = { x: 0, y: 0, radius: 40 };
const rightButton = { x: 0, y: 0, radius: 40 };
const resetButton = { x: 0, y: 0, width: 80, height: 40 };

function updateControlButtonsPosition() { 
    jumpButton.x = width - 90; jumpButton.y = height - 90; jumpButton.radius = 50; 
    leftButton.x = 90; leftButton.y = height - 90; leftButton.radius = 40; 
    rightButton.x = leftButton.x + leftButton.radius * 2 + 20; rightButton.y = height - 90; rightButton.radius = 40;
    resetButton.x = width - resetButton.width - 20; resetButton.y = 20;
}

function handleTouches(e) { 
    e.preventDefault(); 
    isTouchingLeft = false; 
    isTouchingRight = false; 
    for (let i = 0; i < e.touches.length; i++) { 
        const touch = e.touches[i]; 
        if (touch.clientX > resetButton.x && touch.clientX < resetButton.x + resetButton.width &&
            touch.clientY > resetButton.y && touch.clientY < resetButton.y + resetButton.height) {
            if (confirm("모든 진행 상황을 초기화하고 1단계부터 다시 시작하시겠습니까?")) {
                localStorage.removeItem('noiseGameState');
                if (spawnCheckTimer) clearInterval(spawnCheckTimer);
                spawnCheckTimer = null;
                init(1);
            }
            return;
        }
        const distJump = Math.sqrt((touch.clientX - jumpButton.x)**2 + (touch.clientY - jumpButton.y)**2); 
        if (distJump < jumpButton.radius) { if (player.onGround && !gameCleared && !player.isFrozen) { player.dy = JUMP_FORCE; } continue; } 
        const distLeft = Math.sqrt((touch.clientX - leftButton.x)**2 + (touch.clientY - leftButton.y)**2); 
        if (distLeft < leftButton.radius) { isTouchingLeft = true; continue; } 
        const distRight = Math.sqrt((touch.clientX - rightButton.x)**2 + (touch.clientY - rightButton.y)**2); 
        if (distRight < rightButton.radius) { isTouchingRight = true; continue; } 
    } 
}

window.addEventListener('touchstart', handleTouches, { passive: false }); 
window.addEventListener('touchmove', handleTouches, { passive: false }); 
window.addEventListener('touchend', (e) => { handleTouches(e); }, { passive: false });

function getStaticNoiseValue(x, y) { let seed = Math.floor(x) * 1357 + Math.floor(y) * 2468; let t = seed += 1831565813; t = Math.imul(t ^ t >>> 15, 1 | t); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) % 2 === 0 ? 0 : 255; }

function createPlayerTexture() { 
    playerTextureCanvas.width = PLAYER_TEXTURE_SIZE; playerTextureCanvas.height = PLAYER_TEXTURE_SIZE;
    const iD = pTextureCtx.createImageData(PLAYER_TEXTURE_SIZE,PLAYER_TEXTURE_SIZE); 
    const d = iD.data; 
    for (let i = 0; i < d.length; i+=4) { const s = Math.random() < 0.5 ? 0 : 255; d[i]=s; d[i+1]=s; d[i+2]=s; d[i+3]=255; } 
    pTextureCtx.putImageData(iD, 0, 0); 
}

function updatePlayer(time) {
    if (gameCleared) return;
    if (player.isFrozen) { if (time > player.freezeEndTime) player.isFrozen = false; return; }
    if (player.isBoosted) { if (time > player.boostEndTime) { player.isBoosted = false; MAX_SPEED = BASE_MAX_SPEED; JUMP_FORCE = BASE_JUMP_FORCE; } else { MAX_SPEED = BASE_MAX_SPEED * 1.5; JUMP_FORCE = BASE_JUMP_FORCE * 1.5; } }
    
    if (keys['keya'] || keys['arrowleft'] || isTouchingLeft) player.dx -= PLAYER_ACCEL;
    if (keys['keyd'] || keys['arrowright'] || isTouchingRight) player.dx += PLAYER_ACCEL;
    if ((keys['keyw'] || keys['arrowup'] || keys['space']) && player.onGround) { player.dy = JUMP_FORCE; player.onGround = false; }
    player.dx *= FRICTION;
    if (Math.abs(player.dx) < 0.1) player.dx = 0;
    if (Math.abs(player.dx) > MAX_SPEED) player.dx = Math.sign(player.dx) * MAX_SPEED;
    if (!player.onGround) player.dy += GRAVITY;
    
    const physicalObjects = worldObjects.filter(o => o.isPhysical);
    const lastPlayerY = player.worldY;
    player.worldX += player.dx;
    for (const p of physicalObjects) { if (checkPlatformCollision(player, p)) { if (player.dx > 0) player.worldX = p.worldX - player.radius; else if (player.dx < 0) player.worldX = p.worldX + p.width + player.radius; player.dx = 0; } }
    player.worldY += player.dy;
    player.onGround = false;
    for (const p of physicalObjects) { if (checkPlatformCollision(player, p)) { if (player.dy >= 0 && lastPlayerY + player.radius <= p.worldY + 1) { player.worldY = p.worldY - player.radius; player.dy = 0; player.onGround = true; } else if (player.dy < 0) { player.worldY = p.worldY + p.height + player.radius; player.dy = 0; } } }
    
    for (const coin of iceCoins) { if (coin.active) { const distSq = (player.worldX - coin.worldX)**2 + (player.worldY - coin.worldY)**2; if (distSq < (player.radius + coin.radius)**2) { coin.active = false; player.isFrozen = true; player.freezeEndTime = time + 3000; player.dx = 0; player.dy = 0; } } }
    for (const coin of rainbowCoins) { if (coin.active) { const distSq = (player.worldX - coin.worldX)**2 + (player.worldY - coin.worldY)**2; if (distSq < (player.radius + coin.radius)**2) { coin.active = false; player.isBoosted = true; player.boostEndTime = time + 5000; } } }

    if (portal && !gameCleared) { if (checkPlatformCollision(player, portal)) clearGame(); }
    player.rotationAngle += player.dx * 0.02;
    if (player.worldX > highestX) highestX = player.worldX;
    if (player.worldY > height + 800) { if (!gameCleared) init(currentStage); }
}

function checkPlatformCollision(p, plat) { const cX = Math.max(plat.worldX, Math.min(p.worldX, plat.worldX + plat.width)); const cY = Math.max(plat.worldY, Math.min(p.worldY, plat.worldY + plat.height)); return ((p.worldX - cX)**2 + (p.worldY - cY)**2) < (p.radius**2); }
function resetPlayer() { if (highestX > sessionRecordX) { sessionRecordX = highestX; saveGameState(); } highestX = 0; updateRecordPlatform(); player.worldX = player.initialX; player.worldY = player.initialY; player.dx = 0; player.dy = 0; player.isFrozen = false; player.freezeEndTime = 0; player.isBoosted = false; player.boostEndTime = 0; MAX_SPEED = BASE_MAX_SPEED; JUMP_FORCE = BASE_JUMP_FORCE; PLAYER_ACCEL = BASE_PLAYER_ACCEL; }
function renderWorld() { ctx.save(); ctx.translate(-(camera.x * 0.2) % 1024, -(camera.y * 0.2) % 1024); ctx.fillStyle = bgPattern; ctx.fillRect((camera.x * 0.2) % 1024, (camera.y * 0.2) % 1024, width, height); ctx.restore(); const physicalObjects = worldObjects.filter(o => o.isPhysical); physicalObjects.forEach(obj => { const screenX = Math.floor(obj.worldX - camera.x); const screenY = Math.floor(obj.worldY - camera.y); if (screenX + obj.width < 0 || screenX > width || screenY + obj.height < 0 || screenY > height) return; ctx.save(); ctx.beginPath(); ctx.rect(screenX, screenY, obj.width, obj.height); ctx.clip(); ctx.translate(-(camera.x % 1024), -(camera.y % 1024)); ctx.fillStyle = bgPattern; ctx.fillRect(camera.x % 1024, camera.y % 1024, width, height); ctx.restore(); }); }
function createPortalAssets() { const outerWidth = portal.width + PORTAL_BORDER_SIZE * 2; const outerHeight = portal.height + PORTAL_BORDER_SIZE * 2; portalBorderCanvas = document.createElement('canvas'); portalBorderCanvas.width = outerWidth; portalBorderCanvas.height = outerHeight; const borderCtx = portalBorderCanvas.getContext('2d'); for(let y=0; y<outerHeight; y++) for(let x=0; x<outerWidth; x++) if (x<PORTAL_BORDER_SIZE || x>=outerWidth-PORTAL_BORDER_SIZE || y<PORTAL_BORDER_SIZE || y>=outerHeight-PORTAL_BORDER_SIZE) if(getStaticNoiseValue(x,y)>128) { const lightness=15+Math.random()*15; borderCtx.fillStyle=`hsl(0, 75%, ${lightness}%)`; borderCtx.fillRect(x,y,1,1); } portalNoiseMaskCanvas = document.createElement('canvas'); portalNoiseMaskCanvas.width = portal.width; portalNoiseMaskCanvas.height = portal.height; const maskCtx = portalNoiseMaskCanvas.getContext('2d'); for (let y=0; y<portal.height; y++) for (let x=0; x<portal.width; x++) if(getStaticNoiseValue(x,y)>128) { maskCtx.fillStyle='black'; maskCtx.fillRect(x,y,1,1); } portalCompositeCanvas = document.createElement('canvas'); portalCompositeCanvas.width = outerWidth; portalCompositeCanvas.height = outerHeight; }
function drawPortal(time) { if (!portal || !portalCompositeCanvas) return; const pCtx = portalCompositeCanvas.getContext('2d'); const outerWidth = portalCompositeCanvas.width; const outerHeight = portalCompositeCanvas.height; pCtx.clearRect(0, 0, outerWidth, outerHeight); const gradient = pCtx.createLinearGradient(0, PORTAL_BORDER_SIZE, 0, PORTAL_BORDER_SIZE + portal.height); const hue = (time / 20) % 360; gradient.addColorStop(0, `hsla(${hue}, 80%, 40%, 0.8)`); gradient.addColorStop(1, `hsla(${(hue + 40) % 360}, 80%, 40%, 0.8)`); pCtx.fillStyle = gradient; pCtx.fillRect(PORTAL_BORDER_SIZE, PORTAL_BORDER_SIZE, portal.width, portal.height); pCtx.globalCompositeOperation = 'destination-in'; pCtx.drawImage(portalNoiseMaskCanvas, PORTAL_BORDER_SIZE, PORTAL_BORDER_SIZE); pCtx.globalCompositeOperation = 'source-over'; pCtx.drawImage(portalBorderCanvas, 0, 0); const screenX = Math.floor(portal.worldX - camera.x); const screenY = Math.floor(portal.worldY - camera.y); ctx.drawImage(portalCompositeCanvas, screenX - PORTAL_BORDER_SIZE, screenY - PORTAL_BORDER_SIZE); }
function updateCoins() { [...iceCoins, ...rainbowCoins].forEach(coin => { if (coin.active) { coin.worldX += coin.dx; coin.worldY += coin.dy; const screenLeft = camera.x + coin.radius; const screenRight = camera.x + width - coin.radius; const screenTop = camera.y + coin.radius; const screenBottom = camera.y + height - coin.radius; if (coin.worldX < screenLeft || coin.worldX > screenRight) { coin.dx *= -1; coin.worldX = Math.max(screenLeft, Math.min(coin.worldX, screenRight)); } if (coin.worldY < screenTop || coin.worldY > screenBottom) { coin.dy *= -1; coin.worldY = Math.max(screenTop, Math.min(coin.worldY, screenBottom)); } } }); }
function drawCoins(time) { ctx.save(); iceCoins.forEach(coin => { if (coin.active) { const screenX = coin.worldX - camera.x; const screenY = coin.worldY - camera.y; ctx.fillStyle = 'black'; ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(screenX, screenY, coin.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; ctx.beginPath(); ctx.arc(screenX - coin.radius * 0.3, screenY - coin.radius * 0.3, coin.radius * 0.3, 0, Math.PI * 2); ctx.fill(); } }); rainbowCoins.forEach(coin => { if (coin.active) { const screenX = coin.worldX - camera.x; const screenY = coin.worldY - camera.y; const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, coin.radius); const hue = (time / 10) % 360; gradient.addColorStop(0, `hsl(${hue}, 100%, 70%)`); gradient.addColorStop(0.5, `hsl(${(hue + 120) % 360}, 100%, 70%)`); gradient.addColorStop(1, `hsl(${(hue + 240) % 360}, 100%, 70%)`); ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(screenX, screenY, coin.radius, 0, Math.PI * 2); ctx.fill(); } }); ctx.restore(); }
function drawPlayer(time) { const screenX = width / 2, screenY = height / 2; ctx.save(); if (player.isBoosted) { const auraRadius = player.radius + 8 + Math.sin(time / 100) * 3; const gradient = ctx.createRadialGradient(screenX, screenY, player.radius, screenX, screenY, auraRadius); const hue = (time / 15) % 360; gradient.addColorStop(0, `hsla(${hue}, 90%, 70%, 0.5)`); gradient.addColorStop(1, `hsla(${(hue + 60) % 360}, 90%, 70%, 0)`); ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(screenX, screenY, auraRadius, 0, 2*Math.PI); ctx.fill(); } if (player.isFrozen) { ctx.fillStyle = 'black'; ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(screenX, screenY, player.radius, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); } else { ctx.beginPath(); ctx.arc(screenX, screenY, player.radius, 0, 2 * Math.PI); ctx.clip(); ctx.translate(screenX, screenY); ctx.rotate(player.rotationAngle); ctx.drawImage(playerTextureCanvas, -player.radius, -player.radius, player.radius * 2, player.radius * 2); } ctx.restore(); }
function createBackgroundPattern() { const pS = 1024; bgCanvas.width=pS; bgCanvas.height=pS; const iD=bgCtx.createImageData(pS, pS); const d = iD.data; for(let i=0; i<d.length; i+=4) { const s = getStaticNoiseValue(i%pS, Math.floor(i/pS)); d[i]=s; d[i+1]=s; d[i+2]=s; d[i+3]=255; } bgCtx.putImageData(iD, 0, 0); bgPattern = ctx.createPattern(bgCanvas, 'repeat'); }
function clearGame() { if(gameCleared) return; gameCleared = true; currentStage++; saveGameState(); setTimeout(() => { init(currentStage); }, STAGE_RESET_DELAY); }
function launchFireworks() { const numRockets = 12; for (let i = 0; i < numRockets; i++) { setTimeout(() => { rockets.push({ x: Math.random() * width, y: height, dx: Math.random() * 6 - 3, dy: -(Math.random() * 8 + 15), targetY: Math.random() * (height / 2.5), hue: Math.random() * 360 }); }, i * 150); } }
function createExplosion(x, y, hue) { const particleCount = 40 + Math.random() * 20; for (let i = 0; i < particleCount; i++) { const angle = Math.random() * Math.PI * 2; const speed = Math.random() * 12 + 4; particles.push({ x: x, y: y, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed, life: Math.random() * 60 + 60, size: Math.random() * 5 + 4, hue: hue + (Math.random() * 60 - 30) }); } }
function updateAndDrawClearEffects() { if (!fireworksLaunched) { launchFireworks(); fireworksLaunched = true; } for (let i = rockets.length - 1; i >= 0; i--) { const r = rockets[i]; r.x += r.dx; r.y += r.dy; r.dy += 0.2; ctx.fillStyle = `hsl(${r.hue}, 100%, 75%)`; ctx.beginPath(); ctx.arc(r.x, r.y, 3, 0, Math.PI * 2); ctx.fill(); if (r.y <= r.targetY) { createExplosion(r.x, r.y, r.hue); rockets.splice(i, 1); } } let lastCompositeOperation = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.dx; p.y += p.dy; p.dy += GRAVITY * 0.08; p.dx *= 0.98; p.life--; if (p.life <= 0) { particles.splice(i, 1); continue; } ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${p.life / 90})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); } ctx.globalCompositeOperation = lastCompositeOperation; ctx.font = 'bold 70px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'white'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 8; ctx.strokeText('NEXT STAGE', width / 2, height / 2); ctx.fillText('NEXT STAGE', width / 2, height / 2); }
function drawStageUI() { const uiWidth = 140; const uiHeight = 40; const x = width / 2 - uiWidth / 2; const y = 20; ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = 2; ctx.fillRect(x, y, uiWidth, uiHeight); ctx.strokeRect(x, y, uiWidth, uiHeight); ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('STAGE ' + currentStage, width / 2, y + uiHeight / 2); }
function drawControlButtons() { const bS = 'rgba(255, 255, 255, 0.35)'; const brS = 'rgba(255, 255, 255, 0.7)'; const iS = 'rgba(255, 255, 255, 0.9)'; ctx.lineWidth = 2; ctx.fillStyle = bS; ctx.strokeStyle = brS; ctx.beginPath(); ctx.arc(jumpButton.x, jumpButton.y, jumpButton.radius, 0, 2*Math.PI); ctx.fill(); ctx.stroke(); ctx.fillStyle = iS; ctx.beginPath(); ctx.moveTo(jumpButton.x, jumpButton.y-jumpButton.radius*0.4); ctx.lineTo(jumpButton.x-jumpButton.radius*0.5, jumpButton.y+jumpButton.radius*0.3); ctx.lineTo(jumpButton.x+jumpButton.radius*0.5, jumpButton.y+jumpButton.radius*0.3); ctx.closePath(); ctx.fill(); ctx.fillStyle = bS; ctx.strokeStyle = brS; ctx.beginPath(); ctx.arc(leftButton.x, leftButton.y, leftButton.radius, 0, 2*Math.PI); ctx.fill(); ctx.stroke(); ctx.fillStyle = iS; ctx.beginPath(); ctx.moveTo(leftButton.x-leftButton.radius*0.4, leftButton.y); ctx.lineTo(leftButton.x+leftButton.radius*0.4, leftButton.y-leftButton.radius*0.5); ctx.lineTo(leftButton.x+leftButton.radius*0.4, leftButton.y+leftButton.radius*0.5); ctx.closePath(); ctx.fill(); ctx.fillStyle = bS; ctx.strokeStyle = brS; ctx.beginPath(); ctx.arc(rightButton.x, rightButton.y, rightButton.radius, 0, 2*Math.PI); ctx.fill(); ctx.stroke(); ctx.fillStyle = iS; ctx.beginPath(); ctx.moveTo(rightButton.x+rightButton.radius*0.4, rightButton.y); ctx.lineTo(rightButton.x-rightButton.radius*0.4, rightButton.y-rightButton.radius*0.5); ctx.lineTo(rightButton.x-rightButton.radius*0.4, rightButton.y+rightButton.radius*0.5); ctx.closePath(); ctx.fill(); }
    function drawResetButton() { ctx.fillStyle = 'rgba(255, 0, 0, 0.7)'; ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; ctx.lineWidth = 2; ctx.fillRect(resetButton.x, resetButton.y, resetButton.width, resetButton.height); ctx.strokeRect(resetButton.x, resetButton.y, resetButton.width, resetButton.height); ctx.font = 'bold 18px sans-serif'; ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('RESET', resetButton.x + resetButton.width / 2, resetButton.y + resetButton.height / 2); }
    function drawRecordFlag() { if (!recordPlatform) return; const fW = 40, fH = 25, pH = 50, pWd = 2; const pCX = recordPlatform.worldX + recordPlatform.width / 2; const pTY = recordPlatform.worldY; const sPX = Math.floor(pCX - camera.x); const sPTY = Math.floor(pTY - pH - camera.y); if (sPX + fW < 0 || sPX - pWd > width) return; const pID = ctx.createImageData(pWd, pH); const pD = pID.data; for (let y = 0; y < pH; y++) for (let x = 0; x < pWd; x++) { const s=getStaticNoiseValue(x, y+100); const i=(y*pWd+x)*4; pD[i]=s; pD[i+1]=s; pD[i+2]=s; pD[i+3]=255; } ctx.putImageData(pID, sPX - Math.floor(pWd/2), sPTY); const fID = ctx.createImageData(fW, fH); const fD = fID.data; for (let y = 0; y < fH; y++) for (let x = 0; x < fW; x++) { const s=getStaticNoiseValue(x, y); const i=(y*fW+x)*4; fD[i]=s; fD[i+1]=s; fD[i+2]=s; fD[i+3]=255; } ctx.putImageData(fID, sPX, sPTY); }
    function updateRecordPlatform() { const phys = worldObjects.filter(o => o.isPhysical); let best = null; for (const p of phys) { if (p.worldX <= sessionRecordX) best = p; else break; } recordPlatform = best; }

    let lastTime = 0;
    function animate(time) {
        if(!lastTime) lastTime = time;
        updatePlayer(time);
        updateCoins();
        camera.x = player.worldX - (width / 2); camera.y = player.worldY - (height / 2);
        renderWorld(); 
        drawPortal(time);
        drawRecordFlag(); 
        drawCoins(time); 
        drawPlayer(time);
        drawResetButton();
        if (!gameCleared) { 
            drawControlButtons(); 
            drawStageUI(); 
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
            dx = (Math.random() - 0.5) * 60;
            dy = (Math.random() - 0.5) * 30;
        } else { 
            dx = (Math.random() - 0.5) * 12;
            dy = (Math.random() - 0.5) * 6;
        }
        const newCoin = {
            worldX: camera.x + Math.random() * width,
            worldY: camera.y + Math.random() * height,
            radius: 15, active: true,
            dx: dx, dy: dy,
        };
        if (type === 'ice') iceCoins.push(newCoin);
        else if (type === 'rainbow') rainbowCoins.push(newCoin);
    }
    
    function saveGameState() { const gameState = { stage: currentStage, record: sessionRecordX }; localStorage.setItem('noiseGameState', JSON.stringify(gameState)); }
    function loadGameState() { const savedState = localStorage.getItem('noiseGameState'); if (savedState) { const gameState = JSON.parse(savedState); currentStage = gameState.stage || 1; sessionRecordX = gameState.record || 0; } }

    function init(stageLevel = 1) {
        currentStage = stageLevel;
        gameCleared = false; fireworksLaunched = false;
        rockets = []; particles = []; highestX = 0;
        recordPlatform = null; 

        if (!spawnCheckTimer) {
            iceCoins = [];
            rainbowCoins = [];
            spawnCheckTimer = setInterval(spawnManager, SPAWN_CHECK_INTERVAL);
        }

        const startPlatformY = height - 100;
        resetPlayer();
        const platforms = [];
        let currentX = -200; let prevY = startPlatformY;
        const startPlatformSegmentWidth = 100; const startPlatformSegmentHeight = startPlatformSegmentWidth / 1.7;
        for (let i = 0; i < 10; i++) {
            platforms.push({ worldX: currentX, worldY: prevY, width: startPlatformSegmentWidth, height: startPlatformSegmentHeight, isPhysical: true });
            currentX += startPlatformSegmentWidth;
        }
        player.initialX = 150; player.initialY = startPlatformY - 150;
        player.worldX = player.initialX; player.worldY = player.initialY;

        const platformCount = 10 + (stageLevel - 1) * 5;
        const MAX_X_GAP = 180 + stageLevel * 10;
        const MIN_X_GAP = 120 + stageLevel * 5;
        const MAX_Y_CHANGE = 80 + stageLevel * 10;
        const platformMaxWidth = Math.max(40, 140 - stageLevel * 8);
        const platformMinWidth = Math.max(30, 80 - stageLevel * 8);

        for (let i = 0; i < platformCount; i++) {
            const xGap = MIN_X_GAP + Math.random() * (MAX_X_GAP - MIN_X_GAP);
            const yChange = (Math.random() - 0.4) * 2 * MAX_Y_CHANGE;
            let pW = platformMinWidth + Math.random() * (platformMaxWidth - platformMinWidth);
            let pH = pW / 1.7;
            currentX += xGap; let newY = prevY + yChange;
            if (newY > height - pH - 20) newY = height - pH - 20; if (newY < 150) newY = 150;
            platforms.push({ worldX: currentX, worldY: newY, width: pW, height: pH, isPhysical: true });
            prevY = newY;
        }
        
        const portalX = currentX + MAX_X_GAP + 100;
        const portalHeight = 300; const portalWidth = 120;
        portal = { worldX: portalX, worldY: prevY - portalHeight / 2, width: portalWidth, height: portalHeight, isPhysical: false };
        worldObjects = [ { worldX: -100000, worldY: -10000, width: 200000, height: 20000, isPhysical: false }, ...platforms ];
        
        createPortalAssets();
    }
    
    // ✨ (실행 순서 수정) resize 핸들러를 먼저 설정
    function resizeHandler() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        updateControlButtonsPosition();
        init(currentStage); // 창 크기가 바뀔 때마다 현재 스테이지를 다시 그림
    }
    
    window.addEventListener('resize', resizeHandler);
    
    // ✨ 모든 리소스/변수/함수가 정의된 후 게임 시작
    createPlayerTexture();
    createBackgroundPattern(); 
    
    loadGameState(); 
    resizeHandler(); // 초기 로드 시에도 호출하여 크기 설정 및 init 실행
    
    animate(0);
};