/**
 * 3D 沙盘游戏室 — 主交互页
 * 使用 WebView 内嵌 Three.js，通过 postMessage 双向通信
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, Pressable, ScrollView,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft, Camera, Trash2, Plus, Package, Image as ImageIcon, CheckCircle,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
} from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import * as MediaLibrary from 'expo-media-library';
import { fetch as expoFetch } from 'expo/fetch';
import { File as FSFile, Paths } from 'expo-file-system';
import { setSandboxCapture } from '@/lib/sandboxStore';
import Reanimated, {
  useSharedValue, useAnimatedStyle, runOnJS,
  withSpring, withDelay, withTiming, interpolate,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

// ── 物件类型 ─────────────────────────────────────────────
type ObjType = 'house' | 'tree' | 'person' | 'dog' | 'mountain'
  | 'boy' | 'girl' | 'woman' | 'cow' | 'panda' | 'rock' | 'grass'
  | 'car' | 'bike' | 'school' | 'hospital' | 'supermarket' | 'skyscraper'
  | 'chick' | 'duck' | 'tank'
  // 交通
  | 'streetlight'
  // 建筑
  | 'gym' | 'library' | 'airport' | 'hotel' | 'govbuilding' | 'villa' | 'billboard'
  // 动物
  | 'sheep' | 'wolf' | 'boar' | 'rabbit' | 'tiger' | 'bear' | 'squirrel' | 'frog' | 'horse'
  // 军事
  | 'airplane' | 'sandbag'
  // 植物
  | 'flower'
  // 水系
  | 'river' | 'lake'
  // 特色建筑
  | 'temple'
  // 学校系列
  | 'desk' | 'schoolbag' | 'books' | 'stage' | 'sofa' | 'shelf'
  // 社会机构
  | 'court' | 'procuratorate' | 'cage' | 'prison' | 'policestation' | 'mentalcenter'
  // 建筑道具
  | 'bathroomwall' | 'bridge'
  // 生活道具
  | 'mirror' | 'bathtub' | 'boat' | 'umbrella' | 'scissors' | 'chair' | 'smalltable' | 'basket'
  // 交通车辆
  | 'policecar' | 'firetruck' | 'truck'
  // 专业人物
  | 'policeman' | 'prosecutor' | 'judge';
interface SandboxObject {
  id: string;
  type: ObjType;
  label: string;
  emoji: string;
  color: string;
  scale: number;
  /** Y 轴旋转弧度，0=朝前，π/2=朝左，π=朝后，-π/2=朝右 */
  rotateY: number;
}

type RotateDir = 'front' | 'back' | 'left' | 'right';

const OBJ_CONFIGS: Record<ObjType, { label: string; emoji: string; color: string }> = {
  house:       { label: '房子',     emoji: '🏠', color: '#E8A365' },
  tree:        { label: '树木',     emoji: '🌳', color: '#7A9D8C' },
  person:      { label: '人物',     emoji: '🧑', color: '#9B8EC4' },
  dog:         { label: '小狗',     emoji: '🐕', color: '#D4924A' },
  mountain:    { label: '小山',     emoji: '⛰️', color: '#6B8F71' },
  boy:         { label: '男孩',     emoji: '👦', color: '#5B9BD5' },
  girl:        { label: '女孩',     emoji: '👧', color: '#E88FAA' },
  woman:       { label: '成年女性', emoji: '👩', color: '#B07ECE' },
  cow:         { label: '牛',       emoji: '🐄', color: '#D4B896' },
  panda:       { label: '熊猫',     emoji: '🐼', color: '#888888' },
  rock:        { label: '小石块',   emoji: '🪨', color: '#8A8A8A' },
  grass:       { label: '小草丛',   emoji: '🌿', color: '#5A9E5A' },
  // 交通
  car:         { label: '汽车',     emoji: '🚗', color: '#E74C3C' },
  bike:        { label: '自行车',   emoji: '🚲', color: '#3498DB' },
  // 建筑
  school:      { label: '学校',     emoji: '🏫', color: '#F39C12' },
  hospital:    { label: '医院',     emoji: '🏥', color: '#E74C3C' },
  supermarket: { label: '超市',     emoji: '🏪', color: '#27AE60' },
  skyscraper:  { label: '高楼',     emoji: '🏢', color: '#7F8C8D' },
  // 动物
  chick:       { label: '小鸡',     emoji: '🐥', color: '#F1C40F' },
  duck:        { label: '小鸭',     emoji: '🦆', color: '#E67E22' },
  // 军事
  tank:        { label: '坦克',     emoji: '🪖', color: '#5D6D3A' },
  // 交通
  streetlight: { label: '路灯',     emoji: '💡', color: '#F5CBA7' },
  // 建筑
  gym:         { label: '体育馆',   emoji: '🏟️', color: '#E67E22' },
  library:     { label: '图书馆',   emoji: '📚', color: '#8E44AD' },
  airport:     { label: '飞机场',   emoji: '✈️', color: '#2980B9' },
  hotel:       { label: '酒店',     emoji: '🏨', color: '#C0392B' },
  govbuilding: { label: '政府楼',   emoji: '🏛️', color: '#7F8C8D' },
  villa:       { label: '别墅',     emoji: '🏡', color: '#27AE60' },
  billboard:   { label: '广告牌',   emoji: '🪧', color: '#F39C12' },
  // 动物
  sheep:       { label: '小羊',     emoji: '🐑', color: '#ECF0F1' },
  wolf:        { label: '狼',       emoji: '🐺', color: '#7F8C8D' },
  boar:        { label: '野猪',     emoji: '🐗', color: '#784212' },
  rabbit:      { label: '小白兔',   emoji: '🐇', color: '#FDFEFE' },
  tiger:       { label: '大老虎',   emoji: '🐯', color: '#E67E22' },
  bear:        { label: '小熊',     emoji: '🐻', color: '#784212' },
  squirrel:    { label: '小松鼠',   emoji: '🐿️', color: '#D35400' },
  frog:        { label: '青蛙',     emoji: '🐸', color: '#1E8449' },
  horse:       { label: '小马',     emoji: '🐴', color: '#935116' },
  // 军事
  airplane:    { label: '飞机',     emoji: '✈️', color: '#5DADE2' },
  sandbag:     { label: '沙袋',     emoji: '🪨', color: '#A04000' },
  // 植物
  flower:      { label: '小花',     emoji: '🌸', color: '#F1948A' },
  // 水系
  river:       { label: '河流',     emoji: '🏞️', color: '#5DADE2' },
  lake:        { label: '湖泊',     emoji: '🫧', color: '#2980B9' },
  // 特色建筑
  temple:      { label: '寺庙',     emoji: '⛩️', color: '#C0392B' },
  // 学校系列
  desk:        { label: '课桌',     emoji: '🪑', color: '#D4A97A' },
  schoolbag:   { label: '书包',     emoji: '🎒', color: '#3498DB' },
  books:       { label: '书本',     emoji: '📖', color: '#E74C3C' },
  stage:       { label: '舞台',     emoji: '🎭', color: '#8E44AD' },
  sofa:        { label: '沙发',     emoji: '🛋️', color: '#A04000' },
  shelf:       { label: '货架',     emoji: '🗄️', color: '#7F8C8D' },
  // 社会机构
  court:       { label: '法院',     emoji: '⚖️', color: '#D4AC0D' },
  procuratorate:{ label: '检察院',  emoji: '🏛️', color: '#2E4057' },
  cage:        { label: '铁笼',     emoji: '🔒', color: '#5D6D7E' },
  prison:      { label: '监狱',     emoji: '⛓️', color: '#4A4A4A' },
  policestation:{ label: '派出所',  emoji: '🚔', color: '#1A5276' },
  mentalcenter:{ label: '心理中心', emoji: '💚', color: '#1E8449' },
  // 建筑道具
  bathroomwall:{ label: '浴室隔断', emoji: '🚿', color: '#85C1E9' },
  bridge:      { label: '古桥',     emoji: '🌉', color: '#784212' },
  // 生活道具
  mirror:      { label: '镜子',     emoji: '🪞', color: '#AED6F1' },
  bathtub:     { label: '浴缸',     emoji: '🛁', color: '#D5DBDB' },
  boat:        { label: '小船',     emoji: '⛵', color: '#E8A365' },
  umbrella:    { label: '雨伞',     emoji: '☂️', color: '#A569BD' },
  scissors:    { label: '剪刀',     emoji: '✂️', color: '#7F8C8D' },
  chair:       { label: '椅子',     emoji: '🪑', color: '#B7770D' },
  smalltable:  { label: '小桌',     emoji: '🪵', color: '#D4A97A' },
  basket:      { label: '篮子',     emoji: '🧺', color: '#CA6F1E' },
  // 交通车辆
  policecar:   { label: '警车',     emoji: '🚓', color: '#1A5276' },
  firetruck:   { label: '消防车',   emoji: '🚒', color: '#C0392B' },
  truck:       { label: '大货车',   emoji: '🚛', color: '#566573' },
  // 专业人物
  policeman:   { label: '警察',     emoji: '👮', color: '#1A5276' },
  prosecutor:  { label: '检察官',   emoji: '👨‍⚖️', color: '#2E4057' },
  judge:       { label: '法官',     emoji: '⚖️', color: '#D4AC0D' },
};

// ── 背景主题 ──────────────────────────────────────────────
const BG_THEMES = [
  { id: 'sand',    label: '原木沙盘', emoji: '🏖',  bg: 0x1a0f05, fog: 0x2a1a0a, ambient: 0xfff4e0, dir: 0xffe8c0 },
  { id: 'sky',     label: '天空蓝',   emoji: '☀️', bg: 0x87CEEB, fog: 0xB0D8F0, ambient: 0xE0F4FF, dir: 0xFFF8E7 },
  { id: 'forest',  label: '森林绿',   emoji: '🌲',  bg: 0x1a3a1a, fog: 0x2a5a2a, ambient: 0xC8EEC8, dir: 0xE8FFD0 },
  { id: 'sunset',  label: '暖阳橙',   emoji: '🌅',  bg: 0x3a1a05, fog: 0x6a3a1a, ambient: 0xFFE4C8, dir: 0xFFCC88 },
  { id: 'night',   label: '星空紫',   emoji: '🌙',  bg: 0x0a0a2a, fog: 0x10103a, ambient: 0xC0C0FF, dir: 0x8080FF },
  { id: 'spring',  label: '樱花粉',   emoji: '🌸',  bg: 0x3a1a2a, fog: 0x6a3a5a, ambient: 0xFFD0E8, dir: 0xFFB8D8 },
  { id: 'snow',    label: '雪原白',   emoji: '❄️', bg: 0xd0e8f0, fog: 0xe8f4fa, ambient: 0xF0F8FF, dir: 0xFFFFFF },
  { id: 'ocean',   label: '深海蓝',   emoji: '🌊',  bg: 0x02223a, fog: 0x04355a, ambient: 0xB0D8FF, dir: 0x80C8FF },
  { id: 'desert',  label: '沙漠金',   emoji: '🏜️', bg: 0x3a2a05, fog: 0x6a4a0a, ambient: 0xFFE8A0, dir: 0xFFD060 },
  { id: 'volcano', label: '火山红',   emoji: '🌋',  bg: 0x1a0505, fog: 0x3a0a0a, ambient: 0xFF9060, dir: 0xFF6020 },
];

// ── 尺寸档位 ──────────────────────────────────────────────
const SIZE_LEVELS: { label: string; value: number }[] = [
  { label: 'XS', value: 0.35 },
  { label: 'S',  value: 0.6  },
  { label: 'M',  value: 1.0  },
  { label: 'L',  value: 1.6  },
  { label: 'XL', value: 2.2  },
];

// ── Three.js HTML ─────────────────────────────────────────
const THREEJS_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#1a0f05; overflow:hidden; width:100vw; height:100vh; }
  canvas { display:block; width:100%; height:100%; touch-action:none; }
  #info { position:fixed; bottom:8px; left:0; right:0; text-align:center;
    font-family:sans-serif; font-size:10px; color:rgba(255,255,255,0.35); pointer-events:none; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="info">双指旋转缩放 · 单指拖动物件</div>
<script>
(function(){
  var s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s.onload = initScene;
  document.head.appendChild(s);
})();

// ── 程序渐变天空背景 ──────────────────────────────────────
function makeSkyTexture(topHex, botHex) {
  var c = document.createElement('canvas');
  c.width = 2; c.height = 512;
  var ctx = c.getContext('2d');
  var grd = ctx.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, topHex);
  grd.addColorStop(1, botHex);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 2, 512);
  return c;
}

var THEMES = {
  sand:     { top:'#1a0f05', bot:'#2a1a0a', fog:0x2a1a0a, amb:0xfff4e0, dir:0xffe8c0 },
  sky:      { top:'#87CEEB', bot:'#E0F4FF', fog:0xB0D8F0, amb:0xE0F4FF, dir:0xFFF8E7 },
  forest:   { top:'#0d2b0d', bot:'#2a5a2a', fog:0x2a5a2a, amb:0xC8EEC8, dir:0xE8FFD0 },
  sunset:   { top:'#1a0505', bot:'#6a3a1a', fog:0x6a3a1a, amb:0xFFE4C8, dir:0xFFCC88 },
  night:    { top:'#0a0a2a', bot:'#20104a', fog:0x10103a, amb:0xC0C0FF, dir:0x8080FF },
  spring:   { top:'#2a0a1a', bot:'#6a3a5a', fog:0x6a3a5a, amb:0xFFD0E8, dir:0xFFB8D8 },
  snow:     { top:'#d0e8f0', bot:'#eaf4fa', fog:0xe8f4fa, amb:0xF0F8FF, dir:0xFFFFFF },
  ocean:    { top:'#02223a', bot:'#04355a', fog:0x04355a, amb:0xB0D8FF, dir:0x80C8FF },
  desert:   { top:'#3a2a05', bot:'#6a4a0a', fog:0x6a4a0a, amb:0xFFE8A0, dir:0xFFD060 },
  volcano:  { top:'#1a0505', bot:'#3a0a0a', fog:0x3a0a0a, amb:0xFF9060, dir:0xFF6020 },
};

function initScene() {
  var W = window.innerWidth, H = window.innerHeight;
  var renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias:true, preserveDrawingBuffer:true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x2a1a0a, 18, 40);

  // 初始天空
  var skyCanvas = makeSkyTexture('#1a0f05','#2a1a0a');
  var skyTex = new THREE.CanvasTexture(skyCanvas);
  scene.background = skyTex;

  var camera = new THREE.PerspectiveCamera(45, W/H, 0.1, 100);
  camera.position.set(0, 10, 16);
  camera.lookAt(0, 0, 0);

  // ── 灯光 ────────────────────────────────────────────────
  var ambient = new THREE.AmbientLight(0xfff4e0, 0.7);
  scene.add(ambient);
  var dirLight = new THREE.DirectionalLight(0xffe8c0, 1.4);
  dirLight.position.set(8, 14, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 50;
  dirLight.shadow.camera.left = -12;
  dirLight.shadow.camera.right = 12;
  dirLight.shadow.camera.top = 12;
  dirLight.shadow.camera.bottom = -12;
  scene.add(dirLight);

  // ── 木质沙盘框 ────────────────────────────────────────────
  var woodMat = new THREE.MeshLambertMaterial({ color: 0x8B5E3C });
  var frameH = 0.8, frameT = 0.5, sandW = 9, sandD = 7;
  [
    { w: sandW+frameT*2, h: frameH, d: frameT, x:0,              z:-(sandD/2+frameT/2) },
    { w: sandW+frameT*2, h: frameH, d: frameT, x:0,              z: (sandD/2+frameT/2) },
    { w: frameT,         h: frameH, d: sandD,  x:-(sandW/2+frameT/2), z:0 },
    { w: frameT,         h: frameH, d: sandD,  x: (sandW/2+frameT/2), z:0 },
    { w: sandW+frameT*2, h: frameT, d: sandD+frameT*2, x:0, y:-frameH/2-frameT/2, z:0 },
  ].forEach(function(seg){
    var m = new THREE.Mesh(new THREE.BoxGeometry(seg.w, seg.h, seg.d), woodMat);
    m.position.set(seg.x||0, seg.y||0, seg.z||0);
    m.receiveShadow = true;
    scene.add(m);
  });

  // 沙粒纹理
  var sandCanvas = document.createElement('canvas');
  sandCanvas.width = sandCanvas.height = 256;
  var sCtx = sandCanvas.getContext('2d');
  sCtx.fillStyle = '#D4AA70'; sCtx.fillRect(0,0,256,256);
  for(var i=0;i<4000;i++){
    var sx=Math.random()*256, sy=Math.random()*256, sr=Math.random()*1.5+0.3;
    var sb=Math.random()*60-20, sgray=Math.round(180+sb);
    sCtx.fillStyle='rgba('+sgray+','+(sgray-10)+','+(sgray-40)+',0.5)';
    sCtx.beginPath(); sCtx.arc(sx,sy,sr,0,Math.PI*2); sCtx.fill();
  }
  var sandTex = new THREE.CanvasTexture(sandCanvas);
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set(4,3);
  var sandMesh = new THREE.Mesh(
    new THREE.BoxGeometry(sandW-0.1, 0.15, sandD-0.1),
    new THREE.MeshLambertMaterial({ map: sandTex })
  );
  sandMesh.position.y = -frameH/2+0.08;
  sandMesh.receiveShadow = true;
  scene.add(sandMesh);

  // ── 物件工厂 ──────────────────────────────────────────────
  var objects = {};

  function makeHouse(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='house';
    var wallM = new THREE.MeshLambertMaterial({color:0xFAEAD0});
    var roofM = new THREE.MeshLambertMaterial({color:0xC0392B});
    var doorM = new THREE.MeshLambertMaterial({color:0x8B5E3C});
    var wall = new THREE.Mesh(new THREE.BoxGeometry(1.2,1,1.2), wallM);
    wall.position.y=0.5; wall.castShadow=true; g.add(wall);
    var roof = new THREE.Mesh(new THREE.ConeGeometry(1.0,0.8,4), roofM);
    roof.position.y=1.4; roof.rotation.y=Math.PI/4; roof.castShadow=true; g.add(roof);
    var door = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.45,0.05), doorM);
    door.position.set(0,0.22,0.63); g.add(door);
    return g;
  }

  function makeTree(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='tree';
    var trunkM = new THREE.MeshLambertMaterial({color:0x8B5E3C});
    var leafM  = new THREE.MeshLambertMaterial({color:0x2D8A4E});
    var trunk  = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.18,1.0,8), trunkM);
    trunk.position.y=0.5; trunk.castShadow=true; g.add(trunk);
    [1.05,1.55,1.95].forEach(function(y,i){
      var leaf = new THREE.Mesh(new THREE.ConeGeometry(0.7-i*0.15,0.7,8), leafM);
      leaf.position.y=y; leaf.castShadow=true; g.add(leaf);
    });
    return g;
  }

  function makePerson(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='person';
    var skinM = new THREE.MeshLambertMaterial({color:0xF5CBA7});
    var bodyM = new THREE.MeshLambertMaterial({color:0x5B9BD5});
    var legM  = new THREE.MeshLambertMaterial({color:0x3A5278});
    var head  = new THREE.Mesh(new THREE.SphereGeometry(0.22,12,12), skinM);
    head.position.y=1.42; head.castShadow=true; g.add(head);
    var body  = new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.2,0.7,8), bodyM);
    body.position.y=0.9; body.castShadow=true; g.add(body);
    [-0.1,0.1].forEach(function(x){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.55,8), legM);
      leg.position.set(x,0.27,0); g.add(leg);
    });
    return g;
  }

  function makeDog(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='dog';
    var furM = new THREE.MeshLambertMaterial({color:0xD4924A});
    var darkM= new THREE.MeshLambertMaterial({color:0x7A4A1A});
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.5,0.5), furM);
    body.position.set(0,0.35,0); body.castShadow=true; g.add(body);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.45,0.4,0.45), furM);
    head.position.set(0.5,0.6,0); head.castShadow=true; g.add(head);
    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.07,8,8), darkM);
    nose.position.set(0.73,0.6,0); g.add(nose);
    [-0.12,0.12].forEach(function(z){
      var ear = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.2,0.1), furM);
      ear.position.set(0.42,0.85,z); g.add(ear);
    });
    [[-0.28,-0.2],[-0.28,0.2],[0.28,-0.2],[0.28,0.2]].forEach(function(p){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.06,0.35,8), furM);
      leg.position.set(p[0],0.08,p[1]); g.add(leg);
    });
    var tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.06,0.4,8), furM);
    tail.position.set(-0.55,0.55,0); tail.rotation.z=0.8; g.add(tail);
    return g;
  }

  function makeMountain(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='mountain';
    var rockM = new THREE.MeshLambertMaterial({color:0x6B8F71});
    var snowM = new THREE.MeshLambertMaterial({color:0xF0F0F0});
    var darkM = new THREE.MeshLambertMaterial({color:0x4A6A50});
    var main  = new THREE.Mesh(new THREE.ConeGeometry(1.4,2.2,8), rockM);
    main.position.y=1.1; main.castShadow=true; g.add(main);
    var snow  = new THREE.Mesh(new THREE.ConeGeometry(0.45,0.6,8), snowM);
    snow.position.y=2.5; snow.castShadow=true; g.add(snow);
    var side  = new THREE.Mesh(new THREE.ConeGeometry(0.8,1.4,7), darkM);
    side.position.set(1.1,0.7,0.2); side.castShadow=true; g.add(side);
    var base  = new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.6,0.25,12), rockM);
    base.position.y=0.12; g.add(base);
    return g;
  }

  // ── 男孩 ────────────────────────────────────────────────
  function makeBoy(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='boy';
    var skinM = new THREE.MeshLambertMaterial({color:0xF5CBA7});
    var topM  = new THREE.MeshLambertMaterial({color:0x5B9BD5});  // 蓝上衣
    var pantsM= new THREE.MeshLambertMaterial({color:0x4A7AB5});  // 深蓝短裤
    var hairM = new THREE.MeshLambertMaterial({color:0x4A3728});
    // 头
    var head  = new THREE.Mesh(new THREE.SphereGeometry(0.2,12,12), skinM);
    head.position.y=1.15; head.castShadow=true; g.add(head);
    // 头发
    var hair  = new THREE.Mesh(new THREE.SphereGeometry(0.21,12,8), hairM);
    hair.position.set(0,1.26,0); hair.scale.set(1,0.5,1); g.add(hair);
    // 身体
    var body  = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.16,0.55,8), topM);
    body.position.y=0.72; body.castShadow=true; g.add(body);
    // 短裤
    var pants = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.14,0.3,8), pantsM);
    pants.position.y=0.38; g.add(pants);
    // 腿
    [-0.08,0.08].forEach(function(x){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.065,0.06,0.38,8), skinM);
      leg.position.set(x,0.08,0); g.add(leg);
    });
    return g;
  }

  // ── 女孩 ────────────────────────────────────────────────
  function makeGirl(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='girl';
    var skinM  = new THREE.MeshLambertMaterial({color:0xF5CBA7});
    var dressM = new THREE.MeshLambertMaterial({color:0xE88FAA}); // 粉裙子
    var hairM  = new THREE.MeshLambertMaterial({color:0x3A2518});
    // 头
    var head   = new THREE.Mesh(new THREE.SphereGeometry(0.2,12,12), skinM);
    head.position.y=1.15; head.castShadow=true; g.add(head);
    // 马尾（两侧）
    [-0.18,0.18].forEach(function(x){
      var tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.03,0.28,8), hairM);
      tail.position.set(x,1.1,-0.05); tail.rotation.z=x>0?0.4:-0.4; g.add(tail);
    });
    var hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.21,12,8), hairM);
    hairTop.position.set(0,1.26,0); hairTop.scale.set(1,0.5,1); g.add(hairTop);
    // 连衣裙（锥形）
    var dress  = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.32,0.85,10), dressM);
    dress.position.y=0.62; dress.castShadow=true; g.add(dress);
    // 腿
    [-0.07,0.07].forEach(function(x){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.05,0.25,8), skinM);
      leg.position.set(x,0.08,0); g.add(leg);
    });
    return g;
  }

  // ── 成年女性 ─────────────────────────────────────────────
  function makeWoman(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='woman';
    var skinM  = new THREE.MeshLambertMaterial({color:0xF0C090});
    var topM   = new THREE.MeshLambertMaterial({color:0x9B6EC4}); // 紫上衣
    var skirtM = new THREE.MeshLambertMaterial({color:0x7A4EA0}); // 深紫裙
    var hairM  = new THREE.MeshLambertMaterial({color:0x2A1A10});
    // 头
    var head   = new THREE.Mesh(new THREE.SphereGeometry(0.22,12,12), skinM);
    head.position.y=1.45; head.castShadow=true; g.add(head);
    // 长发
    var hair   = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.12,0.55,10), hairM);
    hair.position.set(0,1.28,0); g.add(hair);
    var hairTop= new THREE.Mesh(new THREE.SphereGeometry(0.22,12,8), hairM);
    hairTop.position.set(0,1.56,0); hairTop.scale.set(1,0.55,1); g.add(hairTop);
    // 上衣
    var top    = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.2,0.55,8), topM);
    top.position.y=0.98; top.castShadow=true; g.add(top);
    // 裙子（锥形）
    var skirt  = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.38,0.65,10), skirtM);
    skirt.position.y=0.52; g.add(skirt);
    // 腿
    [-0.09,0.09].forEach(function(x){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.06,0.28,8), skinM);
      leg.position.set(x,0.08,0); g.add(leg);
    });
    return g;
  }

  // ── 牛 ──────────────────────────────────────────────────
  function makeCow(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='cow';
    var whiteM = new THREE.MeshLambertMaterial({color:0xF5F0E8});
    var spotM  = new THREE.MeshLambertMaterial({color:0x3A2A1A}); // 棕黑斑纹
    var pinkM  = new THREE.MeshLambertMaterial({color:0xFFAAAA});
    // 躯干
    var body   = new THREE.Mesh(new THREE.BoxGeometry(1.1,0.65,0.65), whiteM);
    body.position.set(0,0.48,0); body.castShadow=true; g.add(body);
    // 斑点
    var spot1  = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.32,0.67), spotM);
    spot1.position.set(-0.2,0.52,0); g.add(spot1);
    var spot2  = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.28,0.67), spotM);
    spot2.position.set(0.25,0.38,0); g.add(spot2);
    // 头
    var head   = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.42,0.5), whiteM);
    head.position.set(0.72,0.62,0); head.castShadow=true; g.add(head);
    // 鼻子
    var nose   = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.12,0.08,10), pinkM);
    nose.position.set(0.98,0.57,0); nose.rotation.z=Math.PI/2; g.add(nose);
    // 角
    [-0.1,0.1].forEach(function(z){
      var horn = new THREE.Mesh(new THREE.ConeGeometry(0.035,0.22,6), whiteM);
      horn.position.set(0.65,0.9,z); horn.rotation.z=-0.35; g.add(horn);
    });
    // 耳朵
    [-0.25,0.25].forEach(function(z){
      var ear = new THREE.Mesh(new THREE.SphereGeometry(0.1,8,6), whiteM);
      ear.position.set(0.6,0.78,z); ear.scale.set(0.5,0.5,1); g.add(ear);
    });
    // 四腿
    [[-0.32,-0.22],[-0.32,0.22],[0.32,-0.22],[0.32,0.22]].forEach(function(p){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.08,0.48,8), whiteM);
      leg.position.set(p[0],0.06,p[1]); g.add(leg);
    });
    // 尾巴
    var tail = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.04,0.45,8), whiteM);
    tail.position.set(-0.6,0.62,0); tail.rotation.z=0.9; g.add(tail);
    return g;
  }

  // ── 黑白熊猫（r128 兼容：四肢用 CylinderGeometry）─────────
  function makePanda(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='panda';
    var whiteM = new THREE.MeshLambertMaterial({color:0xF5F5F5});
    var blackM = new THREE.MeshLambertMaterial({color:0x1A1A1A});
    // 身体
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.48,14,12), whiteM);
    body.position.y=0.55; body.castShadow=true; g.add(body);
    // 头
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.34,14,12), whiteM);
    head.position.y=1.18; head.castShadow=true; g.add(head);
    // 黑耳朵
    [-0.22,0.22].forEach(function(x){
      var ear = new THREE.Mesh(new THREE.SphereGeometry(0.12,10,8), blackM);
      ear.position.set(x,1.46,0); g.add(ear);
    });
    // 黑眼圈 + 白眼珠
    [-0.14,0.14].forEach(function(x){
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.09,10,8), blackM);
      eye.position.set(x,1.22,0.28); g.add(eye);
      var pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04,8,8), whiteM);
      pupil.position.set(x,1.22,0.36); g.add(pupil);
    });
    // 鼻子
    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.06,8,8), blackM);
    nose.position.set(0,1.1,0.34); g.add(nose);
    // 四肢（CylinderGeometry + 球形末端模拟圆润）
    var limbDef = [[-0.35,0.22,-0.18],[-0.35,0.22,0.18],[0.3,0.22,-0.2],[0.3,0.22,0.2]];
    limbDef.forEach(function(p){
      var limb = new THREE.Mesh(new THREE.CylinderGeometry(0.10,0.09,0.38,10), blackM);
      limb.position.set(p[0],p[1]-0.12,p[2]); limb.rotation.z=p[0]<0?0.35:-0.35; limb.castShadow=true; g.add(limb);
      var pad = new THREE.Mesh(new THREE.SphereGeometry(0.11,10,8), blackM);
      pad.position.set(p[0]+(p[0]<0?-0.1:0.1),p[1]-0.25,p[2]); g.add(pad);
    });
    return g;
  }

  // ── 小石块（用 IcosahedronGeometry 确保 r128 可用）────────
  function makeRock(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='rock';
    var r1M = new THREE.MeshLambertMaterial({color:0x888888});
    var r2M = new THREE.MeshLambertMaterial({color:0x636363});
    var r3M = new THREE.MeshLambertMaterial({color:0xAAAAAA});
    // 主石（IcosahedronGeometry detail=0 → 低多边形块状感）
    var main = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38,0), r1M);
    main.position.set(0,0.32,0); main.rotation.set(0.3,0.5,0.2); main.castShadow=true; g.add(main);
    // 右侧小石
    var s1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.21,0), r2M);
    s1.position.set(0.38,0.17,-0.12); s1.rotation.set(0.8,0.2,0.4); s1.castShadow=true; g.add(s1);
    // 左侧小石
    var s2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14,0), r3M);
    s2.position.set(-0.3,0.12,0.18); s2.rotation.set(0.1,1.0,0.3); g.add(s2);
    return g;
  }

  // ── 小草丛 ────────────────────────────────────────────────
  function makeGrass(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='grass';
    var g1M = new THREE.MeshLambertMaterial({color:0x3A8A3A}); // 深绿
    var g2M = new THREE.MeshLambertMaterial({color:0x5AB55A}); // 中绿
    var g3M = new THREE.MeshLambertMaterial({color:0x7AD07A}); // 浅绿
    // 多簇草叶（细锥形）
    [
      {x:-0.15,z:-0.1,h:0.55,r:0.06,m:g1M,ry:0.2},
      {x: 0.05,z:-0.15,h:0.65,r:0.05,m:g2M,ry:-0.3},
      {x: 0.18,z: 0.05,h:0.5, r:0.07,m:g3M,ry:0.5},
      {x:-0.05,z: 0.18,h:0.6, r:0.05,m:g1M,ry:-0.5},
      {x: 0.0, z: 0.0, h:0.7, r:0.06,m:g2M,ry:0.1},
      {x:-0.2, z: 0.12,h:0.45,r:0.05,m:g3M,ry:0.8},
      {x: 0.22,z:-0.08,h:0.52,r:0.05,m:g1M,ry:-0.2},
    ].forEach(function(b){
      var blade = new THREE.Mesh(new THREE.ConeGeometry(b.r,b.h,6), b.m);
      blade.position.set(b.x, b.h/2, b.z);
      blade.rotation.y=b.ry;
      blade.rotation.x=(Math.random()-0.5)*0.25;
      blade.castShadow=true;
      g.add(blade);
    });
    // 草根底盘
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.32,0.08,10), g1M);
    base.position.y=0.04; g.add(base);
    return g;
  }

  // ── 汽车 ────────────────────────────────────────────────
  function makeCar(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='car';
    var bodyM  = new THREE.MeshLambertMaterial({color:0xE74C3C});
    var cabinM = new THREE.MeshLambertMaterial({color:0xC0392B});
    var glassM = new THREE.MeshLambertMaterial({color:0x85C1E9, transparent:true, opacity:0.7});
    var wheelM = new THREE.MeshLambertMaterial({color:0x2C3E50});
    var rimM   = new THREE.MeshLambertMaterial({color:0x95A5A6});
    // 车身
    var body = new THREE.Mesh(new THREE.BoxGeometry(1.4,0.38,0.7), bodyM);
    body.position.y=0.38; body.castShadow=true; g.add(body);
    // 车顶舱
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(0.85,0.34,0.62), cabinM);
    cabin.position.set(-0.08,0.72,0); cabin.castShadow=true; g.add(cabin);
    // 前后挡风玻璃
    var frontG = new THREE.Mesh(new THREE.BoxGeometry(0.04,0.28,0.56), glassM);
    frontG.position.set(0.34,0.72,0); g.add(frontG);
    var rearG  = new THREE.Mesh(new THREE.BoxGeometry(0.04,0.28,0.56), glassM);
    rearG.position.set(-0.50,0.72,0); g.add(rearG);
    // 四个轮子
    [[-0.45,-0.33],[-0.45,0.33],[0.45,-0.33],[0.45,0.33]].forEach(function(p){
      var w = new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,0.12,14), wheelM);
      w.rotation.x=Math.PI/2; w.position.set(p[0],0.2,p[1]); w.castShadow=true; g.add(w);
      var r = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,0.14,8), rimM);
      r.rotation.x=Math.PI/2; r.position.set(p[0],0.2,p[1]); g.add(r);
    });
    // 车头灯
    var lightM = new THREE.MeshLambertMaterial({color:0xFFFDE7});
    [-0.2,0.2].forEach(function(z){
      var l = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.08,0.12), lightM);
      l.position.set(0.7,0.38,z); g.add(l);
    });
    return g;
  }

  // ── 自行车 ──────────────────────────────────────────────
  function makeBike(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='bike';
    var frameM = new THREE.MeshLambertMaterial({color:0x3498DB});
    var wheelM = new THREE.MeshLambertMaterial({color:0x2C3E50});
    var rimM   = new THREE.MeshLambertMaterial({color:0xBDC3C7});
    // 两轮
    [-0.52,0.52].forEach(function(x){
      var rim = new THREE.Mesh(new THREE.TorusGeometry(0.28,0.04,8,20), wheelM);
      rim.rotation.y=Math.PI/2; rim.position.set(x,0.3,0); rim.castShadow=true; g.add(rim);
      var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.08,10), rimM);
      hub.rotation.z=Math.PI/2; hub.position.set(x,0.3,0); g.add(hub);
    });
    // 车架（三角形结构用两根斜杆）
    var topTube = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.95,8), frameM);
    topTube.rotation.z=Math.PI*0.08; topTube.position.set(0,0.65,0); g.add(topTube);
    var downTube = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.75,8), frameM);
    downTube.rotation.z=Math.PI*0.22; downTube.position.set(-0.1,0.45,0); g.add(downTube);
    var seatTube = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.55,8), frameM);
    seatTube.rotation.z=Math.PI*0.05; seatTube.position.set(0.14,0.45,0); g.add(seatTube);
    var rearStay = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.62,8), frameM);
    rearStay.rotation.z=-Math.PI*0.2; rearStay.position.set(0.28,0.35,0); g.add(rearStay);
    // 车把
    var handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.4,8), frameM);
    handle.rotation.x=Math.PI/2; handle.position.set(-0.5,0.7,0); g.add(handle);
    var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.3,8), frameM);
    stem.position.set(-0.5,0.58,0); g.add(stem);
    // 座垫
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.05,0.12), new THREE.MeshLambertMaterial({color:0x2C3E50}));
    seat.position.set(0.2,0.82,0); g.add(seat);
    return g;
  }

  // ── 学校 ────────────────────────────────────────────────
  function makeSchool(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='school';
    var wallM  = new THREE.MeshLambertMaterial({color:0xF5ECD7});
    var roofM  = new THREE.MeshLambertMaterial({color:0xE67E22});
    var winM   = new THREE.MeshLambertMaterial({color:0x85C1E9, transparent:true, opacity:0.8});
    var doorM  = new THREE.MeshLambertMaterial({color:0x935116});
    var accentM= new THREE.MeshLambertMaterial({color:0xF39C12});
    // 主楼
    var main = new THREE.Mesh(new THREE.BoxGeometry(1.8,1.1,1.0), wallM);
    main.position.y=0.55; main.castShadow=true; g.add(main);
    // 屋顶
    var roof = new THREE.Mesh(new THREE.BoxGeometry(1.9,0.15,1.1), roofM);
    roof.position.y=1.17; g.add(roof);
    // 门洞
    var door = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.5,0.08), doorM);
    door.position.set(0,0.25,0.54); g.add(door);
    // 门廊柱
    [-0.2,0.2].forEach(function(x){
      var col = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.6,8), accentM);
      col.position.set(x,0.3,0.55); g.add(col);
    });
    // 窗户
    [[-0.6,0.7],[-0.6,0.4],[0.6,0.7],[0.6,0.4],[-0.6,-0.25],[0.6,-0.25]].forEach(function(p){
      var w = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.22,0.06), winM);
      w.position.set(p[0],p[1]+0.1,0.52); g.add(w);
    });
    // 旗杆
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.9,8), new THREE.MeshLambertMaterial({color:0xBDC3C7}));
    pole.position.set(0.7,1.6,0); g.add(pole);
    var flag = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.18,0.02), new THREE.MeshLambertMaterial({color:0xE74C3C}));
    flag.position.set(0.84,2.0,0); g.add(flag);
    return g;
  }

  // ── 医院 ────────────────────────────────────────────────
  function makeHospital(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='hospital';
    var wallM  = new THREE.MeshLambertMaterial({color:0xECF0F1});
    var roofM  = new THREE.MeshLambertMaterial({color:0xBDC3C7});
    var redM   = new THREE.MeshLambertMaterial({color:0xE74C3C});
    var winM   = new THREE.MeshLambertMaterial({color:0xAED6F1, transparent:true, opacity:0.8});
    // 主楼（两层）
    var base = new THREE.Mesh(new THREE.BoxGeometry(1.6,0.9,1.0), wallM);
    base.position.y=0.45; base.castShadow=true; g.add(base);
    var top = new THREE.Mesh(new THREE.BoxGeometry(1.1,0.75,0.8), wallM);
    top.position.set(0,1.27,0); top.castShadow=true; g.add(top);
    // 平屋顶
    var roof1 = new THREE.Mesh(new THREE.BoxGeometry(1.7,0.1,1.1), roofM);
    roof1.position.y=0.95; g.add(roof1);
    var roof2 = new THREE.Mesh(new THREE.BoxGeometry(1.2,0.1,0.9), roofM);
    roof2.position.y=1.69; g.add(roof2);
    // 红十字（正面）
    var crossH = new THREE.Mesh(new THREE.BoxGeometry(0.36,0.12,0.05), redM);
    crossH.position.set(0,1.28,0.42); g.add(crossH);
    var crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.36,0.05), redM);
    crossV.position.set(0,1.28,0.42); g.add(crossV);
    // 大门
    var door = new THREE.Mesh(new THREE.BoxGeometry(0.38,0.55,0.06), new THREE.MeshLambertMaterial({color:0x5DADE2}));
    door.position.set(0,0.27,0.53); g.add(door);
    // 窗
    [[-0.55,0.65],[0.55,0.65],[-0.55,0.25],[0.55,0.25]].forEach(function(p){
      var w = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.2,0.05), winM);
      w.position.set(p[0],p[1],0.52); g.add(w);
    });
    return g;
  }

  // ── 超市 ────────────────────────────────────────────────
  function makeSupermarket(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='supermarket';
    var wallM   = new THREE.MeshLambertMaterial({color:0xF8F9FA});
    var accentM = new THREE.MeshLambertMaterial({color:0x27AE60});
    var glassM  = new THREE.MeshLambertMaterial({color:0xAED6F1, transparent:true, opacity:0.7});
    var signBgM = new THREE.MeshLambertMaterial({color:0x1E8449});
    // 主体
    var body = new THREE.Mesh(new THREE.BoxGeometry(1.9,0.85,1.0), wallM);
    body.position.y=0.42; body.castShadow=true; g.add(body);
    // 屋檐条（绿色装饰带）
    var banner = new THREE.Mesh(new THREE.BoxGeometry(1.9,0.22,0.06), accentM);
    banner.position.set(0,0.96,0.52); g.add(banner);
    // 招牌底板
    var sign = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.18,0.04), signBgM);
    sign.position.set(0,0.97,0.55); g.add(sign);
    // 大玻璃门窗（整面）
    var front = new THREE.Mesh(new THREE.BoxGeometry(1.5,0.65,0.04), glassM);
    front.position.set(0,0.37,0.52); g.add(front);
    // 门框
    var doorFrameM = new THREE.MeshLambertMaterial({color:0x27AE60});
    var frameL = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.7,0.06), doorFrameM);
    frameL.position.set(-0.4,0.37,0.52); g.add(frameL);
    var frameR = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.7,0.06), doorFrameM);
    frameR.position.set(0.4,0.37,0.52); g.add(frameR);
    // 购物车图标（简单球+棒）
    var cartM = new THREE.MeshLambertMaterial({color:0xFFFFFF});
    var cart = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.06,0.02), cartM);
    cart.position.set(-0.2,0.98,0.57); g.add(cart);
    return g;
  }

  // ── 高楼 ────────────────────────────────────────────────
  function makeSkyscraper(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='skyscraper';
    var concreteM = new THREE.MeshLambertMaterial({color:0x7F8C8D});
    var glassM    = new THREE.MeshLambertMaterial({color:0x5DADE2, transparent:true, opacity:0.75});
    var darkM     = new THREE.MeshLambertMaterial({color:0x566573});
    var antM      = new THREE.MeshLambertMaterial({color:0xBDC3C7});
    // 三节楼体（底宽顶窄）
    var b1 = new THREE.Mesh(new THREE.BoxGeometry(1.0,1.0,0.8), concreteM);
    b1.position.y=0.5; b1.castShadow=true; g.add(b1);
    var b2 = new THREE.Mesh(new THREE.BoxGeometry(0.8,1.2,0.65), darkM);
    b2.position.y=1.6; b2.castShadow=true; g.add(b2);
    var b3 = new THREE.Mesh(new THREE.BoxGeometry(0.58,1.0,0.48), concreteM);
    b3.position.y=2.7; b3.castShadow=true; g.add(b3);
    // 玻璃幕墙（前后两面）
    [0.41,-0.41].forEach(function(z){
      var gl = new THREE.Mesh(new THREE.BoxGeometry(0.72,0.9,0.04), glassM);
      gl.position.set(0,1.65,z); g.add(gl);
      var gl2 = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.85,0.04), glassM);
      gl2.position.set(0,2.73,z*0.6); g.add(gl2);
    });
    // 网格线（水平条）
    for(var i=0;i<5;i++){
      var strip = new THREE.Mesh(new THREE.BoxGeometry(1.02,0.04,0.82), darkM);
      strip.position.y=0.8+i*0.22; g.add(strip);
    }
    // 天线
    var ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.6,8), antM);
    ant.position.set(0,3.5,0); g.add(ant);
    var antTip = new THREE.Mesh(new THREE.SphereGeometry(0.04,8,8), new THREE.MeshLambertMaterial({color:0xE74C3C}));
    antTip.position.set(0,3.82,0); g.add(antTip);
    return g;
  }

  // ── 小鸡 ────────────────────────────────────────────────
  function makeChick(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='chick';
    var yellowM = new THREE.MeshLambertMaterial({color:0xF4D03F});
    var orangeM = new THREE.MeshLambertMaterial({color:0xE67E22});
    var darkM   = new THREE.MeshLambertMaterial({color:0x1A1A1A});
    // 身体
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.3,12,10), yellowM);
    body.position.y=0.33; body.scale.y=0.9; body.castShadow=true; g.add(body);
    // 头
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.22,12,10), yellowM);
    head.position.y=0.72; head.castShadow=true; g.add(head);
    // 翅膀（两侧扁球）
    [-0.28,0.28].forEach(function(x){
      var wing = new THREE.Mesh(new THREE.SphereGeometry(0.16,10,8), yellowM);
      wing.position.set(x,0.38,0); wing.scale.set(0.5,0.6,0.9); g.add(wing);
    });
    // 嘴巴（橙色三角锥）
    var beak = new THREE.Mesh(new THREE.ConeGeometry(0.05,0.12,6), orangeM);
    beak.rotation.x=Math.PI/2; beak.position.set(0,0.72,0.22); g.add(beak);
    // 鸡冠
    var crest = new THREE.Mesh(new THREE.SphereGeometry(0.06,8,6), orangeM);
    crest.position.set(0,0.94,0); g.add(crest);
    // 眼睛
    [-0.09,0.09].forEach(function(x){
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.04,8,6), darkM);
      eye.position.set(x,0.76,0.19); g.add(eye);
    });
    // 两腿
    [-0.08,0.08].forEach(function(x){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.02,0.2,6), orangeM);
      leg.position.set(x,0.08,0); g.add(leg);
      // 爪子
      [-0.06,0,0.06].forEach(function(z){
        var toe = new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.01,0.1,6), orangeM);
        toe.rotation.x=Math.PI/2; toe.position.set(x,0.01,z); g.add(toe);
      });
    });
    return g;
  }

  // ── 小鸭 ────────────────────────────────────────────────
  function makeDuck(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='duck';
    var bodyM  = new THREE.MeshLambertMaterial({color:0xF0E68C});
    var headM  = new THREE.MeshLambertMaterial({color:0x228B22}); // 绿头鸭
    var billM  = new THREE.MeshLambertMaterial({color:0xE8A020});
    var darkM  = new THREE.MeshLambertMaterial({color:0x1A1A1A});
    var legM   = new THREE.MeshLambertMaterial({color:0xE8A020});
    var wingM  = new THREE.MeshLambertMaterial({color:0xD4B040});
    // 身体（椭圆形）
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.38,14,10), bodyM);
    body.position.y=0.4; body.scale.set(1,0.75,0.85); body.castShadow=true; g.add(body);
    // 翅膀纹路
    [-0.3,0.3].forEach(function(z){
      var wing = new THREE.Mesh(new THREE.SphereGeometry(0.22,10,8), wingM);
      wing.position.set(0,0.42,z); wing.scale.set(0.8,0.55,0.4); g.add(wing);
    });
    // 尾巴
    var tail = new THREE.Mesh(new THREE.ConeGeometry(0.1,0.3,6), bodyM);
    tail.rotation.z=-Math.PI*0.45; tail.position.set(-0.42,0.55,0); g.add(tail);
    // 脖子
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,0.3,10), headM);
    neck.position.set(0.22,0.7,0); neck.rotation.z=-0.35; g.add(neck);
    // 头
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.2,12,10), headM);
    head.position.set(0.4,0.88,0); head.castShadow=true; g.add(head);
    // 嘴
    var bill = new THREE.Mesh(new THREE.BoxGeometry(0.18,0.07,0.1), billM);
    bill.position.set(0.59,0.86,0); g.add(bill);
    // 眼
    [-0.1,0.1].forEach(function(z){
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.04,8,6), darkM);
      eye.position.set(0.54,0.94,z); g.add(eye);
    });
    // 腿和蹼
    [-0.12,0.12].forEach(function(z){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.025,0.22,6), legM);
      leg.position.set(0,0.1,z); g.add(leg);
      var foot = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.04,0.14), legM);
      foot.position.set(0.05,0.0,z); g.add(foot);
    });
    return g;
  }

  // ── 坦克 ────────────────────────────────────────────────
  function makeTank(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='tank';
    var armorM  = new THREE.MeshLambertMaterial({color:0x5D6D3A}); // 军绿
    var darkM   = new THREE.MeshLambertMaterial({color:0x3A4520}); // 深军绿
    var trackM  = new THREE.MeshLambertMaterial({color:0x2C2C2C}); // 履带
    var metalM  = new THREE.MeshLambertMaterial({color:0x7A8A50}); // 浅金属绿
    // 履带（左右两侧）
    [-0.42,0.42].forEach(function(z){
      var track = new THREE.Mesh(new THREE.BoxGeometry(1.4,0.26,0.22), trackM);
      track.position.set(0,0.13,z); g.add(track);
      // 履带轮（前中后）
      [-0.5,0,0.5].forEach(function(x){
        var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.24,10), darkM);
        wheel.rotation.x=Math.PI/2; wheel.position.set(x,0.15,z); g.add(wheel);
      });
    });
    // 车体
    var hull = new THREE.Mesh(new THREE.BoxGeometry(1.2,0.36,0.72), armorM);
    hull.position.y=0.44; hull.castShadow=true; g.add(hull);
    // 车体前斜面装甲
    var frontArmor = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.38,0.72), metalM);
    frontArmor.position.set(0.6,0.44,0); frontArmor.rotation.z=-0.35; g.add(frontArmor);
    // 炮塔
    var turret = new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.38,0.28,10), armorM);
    turret.position.y=0.76; turret.castShadow=true; g.add(turret);
    var turretTop = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.32,0.12,10), darkM);
    turretTop.position.y=0.96; g.add(turretTop);
    // 炮管
    var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.06,0.82,10), darkM);
    barrel.rotation.z=Math.PI/2; barrel.position.set(0.52,0.84,0); barrel.castShadow=true; g.add(barrel);
    // 炮管口
    var muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.055,0.1,10), metalM);
    muzzle.rotation.z=Math.PI/2; muzzle.position.set(0.97,0.84,0); g.add(muzzle);
    // 顶部小舱门
    var hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.06,8), metalM);
    hatch.position.set(-0.1,1.05,0); g.add(hatch);
    // 侧面装甲板
    [-0.38,0.38].forEach(function(z){
      var skirt = new THREE.Mesh(new THREE.BoxGeometry(1.18,0.14,0.06), darkM);
      skirt.position.set(0,0.32,z); g.add(skirt);
    });
    return g;
  }


  // ── 路灯 ─────────────────────────────────────────────────
  function makeStreetlight(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='streetlight';
    var poleM  = new THREE.MeshLambertMaterial({color:0xBDC3C7});
    var lampM  = new THREE.MeshLambertMaterial({color:0xFFFDE7});
    var armM   = new THREE.MeshLambertMaterial({color:0x95A5A6});
    var pole   = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.06,1.8,8), poleM);
    pole.position.y=0.9; pole.castShadow=true; g.add(pole);
    var arm    = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.55,8), armM);
    arm.rotation.z=Math.PI/2; arm.position.set(0.27,1.72,0); g.add(arm);
    var lampHood = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.08,0.12,10), armM);
    lampHood.position.set(0.55,1.68,0); g.add(lampHood);
    var bulb   = new THREE.Mesh(new THREE.SphereGeometry(0.07,10,8), lampM);
    bulb.position.set(0.55,1.62,0); g.add(bulb);
    var base   = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.14,0.1,10), poleM);
    base.position.y=0.05; g.add(base);
    return g;
  }

  // ── 体育馆 ───────────────────────────────────────────────
  function makeGym(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='gym';
    var wallM  = new THREE.MeshLambertMaterial({color:0xE8E8E8});
    var roofM  = new THREE.MeshLambertMaterial({color:0x2980B9});
    var accentM= new THREE.MeshLambertMaterial({color:0xE67E22});
    var glassM = new THREE.MeshLambertMaterial({color:0xAED6F1,transparent:true,opacity:0.7});
    var base   = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.9,1.4), wallM);
    base.position.y=0.45; base.castShadow=true; g.add(base);
    var roofGeo = new THREE.CylinderGeometry(0.72,0.72,2.2,16,1,false,0,Math.PI);
    var roof    = new THREE.Mesh(roofGeo, roofM);
    roof.rotation.z=Math.PI/2; roof.position.set(0,0.9,0); roof.castShadow=true; g.add(roof);
    var door   = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.7,0.06), glassM);
    door.position.set(0,0.35,0.73); g.add(door);
    var stripe = new THREE.Mesh(new THREE.BoxGeometry(2.22,0.12,0.06), accentM);
    stripe.position.set(0,0.9,0.73); g.add(stripe);
    [[-0.8,0.65],[0.8,0.65]].forEach(function(p){
      var w = new THREE.Mesh(new THREE.BoxGeometry(0.35,0.28,0.06), glassM);
      w.position.set(p[0],p[1],0.73); g.add(w);
    });
    return g;
  }

  // ── 图书馆 ───────────────────────────────────────────────
  function makeLibrary(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='library';
    var wallM  = new THREE.MeshLambertMaterial({color:0xF5F0E8});
    var roofM  = new THREE.MeshLambertMaterial({color:0x6C3483});
    var colM   = new THREE.MeshLambertMaterial({color:0xDDD5C5});
    var winM   = new THREE.MeshLambertMaterial({color:0xAED6F1,transparent:true,opacity:0.8});
    var main   = new THREE.Mesh(new THREE.BoxGeometry(1.8,1.1,1.1), wallM);
    main.position.y=0.55; main.castShadow=true; g.add(main);
    var pediment = new THREE.Mesh(new THREE.CylinderGeometry(0,1.1,0.5,4), roofM);
    pediment.position.y=1.35; pediment.rotation.y=Math.PI/4; g.add(pediment);
    [-0.6,-0.2,0.2,0.6].forEach(function(x){
      var col = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,1.1,8), colM);
      col.position.set(x,0.55,0.57); g.add(col);
    });
    var door = new THREE.Mesh(new THREE.BoxGeometry(0.32,0.55,0.06), new THREE.MeshLambertMaterial({color:0x784212}));
    door.position.set(0,0.27,0.58); g.add(door);
    [[-0.75,0.65],[0.75,0.65]].forEach(function(p){
      var w = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.28,0.06), winM);
      w.position.set(p[0],p[1],0.58); g.add(w);
    });
    return g;
  }

  // ── 飞机场 ───────────────────────────────────────────────
  function makeAirport(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='airport';
    var wallM  = new THREE.MeshLambertMaterial({color:0xF0F3F4});
    var roofM  = new THREE.MeshLambertMaterial({color:0x2980B9});
    var glassM = new THREE.MeshLambertMaterial({color:0x85C1E9,transparent:true,opacity:0.7});
    var accentM= new THREE.MeshLambertMaterial({color:0x1A5276});
    var main   = new THREE.Mesh(new THREE.BoxGeometry(2.4,0.7,1.0), wallM);
    main.position.y=0.35; main.castShadow=true; g.add(main);
    var roofGeo= new THREE.CylinderGeometry(0.42,0.42,2.4,12,1,false,0,Math.PI);
    var roof   = new THREE.Mesh(roofGeo, roofM);
    roof.rotation.z=Math.PI/2; roof.position.set(0,0.7,0); g.add(roof);
    var front  = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.62,0.04), glassM);
    front.position.set(0,0.35,0.52); g.add(front);
    [-0.9,0.9].forEach(function(x){
      var bridge = new THREE.Mesh(new THREE.BoxGeometry(0.38,0.28,0.55), accentM);
      bridge.position.set(x,0.34,0.77); g.add(bridge);
    });
    for(var li=0;li<5;li++){
      var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04,6,6), new THREE.MeshLambertMaterial({color:0xFFFF00}));
      lamp.position.set(-1.0+li*0.5,0.02,-0.55); g.add(lamp);
    }
    return g;
  }

  // ── 酒店 ─────────────────────────────────────────────────
  function makeHotel(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='hotel';
    var wallM  = new THREE.MeshLambertMaterial({color:0xFAE5D3});
    var roofM  = new THREE.MeshLambertMaterial({color:0xC0392B});
    var glassM = new THREE.MeshLambertMaterial({color:0xAED6F1,transparent:true,opacity:0.75});
    var goldM  = new THREE.MeshLambertMaterial({color:0xD4AC0D});
    var tower  = new THREE.Mesh(new THREE.BoxGeometry(1.0,2.4,0.9), wallM);
    tower.position.y=1.2; tower.castShadow=true; g.add(tower);
    var hbase  = new THREE.Mesh(new THREE.BoxGeometry(1.6,0.6,1.3), wallM);
    hbase.position.y=0.3; hbase.castShadow=true; g.add(hbase);
    var roof   = new THREE.Mesh(new THREE.CylinderGeometry(0,0.58,0.45,4), roofM);
    roof.position.y=2.62; roof.rotation.y=Math.PI/4; g.add(roof);
    [0.6,1.2,1.8].forEach(function(y){
      var band = new THREE.Mesh(new THREE.BoxGeometry(1.02,0.06,0.92), goldM);
      band.position.y=y; g.add(band);
    });
    for(var row=0;row<4;row++){
      [-0.28,0.28].forEach(function(cx){
        var w = new THREE.Mesh(new THREE.BoxGeometry(0.18,0.22,0.05), glassM);
        w.position.set(cx,0.5+row*0.48,0.46); g.add(w);
      });
    }
    var door   = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.06), glassM);
    door.position.set(0,0.25,0.68); g.add(door);
    return g;
  }

  // ── 政府办公楼 ───────────────────────────────────────────
  function makeGovbuilding(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='govbuilding';
    var wallM  = new THREE.MeshLambertMaterial({color:0xECECEC});
    var colM   = new THREE.MeshLambertMaterial({color:0xD5D5D5});
    var roofM  = new THREE.MeshLambertMaterial({color:0x7F8C8D});
    var winM   = new THREE.MeshLambertMaterial({color:0xAED6F1,transparent:true,opacity:0.8});
    var flagM  = new THREE.MeshLambertMaterial({color:0xE74C3C});
    var main   = new THREE.Mesh(new THREE.BoxGeometry(2.0,1.2,1.0), wallM);
    main.position.y=0.6; main.castShadow=true; g.add(main);
    var roofBox= new THREE.Mesh(new THREE.BoxGeometry(2.1,0.14,1.1), roofM);
    roofBox.position.y=1.27; g.add(roofBox);
    var pediment = new THREE.Mesh(new THREE.CylinderGeometry(0,1.12,0.38,4), roofM);
    pediment.position.y=1.58; pediment.rotation.y=Math.PI/4; g.add(pediment);
    [-0.72,-0.36,0,0.36,0.72].forEach(function(x){
      var col = new THREE.Mesh(new THREE.CylinderGeometry(0.065,0.065,1.2,8), colM);
      col.position.set(x,0.6,0.54); g.add(col);
    });
    var step = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.1,0.35), colM);
    step.position.set(0,0.05,0.67); g.add(step);
    var gdoor = new THREE.Mesh(new THREE.BoxGeometry(0.38,0.6,0.06), winM);
    gdoor.position.set(0,0.3,0.54); g.add(gdoor);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,1.0,8), colM);
    pole.position.set(0,1.9,0); g.add(pole);
    var flag = new THREE.Mesh(new THREE.BoxGeometry(0.32,0.2,0.02), flagM);
    flag.position.set(0.18,2.32,0); g.add(flag);
    return g;
  }

  // ── 别墅 ─────────────────────────────────────────────────
  function makeVilla(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='villa';
    var wallM  = new THREE.MeshLambertMaterial({color:0xFDF5E6});
    var roofM  = new THREE.MeshLambertMaterial({color:0x6B3A2A});
    var winM   = new THREE.MeshLambertMaterial({color:0xAED6F1,transparent:true,opacity:0.8});
    var doorM  = new THREE.MeshLambertMaterial({color:0x8B4513});
    var greenM = new THREE.MeshLambertMaterial({color:0x27AE60});
    var main   = new THREE.Mesh(new THREE.BoxGeometry(1.5,0.9,1.1), wallM);
    main.position.y=0.45; main.castShadow=true; g.add(main);
    var roofTop= new THREE.Mesh(new THREE.CylinderGeometry(0,1.05,0.6,4), roofM);
    roofTop.position.y=1.2; roofTop.rotation.y=Math.PI/4; roofTop.castShadow=true; g.add(roofTop);
    var garage = new THREE.Mesh(new THREE.BoxGeometry(0.7,0.65,0.85), wallM);
    garage.position.set(0.95,0.32,0.06); garage.castShadow=true; g.add(garage);
    var garageRoof = new THREE.Mesh(new THREE.BoxGeometry(0.72,0.06,0.87), roofM);
    garageRoof.position.set(0.95,0.68,0.06); g.add(garageRoof);
    var vdoor  = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.5,0.06), doorM);
    vdoor.position.set(0,0.25,0.58); g.add(vdoor);
    [[-0.48,0.62],[0.48,0.62],[-0.48,0.28],[0.48,0.28]].forEach(function(p){
      var w = new THREE.Mesh(new THREE.BoxGeometry(0.24,0.22,0.06), winM);
      w.position.set(p[0],p[1],0.58); g.add(w);
    });
    var garden = new THREE.Mesh(new THREE.CylinderGeometry(0.38,0.4,0.06,12), greenM);
    garden.position.set(-0.7,0.03,0); g.add(garden);
    return g;
  }

  // ── 广告牌 ───────────────────────────────────────────────
  function makeBillboard(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='billboard';
    var poleM    = new THREE.MeshLambertMaterial({color:0x7F8C8D});
    var boardM   = new THREE.MeshLambertMaterial({color:0xF39C12});
    var contentM = new THREE.MeshLambertMaterial({color:0xFFF9C4});
    var frameM   = new THREE.MeshLambertMaterial({color:0x566573});
    [-0.3,0.3].forEach(function(x){
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,1.5,8), poleM);
      pole.position.set(x,0.75,0); pole.castShadow=true; g.add(pole);
    });
    var board  = new THREE.Mesh(new THREE.BoxGeometry(1.5,0.75,0.06), boardM);
    board.position.set(0,1.62,0); board.castShadow=true; g.add(board);
    var fH1 = new THREE.Mesh(new THREE.BoxGeometry(1.56,0.07,0.08), frameM);
    fH1.position.set(0,1.25,0); g.add(fH1);
    var fH2 = fH1.clone(); fH2.position.set(0,2.0,0); g.add(fH2);
    var fV1 = new THREE.Mesh(new THREE.BoxGeometry(0.07,0.81,0.08), frameM);
    fV1.position.set(-0.78,1.62,0); g.add(fV1);
    var fV2 = fV1.clone(); fV2.position.set(0.78,1.62,0); g.add(fV2);
    var content = new THREE.Mesh(new THREE.BoxGeometry(1.3,0.58,0.04), contentM);
    content.position.set(0,1.62,0.06); g.add(content);
    return g;
  }

  // ── 小羊 ─────────────────────────────────────────────────
  function makeSheep(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='sheep';
    var woolM  = new THREE.MeshLambertMaterial({color:0xF0EDE8});
    var faceM  = new THREE.MeshLambertMaterial({color:0xD5CFC8});
    var darkM  = new THREE.MeshLambertMaterial({color:0x2C2C2C});
    var body   = new THREE.Mesh(new THREE.SphereGeometry(0.42,12,10), woolM);
    body.position.y=0.52; body.scale.set(1,0.8,0.95); body.castShadow=true; g.add(body);
    [[0.2,0.82,0.2],[-0.2,0.78,0.25],[0.0,0.88,-0.1]].forEach(function(p){
      var puff = new THREE.Mesh(new THREE.SphereGeometry(0.15,8,6), woolM);
      puff.position.set(p[0],p[1],p[2]); g.add(puff);
    });
    var head   = new THREE.Mesh(new THREE.SphereGeometry(0.22,10,8), faceM);
    head.position.set(0.5,0.7,0); head.castShadow=true; g.add(head);
    [-0.1,0.1].forEach(function(z){
      var ear = new THREE.Mesh(new THREE.SphereGeometry(0.06,6,5), faceM);
      ear.position.set(0.44,0.88,z); g.add(ear);
    });
    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.05,8,6), darkM);
    nose.position.set(0.72,0.67,0); g.add(nose);
    [[-0.25,-0.22],[-0.25,0.22],[0.25,-0.22],[0.25,0.22]].forEach(function(p){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.05,0.4,8), faceM);
      leg.position.set(p[0],0.1,p[1]); g.add(leg);
    });
    return g;
  }

  // ── 狼 ───────────────────────────────────────────────────
  function makeWolf(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='wolf';
    var furM   = new THREE.MeshLambertMaterial({color:0x7D8A8A});
    var darkM  = new THREE.MeshLambertMaterial({color:0x3A4040});
    var eyeM   = new THREE.MeshLambertMaterial({color:0xF0D060});
    var body   = new THREE.Mesh(new THREE.BoxGeometry(1.0,0.55,0.58), furM);
    body.position.set(0,0.42,0); body.castShadow=true; g.add(body);
    var head   = new THREE.Mesh(new THREE.BoxGeometry(0.48,0.42,0.48), furM);
    head.position.set(0.6,0.62,0); head.castShadow=true; g.add(head);
    var snout  = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.2,0.32), darkM);
    snout.position.set(0.83,0.57,0); g.add(snout);
    [-0.12,0.12].forEach(function(z){
      var ear = new THREE.Mesh(new THREE.ConeGeometry(0.08,0.22,5), furM);
      ear.position.set(0.55,0.9,z); g.add(ear);
    });
    [-0.1,0.1].forEach(function(z){
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.055,8,6), eyeM);
      eye.position.set(0.8,0.68,z); g.add(eye);
      var pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03,6,5), darkM);
      pupil.position.set(0.84,0.68,z); g.add(pupil);
    });
    [[-0.3,-0.2],[-0.3,0.2],[0.3,-0.2],[0.3,0.2]].forEach(function(p){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.06,0.42,8), furM);
      leg.position.set(p[0],0.1,p[1]); g.add(leg);
    });
    var tail   = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.07,0.52,8), furM);
    tail.position.set(-0.6,0.7,0); tail.rotation.z=0.7; g.add(tail);
    return g;
  }

  // ── 野猪 ─────────────────────────────────────────────────
  function makeBoar(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='boar';
    var furM   = new THREE.MeshLambertMaterial({color:0x6B4226});
    var darkM  = new THREE.MeshLambertMaterial({color:0x3A2010});
    var pinkM  = new THREE.MeshLambertMaterial({color:0xFFB6A0});
    var tuskM  = new THREE.MeshLambertMaterial({color:0xFAF0E6});
    var body   = new THREE.Mesh(new THREE.SphereGeometry(0.5,12,10), furM);
    body.position.y=0.52; body.scale.set(1.1,0.85,0.9); body.castShadow=true; g.add(body);
    var head   = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.42,0.48), furM);
    head.position.set(0.62,0.62,0); head.castShadow=true; g.add(head);
    var snout  = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.14,0.1,10), pinkM);
    snout.rotation.z=Math.PI/2; snout.position.set(0.92,0.6,0); g.add(snout);
    [-0.08,0.08].forEach(function(z){
      var tusk = new THREE.Mesh(new THREE.ConeGeometry(0.03,0.22,6), tuskM);
      tusk.rotation.z=-Math.PI*0.45; tusk.position.set(0.95,0.5,z); g.add(tusk);
    });
    [-0.12,0.12].forEach(function(z){
      var ear = new THREE.Mesh(new THREE.ConeGeometry(0.07,0.15,5), darkM);
      ear.position.set(0.55,0.88,z); g.add(ear);
    });
    [[-0.28,-0.22],[-0.28,0.22],[0.28,-0.22],[0.28,0.22]].forEach(function(p){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.08,0.4,8), furM);
      leg.position.set(p[0],0.1,p[1]); g.add(leg);
    });
    return g;
  }

  // ── 小白兔 ───────────────────────────────────────────────
  function makeRabbit(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='rabbit';
    var whiteM = new THREE.MeshLambertMaterial({color:0xFCFCFC});
    var pinkM  = new THREE.MeshLambertMaterial({color:0xFFB6C1});
    var eyeM   = new THREE.MeshLambertMaterial({color:0xFF4466});
    var body   = new THREE.Mesh(new THREE.SphereGeometry(0.35,12,10), whiteM);
    body.position.y=0.42; body.scale.set(1,1.1,0.95); body.castShadow=true; g.add(body);
    var head   = new THREE.Mesh(new THREE.SphereGeometry(0.26,12,10), whiteM);
    head.position.y=0.88; head.castShadow=true; g.add(head);
    [-0.1,0.1].forEach(function(x){
      var ear = new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.055,0.55,8), whiteM);
      ear.position.set(x,1.2,0); ear.rotation.z=x*0.18; g.add(ear);
      var earIn = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.48,8), pinkM);
      earIn.position.set(x,1.2,0.02); earIn.rotation.z=x*0.18; g.add(earIn);
    });
    [-0.1,0.1].forEach(function(x){
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.05,8,6), eyeM);
      eye.position.set(x,0.92,0.22); g.add(eye);
    });
    var rnose = new THREE.Mesh(new THREE.SphereGeometry(0.04,6,5), pinkM);
    rnose.position.set(0,0.85,0.25); g.add(rnose);
    var rtail = new THREE.Mesh(new THREE.SphereGeometry(0.1,8,6), whiteM);
    rtail.position.set(-0.28,0.48,0); g.add(rtail);
    [-0.12,0.12].forEach(function(z){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.3,8), whiteM);
      leg.position.set(0,0.1,z); g.add(leg);
    });
    return g;
  }

  // ── 大老虎 ───────────────────────────────────────────────
  function makeTiger(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='tiger';
    var orangeM= new THREE.MeshLambertMaterial({color:0xE67E22});
    var stripeM= new THREE.MeshLambertMaterial({color:0x2C2C2C});
    var whiteM = new THREE.MeshLambertMaterial({color:0xFAF0E6});
    var eyeM   = new THREE.MeshLambertMaterial({color:0xF0D000});
    var tbody  = new THREE.Mesh(new THREE.BoxGeometry(1.2,0.65,0.7), orangeM);
    tbody.position.set(0,0.52,0); tbody.castShadow=true; g.add(tbody);
    [-0.4,-0.1,0.2].forEach(function(x){
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.67,0.72), stripeM);
      stripe.position.set(x,0.52,0); g.add(stripe);
    });
    var thead  = new THREE.Mesh(new THREE.SphereGeometry(0.36,12,10), orangeM);
    thead.position.set(0.72,0.72,0); thead.castShadow=true; g.add(thead);
    var tface  = new THREE.Mesh(new THREE.SphereGeometry(0.22,10,8), whiteM);
    tface.position.set(0.94,0.68,0); tface.scale.set(0.6,0.7,0.7); g.add(tface);
    [-0.18,0.18].forEach(function(z){
      var ear = new THREE.Mesh(new THREE.ConeGeometry(0.1,0.18,6), orangeM);
      ear.position.set(0.66,1.02,z); g.add(ear);
    });
    [-0.12,0.12].forEach(function(z){
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.065,8,6), eyeM);
      eye.position.set(0.94,0.78,z); g.add(eye);
      var pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03,6,5), stripeM);
      pupil.position.set(0.99,0.78,z); g.add(pupil);
    });
    [[-0.38,-0.24],[-0.38,0.24],[0.38,-0.24],[0.38,0.24]].forEach(function(p){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.09,0.52,8), orangeM);
      leg.position.set(p[0],0.1,p[1]); g.add(leg);
    });
    var ttail  = new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.07,0.65,8), orangeM);
    ttail.position.set(-0.7,0.75,0); ttail.rotation.z=0.75; g.add(ttail);
    return g;
  }

  // ── 小熊 ─────────────────────────────────────────────────
  function makeBear(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='bear';
    var furM   = new THREE.MeshLambertMaterial({color:0x784212});
    var faceM  = new THREE.MeshLambertMaterial({color:0xA0552A});
    var darkM  = new THREE.MeshLambertMaterial({color:0x2C2C2C});
    var bbody  = new THREE.Mesh(new THREE.SphereGeometry(0.45,12,10), furM);
    bbody.position.y=0.52; bbody.scale.set(1,1.05,0.92); bbody.castShadow=true; g.add(bbody);
    var bhead  = new THREE.Mesh(new THREE.SphereGeometry(0.32,12,10), furM);
    bhead.position.y=1.08; bhead.castShadow=true; g.add(bhead);
    [-0.2,0.2].forEach(function(x){
      var ear = new THREE.Mesh(new THREE.SphereGeometry(0.1,8,6), furM);
      ear.position.set(x,1.34,0); g.add(ear);
    });
    var bsnout = new THREE.Mesh(new THREE.SphereGeometry(0.14,10,8), faceM);
    bsnout.position.set(0,1.04,0.28); bsnout.scale.set(1,0.75,0.8); g.add(bsnout);
    var bnose  = new THREE.Mesh(new THREE.SphereGeometry(0.05,8,6), darkM);
    bnose.position.set(0,1.1,0.36); g.add(bnose);
    [-0.12,0.12].forEach(function(x){
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.05,8,6), darkM);
      eye.position.set(x,1.16,0.28); g.add(eye);
    });
    [[-0.38,-0.18],[-0.38,0.18],[0.3,-0.18],[0.3,0.18]].forEach(function(p){
      var limb = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.09,0.4,8), furM);
      limb.position.set(p[0],0.12,p[1]); g.add(limb);
    });
    return g;
  }

  // ── 小松鼠 ───────────────────────────────────────────────
  function makeSquirrel(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='squirrel';
    var furM   = new THREE.MeshLambertMaterial({color:0xD35400});
    var bellyM = new THREE.MeshLambertMaterial({color:0xF5CBA7});
    var darkM  = new THREE.MeshLambertMaterial({color:0x2C2C2C});
    var sbody  = new THREE.Mesh(new THREE.SphereGeometry(0.28,10,8), furM);
    sbody.position.y=0.38; sbody.scale.set(1,1.2,0.9); sbody.castShadow=true; g.add(sbody);
    var belly  = new THREE.Mesh(new THREE.SphereGeometry(0.18,8,6), bellyM);
    belly.position.set(0,0.38,0.16); belly.scale.set(0.7,0.9,0.5); g.add(belly);
    var shead  = new THREE.Mesh(new THREE.SphereGeometry(0.22,10,8), furM);
    shead.position.y=0.78; shead.castShadow=true; g.add(shead);
    [-0.1,0.1].forEach(function(x){
      var ear = new THREE.Mesh(new THREE.ConeGeometry(0.06,0.16,5), furM);
      ear.position.set(x,0.96,0); g.add(ear);
    });
    [-0.08,0.08].forEach(function(x){
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.04,6,5), darkM);
      eye.position.set(x,0.82,0.19); g.add(eye);
    });
    var tailBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.12,0.6,8), furM);
    tailBase.position.set(-0.18,0.55,0); tailBase.rotation.z=1.2; g.add(tailBase);
    var tailTip  = new THREE.Mesh(new THREE.SphereGeometry(0.18,10,8), furM);
    tailTip.position.set(-0.38,0.95,0); g.add(tailTip);
    [-0.1,0.1].forEach(function(z){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.04,0.28,6), furM);
      leg.position.set(0,0.08,z); g.add(leg);
    });
    return g;
  }

  // ── 青蛙 ─────────────────────────────────────────────────
  function makeFrog(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='frog';
    var greenM = new THREE.MeshLambertMaterial({color:0x1E8449});
    var lgreenM= new THREE.MeshLambertMaterial({color:0x27AE60});
    var bellyM = new THREE.MeshLambertMaterial({color:0xA9DFBF});
    var eyeM   = new THREE.MeshLambertMaterial({color:0xF0F000});
    var darkM  = new THREE.MeshLambertMaterial({color:0x1A1A1A});
    var fbody  = new THREE.Mesh(new THREE.SphereGeometry(0.35,12,10), greenM);
    fbody.position.y=0.3; fbody.scale.set(1.1,0.7,1.1); fbody.castShadow=true; g.add(fbody);
    var fbelly = new THREE.Mesh(new THREE.SphereGeometry(0.25,10,8), bellyM);
    fbelly.position.set(0,0.28,0.18); fbelly.scale.set(0.8,0.6,0.5); g.add(fbelly);
    var fhead  = new THREE.Mesh(new THREE.SphereGeometry(0.28,12,10), greenM);
    fhead.position.set(0,0.4,0.3); fhead.scale.set(1,0.75,0.9); g.add(fhead);
    [-0.16,0.16].forEach(function(x){
      var eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.1,10,8), lgreenM);
      eyeball.position.set(x,0.55,0.3); g.add(eyeball);
      var pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06,8,6), darkM);
      pupil.position.set(x,0.56,0.38); g.add(pupil);
      var eyehi = new THREE.Mesh(new THREE.SphereGeometry(0.03,6,5), eyeM);
      eyehi.position.set(x,0.58,0.42); g.add(eyehi);
    });
    [[-0.25,0.28],[0.25,0.28]].forEach(function(p){
      var thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.32,8), greenM);
      thigh.rotation.z=Math.PI/2; thigh.position.set(p[0]*0.5,0.14,p[1]); g.add(thigh);
      var shin  = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.28,8), greenM);
      shin.position.set(p[0],0.06,p[1]+0.1); g.add(shin);
    });
    [[-0.2,-0.25],[0.2,-0.25]].forEach(function(p){
      var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.22,8), greenM);
      arm.rotation.z=Math.PI/2; arm.position.set(p[0]*0.5,0.2,p[1]); g.add(arm);
    });
    return g;
  }

  // ── 小马 ─────────────────────────────────────────────────
  function makeHorse(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='horse';
    var furM   = new THREE.MeshLambertMaterial({color:0x935116});
    var maneM  = new THREE.MeshLambertMaterial({color:0x4A2A0A});
    var darkM  = new THREE.MeshLambertMaterial({color:0x2C2C2C});
    var hoofM  = new THREE.MeshLambertMaterial({color:0x1A1A1A});
    var hbody  = new THREE.Mesh(new THREE.BoxGeometry(1.1,0.6,0.62), furM);
    hbody.position.set(0,0.55,0); hbody.castShadow=true; g.add(hbody);
    var neck   = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.18,0.5,10), furM);
    neck.position.set(0.42,0.9,0); neck.rotation.z=-0.38; neck.castShadow=true; g.add(neck);
    var hhead  = new THREE.Mesh(new THREE.BoxGeometry(0.42,0.34,0.34), furM);
    hhead.position.set(0.7,1.18,0); hhead.castShadow=true; g.add(hhead);
    var hsnout = new THREE.Mesh(new THREE.BoxGeometry(0.2,0.22,0.28), furM);
    hsnout.position.set(0.93,1.1,0); g.add(hsnout);
    [-0.08,0.08].forEach(function(z){
      var nostril = new THREE.Mesh(new THREE.SphereGeometry(0.03,6,5), darkM);
      nostril.position.set(1.04,1.1,z); g.add(nostril);
    });
    [0,0.15,0.3].forEach(function(dx){
      var mane = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.25,0.06), maneM);
      mane.position.set(0.5-dx,1.12,0.15); mane.rotation.z=0.3; g.add(mane);
    });
    [-0.08,0.08].forEach(function(z){
      var ear = new THREE.Mesh(new THREE.ConeGeometry(0.06,0.16,5), furM);
      ear.position.set(0.62,1.38,z); g.add(ear);
    });
    [[-0.35,-0.22],[-0.35,0.22],[0.35,-0.22],[0.35,0.22]].forEach(function(p){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.07,0.55,8), furM);
      leg.position.set(p[0],0.1,p[1]); g.add(leg);
      var hoof= new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.08,0.1,8), hoofM);
      hoof.position.set(p[0],-0.18,p[1]); g.add(hoof);
    });
    var htail  = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.08,0.5,8), maneM);
    htail.position.set(-0.6,0.7,0); htail.rotation.z=0.8; g.add(htail);
    return g;
  }

  // ── 飞机 ─────────────────────────────────────────────────
  function makeAirplane(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='airplane';
    var bodyM  = new THREE.MeshLambertMaterial({color:0xDDE6F0});
    var wingM  = new THREE.MeshLambertMaterial({color:0xBDC9D8});
    var engineM= new THREE.MeshLambertMaterial({color:0x7F8C8D});
    var windowM= new THREE.MeshLambertMaterial({color:0x85C1E9,transparent:true,opacity:0.8});
    var tailM  = new THREE.MeshLambertMaterial({color:0x2980B9});
    var fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.12,1.8,12), bodyM);
    fuselage.rotation.z=Math.PI/2; fuselage.position.y=0.7; fuselage.castShadow=true; g.add(fuselage);
    var anose  = new THREE.Mesh(new THREE.ConeGeometry(0.16,0.3,12), bodyM);
    anose.rotation.z=-Math.PI/2; anose.position.set(1.05,0.7,0); g.add(anose);
    var wing   = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.04,1.6), wingM);
    wing.position.set(0,0.7,0); wing.castShadow=true; g.add(wing);
    var hTail  = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.04,0.7), wingM);
    hTail.position.set(-0.75,0.7,0); g.add(hTail);
    var vTail  = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.38,0.04), tailM);
    vTail.position.set(-0.72,0.9,0); g.add(vTail);
    [-0.55,0.55].forEach(function(z){
      var eng = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.38,10), engineM);
      eng.rotation.z=Math.PI/2; eng.position.set(0.05,0.6,z); g.add(eng);
    });
    for(var wi=0;wi<4;wi++){
      var win = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.07,0.1), windowM);
      win.position.set(0.5-wi*0.28,0.76,0.17); g.add(win);
    }
    return g;
  }

  // ── 沙袋 ─────────────────────────────────────────────────
  function makeSandbag(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='sandbag';
    var bagM   = new THREE.MeshLambertMaterial({color:0xA0872A});
    var ropeM  = new THREE.MeshLambertMaterial({color:0x7A5A18});
    var sbDefs = [[0,0.14,0,0.48,0.22,0.22],[0.18,0.36,-0.15,0.48,0.22,0.22],
                  [-0.18,0.36,0.12,0.48,0.22,0.22],[0,0.58,0,0.44,0.2,0.2],
                  [0.2,0.58,0,0.44,0.2,0.2],[-0.2,0.58,0,0.44,0.2,0.2],[0,0.8,0,0.5,0.2,0.2]];
    sbDefs.forEach(function(s){
      var bag = new THREE.Mesh(new THREE.BoxGeometry(s[3],s[4],s[5]), bagM);
      bag.position.set(s[0],s[1],s[2]); bag.castShadow=true; g.add(bag);
      var rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,s[5]+0.02,6), ropeM);
      rope.rotation.x=Math.PI/2; rope.position.set(s[0],s[1],s[2]); g.add(rope);
    });
    return g;
  }

  // ── 小花 ─────────────────────────────────────────────────
  function makeFlower(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='flower';
    var stemM  = new THREE.MeshLambertMaterial({color:0x27AE60});
    var petalM = new THREE.MeshLambertMaterial({color:0xF1948A});
    var petal2M= new THREE.MeshLambertMaterial({color:0xF8C8D4});
    var centerM= new THREE.MeshLambertMaterial({color:0xF4D03F});
    var leafM  = new THREE.MeshLambertMaterial({color:0x1E8449});
    var stem   = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,0.7,8), stemM);
    stem.position.y=0.35; stem.castShadow=true; g.add(stem);
    [-0.16,0.16].forEach(function(x){
      var leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14,8,6), leafM);
      leaf.position.set(x*2,0.32,0); leaf.scale.set(0.5,0.4,1.5); g.add(leaf);
    });
    for(var pi=0;pi<5;pi++){
      var angle = (pi/5)*Math.PI*2;
      var petal = new THREE.Mesh(new THREE.SphereGeometry(0.16,8,6), pi%2===0?petalM:petal2M);
      petal.position.set(Math.cos(angle)*0.22,0.72,Math.sin(angle)*0.22);
      petal.scale.set(0.7,0.4,0.7); g.add(petal);
    }
    var center = new THREE.Mesh(new THREE.SphereGeometry(0.12,10,8), centerM);
    center.position.y=0.75; g.add(center);
    return g;
  }

  // ── 河流 ─────────────────────────────────────────────────
  function makeRiver(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='river';
    var waterM = new THREE.MeshLambertMaterial({color:0x5DADE2,transparent:true,opacity:0.82});
    var bankM  = new THREE.MeshLambertMaterial({color:0xC8A96E});
    var foamM  = new THREE.MeshLambertMaterial({color:0xEAF6FF,transparent:true,opacity:0.6});
    var rbed   = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.06,0.7), waterM);
    rbed.position.y=0.03; g.add(rbed);
    [-0.4,0.4].forEach(function(z){
      var bank = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.1,0.18), bankM);
      bank.position.set(0,0.05,z); g.add(bank);
    });
    [-0.6,0,0.6].forEach(function(x){
      var foam = new THREE.Mesh(new THREE.BoxGeometry(0.4,0.02,0.48), foamM);
      foam.position.set(x,0.07,0); g.add(foam);
    });
    [-1.05,1.05].forEach(function(x){
      var cap = new THREE.Mesh(new THREE.SphereGeometry(0.35,10,6), waterM);
      cap.position.set(x,0.03,0); cap.scale.set(0.5,0.3,1); g.add(cap);
    });
    return g;
  }

  // ── 湖泊 ─────────────────────────────────────────────────
  function makeLake(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='lake';
    var waterM = new THREE.MeshLambertMaterial({color:0x2980B9,transparent:true,opacity:0.85});
    var bankM  = new THREE.MeshLambertMaterial({color:0xC8A96E});
    var foamM  = new THREE.MeshLambertMaterial({color:0xD6EAF8,transparent:true,opacity:0.55});
    var reedM  = new THREE.MeshLambertMaterial({color:0x7D9E6A});
    var lakeM  = new THREE.Mesh(new THREE.SphereGeometry(0.85,16,10), waterM);
    lakeM.position.y=0.04; lakeM.scale.set(1,0.12,0.75); g.add(lakeM);
    var shore  = new THREE.Mesh(new THREE.SphereGeometry(0.95,14,8), bankM);
    shore.position.y=0.02; shore.scale.set(1,0.08,0.78); g.add(shore);
    [[-0.3,0.1],[0.3,-0.1],[0,-0.2]].forEach(function(p){
      var ripple = new THREE.Mesh(new THREE.SphereGeometry(0.18,8,4), foamM);
      ripple.position.set(p[0],0.06,p[1]); ripple.scale.set(1,0.1,0.8); g.add(ripple);
    });
    [[-0.65,0.4],[0.6,0.38],[-0.6,-0.35]].forEach(function(p){
      var reed = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.45,6), reedM);
      reed.position.set(p[0],0.22,p[1]); g.add(reed);
      var rtop = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.02,0.12,6), new THREE.MeshLambertMaterial({color:0x8B6914}));
      rtop.position.set(p[0],0.48,p[1]); g.add(rtop);
    });
    return g;
  }

  // ── 寺庙 ─────────────────────────────────────────────────
  function makeTemple(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='temple';
    var wallM  = new THREE.MeshLambertMaterial({color:0xFAE5D3});
    var roofM  = new THREE.MeshLambertMaterial({color:0xC0392B});
    var colM   = new THREE.MeshLambertMaterial({color:0xE8C9A0});
    var goldM  = new THREE.MeshLambertMaterial({color:0xD4AC0D});
    var darkM  = new THREE.MeshLambertMaterial({color:0x5D2E0A});
    var tbase  = new THREE.Mesh(new THREE.BoxGeometry(2.0,0.2,1.4), colM);
    tbase.position.y=0.1; g.add(tbase);
    var tbase2 = new THREE.Mesh(new THREE.BoxGeometry(1.8,0.18,1.2), colM);
    tbase2.position.y=0.29; g.add(tbase2);
    var thall  = new THREE.Mesh(new THREE.BoxGeometry(1.5,0.9,1.0), wallM);
    thall.position.y=0.83; thall.castShadow=true; g.add(thall);
    [0,0.5].forEach(function(dy){
      var eave = new THREE.Mesh(new THREE.BoxGeometry(1.85,0.1,1.35), roofM);
      eave.position.y=1.38+dy; g.add(eave);
      [[0.92,0.67],[0.92,-0.67],[-0.92,0.67],[-0.92,-0.67]].forEach(function(p){
        var tip = new THREE.Mesh(new THREE.ConeGeometry(0.07,0.22,4), roofM);
        tip.position.set(p[0],1.46+dy,p[1]);
        tip.rotation.z=p[0]>0?0.7:-0.7;
        tip.rotation.x=p[1]>0?0.4:-0.4;
        g.add(tip);
      });
    });
    var ridge  = new THREE.Mesh(new THREE.BoxGeometry(1.6,0.1,0.08), roofM);
    ridge.position.y=1.88; g.add(ridge);
    [-0.82,0.82].forEach(function(x){
      var chi = new THREE.Mesh(new THREE.SphereGeometry(0.1,8,6), goldM);
      chi.position.set(x,1.94,0); g.add(chi);
    });
    [-0.6,0,0.6].forEach(function(x){
      [-0.52,0.52].forEach(function(z){
        var col = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.92,8), colM);
        col.position.set(x,0.84,z); g.add(col);
      });
    });
    var tdoor  = new THREE.Mesh(new THREE.BoxGeometry(0.42,0.6,0.06), darkM);
    tdoor.position.set(0,0.68,0.53); g.add(tdoor);
    [[0.1,0.8],[0.1,0.68],[0.1,0.56],[-0.1,0.8],[-0.1,0.68],[-0.1,0.56]].forEach(function(p){
      var nail = new THREE.Mesh(new THREE.SphereGeometry(0.025,6,5), goldM);
      nail.position.set(p[0],p[1],0.56); g.add(nail);
    });
    var orb    = new THREE.Mesh(new THREE.SphereGeometry(0.1,10,8), goldM);
    orb.position.y=2.0; g.add(orb);
    return g;
  }

  // ── 课桌 ─────────────────────────────────────────────────
  function makeDesk(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='desk';
    var topM   = new THREE.MeshLambertMaterial({color:0xC8A46A});
    var legM   = new THREE.MeshLambertMaterial({color:0xA0784A});
    var top    = new THREE.Mesh(new THREE.BoxGeometry(0.75,0.06,0.5), topM);
    top.position.y=0.5; top.castShadow=true; g.add(top);
    // 四条腿
    [[-0.32,-0.22],[0.32,-0.22],[-0.32,0.22],[0.32,0.22]].forEach(function(p){
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.5,0.06), legM);
      leg.position.set(p[0],0.25,p[1]); g.add(leg);
    });
    // 抽屉
    var drawer = new THREE.Mesh(new THREE.BoxGeometry(0.62,0.14,0.4), topM);
    drawer.position.set(0,0.36,0); g.add(drawer);
    var handle = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.04,0.04), legM);
    handle.position.set(0,0.36,0.22); g.add(handle);
    // 书架横板
    var shelf  = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.04,0.35), topM);
    shelf.position.set(0,0.18,0.05); g.add(shelf);
    return g;
  }

  // ── 书包 ─────────────────────────────────────────────────
  function makeSchoolbag(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='schoolbag';
    var bagM   = new THREE.MeshLambertMaterial({color:0x2471A3});
    var zipM   = new THREE.MeshLambertMaterial({color:0x1A5276});
    var pocketM= new THREE.MeshLambertMaterial({color:0x1F618D});
    var strapM = new THREE.MeshLambertMaterial({color:0x154360});
    // 主体
    var body   = new THREE.Mesh(new THREE.BoxGeometry(0.48,0.6,0.2), bagM);
    body.position.y=0.3; body.castShadow=true; g.add(body);
    // 顶部圆弧
    var top    = new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.24,0.2,12,1,false,0,Math.PI), bagM);
    top.rotation.x=Math.PI/2; top.position.set(0,0.6,0); g.add(top);
    // 正面口袋
    var pocket = new THREE.Mesh(new THREE.BoxGeometry(0.38,0.22,0.05), pocketM);
    pocket.position.set(0,0.2,0.13); g.add(pocket);
    // 拉链线
    var zip    = new THREE.Mesh(new THREE.BoxGeometry(0.36,0.03,0.04), zipM);
    zip.position.set(0,0.32,0.13); g.add(zip);
    // 背带
    [-0.12,0.12].forEach(function(x){
      var strap = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.55,0.04), strapM);
      strap.position.set(x,0.3,-0.12); g.add(strap);
    });
    return g;
  }

  // ── 书本堆 ───────────────────────────────────────────────
  function makeBooks(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='books';
    var colors=[0xE74C3C,0x3498DB,0x2ECC71,0xF39C12,0x9B59B6];
    for(var i=0;i<5;i++){
      var bM  = new THREE.MeshLambertMaterial({color:colors[i]});
      var rot = (Math.random()-0.5)*0.18;
      var bk  = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.06,0.3+Math.random()*0.06), bM);
      bk.position.y = 0.03+i*0.065;
      bk.rotation.y = rot;
      bk.castShadow=true; g.add(bk);
      // 书脊细节
      var spineM = new THREE.MeshLambertMaterial({color:0xFFFFFF});
      var spine  = new THREE.Mesh(new THREE.BoxGeometry(0.02,0.055,0.28), spineM);
      spine.position.set(-0.11,0.03+i*0.065,0); spine.rotation.y=rot; g.add(spine);
    }
    return g;
  }

  // ── 舞台 ─────────────────────────────────────────────────
  function makeStage(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='stage';
    var stageM = new THREE.MeshLambertMaterial({color:0x5D2E0A});
    var curtainM=new THREE.MeshLambertMaterial({color:0x922B21});
    var lightM = new THREE.MeshLambertMaterial({color:0xFFF3A3});
    var frameM = new THREE.MeshLambertMaterial({color:0x2E4057});
    // 台面
    var floor  = new THREE.Mesh(new THREE.BoxGeometry(1.4,0.1,0.85), stageM);
    floor.position.y=0.05; floor.castShadow=true; g.add(floor);
    // 台阶
    var step   = new THREE.Mesh(new THREE.BoxGeometry(1.2,0.06,0.18), stageM);
    step.position.set(0,0.03,0.52); g.add(step);
    // 两侧幕布
    [-0.72,0.72].forEach(function(x){
      var curtain = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.85,0.04), curtainM);
      curtain.position.set(x,0.55,0.08); g.add(curtain);
    });
    // 背景帷幕
    var bgCurtain = new THREE.Mesh(new THREE.BoxGeometry(1.44,0.9,0.04), new THREE.MeshLambertMaterial({color:0x641E16}));
    bgCurtain.position.set(0,0.55,-0.43); g.add(bgCurtain);
    // 舞台灯框
    var beam   = new THREE.Mesh(new THREE.BoxGeometry(1.5,0.06,0.06), frameM);
    beam.position.set(0,1.0,0); g.add(beam);
    // 灯泡
    [-0.55,-0.22,0.22,0.55].forEach(function(x){
      var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07,8,6), lightM);
      lamp.position.set(x,0.93,0); g.add(lamp);
    });
    // 立柱
    [-0.74,0.74].forEach(function(x){
      var col = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,1.0,8), frameM);
      col.position.set(x,0.6,0); g.add(col);
    });
    return g;
  }

  // ── 沙发 ─────────────────────────────────────────────────
  function makeSofa(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='sofa';
    var fabM   = new THREE.MeshLambertMaterial({color:0x7B6247});
    var legM   = new THREE.MeshLambertMaterial({color:0x5A3A1A});
    var cushM  = new THREE.MeshLambertMaterial({color:0x8D7055});
    // 底座
    var base   = new THREE.Mesh(new THREE.BoxGeometry(1.0,0.26,0.48), fabM);
    base.position.y=0.13; base.castShadow=true; g.add(base);
    // 靠背
    var back   = new THREE.Mesh(new THREE.BoxGeometry(1.0,0.38,0.1), fabM);
    back.position.set(0,0.45,-0.19); back.castShadow=true; g.add(back);
    // 扶手
    [-0.5,0.5].forEach(function(x){
      var arm  = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.38,0.48), fabM);
      arm.position.set(x,0.32,0); g.add(arm);
    });
    // 坐垫
    [-0.22,0.22].forEach(function(x){
      var cush = new THREE.Mesh(new THREE.BoxGeometry(0.38,0.1,0.4), cushM);
      cush.position.set(x,0.31,0.04); g.add(cush);
    });
    // 腿
    [[-0.44,-0.2],[0.44,-0.2],[-0.44,0.2],[0.44,0.2]].forEach(function(p){
      var leg  = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.1,0.06), legM);
      leg.position.set(p[0],0.05,p[1]); g.add(leg);
    });
    return g;
  }

  // ── 货架 ─────────────────────────────────────────────────
  function makeShelf(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='shelf';
    var frameM = new THREE.MeshLambertMaterial({color:0x7F8C8D});
    var boardM = new THREE.MeshLambertMaterial({color:0xAAB7B8});
    var goodsColors=[0xE74C3C,0xF39C12,0x27AE60,0x3498DB,0x9B59B6,0xE67E22];
    // 竖框
    [-0.38,0.38].forEach(function(x){
      var col = new THREE.Mesh(new THREE.BoxGeometry(0.05,1.0,0.28), frameM);
      col.position.set(x,0.5,0); g.add(col);
    });
    // 三层横板
    [0.18,0.48,0.78,1.0].forEach(function(y){
      var board = new THREE.Mesh(new THREE.BoxGeometry(0.82,0.04,0.28), boardM);
      board.position.y=y; g.add(board);
    });
    // 货物小块
    var gi=0;
    [0.22,0.52,0.82].forEach(function(y){
      for(var xi=-0.25;xi<=0.26;xi+=0.18){
        var gM = new THREE.MeshLambertMaterial({color:goodsColors[gi%goodsColors.length]});
        var good = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.1,0.14), gM);
        good.position.set(xi,y+0.09,0); g.add(good); gi++;
      }
    });
    return g;
  }

  // ── 法院 ─────────────────────────────────────────────────
  function makeCourt(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='court';
    var wallM  = new THREE.MeshLambertMaterial({color:0xECECEC});
    var roofM  = new THREE.MeshLambertMaterial({color:0xD4AC0D});
    var colM   = new THREE.MeshLambertMaterial({color:0xDDD5C5});
    var emblemM= new THREE.MeshLambertMaterial({color:0xD4AC0D});
    var winM   = new THREE.MeshLambertMaterial({color:0xAED6F1,transparent:true,opacity:0.75});
    // 主楼
    var main   = new THREE.Mesh(new THREE.BoxGeometry(1.9,1.1,1.0), wallM);
    main.position.y=0.55; main.castShadow=true; g.add(main);
    // 屋顶檐口
    var eave   = new THREE.Mesh(new THREE.BoxGeometry(2.0,0.12,1.1), roofM);
    eave.position.y=1.16; g.add(eave);
    // 三角山墙
    var pediment = new THREE.Mesh(new THREE.CylinderGeometry(0,1.08,0.42,4), roofM);
    pediment.position.y=1.47; pediment.rotation.y=Math.PI/4; g.add(pediment);
    // 柱廊
    [-0.7,-0.35,0,0.35,0.7].forEach(function(x){
      var col = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,1.1,10), colM);
      col.position.set(x,0.55,0.54); g.add(col);
    });
    // 台阶
    [[2.0,0.09,1.1,0.045],[1.8,0.09,1.0,0.1]].forEach(function(s){
      var step = new THREE.Mesh(new THREE.BoxGeometry(s[0],s[1],s[2]), colM);
      step.position.set(0,s[3],0); g.add(step);
    });
    // 天平徽章
    var emblem = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.18,0.04,16), emblemM);
    emblem.rotation.x=Math.PI/2; emblem.position.set(0,0.95,0.54); g.add(emblem);
    // 大门
    var door   = new THREE.Mesh(new THREE.BoxGeometry(0.42,0.6,0.05), winM);
    door.position.set(0,0.3,0.53); g.add(door);
    // 国旗杆
    var pole   = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,1.2,8), colM);
    pole.position.set(0,2.05,0); g.add(pole);
    var flag   = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.2,0.02), new THREE.MeshLambertMaterial({color:0xE74C3C}));
    flag.position.set(0.17,2.58,0); g.add(flag);
    return g;
  }

  // ── 检察院 ───────────────────────────────────────────────
  function makeProcuratorate(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='procuratorate';
    var wallM  = new THREE.MeshLambertMaterial({color:0xF0EEE8});
    var roofM  = new THREE.MeshLambertMaterial({color:0x2E4057});
    var colM   = new THREE.MeshLambertMaterial({color:0xDDD8D0});
    var emblemM= new THREE.MeshLambertMaterial({color:0xC8A400});
    var winM   = new THREE.MeshLambertMaterial({color:0xAED6F1,transparent:true,opacity:0.75});
    var main   = new THREE.Mesh(new THREE.BoxGeometry(1.7,1.0,0.9), wallM);
    main.position.y=0.5; main.castShadow=true; g.add(main);
    // 深蓝色腰线
    var belt   = new THREE.Mesh(new THREE.BoxGeometry(1.72,0.1,0.92), roofM);
    belt.position.y=0.95; g.add(belt);
    // 平顶+栏杆
    var rooftop= new THREE.Mesh(new THREE.BoxGeometry(1.78,0.12,0.96), roofM);
    rooftop.position.y=1.06; g.add(rooftop);
    // 柱廊
    [-0.6,-0.3,0,0.3,0.6].forEach(function(x){
      var col = new THREE.Mesh(new THREE.CylinderGeometry(0.065,0.065,1.0,10), colM);
      col.position.set(x,0.5,0.5); g.add(col);
    });
    // 徽章
    var emblem = new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.17,0.04,16), emblemM);
    emblem.rotation.x=Math.PI/2; emblem.position.set(0,0.85,0.5); g.add(emblem);
    // 台阶
    var step   = new THREE.Mesh(new THREE.BoxGeometry(1.9,0.1,0.38), colM);
    step.position.set(0,0.05,0.64); g.add(step);
    // 大门
    var door   = new THREE.Mesh(new THREE.BoxGeometry(0.38,0.58,0.05), winM);
    door.position.set(0,0.29,0.48); g.add(door);
    return g;
  }

  // ── 铁笼 ─────────────────────────────────────────────────
  function makeCage(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='cage';
    var barM   = new THREE.MeshLambertMaterial({color:0x5D6D7E});
    var topM   = new THREE.MeshLambertMaterial({color:0x4A5568});
    // 底座
    var base   = new THREE.Mesh(new THREE.BoxGeometry(0.7,0.06,0.5), topM);
    base.position.y=0.03; g.add(base);
    // 顶盖
    var top    = new THREE.Mesh(new THREE.BoxGeometry(0.7,0.06,0.5), topM);
    top.position.y=0.66; g.add(top);
    // 竖栏杆 前后
    [-0.5,0.5].forEach(function(z){
      for(var xi=-0.28;xi<=0.29;xi+=0.14){
        var bar= new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.6,8), barM);
        bar.position.set(xi,0.36,z); g.add(bar);
      }
    });
    // 竖栏杆 两侧
    [-0.28,0.28].forEach(function(x){
      for(var zi=-0.36;zi<=0.37;zi+=0.18){
        var bar= new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.6,8), barM);
        bar.position.set(x,0.36,zi); g.add(bar);
      }
    });
    // 锁扣
    var lock   = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.1,0.04), new THREE.MeshLambertMaterial({color:0xB7770D}));
    lock.position.set(0,0.36,0.52); g.add(lock);
    return g;
  }

  // ── 监狱 ─────────────────────────────────────────────────
  function makePrison(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='prison';
    var wallM  = new THREE.MeshLambertMaterial({color:0x7F8C8D});
    var roofM  = new THREE.MeshLambertMaterial({color:0x4A4A4A});
    var barM   = new THREE.MeshLambertMaterial({color:0x566573});
    var towerM = new THREE.MeshLambertMaterial({color:0x616A6B});
    // 主楼
    var main   = new THREE.Mesh(new THREE.BoxGeometry(1.6,0.8,0.9), wallM);
    main.position.y=0.4; main.castShadow=true; g.add(main);
    var rooftop= new THREE.Mesh(new THREE.BoxGeometry(1.65,0.1,0.95), roofM);
    rooftop.position.y=0.85; g.add(rooftop);
    // 四角瞭望塔
    [[-0.82,-0.47],[0.82,-0.47],[-0.82,0.47],[0.82,0.47]].forEach(function(p){
      var tower= new THREE.Mesh(new THREE.BoxGeometry(0.22,1.05,0.22), towerM);
      tower.position.set(p[0],0.52,p[1]); g.add(tower);
      var tcap = new THREE.Mesh(new THREE.CylinderGeometry(0,0.14,0.22,4), roofM);
      tcap.position.set(p[0],1.16,p[1]); tcap.rotation.y=Math.PI/4; g.add(tcap);
    });
    // 正门铁栏
    for(var bi=-0.22;bi<=0.23;bi+=0.11){
      var bar= new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.5,8), barM);
      bar.position.set(bi,0.35,0.46); g.add(bar);
    }
    // 围墙
    var fence  = new THREE.Mesh(new THREE.BoxGeometry(1.7,0.25,0.05), roofM);
    fence.position.set(0,0.12,0.52); g.add(fence);
    return g;
  }

  // ── 派出所 ───────────────────────────────────────────────
  function makePolicestation(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='policestation';
    var wallM  = new THREE.MeshLambertMaterial({color:0xD6EAF8});
    var blueM  = new THREE.MeshLambertMaterial({color:0x1A5276});
    var emblemM= new THREE.MeshLambertMaterial({color:0xD4AC0D});
    var winM   = new THREE.MeshLambertMaterial({color:0xAED6F1,transparent:true,opacity:0.75});
    var lightM = new THREE.MeshLambertMaterial({color:0xFF4444});
    // 主楼
    var main   = new THREE.Mesh(new THREE.BoxGeometry(1.3,0.9,0.85), wallM);
    main.position.y=0.45; main.castShadow=true; g.add(main);
    // 蓝色腰带
    var belt   = new THREE.Mesh(new THREE.BoxGeometry(1.32,0.15,0.87), blueM);
    belt.position.y=0.82; g.add(belt);
    var rooftop= new THREE.Mesh(new THREE.BoxGeometry(1.36,0.1,0.9), blueM);
    rooftop.position.y=0.95; g.add(rooftop);
    // 警徽
    var emblem = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.04,16), emblemM);
    emblem.rotation.x=Math.PI/2; emblem.position.set(0,0.6,0.44); g.add(emblem);
    // 警灯（红）
    var lamp   = new THREE.Mesh(new THREE.SphereGeometry(0.07,8,6), lightM);
    lamp.position.set(0,1.08,0); g.add(lamp);
    var lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.2,6), blueM);
    lampPost.position.set(0,0.98,0); g.add(lampPost);
    // 大门
    var door   = new THREE.Mesh(new THREE.BoxGeometry(0.38,0.52,0.05), winM);
    door.position.set(0,0.26,0.44); g.add(door);
    // 台阶
    var step   = new THREE.Mesh(new THREE.BoxGeometry(1.4,0.08,0.22), wallM);
    step.position.set(0,0.04,0.54); g.add(step);
    return g;
  }

  // ── 心理救助中心 ─────────────────────────────────────────
  function makeMentalcenter(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='mentalcenter';
    var wallM  = new THREE.MeshLambertMaterial({color:0xFEF9F0});
    var greenM = new THREE.MeshLambertMaterial({color:0x1E8449});
    var winM   = new THREE.MeshLambertMaterial({color:0xA9CCE3,transparent:true,opacity:0.8});
    var signM  = new THREE.MeshLambertMaterial({color:0x1E8449});
    var flowerM= new THREE.MeshLambertMaterial({color:0xF1948A});
    // 主楼（圆角感用多BOX堆叠）
    var main   = new THREE.Mesh(new THREE.BoxGeometry(1.3,0.85,0.85), wallM);
    main.position.y=0.42; main.castShadow=true; g.add(main);
    // 绿色屋顶条
    var roofBand = new THREE.Mesh(new THREE.BoxGeometry(1.36,0.14,0.91), greenM);
    roofBand.position.y=0.91; g.add(roofBand);
    // 绿十字标志
    var crossH = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.08,0.05), signM);
    crossH.position.set(0,0.62,0.44); g.add(crossH);
    var crossV = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.28,0.05), signM);
    crossV.position.set(0,0.62,0.44); g.add(crossV);
    // 圆圈
    var circle = new THREE.Mesh(new THREE.TorusGeometry(0.18,0.04,8,16), signM);
    circle.rotation.x=Math.PI/2; circle.position.set(0,0.62,0.44); g.add(circle);
    // 窗户
    [[-0.38,0.56],[0.38,0.56],[-0.38,0.3],[0.38,0.3]].forEach(function(p){
      var w = new THREE.Mesh(new THREE.BoxGeometry(0.24,0.2,0.05), winM);
      w.position.set(p[0],p[1],0.44); g.add(w);
    });
    // 入口花坛
    [-0.28,0.28].forEach(function(x){
      var pot  = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.12,0.12,8), new THREE.MeshLambertMaterial({color:0xCA6F1E}));
      pot.position.set(x,0.06,0.5); g.add(pot);
      var bush = new THREE.Mesh(new THREE.SphereGeometry(0.13,8,6), greenM);
      bush.position.set(x,0.2,0.5); g.add(bush);
      var fl   = new THREE.Mesh(new THREE.SphereGeometry(0.06,6,5), flowerM);
      fl.position.set(x,0.28,0.5); g.add(fl);
    });
    return g;
  }

  // ── 浴室隔断墙 ───────────────────────────────────────────
  function makeBathroomwall(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='bathroomwall';
    var wallM  = new THREE.MeshLambertMaterial({color:0xECF0F1});
    var tileM  = new THREE.MeshLambertMaterial({color:0xAED6F1,transparent:true,opacity:0.85});
    var frameM = new THREE.MeshLambertMaterial({color:0xBDC3C7});
    var doorM  = new THREE.MeshLambertMaterial({color:0xD6EAF8,transparent:true,opacity:0.7});
    // 左隔断
    var leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.06,1.1,0.5), wallM);
    leftWall.position.set(-0.65,0.55,0); g.add(leftWall);
    // 右隔断
    var rightWall= new THREE.Mesh(new THREE.BoxGeometry(0.06,1.1,0.5), wallM);
    rightWall.position.set(0.65,0.55,0); g.add(rightWall);
    // 玻璃门
    var door   = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.95,0.05), doorM);
    door.position.set(0.38,0.47,0.25); g.add(door);
    // 门框
    var frameTop = new THREE.Mesh(new THREE.BoxGeometry(0.56,0.06,0.06), frameM);
    frameTop.position.set(0.38,0.97,0.25); g.add(frameTop);
    // 瓷砖纹理（小方块模拟）
    for(var row=0;row<5;row++){
      for(var col=0;col<2;col++){
        var tile = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.16,0.04), tileM);
        tile.position.set(-0.62,-0.1+row*0.22,-0.18+col*0.22); g.add(tile);
      }
    }
    // 顶横梁
    var beam   = new THREE.Mesh(new THREE.BoxGeometry(1.38,0.07,0.06), frameM);
    beam.position.set(0,1.13,0); g.add(beam);
    return g;
  }

  // ── 古代拱桥 ─────────────────────────────────────────────
  function makeBridge(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='bridge';
    var stoneM = new THREE.MeshLambertMaterial({color:0x7B6247});
    var darkStone= new THREE.MeshLambertMaterial({color:0x5D4A32});
    var railM  = new THREE.MeshLambertMaterial({color:0x9B8060});
    // 拱桥主体（半圆柱近似）
    var archGeo = new THREE.CylinderGeometry(0.42,0.45,1.2,16,1,false,0,Math.PI);
    var arch    = new THREE.Mesh(archGeo, stoneM);
    arch.rotation.z=Math.PI/2; arch.position.set(0,0.42,0); arch.castShadow=true; g.add(arch);
    // 桥面
    var deck    = new THREE.Mesh(new THREE.BoxGeometry(1.3,0.1,0.8), stoneM);
    deck.position.y=0.85; g.add(deck);
    // 两端引桥
    [-0.62,0.62].forEach(function(x){
      var ramp = new THREE.Mesh(new THREE.BoxGeometry(0.35,0.18,0.8), stoneM);
      ramp.position.set(x,0.45,0); ramp.rotation.z= x>0 ? -0.4 : 0.4; g.add(ramp);
    });
    // 拱心石
    var keystone = new THREE.Mesh(new THREE.BoxGeometry(0.14,0.12,0.82), darkStone);
    keystone.position.y=0.84; g.add(keystone);
    // 护栏
    [-0.38,0.38].forEach(function(z){
      var rail = new THREE.Mesh(new THREE.BoxGeometry(1.2,0.06,0.05), railM);
      rail.position.set(0,0.98,z); g.add(rail);
      // 望柱
      [-0.5,-0.25,0,0.25,0.5].forEach(function(x){
        var post = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.22,8), darkStone);
        post.position.set(x,0.98,z); g.add(post);
      });
    });
    return g;
  }

  // ── 镜子 ─────────────────────────────────────────────────
  function makeMirror(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='mirror';
    var frameM = new THREE.MeshLambertMaterial({color:0xD4AC0D});
    var glassM = new THREE.MeshLambertMaterial({color:0xD6EAF8,transparent:true,opacity:0.85});
    var baseM  = new THREE.MeshLambertMaterial({color:0xB7950B});
    // 镜框
    var outerFrame = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.8,0.06), frameM);
    outerFrame.position.y=0.7; outerFrame.castShadow=true; g.add(outerFrame);
    // 镜面
    var glass  = new THREE.Mesh(new THREE.BoxGeometry(0.44,0.68,0.04), glassM);
    glass.position.set(0,0.7,0.02); g.add(glass);
    // 底座
    var base   = new THREE.Mesh(new THREE.BoxGeometry(0.38,0.08,0.22), baseM);
    base.position.set(0,0.04,0); g.add(base);
    // 支撑杆
    var pole   = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.03,0.36,8), frameM);
    pole.position.set(0,0.22,0); g.add(pole);
    // 装饰线
    var decTop = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.55,8), frameM);
    decTop.rotation.z=Math.PI/2; decTop.position.set(0,1.1,0.02); g.add(decTop);
    return g;
  }

  // ── 浴缸 ─────────────────────────────────────────────────
  function makeBathtub(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='bathtub';
    var tubM   = new THREE.MeshLambertMaterial({color:0xF0F0F0});
    var innerM = new THREE.MeshLambertMaterial({color:0xD6EAF8,transparent:true,opacity:0.85});
    var metalM = new THREE.MeshLambertMaterial({color:0xBDC3C7});
    var waterM = new THREE.MeshLambertMaterial({color:0x85C1E9,transparent:true,opacity:0.7});
    // 外壳
    var outer  = new THREE.Mesh(new THREE.BoxGeometry(0.8,0.35,0.45), tubM);
    outer.position.y=0.17; outer.castShadow=true; g.add(outer);
    // 浴缸内槽（向内凹）
    var inner  = new THREE.Mesh(new THREE.BoxGeometry(0.66,0.26,0.32), innerM);
    inner.position.set(0,0.28,0); g.add(inner);
    // 水面
    var water  = new THREE.Mesh(new THREE.BoxGeometry(0.62,0.04,0.28), waterM);
    water.position.set(0,0.4,0); g.add(water);
    // 四脚
    [[-0.34,-0.18],[0.34,-0.18],[-0.34,0.18],[0.34,0.18]].forEach(function(p){
      var foot = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,0.12,8), metalM);
      foot.position.set(p[0],0.06,p[1]); g.add(foot);
    });
    // 水龙头
    var faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.18,8), metalM);
    faucet.rotation.z=Math.PI/2; faucet.position.set(-0.32,0.44,0); g.add(faucet);
    var fHead  = new THREE.Mesh(new THREE.SphereGeometry(0.05,8,6), metalM);
    fHead.position.set(-0.42,0.44,0); g.add(fHead);
    return g;
  }

  // ── 小船 ─────────────────────────────────────────────────
  function makeBoat(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='boat';
    var hullM  = new THREE.MeshLambertMaterial({color:0xC8A46A});
    var sailM  = new THREE.MeshLambertMaterial({color:0xF8F8F0,transparent:true,opacity:0.9});
    var mastM  = new THREE.MeshLambertMaterial({color:0x7B6247});
    var deckM  = new THREE.MeshLambertMaterial({color:0xA0784A});
    // 船身（用CylinderGeometry近似船形）
    var hullGeo = new THREE.CylinderGeometry(0.22,0.3,0.9,8,1,false,0,Math.PI);
    var hull    = new THREE.Mesh(hullGeo, hullM);
    hull.rotation.x=Math.PI; hull.position.y=0.22; hull.castShadow=true; g.add(hull);
    // 船底
    var bottom  = new THREE.Mesh(new THREE.BoxGeometry(0.88,0.08,0.55), hullM);
    bottom.position.y=0.04; g.add(bottom);
    // 甲板
    var deck    = new THREE.Mesh(new THREE.BoxGeometry(0.78,0.06,0.44), deckM);
    deck.position.y=0.3; g.add(deck);
    // 桅杆
    var mast    = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.03,0.85,8), mastM);
    mast.position.set(-0.05,0.75,0); g.add(mast);
    // 帆
    var sail    = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.6,0.04), sailM);
    sail.position.set(0.18,0.9,0); g.add(sail);
    // 帆横杆
    var yard    = new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,0.6,8), mastM);
    yard.rotation.z=Math.PI/2; yard.position.set(0.18,1.16,0); g.add(yard);
    return g;
  }

  // ── 雨伞 ─────────────────────────────────────────────────
  function makeUmbrella(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='umbrella';
    var canopyM= new THREE.MeshLambertMaterial({color:0x9B59B6,side:THREE.DoubleSide});
    var poleM  = new THREE.MeshLambertMaterial({color:0x4A235A});
    var tipM   = new THREE.MeshLambertMaterial({color:0xD7BDE2});
    // 伞盖（锥形）
    var canopy = new THREE.Mesh(new THREE.ConeGeometry(0.5,0.3,12), canopyM);
    canopy.position.y=0.82; canopy.castShadow=true; g.add(canopy);
    // 顶尖
    var top    = new THREE.Mesh(new THREE.SphereGeometry(0.04,6,5), tipM);
    top.position.y=0.97; g.add(top);
    // 伞脊
    for(var ri=0;ri<8;ri++){
      var ang = (ri/8)*Math.PI*2;
      var rib = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.52,6), poleM);
      rib.position.set(Math.cos(ang)*0.22,0.74,Math.sin(ang)*0.22);
      rib.rotation.z = Math.PI*0.18; rib.rotation.y=ang; g.add(rib);
    }
    // 伞柄
    var pole   = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.75,8), poleM);
    pole.position.y=0.37; g.add(pole);
    // 弯钩
    var hook   = new THREE.Mesh(new THREE.TorusGeometry(0.07,0.02,8,12,Math.PI), poleM);
    hook.position.set(0.07,0.02,0); hook.rotation.z=Math.PI/2; g.add(hook);
    return g;
  }

  // ── 剪刀 ─────────────────────────────────────────────────
  function makeScissors(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='scissors';
    var bladeM = new THREE.MeshLambertMaterial({color:0x7F8C8D});
    var handleM= new THREE.MeshLambertMaterial({color:0xD0D3D4});
    var pivotM = new THREE.MeshLambertMaterial({color:0xB7770D});
    // 刀刃A
    var bladeA = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.5,0.04), bladeM);
    bladeA.position.set(-0.04,0.45,0); bladeA.rotation.z=0.22; bladeA.castShadow=true; g.add(bladeA);
    // 刀刃B
    var bladeB = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.5,0.04), bladeM);
    bladeB.position.set(0.04,0.45,0); bladeB.rotation.z=-0.22; g.add(bladeB);
    // 圆环把手A
    var ringA  = new THREE.Mesh(new THREE.TorusGeometry(0.1,0.025,8,14), handleM);
    ringA.position.set(-0.14,0.1,0); g.add(ringA);
    // 圆环把手B
    var ringB  = new THREE.Mesh(new THREE.TorusGeometry(0.1,0.025,8,14), handleM);
    ringB.position.set(0.14,0.1,0); g.add(ringB);
    // 中间枢轴
    var pivot  = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.06,10), pivotM);
    pivot.rotation.x=Math.PI/2; pivot.position.set(0,0.35,0); g.add(pivot);
    return g;
  }

  // ── 椅子 ─────────────────────────────────────────────────
  function makeChair(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='chair';
    var woodM  = new THREE.MeshLambertMaterial({color:0xB7770D});
    var padM   = new THREE.MeshLambertMaterial({color:0x7B6247});
    // 座面
    var seat   = new THREE.Mesh(new THREE.BoxGeometry(0.42,0.05,0.4), woodM);
    seat.position.y=0.42; seat.castShadow=true; g.add(seat);
    // 靠背
    var back   = new THREE.Mesh(new THREE.BoxGeometry(0.42,0.38,0.05), woodM);
    back.position.set(0,0.68,-0.17); g.add(back);
    // 靠背横条
    [0.55,0.72,0.89].forEach(function(y){
      var bar = new THREE.Mesh(new THREE.BoxGeometry(0.36,0.04,0.04), padM);
      bar.position.set(0,y,-0.17); g.add(bar);
    });
    // 四条腿
    [[-0.16,-0.16],[0.16,-0.16],[-0.16,0.16],[0.16,0.16]].forEach(function(p){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.42,8), woodM);
      leg.position.set(p[0],0.21,p[1]); g.add(leg);
    });
    // 坐垫
    var pad    = new THREE.Mesh(new THREE.BoxGeometry(0.36,0.04,0.34), padM);
    pad.position.set(0,0.46,0.02); g.add(pad);
    return g;
  }

  // ── 小桌 ─────────────────────────────────────────────────
  function makeSmalltable(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='smalltable';
    var topM   = new THREE.MeshLambertMaterial({color:0xC8A46A});
    var legM   = new THREE.MeshLambertMaterial({color:0xA0784A});
    // 桌面
    var top    = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.05,0.45), topM);
    top.position.y=0.38; top.castShadow=true; g.add(top);
    // 四腿
    [[-0.24,-0.18],[0.24,-0.18],[-0.24,0.18],[0.24,0.18]].forEach(function(p){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.38,8), legM);
      leg.position.set(p[0],0.19,p[1]); g.add(leg);
    });
    // 下横撑
    var hBar1  = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.04,0.04), legM);
    hBar1.position.set(0,0.15,0); g.add(hBar1);
    return g;
  }

  // ── 篮子 ─────────────────────────────────────────────────
  function makeBasket(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='basket';
    var weaveM = new THREE.MeshLambertMaterial({color:0xCA6F1E});
    var darkM  = new THREE.MeshLambertMaterial({color:0x7E5109});
    var handleM= new THREE.MeshLambertMaterial({color:0x5D4037});
    // 篮身
    var body   = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.16,0.28,14), weaveM);
    body.position.y=0.14; body.castShadow=true; g.add(body);
    // 编织纹（横条）
    [0.07,0.14,0.21].forEach(function(y){
      var band = new THREE.Mesh(new THREE.TorusGeometry(0.21,0.02,6,16), darkM);
      band.position.y=y; band.rotation.x=Math.PI/2; g.add(band);
    });
    // 底
    var base   = new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.17,0.04,14), darkM);
    base.position.y=0.02; g.add(base);
    // 提手
    var handle = new THREE.Mesh(new THREE.TorusGeometry(0.2,0.025,8,16,Math.PI), handleM);
    handle.position.y=0.44; g.add(handle);
    return g;
  }

  // ── 警车 ─────────────────────────────────────────────────
  function makePolicecar(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='policecar';
    var bodyM  = new THREE.MeshLambertMaterial({color:0xD6EAF8});
    var blueM  = new THREE.MeshLambertMaterial({color:0x1A5276});
    var wheelM = new THREE.MeshLambertMaterial({color:0x1C1C1C});
    var glassM = new THREE.MeshLambertMaterial({color:0x85C1E9,transparent:true,opacity:0.8});
    var lightM = new THREE.MeshLambertMaterial({color:0xFF3333});
    var light2M= new THREE.MeshLambertMaterial({color:0x3333FF});
    // 车身
    var cab    = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.25,0.32), bodyM);
    cab.position.set(0,0.35,0); cab.castShadow=true; g.add(cab);
    var chassis= new THREE.Mesh(new THREE.BoxGeometry(0.7,0.15,0.36), blueM);
    chassis.position.set(0,0.17,0); g.add(chassis);
    // 蓝色警车横条
    var stripe = new THREE.Mesh(new THREE.BoxGeometry(0.72,0.07,0.04), blueM);
    stripe.position.set(0,0.27,0.2); g.add(stripe);
    // 警灯条
    var lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.06,0.12), blueM);
    lightBar.position.set(0,0.5,0); g.add(lightBar);
    [-0.08,0.08].forEach(function(x){
      var lensM = x<0 ? lightM : light2M;
      var lens  = new THREE.Mesh(new THREE.SphereGeometry(0.04,6,5), lensM);
      lens.position.set(x,0.53,0); g.add(lens);
    });
    // 玻璃
    var windshield = new THREE.Mesh(new THREE.BoxGeometry(0.42,0.18,0.04), glassM);
    windshield.position.set(0,0.4,0.17); g.add(windshield);
    // 四轮
    [[-0.28,-0.15],[-0.28,0.15],[0.28,-0.15],[0.28,0.15]].forEach(function(p){
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.1,12), wheelM);
      wheel.rotation.z=Math.PI/2; wheel.position.set(p[0],0.1,p[1]); g.add(wheel);
    });
    return g;
  }

  // ── 消防车 ───────────────────────────────────────────────
  function makeFiretruck(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='firetruck';
    var redM   = new THREE.MeshLambertMaterial({color:0xC0392B});
    var darkM  = new THREE.MeshLambertMaterial({color:0x922B21});
    var wheelM = new THREE.MeshLambertMaterial({color:0x1C1C1C});
    var silverM= new THREE.MeshLambertMaterial({color:0xBDC3C7});
    var glassM = new THREE.MeshLambertMaterial({color:0x85C1E9,transparent:true,opacity:0.75});
    // 车身（更长）
    var body   = new THREE.Mesh(new THREE.BoxGeometry(1.0,0.3,0.38), redM);
    body.position.set(0,0.25,0); body.castShadow=true; g.add(body);
    var chassis= new THREE.Mesh(new THREE.BoxGeometry(1.06,0.16,0.42), darkM);
    chassis.position.set(0,0.08,0); g.add(chassis);
    // 驾驶舱
    var cab    = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.28,0.38), redM);
    cab.position.set(-0.38,0.4,0); g.add(cab);
    var wind   = new THREE.Mesh(new THREE.BoxGeometry(0.2,0.2,0.04), glassM);
    wind.position.set(-0.38,0.42,0.21); g.add(wind);
    // 水罐
    var tank   = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.55,10), silverM);
    tank.rotation.z=Math.PI/2; tank.position.set(0.18,0.42,0); g.add(tank);
    // 水管卷
    var hose   = new THREE.Mesh(new THREE.TorusGeometry(0.1,0.04,8,12), silverM);
    hose.position.set(0.4,0.38,0.18); g.add(hose);
    // 警灯
    var lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.06,0.14), darkM);
    lightBar.position.set(-0.38,0.57,0); g.add(lightBar);
    var ll = new THREE.Mesh(new THREE.SphereGeometry(0.04,6,5), new THREE.MeshLambertMaterial({color:0xFF4444}));
    ll.position.set(-0.38,0.6,0); g.add(ll);
    // 轮子（6个）
    [[-0.38,-0.19],[-0.38,0.19],[0.1,-0.19],[0.1,0.19],[0.42,-0.19],[0.42,0.19]].forEach(function(p){
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.1,12), wheelM);
      wheel.rotation.z=Math.PI/2; wheel.position.set(p[0],0.1,p[1]); g.add(wheel);
    });
    return g;
  }

  // ── 大货车 ───────────────────────────────────────────────
  function makeTruck(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='truck';
    var cabM   = new THREE.MeshLambertMaterial({color:0x566573});
    var bodyM  = new THREE.MeshLambertMaterial({color:0x7F8C8D});
    var wheelM = new THREE.MeshLambertMaterial({color:0x1C1C1C});
    var glassM = new THREE.MeshLambertMaterial({color:0x85C1E9,transparent:true,opacity:0.75});
    var cargoM = new THREE.MeshLambertMaterial({color:0xAAB7B8});
    // 货箱
    var cargo  = new THREE.Mesh(new THREE.BoxGeometry(0.85,0.55,0.42), bodyM);
    cargo.position.set(0.2,0.45,0); cargo.castShadow=true; g.add(cargo);
    var cargoTop = new THREE.Mesh(new THREE.BoxGeometry(0.87,0.06,0.44), cargoM);
    cargoTop.position.set(0.2,0.74,0); g.add(cargoTop);
    // 驾驶舱
    var cab    = new THREE.Mesh(new THREE.BoxGeometry(0.32,0.48,0.42), cabM);
    cab.position.set(-0.56,0.38,0); g.add(cab);
    // 驾驶舱圆弧顶
    var cabTop = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,0.42,10,1,false,0,Math.PI), cabM);
    cabTop.rotation.z=Math.PI/2; cabTop.position.set(-0.56,0.61,0); g.add(cabTop);
    var wind   = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.3,0.34), glassM);
    wind.position.set(-0.41,0.42,0); g.add(wind);
    // 底盘
    var chassis= new THREE.Mesh(new THREE.BoxGeometry(1.24,0.14,0.46), new THREE.MeshLambertMaterial({color:0x424242}));
    chassis.position.set(0,0.07,0); g.add(chassis);
    // 轮子（6个）
    [[-0.5,-0.2],[-0.5,0.2],[0.1,-0.2],[0.1,0.2],[0.45,-0.2],[0.45,0.2]].forEach(function(p){
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.12,12), wheelM);
      wheel.rotation.z=Math.PI/2; wheel.position.set(p[0],0.1,p[1]); g.add(wheel);
    });
    return g;
  }

  // ── 警察 ─────────────────────────────────────────────────
  function makePoliceman(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='policeman';
    var uniformM= new THREE.MeshLambertMaterial({color:0x1A5276});
    var skinM  = new THREE.MeshLambertMaterial({color:0xF0C090});
    var hatM   = new THREE.MeshLambertMaterial({color:0x1A3A5C});
    var emblemM= new THREE.MeshLambertMaterial({color:0xD4AC0D});
    var beltM  = new THREE.MeshLambertMaterial({color:0x2E4057});
    // 腿
    [[-0.1,0.06],[0.1,0.06]].forEach(function(p){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.065,0.06,0.35,8), uniformM);
      leg.position.set(p[0],0.17,p[1]); g.add(leg);
      var shoe= new THREE.Mesh(new THREE.BoxGeometry(0.1,0.06,0.14), new THREE.MeshLambertMaterial({color:0x1C1C1C}));
      shoe.position.set(p[0],0.03,p[1]+0.02); g.add(shoe);
    });
    // 躯干
    var torso  = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.38,0.18), uniformM);
    torso.position.y=0.57; torso.castShadow=true; g.add(torso);
    // 腰带
    var belt   = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.07,0.2), beltM);
    belt.position.y=0.4; g.add(belt);
    // 警徽
    var badge  = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.03,8), emblemM);
    badge.rotation.x=Math.PI/2; badge.position.set(-0.1,0.68,0.1); g.add(badge);
    // 手臂
    [-0.2,0.2].forEach(function(x){
      var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.28,8), uniformM);
      arm.rotation.z= x<0 ? 0.3 : -0.3;
      arm.position.set(x*1.3,0.52,0); g.add(arm);
    });
    // 脖子
    var neck   = new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.06,0.08,8), skinM);
    neck.position.y=0.8; g.add(neck);
    // 头
    var head   = new THREE.Mesh(new THREE.SphereGeometry(0.14,10,8), skinM);
    head.position.y=0.97; g.add(head);
    // 警帽
    var brim   = new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,0.05,14), hatM);
    brim.position.y=1.03; g.add(brim);
    var crown  = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,0.18,14), hatM);
    crown.position.y=1.15; g.add(crown);
    var hatBadge = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.03,8), emblemM);
    hatBadge.rotation.x=Math.PI/2; hatBadge.position.set(0,1.13,0.14); g.add(hatBadge);
    return g;
  }

  // ── 检察官 ───────────────────────────────────────────────
  function makeProsecutor(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='prosecutor';
    var suitM  = new THREE.MeshLambertMaterial({color:0x2E4057});
    var shirtM = new THREE.MeshLambertMaterial({color:0xF8F8F0});
    var skinM  = new THREE.MeshLambertMaterial({color:0xF0C090});
    var tieM   = new THREE.MeshLambertMaterial({color:0xC0392B});
    var badgeM = new THREE.MeshLambertMaterial({color:0xD4AC0D});
    var shoeM  = new THREE.MeshLambertMaterial({color:0x1C1C1C});
    // 腿
    [[-0.09,0.05],[0.09,0.05]].forEach(function(p){
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.065,0.06,0.36,8), suitM);
      leg.position.set(p[0],0.18,p[1]); g.add(leg);
      var shoe= new THREE.Mesh(new THREE.BoxGeometry(0.1,0.06,0.14), shoeM);
      shoe.position.set(p[0],0.03,p[1]+0.02); g.add(shoe);
    });
    // 躯干（深蓝西装）
    var torso  = new THREE.Mesh(new THREE.BoxGeometry(0.26,0.38,0.17), suitM);
    torso.position.y=0.57; torso.castShadow=true; g.add(torso);
    // 白衬衫露出
    var shirt  = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.35,0.18), shirtM);
    shirt.position.set(0,0.57,0.005); g.add(shirt);
    // 领带
    var tie    = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.28,0.05), tieM);
    tie.position.set(0,0.58,0.1); g.add(tie);
    // 徽章
    var badge  = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.03,8), badgeM);
    badge.rotation.x=Math.PI/2; badge.position.set(-0.1,0.7,0.1); g.add(badge);
    // 手臂
    [-0.18,0.18].forEach(function(x){
      var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.28,8), suitM);
      arm.rotation.z= x<0 ? 0.25 : -0.25;
      arm.position.set(x*1.3,0.52,0); g.add(arm);
    });
    // 颈部
    var neck   = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.055,0.08,8), skinM);
    neck.position.y=0.79; g.add(neck);
    // 头
    var head   = new THREE.Mesh(new THREE.SphereGeometry(0.13,10,8), skinM);
    head.position.y=0.95; g.add(head);
    // 深色短发
    var hair   = new THREE.Mesh(new THREE.SphereGeometry(0.135,10,6), new THREE.MeshLambertMaterial({color:0x1A1A1A}));
    hair.position.set(0,1.0,0); hair.scale.set(1,0.55,1); g.add(hair);
    return g;
  }

  // ── 法官 ─────────────────────────────────────────────────
  function makeJudge(id) {
    var g = new THREE.Group(); g.userData.objId=id; g.userData.objType='judge';
    var robeM  = new THREE.MeshLambertMaterial({color:0x1A1A2E});
    var collarM= new THREE.MeshLambertMaterial({color:0xF8F8F0});
    var skinM  = new THREE.MeshLambertMaterial({color:0xF0C090});
    var goldM  = new THREE.MeshLambertMaterial({color:0xD4AC0D});
    var shoeM  = new THREE.MeshLambertMaterial({color:0x1C1C1C});
    var wigM   = new THREE.MeshLambertMaterial({color:0xF5F5DC});
    // 腿（长袍遮住）
    var robe   = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.22,0.7,12), robeM);
    robe.position.y=0.35; robe.castShadow=true; g.add(robe);
    var shoe1  = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.06,0.14), shoeM);
    shoe1.position.set(-0.08,0.03,0.06); g.add(shoe1);
    var shoe2  = shoe1.clone(); shoe2.position.set(0.08,0.03,0.06); g.add(shoe2);
    // 袍子上身（加宽）
    var upper  = new THREE.Mesh(new THREE.BoxGeometry(0.34,0.4,0.2), robeM);
    upper.position.y=0.9; g.add(upper);
    // 白色领饰
    var collar = new THREE.Mesh(new THREE.BoxGeometry(0.2,0.14,0.12), collarM);
    collar.position.set(0,0.9,0.06); g.add(collar);
    // 金色徽章
    var badge  = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.04,12), goldM);
    badge.rotation.x=Math.PI/2; badge.position.set(0,0.98,0.11); g.add(badge);
    // 天平图案（极简）
    var beam   = new THREE.Mesh(new THREE.BoxGeometry(0.14,0.02,0.03), goldM);
    beam.position.set(0,1.01,0.11); g.add(beam);
    [-0.06,0.06].forEach(function(x){
      var pan= new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.02,8), goldM);
      pan.position.set(x,0.98,0.11); g.add(pan);
    });
    // 手臂
    [-0.22,0.22].forEach(function(x){
      var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.055,0.3,8), robeM);
      arm.rotation.z= x<0 ? 0.3 : -0.3;
      arm.position.set(x*1.2,0.84,0); g.add(arm);
    });
    // 颈
    var neck   = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.055,0.08,8), skinM);
    neck.position.y=1.12; g.add(neck);
    // 头
    var head   = new THREE.Mesh(new THREE.SphereGeometry(0.13,10,8), skinM);
    head.position.y=1.28; g.add(head);
    // 法官白色假发
    var wig    = new THREE.Mesh(new THREE.SphereGeometry(0.155,10,8), wigM);
    wig.position.set(0,1.3,0); wig.scale.set(1,0.8,1); g.add(wig);
    // 假发卷（两侧）
    [-0.16,0.16].forEach(function(x){
      var curl = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.04,0.25,8), wigM);
      curl.position.set(x,1.2,0); g.add(curl);
    });
    return g;
  }

  var makers = { house:makeHouse, tree:makeTree, person:makePerson, dog:makeDog, mountain:makeMountain,
                 boy:makeBoy, girl:makeGirl, woman:makeWoman, cow:makeCow, panda:makePanda, rock:makeRock, grass:makeGrass,
                 car:makeCar, bike:makeBike,
                 school:makeSchool, hospital:makeHospital, supermarket:makeSupermarket, skyscraper:makeSkyscraper,
                 chick:makeChick, duck:makeDuck,
                 tank:makeTank,
                 streetlight:makeStreetlight,
                 gym:makeGym, library:makeLibrary, airport:makeAirport, hotel:makeHotel,
                 govbuilding:makeGovbuilding, villa:makeVilla, billboard:makeBillboard,
                 sheep:makeSheep, wolf:makeWolf, boar:makeBoar, rabbit:makeRabbit,
                 tiger:makeTiger, bear:makeBear, squirrel:makeSquirrel, frog:makeFrog, horse:makeHorse,
                 airplane:makeAirplane, sandbag:makeSandbag,
                 flower:makeFlower,
                 river:makeRiver, lake:makeLake,
                 temple:makeTemple,
                 // 学校系列
                 desk:makeDesk, schoolbag:makeSchoolbag, books:makeBooks, stage:makeStage, sofa:makeSofa, shelf:makeShelf,
                 // 社会机构
                 court:makeCourt, procuratorate:makeProcuratorate, cage:makeCage, prison:makePrison,
                 policestation:makePolicestation, mentalcenter:makeMentalcenter,
                 // 建筑道具
                 bathroomwall:makeBathroomwall, bridge:makeBridge,
                 // 生活道具
                 mirror:makeMirror, bathtub:makeBathtub, boat:makeBoat, umbrella:makeUmbrella,
                 scissors:makeScissors, chair:makeChair, smalltable:makeSmalltable, basket:makeBasket,
                 // 交通车辆
                 policecar:makePolicecar, firetruck:makeFiretruck, truck:makeTruck,
                 // 专业人物
                 policeman:makePoliceman, prosecutor:makeProsecutor, judge:makeJudge };

  function addObj(id, type, x, z, scale, rotateY) {
    if (objects[id]) return;
    if (!makers[type]) return;
    var mesh = makers[type](id);
    mesh.position.set(x, -frameH/2+0.15, z);
    var s = (typeof scale === 'number' && scale > 0) ? scale : 1.0;
    mesh.scale.set(s, s, s);
    if (typeof rotateY === 'number') mesh.rotation.y = rotateY;
    scene.add(mesh);
    objects[id] = mesh;
  }

  function removeObj(id) {
    if (objects[id]) { scene.remove(objects[id]); delete objects[id]; }
  }

  // ── 背景切换 ──────────────────────────────────────────────
  function applyTheme(themeId) {
    var t = THEMES[themeId] || THEMES.sand;
    var topHex = '#' + t.top.replace('#','');
    var botHex = '#' + t.bot.replace('#','');
    var sc = makeSkyTexture(t.top, t.bot);
    var newTex = new THREE.CanvasTexture(sc);
    scene.background = newTex;
    if (scene.fog) scene.fog.color.setHex(t.fog);
    ambient.color.setHex(t.amb);
    dirLight.color.setHex(t.dir);
  }

  // ── 消息接收 ──────────────────────────────────────────────
  window.addEventListener('message', function(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.type === 'ADD_OBJECT') {
        var ox = (Math.random()-0.5)*5, oz = (Math.random()-0.5)*3.5;
        addObj(msg.id, msg.objType, ox, oz, msg.scale, msg.rotateY || 0);
      } else if (msg.type === 'REMOVE_OBJECT') {
        removeObj(msg.id);
      } else if (msg.type === 'SET_BG') {
        applyTheme(msg.themeId);
      } else if (msg.type === 'ROTATE_OBJECT') {
        // 即时旋转指定物件到目标弧度
        if (objects[msg.id]) objects[msg.id].rotation.y = msg.rotateY;
      } else if (msg.type === 'SCREENSHOT') {
        renderer.render(scene, camera);
        var dataUrl = renderer.domElement.toDataURL('image/png');
        var out = JSON.stringify({ type:'SCREENSHOT_DATA', data: dataUrl });
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(out);
        else window.parent.postMessage(out, '*');
      }
    } catch(err) {}
  });

  // ── 轨道控制 ─────────────────────────────────────────────
  var orbiting=false, orbitStart={x:0,y:0};
  var theta=0.3, phi=0.9, radius=18;
  var pinchDist0=0, radius0=18;

  function sphereToCart() {
    camera.position.x = radius*Math.sin(phi)*Math.sin(theta);
    camera.position.y = radius*Math.cos(phi);
    camera.position.z = radius*Math.sin(phi)*Math.cos(theta);
    camera.lookAt(0,0,0);
  }
  sphereToCart();

  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();
  var dragObj = null;
  var dragPlane = new THREE.Plane(new THREE.Vector3(0,1,0), frameH/2-0.15);

  function getIntersects(clientX, clientY) {
    var rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX-rect.left)/rect.width)*2-1;
    mouse.y = -((clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(mouse, camera);
    var meshes = [];
    Object.keys(objects).forEach(function(k){
      objects[k].traverse(function(c){ if(c.isMesh) meshes.push(c); });
    });
    return raycaster.intersectObjects(meshes);
  }

  function findParentGroup(obj) {
    var cur=obj;
    while(cur && !cur.userData.objId) cur=cur.parent;
    return cur;
  }

  var canvas = renderer.domElement;
  var touches = [];
  canvas.addEventListener('touchstart', function(e){
    e.preventDefault(); touches=Array.from(e.touches);
    if(touches.length===1){
      var t=touches[0], hits=getIntersects(t.clientX,t.clientY);
      if(hits.length>0){ var gr=findParentGroup(hits[0].object); if(gr){dragObj=gr;return;} }
      orbiting=true; orbitStart={x:t.clientX,y:t.clientY};
    } else if(touches.length===2){
      dragObj=null; orbiting=false;
      var dx=touches[0].clientX-touches[1].clientX, dy=touches[0].clientY-touches[1].clientY;
      pinchDist0=Math.sqrt(dx*dx+dy*dy); radius0=radius;
    }
  },{passive:false});

  canvas.addEventListener('touchmove', function(e){
    e.preventDefault(); var nt=Array.from(e.touches);
    if(nt.length===1&&dragObj){
      var t=nt[0], rect=canvas.getBoundingClientRect();
      mouse.x=((t.clientX-rect.left)/rect.width)*2-1;
      mouse.y=-((t.clientY-rect.top)/rect.height)*2+1;
      raycaster.setFromCamera(mouse,camera);
      var pt=new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane,pt);
      pt.x=Math.max(-sandW/2+0.6,Math.min(sandW/2-0.6,pt.x));
      pt.z=Math.max(-sandD/2+0.6,Math.min(sandD/2-0.6,pt.z));
      dragObj.position.x=pt.x; dragObj.position.z=pt.z;
    } else if(nt.length===1&&orbiting){
      var t2=nt[0];
      theta-=(t2.clientX-orbitStart.x)*0.005;
      phi  -=(t2.clientY-orbitStart.y)*0.005;
      phi=Math.max(0.2,Math.min(Math.PI/2-0.05,phi));
      orbitStart={x:t2.clientX,y:t2.clientY}; sphereToCart();
    } else if(nt.length===2){
      var dx2=nt[0].clientX-nt[1].clientX, dy2=nt[0].clientY-nt[1].clientY;
      radius=Math.max(8,Math.min(28,radius0*(pinchDist0/Math.sqrt(dx2*dx2+dy2*dy2))));
      sphereToCart();
    }
    touches=nt;
  },{passive:false});

  canvas.addEventListener('touchend', function(e){
    touches=Array.from(e.touches);
    if(touches.length===0){dragObj=null;orbiting=false;}
  });

  function animate(){ requestAnimationFrame(animate); renderer.render(scene,camera); }
  animate();

  window.addEventListener('resize',function(){
    var w=window.innerWidth,h=window.innerHeight;
    renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix();
  });
}
</script>
</body>
</html>`;


// ── FabCard：单个模型卡片，使用 Reanimated UI 线程弹簧动画 ──────
// 每张卡片根据 index 错开延迟，形成流畅的瀑布式展开效果
function FabCard({
  type, cfg, index, isOpen, objSizes, onSizeChange, onAdd,
}: {
  type: ObjType;
  cfg: typeof OBJ_CONFIGS[ObjType];
  index: number;
  isOpen: boolean;
  objSizes: Record<ObjType, number>;
  onSizeChange: (type: ObjType, val: number) => void;
  onAdd: () => void;
}) {
  const anim = useSharedValue(0);

  useEffect(() => {
    if (isOpen) {
      // 展开：错开 28ms/卡 的弹簧入场，前几张卡片先到位，制造涟漪感
      anim.value = withDelay(
        Math.min(index * 28, 320),
        withSpring(1, { damping: 15, stiffness: 220, mass: 0.8 }),
      );
    } else {
      // 收起：统一快速淡出，避免逆向错开拖慢收起速度
      anim.value = withTiming(0, { duration: 160 });
    }
  }, [isOpen]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: anim.value,
    transform: [
      { translateY: interpolate(anim.value, [0, 1], [28, 0]) },
      { scale:      interpolate(anim.value, [0, 1], [0.82, 1]) },
    ],
  }));

  return (
    <Reanimated.View style={[{ width: 142 }, animStyle]}>
      <View className="rounded-2xl pt-3 pb-2 items-center"
        style={{ backgroundColor: 'rgba(28,16,5,0.94)', borderWidth: 1.5, borderColor: cfg.color + '90' }}>
        <Text style={{ fontSize: 30 }}>{cfg.emoji}</Text>
        <Text style={{ color: '#EEE', fontSize: 12, marginTop: 5, fontWeight: '700' }}>{cfg.label}</Text>
        {/* 尺寸档位按钮 */}
        <View className="flex-row gap-1 mt-2 px-2 justify-center">
          {SIZE_LEVELS.map(lv => {
            const active = Math.abs(objSizes[type] - lv.value) < 0.05;
            return (
              <Pressable
                key={lv.label}
                onPress={() => onSizeChange(type, lv.value)}
                style={{
                  paddingHorizontal: 5, paddingVertical: 3, borderRadius: 7,
                  backgroundColor: active ? cfg.color : 'rgba(255,255,255,0.08)',
                  borderWidth: 1,
                  borderColor: active ? cfg.color : 'rgba(255,255,255,0.15)',
                }}>
                <Text style={{ color: active ? '#FFF' : 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: '700' }}>
                  {lv.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={onAdd}
          className="mt-1.5 rounded-xl px-5 py-1.5"
          style={{ backgroundColor: cfg.color + '35', borderWidth: 1, borderColor: cfg.color + '70' }}>
          <Text style={{ color: cfg.color, fontSize: 11, fontWeight: '700' }}>+ 放入</Text>
        </Pressable>
      </View>
    </Reanimated.View>
  );
}

export default function SandboxScreen() {
  const router = useRouter();
  const { returnExpertId } = useLocalSearchParams<{ returnExpertId?: string }>();
  const webRef = useRef<unknown>(null);
  const iframeRef = useRef<unknown>(null);
  // 'save' = 保存到相册  |  'complete' = 完成沙盘跳转解读页
  const screenshotModeRef = useRef<'save' | 'complete'>('save');

  const [loading, setLoading] = useState(true);
  // 沙盘中的物件
  const [placedObjects, setPlacedObjects] = useState<SandboxObject[]>([]);
  // 已收纳（暂时隐藏）的物件，可重新放回
  const [storedObjects, setStoredObjects] = useState<SandboxObject[]>([]);
  // 每种物件类型的预设尺寸
  const [objSizes, setObjSizes] = useState<Record<ObjType, number>>(
    Object.keys(OBJ_CONFIGS).reduce((acc, k) => ({ ...acc, [k]: 1.0 }), {} as Record<ObjType, number>)
  );
  // FAB 展开
  const [fabOpen, setFabOpen] = useState(false);
  // 已收纳侧边面板
  const [showStored, setShowStored] = useState(false);
  // 背景选择器
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [activeBgId, setActiveBgId] = useState('sand');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  // 当前选中的物件 id（展开方向控制盘）
  const [activeObjId, setActiveObjId] = useState<string | null>(null);
  const [showObjPanel, setShowObjPanel] = useState(false);

  // 🎯 悬浮按钮可拖动位置（屏幕绝对坐标，top/left）
  const { width: screenW, height: screenH } = useWindowDimensions();
  const BTN_SIZE = 44;
  const btnLeft = useSharedValue(12);
  const btnTop  = useSharedValue(screenH - 200);
  const startLeft = useSharedValue(12);
  const startTop  = useSharedValue(screenH - 200);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      startLeft.value = btnLeft.value;
      startTop.value  = btnTop.value;
    })
    .onChange((e) => {
      btnLeft.value = Math.min(Math.max(0, startLeft.value + e.translationX), screenW - BTN_SIZE);
      btnTop.value  = Math.min(Math.max(0, startTop.value  + e.translationY), screenH - BTN_SIZE);
    })
    .onEnd(() => {
      // 吸边：吸附到最近的左/右边缘
      const midX = screenW / 2;
      btnLeft.value = btnLeft.value < midX ? 8 : screenW - BTN_SIZE - 8;
    });

  const btnAnimStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: btnLeft.value,
    top:  btnTop.value,
    zIndex: 30,
  }));

  // 面板跟随按钮：紧贴按钮右侧或左侧（根据吸边方向），垂直对齐
  const PANEL_W = 220;
  const panelAnimStyle = useAnimatedStyle(() => {
    // 按钮吸左侧时面板在右，否则在左
    const onLeft = btnLeft.value < screenW / 2;
    const panelLeft = onLeft
      ? btnLeft.value + BTN_SIZE + 6
      : btnLeft.value - PANEL_W - 6;
    return {
      position: 'absolute',
      left: panelLeft,
      top: btnTop.value,
      width: PANEL_W,
      zIndex: 29,
    };
  });

  // 面板跟随按钮位置（JS 侧镜像，用于决定面板展开方向）
  const togglePanel = () => setShowObjPanel(v => !v);

  const fabProg = useSharedValue(0);
  const toggleFab = useCallback(() => {
    const next = !fabOpen;
    setFabOpen(next);
    fabProg.value = withSpring(next ? 1 : 0, { damping: 16, stiffness: 200 });
  }, [fabOpen, fabProg]);
  const closeFab = useCallback(() => {
    setFabOpen(false);
    fabProg.value = withSpring(0, { damping: 16, stiffness: 200 });
  }, [fabProg]);

  // ── Web 端消息接收 ────────────────────────────────────────
  const handleWebMessage = useCallback((data: string) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'SCREENSHOT_DATA' && process.env.EXPO_OS === 'web') {
        if (screenshotModeRef.current === 'complete') {
          // 完成沙盘模式：跳转到解读页
          setSaving(false);
          setSandboxCapture({
            base64: msg.data as string,
            objectsCount: placedObjects.length,
            returnExpertId: returnExpertId ?? undefined,
          });
          router.push('/(app)/sandbox-result' as RelativePathString);
        } else {
          // 保存到本地模式
          const a = document.createElement('a');
          a.href = msg.data as string;
          a.download = `sandbox_${Date.now()}.png`;
          a.click();
          setSaveMsg('✓ 已下载截图');
          setSaving(false);
          setTimeout(() => setSaveMsg(''), 2500);
        }
      }
    } catch (_) { /* ignore */ }
  }, [placedObjects.length, returnExpertId, router]);

  useEffect(() => {
    if (process.env.EXPO_OS !== 'web') return;
    const handler = (e: MessageEvent) => {
      if (typeof e.data === 'string') handleWebMessage(e.data);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [handleWebMessage]);

  // ── 发消息到 Three.js 层 ──────────────────────────────────
  const postToWeb = useCallback((msg: object) => {
    const json = JSON.stringify(msg);
    if (process.env.EXPO_OS === 'web') {
      // @ts-ignore
      iframeRef.current?.contentWindow?.postMessage(json, '*');
    } else {
      // @ts-ignore
      webRef.current?.injectJavaScript(
        `window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(json)}})); true;`
      );
    }
  }, []);

  // ── 添加物件到沙盘（携带尺寸）────────────────────────────
  const addObject = useCallback((type: ObjType) => {
    const id = `${type}_${Date.now()}`;
    const cfg = OBJ_CONFIGS[type];
    const scale = objSizes[type];
    const obj: SandboxObject = { id, type, scale, rotateY: 0, ...cfg };
    setPlacedObjects(prev => [...prev, obj]);
    postToWeb({ type: 'ADD_OBJECT', id, objType: type, scale, rotateY: 0 });
    closeFab();
  }, [postToWeb, closeFab, objSizes]);

  // ── 收纳：仅隐藏，可重新放回 ─────────────────────────────
  const storeObject = useCallback((obj: SandboxObject) => {
    setPlacedObjects(prev => prev.filter(o => o.id !== obj.id));
    setStoredObjects(prev => [...prev, obj]);
    postToWeb({ type: 'REMOVE_OBJECT', id: obj.id });
  }, [postToWeb]);

  // ── 删除：彻底移除，不进收纳盒 ──────────────────────────
  const deleteObject = useCallback((obj: SandboxObject) => {
    setPlacedObjects(prev => prev.filter(o => o.id !== obj.id));
    postToWeb({ type: 'REMOVE_OBJECT', id: obj.id });
  }, [postToWeb]);

  // ── 从收纳放回沙盘 ────────────────────────────────────────
  const restoreObject = useCallback((obj: SandboxObject) => {
    setStoredObjects(prev => prev.filter(o => o.id !== obj.id));
    setPlacedObjects(prev => [...prev, obj]);
    postToWeb({ type: 'ADD_OBJECT', id: obj.id, objType: obj.type, scale: obj.scale, rotateY: obj.rotateY ?? 0 });
  }, [postToWeb]);

  // ── 旋转物件方向 ─────────────────────────────────────────
  const rotateObject = useCallback((obj: SandboxObject, dir: RotateDir) => {
    const SNAP: Record<RotateDir, number> = {
      front: 0,
      back:  Math.PI,
      left:  Math.PI / 2,
      right: -Math.PI / 2,
    };
    const newRotateY = SNAP[dir];
    setPlacedObjects(prev => prev.map(o => o.id === obj.id ? { ...o, rotateY: newRotateY } : o));
    postToWeb({ type: 'ROTATE_OBJECT', id: obj.id, rotateY: newRotateY });
  }, [postToWeb]);

  // ── 删除已收纳物件（彻底移除）────────────────────────────
  const deleteStoredObject = useCallback((obj: SandboxObject) => {
    setStoredObjects(prev => prev.filter(o => o.id !== obj.id));
  }, []);

  // ── 清空沙盘（彻底删除，不进收纳盒）────────────────────
  const clearAll = useCallback(() => {
    placedObjects.forEach(obj => postToWeb({ type: 'REMOVE_OBJECT', id: obj.id }));
    setPlacedObjects([]);
    closeFab();
  }, [placedObjects, postToWeb, closeFab]);

  // ── 截图保存到相册 ──────────────────────────────────────
  const saveScreenshot = useCallback(async () => {
    screenshotModeRef.current = 'save';
    setSaving(true);
    postToWeb({ type: 'SCREENSHOT' });
  }, [postToWeb]);

  // ── 完成沙盘 → 截图 → 跳转 AI 解读页 ──────────────────
  const completeSandbox = useCallback(() => {
    screenshotModeRef.current = 'complete';
    setSaving(true);
    postToWeb({ type: 'SCREENSHOT' });
  }, [postToWeb]);

  // ── 背景切换 ──────────────────────────────────────────────
  const setBg = useCallback((theme: typeof BG_THEMES[0]) => {
    setActiveBgId(theme.id);
    setShowBgPicker(false);
    postToWeb({ type: 'SET_BG', themeId: theme.id });
  }, [postToWeb]);

  // ── 接收 Native WebView 消息 ──────────────────────────────
  const onMessage = useCallback(async (e: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'SCREENSHOT_DATA') {
        if (screenshotModeRef.current === 'complete') {
          // 完成沙盘模式：跳转解读页，不存相册
          setSaving(false);
          setSandboxCapture({
            base64: msg.data as string,
            objectsCount: placedObjects.length,
            returnExpertId: returnExpertId ?? undefined,
          });
          router.push('/(app)/sandbox-result' as RelativePathString);
        } else {
          // 保存到相册模式
          const response = await expoFetch(msg.data as string);
          const buffer = await response.arrayBuffer();
          const file = new FSFile(Paths.cache, `sandbox_${Date.now()}.png`);
          await file.write(new Uint8Array(buffer));
          const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
          if (status === 'granted') {
            await MediaLibrary.createAssetAsync(file.uri);
            setSaveMsg('✓ 已保存到相册');
          } else {
            setSaveMsg('需要相册权限才能保存');
          }
          setSaving(false);
          setTimeout(() => setSaveMsg(''), 2500);
        }
      }
    } catch (_) {
      setSaving(false);
    }
  }, [placedObjects.length, returnExpertId, router]);

  const isWeb = process.env.EXPO_OS === 'web';
  const topNavPt = isWeb ? 16 : 52;
  const bottomPb = isWeb ? 12 : 32;
  const fabRotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(fabProg.value, [0, 1], [0, 45])}deg` }],
  }));
  const activeBg = BG_THEMES.find(t => t.id === activeBgId) ?? BG_THEMES[0];

  // ── 工具栏 JSX（两端共用）────────────────────────────────
  const toolbar = (
    <>
      {/* ── 顶部导航栏 ── */}
      <View
        className="absolute top-0 left-0 right-0 flex-row items-center justify-between px-4 pb-3"
        style={{ backgroundColor: 'rgba(26,15,5,0.72)', paddingTop: topNavPt }}
      >
        {/* 返回 */}
        <Pressable onPress={() => router.back()} className="p-2">
          <ArrowLeft size={22} color="#FFF" />
        </Pressable>

        {/* 标题 */}
        <Text style={{ color: '#F5E6C8', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 }}>
          沙盘游戏室
        </Text>

        {/* 右侧工具组 */}
        <View className="flex-row gap-1 items-center">
          <Pressable onPress={() => { setShowBgPicker(v => !v); setShowStored(false); }} className="p-2">
            <ImageIcon size={19} color={showBgPicker ? '#C8A46A' : '#AAA'} />
          </Pressable>
          <Pressable onPress={() => { setShowStored(v => !v); setShowBgPicker(false); }} className="p-2 relative">
            <Package size={19} color={showStored ? '#C8A46A' : '#AAA'} />
            {storedObjects.length > 0 && (
              <View className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full items-center justify-center"
                style={{ backgroundColor: '#C8A46A' }}>
                <Text style={{ fontSize: 8, color: '#FFF', fontWeight: '700' }}>{storedObjects.length}</Text>
              </View>
            )}
          </Pressable>
          <Pressable onPress={clearAll} className="p-2">
            <Trash2 size={19} color="#AAA" />
          </Pressable>
          <Pressable onPress={saveScreenshot} disabled={saving} className="p-2">
            <Camera size={19} color="#AAA" />
          </Pressable>
          {/* 完成解读 — 仅图标，金色高亮，有物件时激活 */}
          <Pressable
            onPress={completeSandbox}
            disabled={saving || placedObjects.length === 0}
            className="p-1.5 rounded-full ml-1"
            style={{
              backgroundColor: placedObjects.length === 0 ? 'rgba(200,164,106,0.15)' : 'rgba(200,164,106,0.25)',
              borderWidth: 1.5,
              borderColor: placedObjects.length === 0 ? 'rgba(200,164,106,0.2)' : '#C8A46A',
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving && screenshotModeRef.current === 'complete'
              ? <ActivityIndicator size="small" color="#C8A46A" />
              : <CheckCircle size={19} color={placedObjects.length === 0 ? '#886040' : '#C8A46A'} />}
          </Pressable>
        </View>
      </View>

      {/* ── 保存提示 ── */}
      {saveMsg !== '' && (
        <View className="absolute px-4 py-2 rounded-xl"
          style={{ backgroundColor: 'rgba(0,0,0,0.72)', top: topNavPt + 56, left: '50%', transform: [{ translateX: -80 }] }}>
          <Text style={{ color: '#FFF', fontSize: 13 }}>{saveMsg}</Text>
        </View>
      )}

      {/* ── 背景选择器面板 ── */}
      {showBgPicker && (
        <View className="absolute left-4 right-4 rounded-2xl p-4"
          style={{ backgroundColor: 'rgba(20,10,2,0.95)', top: topNavPt + 56, zIndex: 20 }}>
          <Text className="text-center font-bold mb-3" style={{ color: '#C8A46A', fontSize: 13 }}>选择背景</Text>
          <View className="flex-row flex-wrap gap-2 justify-center">
            {BG_THEMES.map(theme => (
              <Pressable key={theme.id} onPress={() => setBg(theme)}
                className="rounded-xl px-3 py-2 items-center"
                style={{
                  backgroundColor: activeBgId === theme.id ? 'rgba(200,164,106,0.25)' : 'rgba(255,255,255,0.06)',
                  borderWidth: 1.5,
                  borderColor: activeBgId === theme.id ? '#C8A46A' : 'rgba(255,255,255,0.12)',
                  minWidth: 80,
                }}>
                <Text style={{ fontSize: 22 }}>{theme.emoji}</Text>
                <Text style={{ color: activeBgId === theme.id ? '#C8A46A' : '#CCC', fontSize: 11, marginTop: 3, fontWeight: activeBgId === theme.id ? '700' : '400' }}>
                  {theme.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* ── 已收纳物件侧边面板 ── */}
      {showStored && (
        <View className="absolute right-0 w-32"
          style={{ backgroundColor: 'rgba(20,10,2,0.94)', top: topNavPt + 56, bottom: bottomPb + 88, zIndex: 20 }}>
          <Text className="text-center py-2 text-xs font-semibold" style={{ color: '#C8A46A' }}>已收纳</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {storedObjects.length === 0 && (
              <Text className="text-center text-xs px-2 mt-4" style={{ color: 'rgba(255,255,255,0.4)' }}>暂无收纳</Text>
            )}
            {storedObjects.map(obj => (
              <View key={obj.id} className="mx-2 my-1.5 rounded-xl p-2 items-center"
                style={{ backgroundColor: obj.color + '25', borderWidth: 1, borderColor: obj.color + '50' }}>
                <Text style={{ fontSize: 22 }}>{obj.emoji}</Text>
                <Text style={{ color: '#EEE', fontSize: 10, marginTop: 2 }}>{obj.label}</Text>
                {/* 放回 / 删除 */}
                <View className="flex-row gap-1 mt-1.5">
                  <Pressable onPress={() => restoreObject(obj)}
                    className="rounded-lg px-2 py-0.5"
                    style={{ backgroundColor: obj.color + '40' }}>
                    <Text style={{ color: obj.color, fontSize: 9, fontWeight: '700' }}>↩ 放回</Text>
                  </Pressable>
                  <Pressable onPress={() => deleteStoredObject(obj)}
                    className="rounded-lg px-2 py-0.5"
                    style={{ backgroundColor: 'rgba(200,50,50,0.2)' }}>
                    <Text style={{ color: '#FF7070', fontSize: 9, fontWeight: '700' }}>🗑 删除</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── 已放置物件：悬浮收纳按钮 + 侧面面板 ── */}
      {placedObjects.length > 0 && (
        <>
          {/* 可拖动悬浮切换按钮 */}
          <GestureDetector gesture={panGesture}>
            <Reanimated.View style={btnAnimStyle}>
              <Pressable
                onPress={togglePanel}
                style={{
                  width: BTN_SIZE, height: BTN_SIZE,
                  borderRadius: 14,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: showObjPanel ? 'rgba(232,163,101,0.95)' : 'rgba(26,15,5,0.88)',
                  borderWidth: 1.5,
                  borderColor: showObjPanel ? '#E8A365' : 'rgba(255,255,255,0.18)',
                }}>
                <Text style={{ fontSize: 18 }}>🎯</Text>
                {/* 数量徽标 */}
                <View style={{
                  position: 'absolute', top: -4, right: -4,
                  width: 16, height: 16, borderRadius: 8,
                  backgroundColor: '#E8A365',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '700' }}>
                    {placedObjects.length}
                  </Text>
                </View>
              </Pressable>
            </Reanimated.View>
          </GestureDetector>

          {/* 侧面挂帘面板（跟随悬浮按钮位置）*/}
          {showObjPanel && (
            <Reanimated.View
              style={[panelAnimStyle, {
                maxHeight: 320,
                backgroundColor: 'rgba(20,11,3,0.96)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.12)',
                borderRadius: 16,
              }]}>
              {/* 面板标题 */}
              <View className="flex-row items-center px-3 pt-3 pb-2"
                style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
                <Text style={{ color: '#E8A365', fontSize: 11, fontWeight: '700', flex: 1 }}>
                  已放置物件 ({placedObjects.length})
                </Text>
                <Pressable onPress={() => setShowObjPanel(false)}>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>×</Text>
                </Pressable>
              </View>

              {/* 物件列表 */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: 260 }}
                contentContainerStyle={{ paddingVertical: 4 }}>
                {placedObjects.map(obj => (
                  <View key={obj.id}
                    className="flex-row items-center px-2 py-1.5"
                    style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                    {/* emoji */}
                    <Text style={{ fontSize: 18, width: 26 }}>{obj.emoji}</Text>

                    {/* 名称 */}
                    <Text style={{ color: '#EEE', fontSize: 10, width: 32 }} numberOfLines={1}>
                      {obj.label}
                    </Text>

                    {/* 方向控制（横排4键）*/}
                    <View className="flex-row items-center gap-0.5 flex-1 justify-center">
                      {([
                        { dir: 'front' as RotateDir, icon: <ChevronUp size={10} color={obj.color} /> },
                        { dir: 'left'  as RotateDir, icon: <ChevronLeft size={10} color={obj.color} /> },
                        { dir: 'right' as RotateDir, icon: <ChevronRight size={10} color={obj.color} /> },
                        { dir: 'back'  as RotateDir, icon: <ChevronDown size={10} color={obj.color} /> },
                      ] as const).map(({ dir, icon }) => (
                        <Pressable key={dir}
                          onPress={() => rotateObject(obj, dir)}
                          style={{
                            width: 22, height: 22, borderRadius: 6,
                            backgroundColor: obj.color + '28',
                            borderWidth: 1, borderColor: obj.color + '55',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                          {icon}
                        </Pressable>
                      ))}
                    </View>

                    {/* 收纳 / 删除 */}
                    <View className="flex-row gap-1 ml-1">
                      <Pressable onPress={() => storeObject(obj)}
                        style={{
                          paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6,
                          backgroundColor: obj.color + '30',
                        }}>
                        <Text style={{ color: obj.color, fontSize: 8, fontWeight: '700' }}>收纳</Text>
                      </Pressable>
                      <Pressable onPress={() => deleteObject(obj)}
                        style={{
                          paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6,
                          backgroundColor: 'rgba(200,50,50,0.22)',
                        }}>
                        <Text style={{ color: '#FF7070', fontSize: 8, fontWeight: '700' }}>删除</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </Reanimated.View>
          )}
        </>
      )}

      {/* ── 模型卡片列表（FAB 展开时弹出，逐卡错开弹簧动画）── */}
      {fabOpen && (
        <View className="absolute left-0 right-0"
          style={{ bottom: bottomPb + 100 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
            {(Object.keys(OBJ_CONFIGS) as ObjType[]).map((type, index) => {
              const cfg = OBJ_CONFIGS[type];
              return (
                <FabCard
                  key={type}
                  type={type}
                  cfg={cfg}
                  index={index}
                  isOpen={fabOpen}
                  objSizes={objSizes}
                  onSizeChange={(t, val) => setObjSizes(prev => ({ ...prev, [t]: val }))}
                  onAdd={() => addObject(type)}
                />
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── FAB 圆形按钮 ── */}
      <View className="absolute left-0 right-0 items-center" style={{ bottom: bottomPb + 20 }}>
        {placedObjects.length > 0 && (
          <View className="absolute w-5 h-5 rounded-full items-center justify-center"
            style={{ backgroundColor: '#C8A46A', zIndex: 10, top: -8, right: '50%', marginRight: -30 }}>
            <Text style={{ fontSize: 10, color: '#FFF', fontWeight: '700' }}>{placedObjects.length}</Text>
          </View>
        )}
        <Pressable onPress={toggleFab}
          style={{
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: fabOpen ? '#2A1A08' : '#C8A46A',
            borderWidth: 2.5,
            borderColor: fabOpen ? '#C8A46A' : 'rgba(255,230,180,0.5)',
            alignItems: 'center', justifyContent: 'center',
          }}>
          <Reanimated.View style={fabRotateStyle}>
            <Plus size={26} color={fabOpen ? '#C8A46A' : '#FFF'} />
          </Reanimated.View>
        </Pressable>
        <Text style={{ color: 'rgba(200,164,106,0.6)', fontSize: 10, marginTop: 4 }}>
          {fabOpen ? '收起' : '添加物件'}
        </Text>
      </View>
    </>
  );

  // ── Web 端渲染 ────────────────────────────────────────────
  if (process.env.EXPO_OS === 'web') {
    return (
      <View className="flex-1" style={{ backgroundColor: '#1a0f05' }}>
        <StatusBar style="light" />
        {/* @ts-ignore */}
        <iframe
          ref={iframeRef as React.RefObject<HTMLIFrameElement>}
          srcDoc={THREEJS_HTML}
          onLoad={() => setLoading(false)}
          style={{ flex: 1, border: 'none', width: '100%', height: '100%' } as never}
        />
        {loading && (
          <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: '#1a0f05' }}>
            <ActivityIndicator size="large" color="#C8A46A" />
            <Text className="mt-3 text-sm" style={{ color: '#C8A46A' }}>沙盘加载中…</Text>
          </View>
        )}
        {toolbar}
      </View>
    );
  }

  // ── Native 端渲染 ─────────────────────────────────────────
  return (
    <View className="flex-1" style={{ backgroundColor: '#1a0f05' }}>
      <StatusBar style="light" />
      <WebView
        // @ts-ignore
        ref={webRef}
        source={{ html: THREEJS_HTML }}
        style={{ flex: 1 }}
        onMessage={onMessage}
        onLoadEnd={() => setLoading(false)}
        javaScriptEnabled
        allowsInlineMediaPlayback
        originWhitelist={['*']}
        scrollEnabled={false}
        bounces={false}
      />
      {loading && (
        <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: '#1a0f05' }}>
          <ActivityIndicator size="large" color="#C8A46A" />
          <Text className="mt-3 text-sm" style={{ color: '#C8A46A' }}>沙盘加载中…</Text>
        </View>
      )}
      {toolbar}
    </View>
  );
}

