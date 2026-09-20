/**
 * MusicHealingScene
 * 完整的 Three.js + Web Audio API 音乐粒子场景 HTML 字符串。
 * 由 music-healing-room.tsx 注入 WebView（原生）或 iframe（Web）。
 *
 * 技术栈：
 * - Three.js r160 (ESM via importmap + jsdelivr CDN)
 * - OrbitControls (three/addons ESM)
 * - dat.GUI 0.7.9 (ESM)
 * - Web Audio API (AnalyserNode 低音/中频/高音三段分析)
 *
 * 功能：
 * - 10 万粒子 BufferGeometry + PointsMaterial 顶点着色
 * - 10 种数学形态（球体/心形/烟花/环形/DNA/星云/漩涡/波浪/土星环/立方体）
 * - 低音(Bass) → 粒子尺寸脉冲 + HSL颜色偏移
 * - 中频(Mid)  → 粒子位移震动幅度（跟随音乐律动）
 * - 高音瞬态(Treble Transient) → Z轴爆炸冲击波
 * - 节拍检测 → 整体形态脉冲扩张
 * - 常态呼吸浮动噪声
 * - OrbitControls 双指缩放/旋转
 * - dat.GUI 实时调参面板（⚙展开调参按钮，无重复Open Controls）
 * - 底部形态按钮（含收纳按钮）
 * - 截图导出按钮
 * - 接收 RN 侧 postMessage → loadAudio(url)
 *
 * v247 修复：
 * - 删除 dat.GUI 自带的 Open Controls 重复按钮（通过 CSS + 移除 gui.domElement 处理）
 * - 增强粒子-音频映射：低音→尺寸、中频→位移、高音→冲击波、节拍→脉冲
 * - 接入个人音频库（file:// 协议本地 URI via LOAD_AUDIO_URL）
 */
export const MUSIC_HEALING_HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<title>音乐粒子疗愈室</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#000;font-family:'PingFang SC',sans-serif}
canvas{display:block}

/* ── 引导遮罩 ── */
#overlay{position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:100;gap:20px;padding:32px}
#overlay.hidden{display:none}
#overlay h2{color:#fff;font-size:22px;font-weight:700;text-align:center;line-height:1.5}
#overlay p{color:#94A3B8;font-size:14px;text-align:center;line-height:1.8;max-width:320px}
#startBtn{background:linear-gradient(135deg,#7C3AED,#4F46E5);color:#fff;border:none;border-radius:16px;padding:16px 48px;font-size:16px;font-weight:600;cursor:pointer;letter-spacing:.5px;box-shadow:0 8px 32px rgba(124,58,237,.4)}
#startBtn:hover{opacity:.9}

/* ── 顶部频谱条 ── */
#specBar{position:fixed;top:0;left:0;right:0;height:3px;z-index:50;pointer-events:none;background:transparent}

/* ── 形态标签 ── */
#shapeLabel{position:fixed;top:12px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.45);font-size:11px;letter-spacing:2px;z-index:50;pointer-events:none}

/* ── 右上角按钮组 ── */
#topRight{position:fixed;top:16px;right:16px;display:flex;flex-direction:column;gap:8px;z-index:60;align-items:flex-end}
#topRight button{background:rgba(255,255,255,.1);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:10px;padding:7px 12px;font-size:11px;cursor:pointer;transition:all .2s;white-space:nowrap}
#topRight button:hover{background:rgba(255,255,255,.2)}
#guiToggleBtn{background:rgba(124,58,237,.45)!important;border-color:rgba(124,58,237,.6)!important}
#guiToggleBtn:hover{background:rgba(124,58,237,.65)!important}

/* ── 左上角按钮 ── */
#loadBtn{position:fixed;top:16px;left:16px;background:rgba(124,58,237,.5);backdrop-filter:blur(12px);border:1px solid rgba(124,58,237,.7);color:#fff;border-radius:10px;padding:7px 12px;font-size:11px;cursor:pointer;z-index:60}
#nowPlaying{position:fixed;top:50px;left:16px;color:rgba(255,255,255,.4);font-size:10px;z-index:50;max-width:180px;word-break:break-all;line-height:1.4}

/* ── 底部形态选择栏 ── */
#uiWrapper{position:fixed;bottom:0;left:0;right:0;z-index:50;display:flex;flex-direction:column;align-items:center}
#uiToggleBtn{pointer-events:all;background:rgba(30,20,60,.7);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.15);border-bottom:none;color:rgba(255,255,255,.7);border-radius:10px 10px 0 0;padding:4px 20px 2px;font-size:13px;cursor:pointer;transition:all .2s;line-height:1.6}
#uiToggleBtn:hover{background:rgba(124,58,237,.4)}
#ui{width:100%;background:rgba(10,5,30,.75);backdrop-filter:blur(14px);border-top:1px solid rgba(255,255,255,.08);padding:10px 12px 14px;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;pointer-events:all;overflow:hidden;transition:max-height .3s ease,opacity .3s ease,padding .3s ease}
#ui.collapsed{max-height:0;padding-top:0;padding-bottom:0;opacity:0;pointer-events:none}
#ui.expanded{max-height:120px;opacity:1}
#ui button{background:rgba(255,255,255,.1);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:12px;padding:7px 13px;font-size:12px;cursor:pointer;transition:all .2s}
#ui button:hover{background:rgba(255,255,255,.2)}
#ui button.active{background:rgba(124,58,237,.5);border-color:rgba(124,58,237,.7)}

/* ── dat.GUI 覆盖样式 ── */
/* GUI 面板下沉到按钮组下方，避免与 #topRight 按钮重叠 */
.dg.ac{z-index:200!important;top:96px!important;right:0!important}
/* 隐藏 dat.GUI 自带的 "Open Controls" 按钮——我们用自己的 #guiToggleBtn */
.dg.ac>.dg.main>.close-button{display:none!important}
input[type=file]{display:none}
</style>

<!-- Three.js r160 ESM importmap -->
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }
}
</script>

</head>
<body>

<!-- 引导遮罩 -->
<div id="overlay">
  <h2>🎇 音乐粒子疗愈室</h2>
  <p>点击开始，进入沉浸式粒子世界<br/>双指捏合可缩放，拖动旋转视角<br/>上传音乐后粒子将随旋律律动</p>
  <button id="startBtn">✦ 进入疗愈空间</button>
</div>

<!-- 顶部频谱条 -->
<canvas id="specBar" height="3"></canvas>

<!-- 形态标签 -->
<div id="shapeLabel">SPHERE</div>

<!-- 右上角：调参切换 + 导出 -->
<div id="topRight">
  <button id="guiToggleBtn">⚙ 展开调参</button>
  <button id="exportBtn">📸 导出</button>
</div>

<!-- 左上角：上传音乐 -->
<button id="loadBtn">🎵 上传音乐</button>
<div id="nowPlaying"></div>

<!-- 底部形态选择（可收纳） -->
<div id="uiWrapper">
  <button id="uiToggleBtn">▼ 形态</button>
  <div id="ui" class="expanded"></div>
</div>

<input type="file" id="fileInput" accept=".mp3,.wav,audio/*"/>

<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import dat from 'https://cdn.jsdelivr.net/npm/dat.gui@0.7.9/build/dat.gui.module.js';

(function(){
'use strict';

const PARTICLE_COUNT = 100000;
const SHAPE_NAMES  = ['球体','心形','烟花','环形体','DNA螺旋','星云','漩涡','波浪','土星环','立方体'];
const SHAPE_LABELS = ['SPHERE','HEART','FIREWORKS','TORUS','DNA','NEBULA','VORTEX','WAVE','SATURN','CUBE'];

// ─── 渲染器 ─────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 180);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping   = true;
controls.dampingFactor   = 0.06;
controls.minDistance     = 40;
controls.maxDistance     = 400;
controls.autoRotate      = true;
controls.autoRotateSpeed = 0.4;

// ─── 粒子 ────────────────────────────────────────────────
const positions   = new Float32Array(PARTICLE_COUNT * 3);
const colors      = new Float32Array(PARTICLE_COUNT * 3);
const originalPos = new Float32Array(PARTICLE_COUNT * 3);
const velocities  = new Float32Array(PARTICLE_COUNT * 3);
const noiseOffset = new Float32Array(PARTICLE_COUNT * 3);

for (let i = 0; i < PARTICLE_COUNT; i++) {
  noiseOffset[i*3]   = Math.random()*100;
  noiseOffset[i*3+1] = Math.random()*100;
  noiseOffset[i*3+2] = Math.random()*100;
}

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

const mat = new THREE.PointsMaterial({
  size: 0.6, vertexColors: true, transparent: true,
  opacity: 0.9, sizeAttenuation: true, depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const pts = new THREE.Points(geo, mat);
scene.add(pts);

// ─── 10 种形态 ───────────────────────────────────────────
function shapePoint(idx, i, N) {
  const t = i/N, phi = Math.random()*Math.PI*2, R = 60;
  switch(idx) {
    case 0:{ const th=Math.acos(1-2*Math.random()); return{x:R*Math.sin(th)*Math.cos(phi),y:R*Math.sin(th)*Math.sin(phi),z:R*Math.cos(th)}; }
    case 1:{ const ang=t*Math.PI*2,r=(2-2*Math.sin(ang)+Math.sin(ang)*Math.sqrt(Math.abs(Math.cos(ang)))/(Math.sin(ang)+1.4))*15,j=(Math.random()-.5)*6; return{x:(r*Math.cos(ang)+j)*1.5,y:(r*Math.sin(ang)+j)*1.5,z:(Math.random()-.5)*20}; }
    case 2:{ const b=Math.floor(Math.random()*12),sp=20+Math.random()*60,a=(b/12)*Math.PI*2+(Math.random()-.5)*.5,el=(Math.random()-.5)*Math.PI; return{x:sp*Math.cos(el)*Math.cos(a),y:sp*Math.sin(el)+sp*.3,z:sp*Math.cos(el)*Math.sin(a)}; }
    case 3:{ const u=t*Math.PI*2,v=phi,R2=50,r2=18; return{x:(R2+r2*Math.cos(v))*Math.cos(u),y:(R2+r2*Math.cos(v))*Math.sin(u),z:r2*Math.sin(v)}; }
    case 4:{ const h=(i/N-.5)*160,a3=h*.18+(i%2)*Math.PI,r3=22+Math.random()*8; return{x:r3*Math.cos(a3),y:h,z:r3*Math.sin(a3)}; }
    case 5:{ const r4=Math.pow(Math.random(),2)*R*1.5,th2=Math.acos(1-2*Math.random()),sc=r4*.3; return{x:r4*Math.sin(th2)*Math.cos(phi)+(Math.random()-.5)*sc,y:r4*Math.sin(th2)*Math.sin(phi)+(Math.random()-.5)*sc,z:r4*Math.cos(th2)+(Math.random()-.5)*sc}; }
    case 6:{ const a4=t*Math.PI*12,r5=t*R+10; return{x:r5*Math.cos(a4),y:(Math.random()-.5)*30,z:r5*Math.sin(a4)}; }
    case 7:{ const x7=(Math.random()-.5)*180,z7=(Math.random()-.5)*180; return{x:x7,y:Math.sin(x7*.08)*25+Math.sin(z7*.1)*15,z:z7}; }
    case 8:{ if(i<N*.4){const th3=Math.acos(1-2*Math.random()),ph3=phi;return{x:30*Math.sin(th3)*Math.cos(ph3),y:30*Math.sin(th3)*Math.sin(ph3),z:30*Math.cos(th3)};}else{const r6=50+Math.random()*30;return{x:r6*Math.cos(phi),y:(Math.random()-.5)*8,z:r6*Math.sin(phi)};} }
    default: return{x:(Math.random()-.5)*120,y:(Math.random()-.5)*120,z:(Math.random()-.5)*120};
  }
}

function generateShape(idx) {
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = shapePoint(idx, i, PARTICLE_COUNT);
    originalPos[i*3]=p.x; originalPos[i*3+1]=p.y; originalPos[i*3+2]=p.z;
    positions[i*3]=p.x+(Math.random()-.5)*2;
    positions[i*3+1]=p.y+(Math.random()-.5)*2;
    positions[i*3+2]=p.z+(Math.random()-.5)*2;
  }
  geo.attributes.position.needsUpdate = true;
}
generateShape(0);

// ─── 形态按钮 ────────────────────────────────────────────
const uiEl = document.getElementById('ui');
SHAPE_NAMES.forEach((name, idx) => {
  const btn = document.createElement('button');
  btn.textContent = name;
  if (idx === 0) btn.classList.add('active');
  btn.onclick = () => {
    document.querySelectorAll('#ui button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('shapeLabel').textContent = SHAPE_LABELS[idx];
    generateShape(idx);
    velocities.fill(0);
  };
  uiEl.appendChild(btn);
});

// ─── 形态栏收纳 ──────────────────────────────────────────
let shapesExpanded = true;
const uiToggleBtn = document.getElementById('uiToggleBtn');
uiToggleBtn.onclick = () => {
  shapesExpanded = !shapesExpanded;
  uiEl.classList.toggle('expanded', shapesExpanded);
  uiEl.classList.toggle('collapsed', !shapesExpanded);
  uiToggleBtn.textContent = shapesExpanded ? '▼ 形态' : '▲ 形态';
};

// ─── Web Audio ───────────────────────────────────────────
let audioCtx, analyserBass, analyserMid, analyserTreble, audioSource;
let bassData, midData, trebleData;
let prevTreble = 0, transientCooldown = 0;

function initAudio() {
  if (audioCtx) return;
  audioCtx        = new (window.AudioContext || window.webkitAudioContext)();
  analyserBass    = audioCtx.createAnalyser(); analyserBass.fftSize    = 512;
  analyserMid     = audioCtx.createAnalyser(); analyserMid.fftSize     = 512;
  analyserTreble  = audioCtx.createAnalyser(); analyserTreble.fftSize  = 512;
  bassData   = new Uint8Array(analyserBass.frequencyBinCount);
  midData    = new Uint8Array(analyserMid.frequencyBinCount);
  trebleData = new Uint8Array(analyserTreble.frequencyBinCount);
}

async function loadAudioFromUrl(url, fileName) {
  initAudio();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  if (audioSource) { try{ audioSource.stop(); }catch(_){} audioSource.disconnect(); }
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const decoded = await audioCtx.decodeAudioData(buf);
  audioSource = audioCtx.createBufferSource();
  audioSource.buffer = decoded;
  audioSource.loop = true;
  // 三段滤波器：低音 / 中频 / 高音
  const low  = audioCtx.createBiquadFilter(); low.type  = 'lowpass';   low.frequency.value  = 250;
  const mid  = audioCtx.createBiquadFilter(); mid.type  = 'bandpass';  mid.frequency.value  = 1200; mid.Q.value = 0.8;
  const high = audioCtx.createBiquadFilter(); high.type = 'highpass';  high.frequency.value = 3000;
  audioSource.connect(low);  low.connect(analyserBass);
  audioSource.connect(mid);  mid.connect(analyserMid);
  audioSource.connect(high); high.connect(analyserTreble);
  audioSource.connect(audioCtx.destination);
  audioSource.start(0);
  if (fileName) document.getElementById('nowPlaying').textContent = '▶ ' + fileName;
}
window.loadAudioFromUrl = loadAudioFromUrl;

// ─── Web 侧文件选择 ──────────────────────────────────────
document.getElementById('loadBtn').onclick = () => document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await loadAudioFromUrl(URL.createObjectURL(file), file.name);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type:'AUDIO_UPLOAD',name:file.name,size:file.size}));
};

// ─── dat.GUI（v247：三频参数 + 节拍灵敏度）──────────────
const params = {
  particleSize:       0.6,
  baseHue:            240,
  bassColorFactor:    1.0,   // 低音→颜色偏移幅度
  bassSizePulse:      1.2,   // 低音→粒子尺寸脉冲强度
  midDisplace:        1.5,   // 中频→粒子位移幅度
  trebleSensitivity:  1.2,   // 高音瞬态灵敏度
  explosionForce:     1.0,   // 冲击波强度
  beatPulse:          1.0,   // 节拍→整体脉冲
  rotateSpeed:        0.4,
  opacity:            0.9,
};

const gui = new dat.GUI({ width: 220 });
gui.add(params, 'particleSize',      0.1, 3.0).name('粒子大小').onChange(v => { mat.size = v; });
gui.add(params, 'baseHue',           0,   360).name('基础色调');
gui.add(params, 'bassColorFactor',   0,   2.0).name('低音色强');
gui.add(params, 'bassSizePulse',     0,   3.0).name('低音尺寸');
gui.add(params, 'midDisplace',       0,   4.0).name('中频位移');
gui.add(params, 'trebleSensitivity', 0,   3.0).name('高音灵敏');
gui.add(params, 'explosionForce',    0,   3.0).name('爆炸强度');
gui.add(params, 'beatPulse',         0,   3.0).name('节拍脉冲');
gui.add(params, 'rotateSpeed',       0,   2.0).name('旋转速度').onChange(v => { controls.autoRotateSpeed = v; });
gui.add(params, 'opacity',         0.1,   1.0).name('透明度').onChange(v => { mat.opacity = v; });

// ─── dat.GUI 收纳按钮 ────────────────────────────────────
// 默认关闭，避免初始加载时遮挡按钮
let guiOpen = false;
const guiToggleBtn = document.getElementById('guiToggleBtn');
gui.close();  // 初始收起
guiToggleBtn.onclick = () => {
  guiOpen = !guiOpen;
  if (guiOpen) { gui.open(); guiToggleBtn.textContent = '⚙ 收起调参'; }
  else         { gui.close(); guiToggleBtn.textContent = '⚙ 展开调参'; }
};

// ─── 顶部频谱条 ──────────────────────────────────────────
const specBarCanvas = document.getElementById('specBar');
const specCtx = specBarCanvas.getContext('2d');
specBarCanvas.width = window.innerWidth;

// ─── 导出 ────────────────────────────────────────────────
document.getElementById('exportBtn').onclick = () => {
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a'); a.href = dataUrl;
  a.download = 'particle-art-' + Date.now() + '.png'; a.click();
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type:'EXPORT',dataUrl}));
};

// ─── 爆炸冲击波 ──────────────────────────────────────────
let explosionDecay = 0;
function triggerExplosion(strength) {
  if (explosionDecay > 0.2) return;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const ox=originalPos[i*3],oy=originalPos[i*3+1],oz=originalPos[i*3+2];
    const d = Math.sqrt(ox*ox+oy*oy+oz*oz)+.001;
    const f = strength*180*(0.5+Math.random()*.5)/d;
    velocities[i*3]=ox*f; velocities[i*3+1]=oy*f; velocities[i*3+2]=oz*f*3.5;
  }
  explosionDecay = 1.0;
}

// ─── 简易噪声 ────────────────────────────────────────────
function sn(x) { return Math.sin(x*1.3)*Math.cos(x*.7)*.5+.5; }

// ─── 主动画循环 ──────────────────────────────────────────
const clock   = new THREE.Clock();
const posAttr = geo.attributes.position;
const colAttr = geo.attributes.color;
const tmpCol  = new THREE.Color();

// ─── 节拍检测状态 ────────────────────────────────────────
let beatScale = 1.0;   // 节拍脉冲缩放因子（衰减到 1.0）
let prevBass  = 0;

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  const t = clock.getElapsedTime();
  let bass = 0, mid = 0, treble = 0;

  if (analyserBass) {
    // ── 读取三频数据 ──
    analyserBass.getByteFrequencyData(bassData);
    analyserMid.getByteFrequencyData(midData);
    analyserTreble.getByteFrequencyData(trebleData);

    // 低音：前 20 个 bin（0–250 Hz）
    for (let i = 0; i < 20; i++) bass += bassData[i];
    bass = (bass / 20 / 255) * params.bassColorFactor;

    // 中频：bin 20–80（约 250–1500 Hz）→ 驱动粒子位移
    for (let i = 20; i < 80; i++) mid += midData[i];
    mid = (mid / 60 / 255) * params.midDisplace;

    // 高音：bin 50+ → 瞬态检测
    for (let i = 50; i < trebleData.length; i++) treble += trebleData[i];
    treble = (treble / (trebleData.length - 50) / 255) * params.trebleSensitivity;

    // ── 节拍检测：低音突变（onset detection）──
    const bassDiff = bass - prevBass;
    if (bassDiff > 0.08 * params.beatPulse && beatScale < 1.05) {
      beatScale = 1.0 + bassDiff * params.beatPulse * 0.6; // 触发脉冲扩张
    }
    prevBass = bass;
    // 节拍脉冲衰减 → 1.0
    beatScale += (1.0 - beatScale) * 0.12;

    // ── 高音瞬态 → 爆炸冲击波 ──
    transientCooldown = Math.max(0, transientCooldown - 0.016);
    const transient = treble - prevTreble;
    if (transient > 0.18 && transientCooldown <= 0) {
      triggerExplosion(transient * params.explosionForce);
      transientCooldown = 0.12;
    }
    prevTreble = treble;

    // ── 低音驱动粒子尺寸脉冲 ──
    mat.size = params.particleSize * (1.0 + bass * params.bassSizePulse * 0.8) * beatScale;

    // ── 顶部频谱条 ──
    const bw = specBarCanvas.width;
    specCtx.clearRect(0, 0, bw, 3);
    const g = specCtx.createLinearGradient(0, 0, bw, 0);
    g.addColorStop(0, 'hsl(' + params.baseHue + ',100%,60%)');
    g.addColorStop(0.5, 'hsl(' + ((params.baseHue + 60) % 360) + ',100%,70%)');
    g.addColorStop(1, 'hsl(' + ((params.baseHue + 120) % 360) + ',100%,60%)');
    specCtx.fillStyle = g;
    specCtx.fillRect(0, 0, (bass + treble) * 0.5 * bw + bw * 0.05, 3);
  }

  // ── 爆炸衰减 ──
  if (explosionDecay > 0) {
    explosionDecay *= 0.92;
    if (explosionDecay < 0.005) { explosionDecay = 0; velocities.fill(0); }
  }

  // ── 逐粒子更新：低音/中频/高音全驱动 ──
  // 中频幅度：驱动噪声偏移幅度（让粒子随音乐"颤抖"）
  const midAmp = 0.25 + mid * 2.2;   // 中频→位移幅度
  const bassAmp = bass * 1.5;         // 低音→额外幅度叠加

  for (let i = 0; i < PARTICLE_COUNT; i += 4) {
    for (let b = 0; b < 4 && (i + b) < PARTICLE_COUNT; b++) {
      const k = (i + b) * 3;
      const nx = noiseOffset[k], ny = noiseOffset[k + 1], nz = noiseOffset[k + 2];

      let cx = posAttr.array[k], cy = posAttr.array[k + 1], cz = posAttr.array[k + 2];

      if (explosionDecay > 0) {
        // 爆炸冲击：高音驱动，Z 轴放大
        cx += velocities[k]     * explosionDecay * 0.04;
        cy += velocities[k + 1] * explosionDecay * 0.04;
        cz += velocities[k + 2] * explosionDecay * 0.04;
        velocities[k] *= 0.92; velocities[k + 1] *= 0.92; velocities[k + 2] *= 0.92;
      } else {
        // 常态：中频驱动位移震动 + 节拍脉冲缩放原始坐标
        const ox = originalPos[k]     * beatScale;
        const oy = originalPos[k + 1] * beatScale;
        const oz = originalPos[k + 2] * beatScale;
        // 弹性归位（低音增大归位刚度，产生"跳动"感）
        const stiffness = 0.04 + bassAmp * 0.03;
        cx += (ox - cx) * stiffness + sn(t * 0.4 + nx) * midAmp * 0.06;
        cy += (oy - cy) * stiffness + sn(t * 0.35 + ny) * midAmp * 0.06;
        cz += (oz - cz) * stiffness + sn(t * 0.3  + nz) * midAmp * 0.04;
      }
      posAttr.array[k] = cx; posAttr.array[k + 1] = cy; posAttr.array[k + 2] = cz;

      // ── 颜色：低音驱动色相偏移 + 亮度 ──
      const hue = ((params.baseHue - bass * 180) % 360 + 360) % 360;
      const sat = Math.min(100, 80 + bass * 20);
      const lit = Math.min(85, 45 + bass * 30 + mid * 15 + explosionDecay * 35);
      tmpCol.setHSL(hue / 360, sat / 100, lit / 100);
      colAttr.array[k] = tmpCol.r; colAttr.array[k + 1] = tmpCol.g; colAttr.array[k + 2] = tmpCol.b;
    }
  }
  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
  renderer.render(scene, camera);
}

// ─── 自动启动：页面加载即隐藏遮罩并开始动画 ─────────────
(async function autoStart() {
  document.getElementById('overlay').classList.add('hidden');
  initAudio();
  try { if (audioCtx.state === 'suspended') await audioCtx.resume(); } catch(_) {}
  animate();
})();

// 保留 startBtn 点击（兜底） 
document.getElementById('startBtn').onclick = () => {};

// ─── 响应式 ──────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  specBarCanvas.width = window.innerWidth;
});

// ─── 接收 RN 侧 postMessage ─────────────────────────────
function handleRNMsg(e) {
  try {
    const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    if (msg && msg.type === 'LOAD_AUDIO_URL') {
      // 自动隐藏引导遮罩并启动动画循环（如果还没有启动）
      const overlay = document.getElementById('overlay');
      if (overlay && !overlay.classList.contains('hidden')) {
        overlay.classList.add('hidden');
        initAudio();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        animate();
      }
      loadAudioFromUrl(msg.url, msg.name || '');
    }
  } catch(_) {}
}
window.addEventListener('message', handleRNMsg);
document.addEventListener('message', handleRNMsg);

})();
</script>
</body>
</html>`;

