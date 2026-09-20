/**
 * love-network.tsx — 自由关系网络图（全屏力导向版 v2）
 * - 无固定中心节点，起点完全自定义
 * - 任意两节点之间可添加有向/无向关系边 + 关系标签（显示在连线中间）
 * - 所有节点（含起点）均可在 WebView 内拖动
 * - 双指 pinch-to-zoom + 双指平移
 * - 长按节点弹出快捷菜单：添加连接/编辑/删除
 * - 底部操作栏：添加节点 / 添加关系边 / AI洞察 / 列表
 * - 可拖动纯净模式按钮
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, TextInput,
  ActivityIndicator, Modal, FlatList, SectionList, ScrollView, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring,
  interpolate, Extrapolate, runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import WebView from 'react-native-webview';
import type WebViewType from 'react-native-webview';
import { useRouter, useFocusEffect } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft, Plus, X, Check, Sparkles, Edit2, Trash2,
  Eye, EyeOff, GitBranch, List, Palette, Lock, Unlock, ImagePlus,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '@/client/supabase';
import { streamAiChat } from '@/lib/aiStream';
import { checkAndConsumeCredits } from '@/hooks/useAiQuota';
import { useSession } from '@/ctx';
import ColorPickerModal from '@/components/ColorPickerModal';

// ── 类型定义 ────────────────────────────────────────────────────
interface RelNode {
  id: string;
  name: string;
  role: string;
  tags: string[];
  quality: 'positive' | 'neutral' | 'draining';
  trust_score: number;
  comfort_score: number;
  distance: number;
  angle: number;
  avatar_emoji: string;
  note: string;
  is_center: boolean;
  node_color: string;
  node_image_url: string | null;
}

interface RelEdge {
  id: string;
  source_id: string;
  target_id: string;
  label: string;
  direction: 'source_to_target' | 'target_to_source' | 'both';
  quality: 'positive' | 'neutral' | 'draining';
  trust_score: number;
  line_style: 'solid' | 'curve' | 'dashed';
}

// ── 节点预设颜色板 ──────────────────────────────────────────────
const NODE_COLORS = [
  '#8B5E3C','#C07070','#7090A8','#7DAA7D','#9B7DB8',
  '#D4956A','#6A9BAB','#B87C9C','#5A7A5A','#A08050',
];

// ── 背景主题 ─────────────────────────────────────────────────────
const BG_THEMES = [
  { name: '羊皮纸', color: '#F8F3EE', textColor: '#2E1B0E' },
  { name: '薄雾蓝', color: '#EEF3F8', textColor: '#1A2E3C' },
  { name: '竹影绿', color: '#EEF5EF', textColor: '#1A2E1C' },
  { name: '暮光紫', color: '#F2EEF8', textColor: '#2A1A3C' },
  { name: '珊瑚粉', color: '#FAF0EE', textColor: '#3C1A1A' },
  { name: '墨夜黑', color: '#1C1C22', textColor: '#E8E4DC' },
  { name: '烟灰蓝', color: '#2A2D35', textColor: '#E0E4EC' },
  { name: '深棕暖', color: '#28201A', textColor: '#EEE8DC' },
];

// ── 常量 ─────────────────────────────────────────────────────────
const QUALITY_CONFIG = {
  positive: { label: '积极滋养', color: '#C07070', lineColor: '#C8A090' },
  neutral:  { label: '普通',    color: '#7090A8', lineColor: '#A0B8C8' },
  draining: { label: '消耗',    color: '#8A8A8A', lineColor: '#B0B0B0' },
};
const EMOJI_OPTIONS = ['😊','💕','🌸','👨‍👩‍👧','👫','🤝','🌟','💫','🔥','🌈','💪','🎯','🌺','✨','🐱','🐶','🦁','🦊'];
const DIR_OPTIONS: { value: RelEdge['direction']; label: string }[] = [
  { value: 'both',             label: '双向 ↔' },
  { value: 'source_to_target', label: '→ 单向' },
  { value: 'target_to_source', label: '← 反向' },
];
const LINE_STYLE_OPTIONS: { value: RelEdge['line_style']; label: string; icon: string }[] = [
  { value: 'solid',  label: '直线', icon: '—' },
  { value: 'curve',  label: '曲线', icon: '⌒' },
  { value: 'dashed', label: '虚线', icon: '- -' },
];

const THEME = {
  bg: '#F8F3EE',
  primary: '#8B5E3C',
  text: '#2E1B0E',
  sub: '#7A6050',
  card: '#FFFDF8',
  cardBorder: '#D4C4A8',
  accent: '#C07070',
};

// ── D3 力导向图 HTML（全功能版 v2）──────────────────────────────
function buildNetworkHtml(nodes: RelNode[], edges: RelEdge[], bgColor: string, showTrust: boolean, initialLocked = false): string {
  const nodesData = nodes.map(n => ({
    id: n.id,
    name: n.name,
    emoji: n.avatar_emoji,
    imageUrl: n.node_image_url || null,
    quality: n.quality,
    isCenter: n.is_center,
    color: n.node_color || (n.is_center ? '#8B5E3C' : (QUALITY_CONFIG[n.quality]?.color ?? '#7090A8')),
    r: n.is_center ? 26 : 18,
  }));

  const edgesData = edges.map(e => ({
    source: e.source_id,
    target: e.target_id,
    label: e.label,
    trust: showTrust ? e.trust_score : 0,
    direction: e.direction,
    quality: e.quality,
    lineStyle: e.line_style ?? 'solid',
    color: QUALITY_CONFIG[e.quality]?.lineColor ?? '#B0C0C8',
    arrowColor: QUALITY_CONFIG[e.quality]?.color ?? '#8A8A8A',
    width: e.quality === 'positive' ? 2.8 : e.quality === 'neutral' ? 2 : 1.4,
  }));

  // 向后兼容：无边时自动连到中心节点
  const autoEdges = edgesData.length === 0
    ? nodes.filter(n => !n.is_center).map(n => {
        const center = nodes.find(c => c.is_center);
        if (!center) return null;
        return { source: center.id, target: n.id, label: '', trust: 0, direction: 'both',
          quality: n.quality, lineStyle: 'solid',
          color: QUALITY_CONFIG[n.quality]?.lineColor ?? '#B0C0C8',
          arrowColor: QUALITY_CONFIG[n.quality]?.color ?? '#8A8A8A', width: 2 };
      }).filter(Boolean)
    : edgesData;

  // 计算文字颜色（深背景用浅字）
  const isDark = ['#1C1C22','#2A2D35','#28201A'].includes(bgColor);
  const textCol = isDark ? '#E8E4DC' : '#2E1B0E';
  const subCol  = isDark ? '#B0A898' : '#7A6050';
  const ringCol = isDark ? 'rgba(255,255,255,0.10)' : '#D4C4A8';
  const menuBgCol = isDark ? '#2E2820' : '#FFFDF8';
  const menuTextCol = isDark ? '#E8E4DC' : '#2E1B0E';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=10,user-scalable=yes"/>
<script src="https://d3js.org/d3.v7.min.js"></script>
<style>
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{width:100%;height:100%;overflow:hidden;background:${bgColor};touch-action:none}
  svg{width:100%;height:100%;cursor:grab}
  svg.panning{cursor:grabbing}
  /* 连线路径（用 path 代替 line，支持曲率偏移避开节点）*/
  .link{fill:none;stroke-opacity:0.75}
  /* 连线标签：普通字重，9px 不抢节点视线 */
  .link-label{font-size:9px;font-family:"PingFang SC","Hiragino Sans GB",sans-serif;
    fill:${textCol};text-anchor:middle;dominant-baseline:middle;pointer-events:none;
    paint-order:stroke;stroke:${bgColor};stroke-width:3px;stroke-linejoin:round;font-weight:400}
  .link-trust{font-size:8px;font-family:"PingFang SC","Hiragino Sans GB",sans-serif;
    fill:${subCol};text-anchor:middle;dominant-baseline:middle;pointer-events:none;
    paint-order:stroke;stroke:${bgColor};stroke-width:3px;stroke-linejoin:round;font-weight:400}
  .node-circle{cursor:grab;filter:drop-shadow(0 2px 6px rgba(0,0,0,.22))}
  .node-circle.center{filter:drop-shadow(0 3px 12px rgba(139,94,60,.45))}
  .node-circle:active{cursor:grabbing}
  .node-label{font-size:11px;font-family:"PingFang SC","Hiragino Sans GB",sans-serif;
    fill:${textCol};text-anchor:middle;pointer-events:none;font-weight:400;
    paint-order:stroke;stroke:${bgColor};stroke-width:4px}
  .node-sub{font-size:9px;fill:${subCol};text-anchor:middle;pointer-events:none}
  .menu-item{cursor:pointer;font-size:12px;font-family:"PingFang SC",sans-serif;fill:${menuTextCol}}
  .menu-item:hover{fill:#8B5E3C}
  #empty{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;
    justify-content:center;font-family:sans-serif;color:${subCol};font-size:14px;
    background:${bgColor};gap:10px;pointer-events:none}
  .ring{fill:none;stroke:${ringCol};stroke-dasharray:4 6;opacity:.5}
  #zoom-hint{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);
    background:rgba(139,94,60,0.80);color:#fff;font-size:11px;
    padding:5px 14px;border-radius:20px;pointer-events:none;
    font-family:"PingFang SC",sans-serif;opacity:0;transition:opacity 0.4s}
</style>
</head>
<body>
<div id="empty" style="display:none">
  <div style="font-size:48px">🌐</div>
  <div>还没有任何节点</div>
  <div style="font-size:12px;opacity:.7">点击下方 + 开始添加</div>
</div>
<svg id="svg"></svg>
<div id="zoom-hint">双指缩放 · 双指平移</div>
<script>
(function(){
  var NODES = ${JSON.stringify(nodesData)};
  var EDGES = ${JSON.stringify(autoEdges)};
  var BG = '${bgColor}';

  if(NODES.length===0){document.getElementById('empty').style.display='flex';return;}

  var W=window.innerWidth, H=window.innerHeight;
  var svg=d3.select('#svg');
  var hint=document.getElementById('zoom-hint');

  // ── 箭头标记（每条边独立 marker，颜色与连线一致）──
  var defs=svg.append('defs');
  // 节点图片 clipPath（每个有图片的节点创建圆形裁切）
  NODES.forEach(function(n){
    if(n.imageUrl){
      defs.append('clipPath').attr('id','clip-'+n.id)
        .append('circle').attr('cx',0).attr('cy',0).attr('r',n.r-2);
    }
  });
  // 预置3种 quality 的 marker（fallback）
  ['positive','neutral','draining'].forEach(function(q){
    var col=q==='positive'?'#C07070':q==='neutral'?'#7090A8':'#8A8A8A';
    defs.append('marker').attr('id','arr-'+q)
      .attr('viewBox','0 -4 8 8').attr('refX',8).attr('refY',0)
      .attr('markerWidth',5).attr('markerHeight',5).attr('orient','auto')
      .append('path').attr('d','M0,-3.5L8,0L0,3.5Z').attr('fill',col);
    defs.append('marker').attr('id','arr-rev-'+q)
      .attr('viewBox','-8 -4 8 8').attr('refX',-8).attr('refY',0)
      .attr('markerWidth',5).attr('markerHeight',5).attr('orient','auto')
      .append('path').attr('d','M0,-3.5L-8,0L0,3.5Z').attr('fill',col);
  });
  // 每条边用 arrowColor 创建独立 marker，确保颜色与连线完全一致
  EDGES.forEach(function(e,i){
    var col=e.arrowColor||e.color;
    defs.append('marker').attr('id','arr-e'+i)
      .attr('viewBox','0 -4 8 8').attr('refX',8).attr('refY',0)
      .attr('markerWidth',5).attr('markerHeight',5).attr('orient','auto')
      .append('path').attr('d','M0,-3.5L8,0L0,3.5Z').attr('fill',col);
    defs.append('marker').attr('id','arr-rev-e'+i)
      .attr('viewBox','-8 -4 8 8').attr('refX',-8).attr('refY',0)
      .attr('markerWidth',5).attr('markerHeight',5).attr('orient','auto')
      .append('path').attr('d','M0,-3.5L-8,0L0,3.5Z').attr('fill',col);
  });

  // ── 缩放/平移容器 ────────────────────────────────
  var zoomG=svg.append('g').attr('class','zoom-g');
  var zoom=d3.zoom().scaleExtent([0.2,5])
    .on('zoom',function(event){zoomG.attr('transform',event.transform);});
  svg.call(zoom).call(zoom.transform, d3.zoomIdentity.translate(W/2,H/2));

  function showHint(){
    hint.style.opacity='1';
    clearTimeout(hint._t);
    hint._t=setTimeout(function(){hint.style.opacity='0';},2000);
  }

  // ── 装饰圆环 ─────────────────────────────────────
  [80,160,260,380].forEach(function(r){
    zoomG.append('circle').attr('class','ring').attr('cx',0).attr('cy',0).attr('r',r);
  });

  // ── 力模拟 ───────────────────────────────────────
  var simNodes=NODES.map(function(d){return Object.assign({},d);});
  var simLinks=EDGES.map(function(e){return Object.assign({},e,{source:e.source,target:e.target});});

  var sim=d3.forceSimulation(simNodes)
    .force('link',d3.forceLink(simLinks).id(function(d){return d.id;}).distance(220).strength(0.45))
    .force('charge',d3.forceManyBody().strength(-320))
    .force('collide',d3.forceCollide().radius(function(d){return (d.r||18)+30;}))
    .force('x',d3.forceX(0).strength(0.03))
    .force('y',d3.forceY(0).strength(0.03));

  // ── 连线（path 实现，通过 refX 精确停在节点边缘）──
  var linkG=zoomG.append('g');
  var linkSel=linkG.selectAll('path').data(simLinks).enter()
    .append('path').attr('class','link')
    .attr('stroke',function(d){return d.color;})
    .attr('stroke-width',function(d){return d.width;})
    .attr('stroke-dasharray',function(d){return d.lineStyle==='dashed'?'6 4':null;})
    .attr('marker-end',function(d,i){
      return (d.direction==='source_to_target'||d.direction==='both')?'url(#arr-e'+i+')':null;
    })
    .attr('marker-start',function(d,i){
      return (d.direction==='target_to_source'||d.direction==='both')?'url(#arr-rev-e'+i+')':null;
    });

  // ── 连线标签（关系标签上方，★信任分数下方，分两行独立 text）──
  var labelLinks=simLinks.filter(function(d){return !!d.label;});
  var trustLinks=simLinks.filter(function(d){return d.trust>0;});
  var allAnnotated=simLinks.filter(function(d){return d.label||d.trust>0;});

  // 背景胶囊（统一垫在所有标签下方，去掉默认黑色描边）
  var labelBgSel=zoomG.append('g').selectAll('rect').data(allAnnotated).enter()
    .append('rect').attr('rx',6).attr('ry',6)
    .attr('fill',BG).attr('stroke','none').attr('opacity',0.82);

  // 关系标签（连线中点，偏上 -7px）
  var labelSel=zoomG.append('g').selectAll('text').data(labelLinks).enter()
    .append('text').attr('class','link-label')
    .text(function(d){return d.label;});

  // 信任分数（连线中点，偏下 +6px；仅 trust>0 时显示）
  var trustSel=zoomG.append('g').selectAll('text').data(trustLinks).enter()
    .append('text').attr('class','link-trust')
    .text(function(d){return '★'+d.trust;});

  // ── 节点拖动 ─────────────────────────────────────
  var drag=d3.drag()
    .on('start',function(event,d){if(!event.active)sim.alphaTarget(0.3).restart();d.fx=d.x;d.fy=d.y;hideMenu();})
    .on('drag',function(event,d){d.fx=event.x;d.fy=event.y;})
    .on('end',function(event,d){if(!event.active)sim.alphaTarget(0);d.fx=null;d.fy=null;});

  // ── 节点组 ───────────────────────────────────────
  var nodeG=zoomG.append('g');
  var nodeGrp=nodeG.selectAll('g').data(simNodes).enter().append('g').call(drag);

  nodeGrp.append('circle')
    .attr('class',function(d){return 'node-circle'+(d.isCenter?' center':'');})
    .attr('r',function(d){return d.r;})
    .attr('fill',function(d){return d.color;})
    .attr('stroke','#FFF8F0').attr('stroke-width',2.5);

  // 有图片的节点显示图片，否则显示 emoji
  nodeGrp.each(function(d){
    var g=d3.select(this);
    if(d.imageUrl){
      g.append('image')
        .attr('href',d.imageUrl)
        .attr('x',function(){return -d.r+2;})
        .attr('y',function(){return -d.r+2;})
        .attr('width',function(){return (d.r-2)*2;})
        .attr('height',function(){return (d.r-2)*2;})
        .attr('clip-path','url(#clip-'+d.id+')')
        .attr('preserveAspectRatio','xMidYMid slice')
        .style('pointer-events','none');
    } else {
      g.append('text').attr('text-anchor','middle').attr('dominant-baseline','central')
        .style('font-size',function(){return Math.max(11,d.r*0.85)+'px';})
        .style('pointer-events','none').text(d.emoji||'👤');
    }
  });

  nodeGrp.append('text').attr('class','node-label')
    .attr('dy',function(d){return d.r+14;}).text(function(d){return d.name;});

  // ── 长按/点击菜单 ────────────────────────────────
  var menuSel=zoomG.append('g').attr('id','ctx-menu').style('display','none');
  var menuW=108,menuItemH=30,menuPad=8;
  var menuItems=['添加连接','编辑节点','删除节点'];
  var menuBg=menuSel.append('rect').attr('rx',10).attr('ry',10)
    .attr('fill','${menuBgCol}').attr('stroke','#D4C4A8').attr('stroke-width',1.2);
  var menuTexts=menuSel.selectAll('text').data(menuItems).enter()
    .append('text').attr('class','menu-item').text(function(d){return d;})
    .attr('text-anchor','middle').attr('dominant-baseline','middle');
  var menuData={nodeId:null};

  function showMenu(x,y,nodeId){
    menuData.nodeId=nodeId;
    var mh=menuItems.length*menuItemH+menuPad*2;
    menuBg.attr('x',x).attr('y',y).attr('width',menuW).attr('height',mh);
    menuTexts.attr('x',x+menuW/2).attr('y',function(d,i){return y+menuPad+menuItemH*i+menuItemH/2;});
    menuSel.style('display',null);
  }
  function hideMenu(){menuSel.style('display','none');}

  menuTexts.on('click',function(event,d){
    event.stopPropagation();
    var action=d==='添加连接'?'ADD_EDGE':d==='编辑节点'?'EDIT_NODE':'DELETE_NODE';
    try{window.ReactNativeWebView.postMessage(JSON.stringify({action:action,nodeId:menuData.nodeId}));}
    catch(e){console.log(action,menuData.nodeId);}
    hideMenu();
  });

  var longPressTimer=null;
  nodeGrp.on('touchstart',function(event,d){
    event.preventDefault();
    var t=event.touches[0];
    var pt=svg.node().createSVGPoint();
    pt.x=t.clientX;pt.y=t.clientY;
    var svgP=pt.matrixTransform(zoomG.node().getScreenCTM().inverse());
    longPressTimer=setTimeout(function(){showMenu(svgP.x+5,svgP.y+5,d.id);},600);
  }).on('touchend',function(){if(longPressTimer){clearTimeout(longPressTimer);longPressTimer=null;}})
    .on('touchmove',function(){if(longPressTimer){clearTimeout(longPressTimer);longPressTimer=null;}})
    .on('click',function(event,d){
      var pt=svg.node().createSVGPoint();pt.x=event.clientX;pt.y=event.clientY;
      var svgP=pt.matrixTransform(zoomG.node().getScreenCTM().inverse());
      showMenu(svgP.x+5,svgP.y+5,d.id);
    });

  svg.on('click',function(){hideMenu();});

  // ── tick 更新（path 精确计算端点，留出节点半径；curve 用二次贝塞尔）──
  sim.on('tick',function(){
    linkSel.attr('d',function(d){
      var dx=d.target.x-d.source.x, dy=d.target.y-d.source.y;
      var dist=Math.sqrt(dx*dx+dy*dy)||1;
      var sr=d.source.r||18, tr=d.target.r||18;
      var pad=2;
      var x1=d.source.x+dx/dist*(sr+pad);
      var y1=d.source.y+dy/dist*(sr+pad);
      var x2=d.target.x-dx/dist*(tr+pad+7);
      var y2=d.target.y-dy/dist*(tr+pad+7);
      if(d.lineStyle==='curve'){
        var mx=(x1+x2)/2, my=(y1+y2)/2;
        var nx=-dy/dist*40, ny=dx/dist*40;
        return 'M'+x1+','+y1+' Q'+(mx+nx)+','+(my+ny)+' '+x2+','+y2;
      }
      return 'M'+x1+','+y1+' L'+x2+','+y2;
    });
    // 各连线中点（曲线取贝塞尔视觉中点）
    var midX=function(d){
      if(d.lineStyle==='curve'){
        var dx=d.target.x-d.source.x,dy=d.target.y-d.source.y,dist=Math.sqrt(dx*dx+dy*dy)||1;
        var sr=d.source.r||18,tr=d.target.r||18,pad=2;
        var x1=d.source.x+dx/dist*(sr+pad);
        var x2=d.target.x-dx/dist*(tr+pad+7);
        var mx=(x1+x2)/2,nx=-dy/dist*40;
        return (x1+2*(mx+nx)+x2)/4;
      }
      return (d.source.x+d.target.x)/2;
    };
    var midY=function(d){
      if(d.lineStyle==='curve'){
        var dx=d.target.x-d.source.x,dy=d.target.y-d.source.y,dist=Math.sqrt(dx*dx+dy*dy)||1;
        var sr=d.source.r||18,tr=d.target.r||18,pad=2;
        var y1=d.source.y+dy/dist*(sr+pad);
        var y2=d.target.y-dy/dist*(tr+pad+7);
        var my=(y1+y2)/2,ny=dx/dist*40;
        return (y1+2*(my+ny)+y2)/4;
      }
      return (d.source.y+d.target.y)/2;
    };
    // 关系标签：中点偏上 -7px
    labelSel.attr('x',midX).attr('y',function(d){return midY(d)-7;});
    // 信任分数：中点偏下 +6px
    trustSel.attr('x',midX).attr('y',function(d){return midY(d)+6;});
    // 背景胶囊跟随
    labelSel.each(function(d){
      try{ var bb=this.getBBox(); d._lbx=bb.x; d._lby=bb.y; d._lbw=bb.width; }catch(e){}
    });
    trustSel.each(function(d){
      try{ var bb=this.getBBox(); d._tbx=bb.x; d._tby=bb.y; d._tbw=bb.width; }catch(e){}
    });
    labelBgSel.attr('x',function(d){
        var lx=d._lbx!=null?d._lbx:midX(d)-20;
        var tx=d._tbx!=null?d._tbx:midX(d)-12;
        return Math.min(lx,tx)-4;
      })
      .attr('y',function(d){
        var ly=d._lby!=null?d._lby:midY(d)-14;
        return ly-2;
      })
      .attr('width',function(d){
        var lw=d._lbw||0,tw=d._tbw||0; return Math.max(lw,tw)+8;
      })
      .attr('height',function(d){
        return (d.label&&d.trust>0)?24:14;
      });
    nodeGrp.attr('transform',function(d){return 'translate('+d.x+','+d.y+')';});
  });

  setTimeout(showHint,800);
  window.addEventListener('resize',function(){W=window.innerWidth;H=window.innerHeight;});

  // ── 初始锁定状态（由 RN 在构建 HTML 时注入）──
  // 锁定时：禁用 zoom/pan；节点拖拽仍然正常
  var initialLocked=${initialLocked ? 'true' : 'false'};
  if(initialLocked){ svg.on('.zoom',null); }
})();
</script>
</body>
</html>`;
}

// ── 可拖动纯净模式按钮（Gesture + Reanimated）────────────────────
function DraggablePureBtn({
  pureMode, onToggle, screenW, screenH,
}: { pureMode: boolean; onToggle: () => void; screenW: number; screenH: number }) {
  const BTN = 44, MARGIN = 8;
  const posX = useSharedValue(screenW - BTN - MARGIN - 16);
  const posY = useSharedValue(64);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const iconOpacity = useSharedValue(1);

  React.useEffect(() => {
    iconOpacity.value = withTiming(pureMode ? 0.65 : 1, { duration: 200 });
  }, [pureMode]);

  const tap = Gesture.Tap().maxDistance(8).onEnd(() => { runOnJS(onToggle)(); });
  const pan = Gesture.Pan().minDistance(8)
    .onStart(() => { startX.value = posX.value; startY.value = posY.value; })
    .onUpdate(e => {
      posX.value = Math.max(MARGIN, Math.min(screenW - BTN - MARGIN, startX.value + e.translationX));
      posY.value = Math.max(MARGIN + 44, Math.min(screenH - BTN - MARGIN - 20, startY.value + e.translationY));
    });
  const composed = Gesture.Exclusive(tap, pan);
  const animStyle = useAnimatedStyle(() => ({ position: 'absolute' as const, left: posX.value, top: posY.value, zIndex: 9999 }));
  const iconStyle = useAnimatedStyle(() => ({ opacity: iconOpacity.value }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={animStyle}>
        <View style={{ width: BTN, height: BTN, borderRadius: BTN / 2,
          backgroundColor: pureMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.38)',
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1.5, borderColor: pureMode ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)',
          boxShadow: '0px 3px 12px rgba(0,0,0,0.30)' }}>
          <Animated.View style={iconStyle}>
            {pureMode ? <Eye size={18} color="#fff" /> : <EyeOff size={18} color="#fff" />}
          </Animated.View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// ── 图片上传工具函数 ─────────────────────────────────────────────
const BUCKET = 'app-cbrme32s08ox-node-images';

async function compressNodeImage(uri: string, mimeType?: string, width?: number) {
  const isPng = mimeType === 'image/png';
  const format = isPng ? SaveFormat.PNG : SaveFormat.JPEG;
  const actions = width && width > 300 ? [{ resize: { width: 300 } }] : [];
  const result = await manipulateAsync(uri, actions, { compress: isPng ? 1 : 0.7, format });
  return { uri: result.uri, format };
}

async function uploadNodeImage(uri: string, format: SaveFormat): Promise<string> {
  const ext = format === SaveFormat.PNG ? 'png' : 'jpg';
  const mime = format === SaveFormat.PNG ? 'image/png' : 'image/jpeg';
  const path = `images/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  const ab = decode(base64);
  const { error } = await supabase.storage.from(BUCKET).upload(path, ab, { contentType: mime, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ── 主页面 ───────────────────────────────────────────────────────
export default function LoveNetworkScreen() {
  const router = useRouter();
  useSession();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [nodes, setNodes] = useState<RelNode[]>([]);
  const [edges, setEdges] = useState<RelEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [pureMode, setPureMode] = useState(false);
  const [viewLocked, setViewLocked] = useState(false);
  const webViewRef = useRef<WebViewType>(null);

  // 弹窗状态
  const [showNodeForm, setShowNodeForm] = useState(false);
  const [showEdgeForm, setShowEdgeForm] = useState(false);
  const [showList, setShowList] = useState(false);
  // BottomSheet 动画：translateY（0=展开，SHEET_H=收起）
  const SHEET_H = screenH * 0.76;
  const sheetY = useSharedValue(SHEET_H);
  const sheetOverlay = useSharedValue(0);

  const openList = useCallback(() => {
    setShowList(true);
    sheetY.value = withSpring(0, { damping: 22, stiffness: 180, mass: 0.8 });
    sheetOverlay.value = withTiming(1, { duration: 220 });
  }, [sheetY, sheetOverlay]);

  const closeList = useCallback(() => {
    sheetY.value = withSpring(SHEET_H, { damping: 22, stiffness: 180, mass: 0.8 });
    sheetOverlay.value = withTiming(0, { duration: 180 });
    setTimeout(() => setShowList(false), 280);
  }, [sheetY, sheetOverlay, SHEET_H]);
  const [showInsight, setShowInsight] = useState(false);
  const [editNode, setEditNode] = useState<RelNode | null>(null);
  const [preselectedSourceId, setPreselectedSourceId] = useState<string | null>(null);

  // AI
  const [aiInsight, setAiInsight] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // 节点图片上传状态
  const [nodeImageUploading, setNodeImageUploading] = useState(false);
  const [nodeImageError, setNodeImageError] = useState('');
  const [nodeImageLocalUri, setNodeImageLocalUri] = useState<string | null>(null);

  // 节点表单
  const emptyNodeForm = () => ({
    name: '', role: '朋友', tags: [] as string[],
    quality: 'positive' as RelNode['quality'],
    trust_score: 7, comfort_score: 7,
    distance: 150, angle: Math.random() * 360,
    avatar_emoji: '😊', note: '',
    is_center: false,
    node_color: '#8B5E3C',
    node_image_url: null as string | null,
  });
  const [nodeForm, setNodeForm] = useState(emptyNodeForm());

  // 背景主题 + 自定义背景色
  const [bgThemeIdx, setBgThemeIdx] = useState(0);
  const [showBgPanel, setShowBgPanel] = useState(false);
  const [customBgColor, setCustomBgColor] = useState('');
  const currentBg = customBgColor
    ? { name: '自定义', color: customBgColor, textColor: '#2E1B0E' }
    : BG_THEMES[bgThemeIdx];

  // 编辑连线
  const [editEdge, setEditEdge] = useState<RelEdge | null>(null);

  // 关系边表单
  const emptyEdgeForm = () => ({
    source_id: '', target_id: '',
    label: '', direction: 'both' as RelEdge['direction'],
    quality: 'neutral' as RelEdge['quality'],
    trust_score: 7,
    line_style: 'solid' as RelEdge['line_style'],
  });
  const [edgeForm, setEdgeForm] = useState(emptyEdgeForm());
  // 是否在图上显示信任分数
  const [showTrustScore, setShowTrustScore] = useState(false);

  // 色盘弹窗
  const [colorPickerTarget, setColorPickerTarget] = useState<'node' | 'bg' | null>(null);

  const { session } = useSession();
  const userId = session?.user?.id;  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      const [{ data: nd }, { data: ed }] = await Promise.all([
        supabase.from('relationship_nodes').select('*').order('created_at'),
        supabase.from('rel_edges').select('*').order('created_at'),
      ]);
      setNodes((nd ?? []) as RelNode[]);
      setEdges((ed ?? []) as RelEdge[]);
      setLoading(false);
    })();
  }, []));

  // ── 锁定界面切换：直接切换 state，html 重新生成并 WebView key 变化强制重载 ──
  const toggleViewLock = useCallback(() => {
    setViewLocked(v => !v);
  }, []);

  // ── 节点图片选取上传 ────────────────────────────────────────
  const pickAndUploadNodeImage = async () => {
    setNodeImageError('');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setNodeImageError('需要相册权限才能选择图片，请在设置中开启');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setNodeImageLocalUri(asset.uri);
    setNodeImageUploading(true);
    try {
      const { uri, format } = await compressNodeImage(asset.uri, asset.mimeType ?? undefined, asset.width ?? undefined);
      const publicUrl = await uploadNodeImage(uri, format);
      setNodeForm(f => ({ ...f, node_image_url: publicUrl }));
    } catch {
      setNodeImageError('上传失败，请重试');
      setNodeImageLocalUri(null);
    } finally {
      setNodeImageUploading(false);
    }
  };
  const saveNode = async () => {
    if (!nodeForm.name.trim()) return;
    const payload = { ...nodeForm, user_id: userId };
    if (editNode) {
      const { data } = await supabase.from('relationship_nodes').update(payload).eq('id', editNode.id).select().single();
      if (data) setNodes(prev => prev.map(n => n.id === editNode.id ? data as RelNode : n));
    } else {
      const { data } = await supabase.from('relationship_nodes').insert(payload).select().single();
      if (data) setNodes(prev => [...prev, data as RelNode]);
    }
    setShowNodeForm(false);
    setEditNode(null);
    setNodeForm(emptyNodeForm());
    setNodeImageLocalUri(null);
    setNodeImageError('');
  };
  const deleteNode = async (id: string) => {
    await Promise.all([
      supabase.from('relationship_nodes').delete().eq('id', id),
      supabase.from('rel_edges').delete().or(`source_id.eq.${id},target_id.eq.${id}`),
    ]);
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.source_id !== id && e.target_id !== id));
  };

  // ── 保存关系边（upsert：相同 source+target 替换旧关系）──────────
  const saveEdge = async () => {
    if (!edgeForm.source_id || !edgeForm.target_id) return;
    const payload = { ...edgeForm, user_id: userId };
    if (editEdge) {
      // 编辑模式：更新已有边
      const { data } = await supabase.from('rel_edges').update(payload).eq('id', editEdge.id).select().single();
      if (data) setEdges(prev => prev.map(e => e.id === editEdge.id ? data as RelEdge : e));
    } else {
      // 检查是否已存在相同节点对的关系（正向或反向）
      const existing = edges.find(e =>
        (e.source_id === edgeForm.source_id && e.target_id === edgeForm.target_id) ||
        (e.source_id === edgeForm.target_id && e.target_id === edgeForm.source_id)
      );
      if (existing) {
        await supabase.from('rel_edges').delete().eq('id', existing.id);
        const { data } = await supabase.from('rel_edges').insert(payload).select().single();
        if (data) setEdges(prev => [...prev.filter(e => e.id !== existing.id), data as RelEdge]);
      } else {
        const { data } = await supabase.from('rel_edges').insert(payload).select().single();
        if (data) setEdges(prev => [...prev, data as RelEdge]);
      }
    }
    setShowEdgeForm(false);
    setEditEdge(null);
    setEdgeForm(emptyEdgeForm());
    setPreselectedSourceId(null);
  };

  // ── WebView → RN 消息（节点长按菜单）──────────────
  const handleWebViewMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { action: string; nodeId: string };
      const node = nodes.find(n => n.id === msg.nodeId);
      if (!node) return;
      if (msg.action === 'ADD_EDGE') {
        setEdgeForm({ ...emptyEdgeForm(), source_id: msg.nodeId });
        setPreselectedSourceId(msg.nodeId);
        setShowEdgeForm(true);
      } else if (msg.action === 'EDIT_NODE') {
        setEditNode(node);
        setNodeForm({ name: node.name, role: node.role, tags: node.tags, quality: node.quality, trust_score: node.trust_score, comfort_score: node.comfort_score, distance: node.distance, angle: node.angle, avatar_emoji: node.avatar_emoji, note: node.note, is_center: node.is_center, node_color: node.node_color || '#8B5E3C', node_image_url: node.node_image_url ?? null });
        setNodeImageLocalUri(node.node_image_url ?? null);
        setNodeImageError('');
        setShowNodeForm(true);
      } else if (msg.action === 'DELETE_NODE') {
        deleteNode(node.id);
      }
    } catch (e) { /* ignore */ }
  };

  // ── AI 洞察 ─────────────────────────────────────────
  const getAiInsight = async () => {
    if (nodes.length === 0) return;
    setAiLoading(true);
    setShowInsight(true);

    // 校验并扣减每日 AI 积分额度（每次洞察消耗 5 点积分）
    const quota = await checkAndConsumeCredits(5);
    if (!quota.allowed) {
      setAiInsight(quota.message || '今日 AI 积分额度不足（单次洞察消耗5点），每日 24:00 自动重置。升级心愈版或工作台版享更多额度。');
      setAiLoading(false);
      return;
    }

    const nodeSummary = nodes.map(n => `${n.name}（${n.role}，${n.quality}，信任${n.trust_score}/10）`).join('；');
    const edgeSummary = edges.map(e => {
      const s = nodes.find(n => n.id === e.source_id)?.name ?? '?';
      const t = nodes.find(n => n.id === e.target_id)?.name ?? '?';
      return `${s}→${t}「${e.label}」`;
    }).join('；');
    try {
      const content = await streamAiChat({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: '你是萨提亚式关系咨询师，根据用户关系网络给出温暖有洞察力的分析，指出支持系统优势和需关注之处，提供2-3个建议，不超过250字。' },
          { role: 'user', content: `节点：${nodeSummary}\n关系：${edgeSummary || '（尚未添加关系边）'}` },
        ],
      });
      setAiInsight(content || '暂时无法获取洞察，请稍后重试。');
    } catch (e) {
      setAiInsight('获取洞察失败，请稍后重试。');
    } finally {
      setAiLoading(false);
    }
  };

  const html = buildNetworkHtml(nodes, edges, currentBg.color, showTrustScore, viewLocked);

  return (
    <View style={{ flex: 1, backgroundColor: THEME.bg }}>
      <StatusBar style="dark" />

      {/* ── 全屏网络图 ── */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        {loading
          ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={THEME.primary} size="large" />
            </View>
          : (process.env.EXPO_OS !== 'web'
              ? <WebView key={viewLocked ? 'locked' : 'unlocked'} ref={webViewRef} source={{ html }} style={{ flex: 1 }} originWhitelist={['*']}
                  javaScriptEnabled domStorageEnabled scrollEnabled={false}
                  onMessage={handleWebViewMessage} />
              : <iframe srcDoc={html} style={{ width: '100%', height: '100%', border: 'none' }} title="关系网络图" />
            )
        }
      </View>

      {/* ── 可拖动纯净按钮 ── */}
      <DraggablePureBtn pureMode={pureMode} onToggle={() => setPureMode(v => !v)} screenW={screenW} screenH={screenH} />

      {/* ── 普通模式 UI ── */}
      {!pureMode && (
        <>
          {/* 顶部导航 */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0,
            paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16,
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: 'rgba(248,243,238,0.85)',
            borderBottomWidth: 1, borderBottomColor: 'rgba(212,196,168,0.4)' }}>
            <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18,
              backgroundColor: 'rgba(139,94,60,0.1)', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={20} color={THEME.primary} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: THEME.text }}>🌐 关系网络图</Text>
            </View>
            {/* 锁定按钮：锁定后禁止背景平移/缩放，节点拖拽不受影响 */}
            <Pressable onPress={toggleViewLock}
              style={{ width: 36, height: 36, borderRadius: 18,
                backgroundColor: viewLocked ? THEME.primary : 'rgba(139,94,60,0.1)',
                alignItems: 'center', justifyContent: 'center' }}>
              {viewLocked
                ? <Lock size={18} color="#fff" />
                : <Unlock size={18} color={THEME.primary} />}
            </Pressable>
          </View>

          {/* 背景切换面板 */}
          {showBgPanel && (
            <View style={{ position: 'absolute', bottom: 100, left: 16, right: 16,
              backgroundColor: THEME.card, borderRadius: 20, padding: 16,
              borderWidth: 1, borderColor: THEME.cardBorder,
              boxShadow: '0px 4px 20px rgba(0,0,0,0.18)' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: THEME.sub, marginBottom: 10 }}>选择背景</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                {BG_THEMES.map((bg, idx) => (
                  <Pressable key={bg.color} onPress={() => { setBgThemeIdx(idx); setCustomBgColor(''); setShowBgPanel(false); }}
                    style={{ alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12,
                      backgroundColor: bg.color,
                      borderWidth: bgThemeIdx === idx && !customBgColor ? 2.5 : 1.5,
                      borderColor: bgThemeIdx === idx && !customBgColor ? THEME.primary : THEME.cardBorder,
                      boxShadow: '0px 2px 6px rgba(0,0,0,0.15)' }} />
                    <Text style={{ fontSize: 9, color: THEME.sub, fontWeight: bgThemeIdx === idx && !customBgColor ? '700' : '400' }}>
                      {bg.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {/* 自定义背景色 */}
              <Pressable onPress={() => setColorPickerTarget('bg')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: '#F5EEE6', borderRadius: 12, borderWidth: 1.5,
                  borderColor: customBgColor ? THEME.primary : THEME.cardBorder,
                  paddingHorizontal: 14, paddingVertical: 10 }}>
                <View style={{ width: 28, height: 28, borderRadius: 8,
                  backgroundColor: customBgColor || currentBg.color,
                  borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.1)' }} />
                <Text style={{ flex: 1, fontSize: 13, color: THEME.text, fontWeight: '500' }}>
                  {customBgColor ? customBgColor.toUpperCase() : '自定义颜色…'}
                </Text>
                {customBgColor ? (
                  <Pressable onPress={() => setCustomBgColor('')} style={{ padding: 4 }} hitSlop={8}>
                    <X size={14} color={THEME.sub} />
                  </Pressable>
                ) : null}
                <Palette size={16} color={THEME.primary} />
                <Text style={{ fontSize: 12, color: THEME.primary, fontWeight: '700' }}>色盘</Text>
              </Pressable>
            </View>
          )}

          {/* 底部操作栏 */}
          <View style={{ position: 'absolute', bottom: 36, left: 16, right: 16, flexDirection: 'row', gap: 8 }}>
            {/* 添加节点 */}
            <Pressable onPress={() => { setEditNode(null); setNodeForm(emptyNodeForm()); setNodeImageLocalUri(null); setNodeImageError(''); setShowNodeForm(true); setShowBgPanel(false); }}
              style={{ flex: 1, height: 50, borderRadius: 25, backgroundColor: THEME.primary,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: '0px 3px 10px rgba(0,0,0,0.25)' }}>
              <Plus size={18} color="#fff" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>添加节点</Text>
            </Pressable>

            {/* 添加关系边 */}
            <Pressable onPress={() => { setEdgeForm(emptyEdgeForm()); setPreselectedSourceId(null); setShowEdgeForm(true); setShowBgPanel(false); }}
              disabled={nodes.length < 2}
              style={{ width: 50, height: 50, borderRadius: 25,
                backgroundColor: nodes.length < 2 ? 'rgba(139,94,60,0.3)' : 'rgba(139,94,60,0.85)',
                alignItems: 'center', justifyContent: 'center',
                boxShadow: '0px 2px 8px rgba(0,0,0,0.18)' }}>
              <GitBranch size={18} color="#fff" />
            </Pressable>

            {/* 背景切换 */}
            <Pressable onPress={() => setShowBgPanel(v => !v)}
              style={{ width: 50, height: 50, borderRadius: 25,
                backgroundColor: showBgPanel ? THEME.primary : 'rgba(255,248,238,0.95)',
                borderWidth: 1.5, borderColor: showBgPanel ? THEME.primary : THEME.cardBorder,
                alignItems: 'center', justifyContent: 'center',
                boxShadow: '0px 2px 6px rgba(0,0,0,0.12)' }}>
              <Palette size={18} color={showBgPanel ? '#fff' : THEME.primary} />
            </Pressable>

            {/* 列表 */}
            <Pressable onPress={() => { openList(); setShowBgPanel(false); }}
              style={{ width: 50, height: 50, borderRadius: 25,
                backgroundColor: 'rgba(255,248,238,0.95)',
                borderWidth: 1.5, borderColor: THEME.cardBorder,
                alignItems: 'center', justifyContent: 'center',
                boxShadow: '0px 2px 6px rgba(0,0,0,0.12)' }}>
              <List size={18} color={THEME.primary} />
            </Pressable>

            {/* AI 洞察 */}
            <Pressable onPress={getAiInsight} disabled={aiLoading}
              style={{ width: 50, height: 50, borderRadius: 25,
                backgroundColor: aiLoading ? 'rgba(192,112,112,0.5)' : '#C07070',
                alignItems: 'center', justifyContent: 'center',
                boxShadow: '0px 2px 8px rgba(0,0,0,0.18)' }}>
              {aiLoading ? <ActivityIndicator size="small" color="#fff" /> : <Sparkles size={18} color="#fff" />}
            </Pressable>
          </View>

          {/* 节点/边数量提示 */}
          {nodes.length > 0 && (
            <View style={{ position: 'absolute', bottom: 96, left: 16,
              backgroundColor: 'rgba(248,243,238,0.9)', borderRadius: 99,
              paddingHorizontal: 12, paddingVertical: 5,
              borderWidth: 1, borderColor: THEME.cardBorder }}>
              <Text style={{ fontSize: 11, color: THEME.sub }}>
                {nodes.length} 个节点 · {edges.length} 条关系 · 长按节点添加连接
              </Text>
            </View>
          )}
        </>
      )}

      {/* ════ Modal：添加/编辑节点 ════ */}
      <Modal visible={showNodeForm} transparent animationType="slide"
        onRequestClose={() => { setShowNodeForm(false); setEditNode(null); setNodeImageLocalUri(null); setNodeImageError(''); }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          onPress={() => { setShowNodeForm(false); setEditNode(null); setNodeImageLocalUri(null); setNodeImageError(''); }}>
          <Pressable style={{ backgroundColor: THEME.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48 }}
            onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: THEME.text }}>
                  {editNode ? '编辑节点' : '添加节点'}
                </Text>
                <Pressable onPress={() => { setShowNodeForm(false); setEditNode(null); setNodeImageLocalUri(null); setNodeImageError(''); }}>
                  <X size={22} color={THEME.sub} />
                </Pressable>
              </View>

              {/* 是否为起点 */}
              <Pressable onPress={() => setNodeForm(f => ({ ...f, is_center: !f.is_center }))}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14,
                  padding: 12, borderRadius: 12,
                  backgroundColor: nodeForm.is_center ? THEME.primary + '18' : '#F5EEE6',
                  borderWidth: 1.5, borderColor: nodeForm.is_center ? THEME.primary : THEME.cardBorder }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                  borderColor: THEME.primary, backgroundColor: nodeForm.is_center ? THEME.primary : 'transparent',
                  alignItems: 'center', justifyContent: 'center' }}>
                  {nodeForm.is_center && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />}
                </View>
                <Text style={{ fontSize: 13, color: THEME.text, fontWeight: '600' }}>设为中心节点（自定义起点）</Text>
              </Pressable>

              {/* 姓名 */}
              <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 6 }}>名字/称呼 *</Text>
              <TextInput value={nodeForm.name} onChangeText={v => setNodeForm(f => ({ ...f, name: v }))}
                placeholder="节点名称" placeholderTextColor={THEME.sub + '60'}
                style={{ backgroundColor: '#F5EEE6', borderRadius: 12, borderWidth: 1.5, borderColor: THEME.cardBorder,
                  paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: THEME.text, marginBottom: 14 }} />

              {/* 节点颜色 */}
              <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 8 }}>节点颜色</Text>
              {/* 快捷色板 */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {NODE_COLORS.map(c => (
                  <Pressable key={c} onPress={() => setNodeForm(f => ({ ...f, node_color: c }))}
                    style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c,
                      borderWidth: nodeForm.node_color === c ? 3 : 1.5,
                      borderColor: nodeForm.node_color === c ? THEME.text : 'transparent',
                      alignItems: 'center', justifyContent: 'center' }}>
                    {nodeForm.node_color === c && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff', opacity: 0.8 }} />}
                  </Pressable>
                ))}
              </View>
              {/* 当前色预览 + 打开色盘按钮 */}
              <Pressable onPress={() => setColorPickerTarget('node')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18,
                  backgroundColor: '#F5EEE6', borderRadius: 12, borderWidth: 1.5,
                  borderColor: THEME.cardBorder, paddingHorizontal: 14, paddingVertical: 10 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: nodeForm.node_color,
                  borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.1)' }} />
                <Text style={{ flex: 1, fontSize: 13, color: THEME.text, fontWeight: '500', letterSpacing: 0.5 }}>
                  {nodeForm.node_color.toUpperCase()}
                </Text>
                <Palette size={16} color={THEME.primary} />
                <Text style={{ fontSize: 12, color: THEME.primary, fontWeight: '700' }}>自定义</Text>
              </Pressable>
              <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 8 }}>头像</Text>
              <FlatList horizontal data={EMOJI_OPTIONS} keyExtractor={i => i}
                showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}
                renderItem={({ item }) => (
                  <Pressable onPress={() => setNodeForm(f => ({ ...f, avatar_emoji: item }))}
                    style={{ width: 38, height: 38, borderRadius: 19, marginRight: 8,
                      backgroundColor: nodeForm.avatar_emoji === item ? THEME.primary + '20' : '#F5EEE6',
                      borderWidth: 1.5, borderColor: nodeForm.avatar_emoji === item ? THEME.primary : THEME.cardBorder,
                      alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20 }}>{item}</Text>
                  </Pressable>
                )} />

              {/* ── 图片节点上传（头像下方）── */}
              <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 8 }}>
                照片头像（可选，替换 emoji）
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                {/* 预览框 */}
                <Pressable onPress={pickAndUploadNodeImage} disabled={nodeImageUploading}
                  style={{ width: 72, height: 72, borderRadius: 36, overflow: 'hidden',
                    backgroundColor: '#F5EEE6', borderWidth: 2,
                    borderColor: nodeForm.node_image_url ? THEME.primary : THEME.cardBorder,
                    alignItems: 'center', justifyContent: 'center' }}>
                  {nodeImageUploading
                    ? <ActivityIndicator size="small" color={THEME.primary} />
                    : nodeImageLocalUri
                      ? <Image source={{ uri: nodeImageLocalUri }} style={{ width: 72, height: 72 }} contentFit="cover" />
                      : <ImagePlus size={28} color={THEME.sub} />}
                </Pressable>
                <View style={{ flex: 1, gap: 6 }}>
                  <Pressable onPress={pickAndUploadNodeImage} disabled={nodeImageUploading}
                    style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
                      backgroundColor: nodeImageUploading ? '#F5EEE6' : THEME.primary + '15',
                      borderWidth: 1.5, borderColor: nodeImageUploading ? THEME.cardBorder : THEME.primary,
                      alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700',
                      color: nodeImageUploading ? THEME.sub : THEME.primary }}>
                      {nodeImageUploading ? '上传中…' : nodeForm.node_image_url ? '重新选择' : '从相册选择'}
                    </Text>
                  </Pressable>
                  {nodeForm.node_image_url ? (
                    <Pressable onPress={() => { setNodeForm(f => ({ ...f, node_image_url: null })); setNodeImageLocalUri(null); setNodeImageError(''); }}
                      style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12,
                        backgroundColor: '#FFF1F2', borderWidth: 1.5, borderColor: '#FCA5A5',
                        alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#DC2626' }}>移除图片</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              {nodeImageError ? (
                <Text style={{ fontSize: 12, color: '#DC2626', marginBottom: 10 }}>{nodeImageError}</Text>
              ) : null}

              <Pressable onPress={saveNode} style={{ borderRadius: 16, backgroundColor: THEME.primary,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 }}>
                <Check size={18} color="#fff" />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                  {editNode ? '保存修改' : '加入网络图'}
                </Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ════ Modal：添加关系边 ════ */}
      <Modal visible={showEdgeForm} transparent animationType="slide"
        onRequestClose={() => { setShowEdgeForm(false); setPreselectedSourceId(null); setEditEdge(null); }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          onPress={() => { setShowEdgeForm(false); setPreselectedSourceId(null); setEditEdge(null); }}>
          <Pressable style={{ backgroundColor: THEME.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48 }}
            onPress={() => {}}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: THEME.text }}>
                {editEdge ? '编辑关系连线' : '添加关系连线'}
              </Text>
              <Pressable onPress={() => { setShowEdgeForm(false); setPreselectedSourceId(null); setEditEdge(null); }}>
                <X size={22} color={THEME.sub} />
              </Pressable>
            </View>

            {/* 起点选择 */}
            <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 8 }}>
              起点节点 {preselectedSourceId && <Text style={{ color: THEME.accent }}>（已从图中选定）</Text>}
            </Text>
            <FlatList horizontal data={nodes} keyExtractor={n => n.id}
              showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}
              renderItem={({ item: n }) => (
                <Pressable onPress={() => setEdgeForm(f => ({ ...f, source_id: n.id }))}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, marginRight: 8,
                    backgroundColor: edgeForm.source_id === n.id ? THEME.primary : '#F5EEE6',
                    borderWidth: 1.5, borderColor: edgeForm.source_id === n.id ? THEME.primary : THEME.cardBorder }}>
                  <Text style={{ fontSize: 13, color: edgeForm.source_id === n.id ? '#fff' : THEME.text }}>
                    {n.avatar_emoji} {n.name}
                  </Text>
                </Pressable>
              )} />

            {/* 终点选择 */}
            <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 8 }}>终点节点</Text>
            <FlatList horizontal data={nodes.filter(n => n.id !== edgeForm.source_id)} keyExtractor={n => n.id}
              showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}
              renderItem={({ item: n }) => (
                <Pressable onPress={() => setEdgeForm(f => ({ ...f, target_id: n.id }))}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, marginRight: 8,
                    backgroundColor: edgeForm.target_id === n.id ? THEME.accent : '#F5EEE6',
                    borderWidth: 1.5, borderColor: edgeForm.target_id === n.id ? THEME.accent : THEME.cardBorder }}>
                  <Text style={{ fontSize: 13, color: edgeForm.target_id === n.id ? '#fff' : THEME.text }}>
                    {n.avatar_emoji} {n.name}
                  </Text>
                </Pressable>
              )} />

            {/* 关系标签 */}
            <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 6 }}>关系标签（显示在连线上）</Text>
            <TextInput value={edgeForm.label} onChangeText={v => setEdgeForm(f => ({ ...f, label: v }))}
              placeholder="如：朋友、暗恋、保护、竞争…" placeholderTextColor={THEME.sub + '60'}
              style={{ backgroundColor: '#F5EEE6', borderRadius: 12, borderWidth: 1.5, borderColor: THEME.cardBorder,
                paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: THEME.text, marginBottom: 14 }} />

            {/* 方向 */}
            <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 8 }}>方向</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {DIR_OPTIONS.map(d => (
                <Pressable key={d.value} onPress={() => setEdgeForm(f => ({ ...f, direction: d.value }))}
                  style={{ flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center',
                    backgroundColor: edgeForm.direction === d.value ? THEME.primary + '18' : '#F5EEE6',
                    borderWidth: 1.5, borderColor: edgeForm.direction === d.value ? THEME.primary : THEME.cardBorder }}>
                  <Text style={{ fontSize: 12, color: edgeForm.direction === d.value ? THEME.primary : THEME.sub, fontWeight: '600' }}>
                    {d.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* 关系质量 */}
            <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 8 }}>关系质量</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {(Object.keys(QUALITY_CONFIG) as RelEdge['quality'][]).map(q => (
                <Pressable key={q} onPress={() => setEdgeForm(f => ({ ...f, quality: q }))}
                  style={{ flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center',
                    backgroundColor: edgeForm.quality === q ? QUALITY_CONFIG[q].color + '20' : '#F5EEE6',
                    borderWidth: 1.5, borderColor: edgeForm.quality === q ? QUALITY_CONFIG[q].color : THEME.cardBorder }}>
                  <Text style={{ fontSize: 12, color: edgeForm.quality === q ? QUALITY_CONFIG[q].color : THEME.sub, fontWeight: '600' }}>
                    {QUALITY_CONFIG[q].label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* 线条样式 */}
            <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 8 }}>线条样式</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {LINE_STYLE_OPTIONS.map(s => (
                <Pressable key={s.value} onPress={() => setEdgeForm(f => ({ ...f, line_style: s.value }))}
                  style={{ flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center', gap: 2,
                    backgroundColor: edgeForm.line_style === s.value ? THEME.primary + '18' : '#F5EEE6',
                    borderWidth: 1.5, borderColor: edgeForm.line_style === s.value ? THEME.primary : THEME.cardBorder }}>
                  <Text style={{ fontSize: 14, color: edgeForm.line_style === s.value ? THEME.primary : THEME.sub }}>{s.icon}</Text>
                  <Text style={{ fontSize: 11, color: edgeForm.line_style === s.value ? THEME.primary : THEME.sub }}>{s.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* 信任程度 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: THEME.sub }}>
                信任程度 <Text style={{ color: THEME.primary }}>{edgeForm.trust_score}/10</Text>
              </Text>
              {/* 开关：控制是否在连线上显示 */}
              <Pressable onPress={() => setShowTrustScore(v => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 11, color: THEME.sub }}>{showTrustScore ? '连线显示' : '不显示'}</Text>
                <View style={{ width: 38, height: 22, borderRadius: 11,
                  backgroundColor: showTrustScore ? THEME.primary : THEME.cardBorder,
                  justifyContent: 'center', paddingHorizontal: 2 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                    alignSelf: showTrustScore ? 'flex-end' : 'flex-start',
                    boxShadow: '0px 1px 3px rgba(0,0,0,0.2)' }} />
                </View>
              </Pressable>
            </View>
            {/* 0-10 共11格 */}
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 22 }}>
              {Array.from({ length: 11 }).map((_, i) => (
                <Pressable key={i} onPress={() => setEdgeForm(f => ({ ...f, trust_score: i }))}
                  style={{ flex: 1, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: i <= edgeForm.trust_score ? THEME.primary : '#F5EEE6',
                    borderWidth: 1, borderColor: i <= edgeForm.trust_score ? THEME.primary : THEME.cardBorder }}>
                  <Text style={{ fontSize: 9, color: i <= edgeForm.trust_score ? '#fff' : THEME.sub }}>{i}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable onPress={saveEdge}
              disabled={!edgeForm.source_id || !edgeForm.target_id}
              style={{ borderRadius: 16,
                backgroundColor: !edgeForm.source_id || !edgeForm.target_id ? THEME.primary + '50' : THEME.primary,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 }}>
              <Check size={18} color="#fff" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                {editEdge ? '保存修改' : '添加连线'}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ════ BottomSheet：节点/边列表（Reanimated 原生线程动画，FlatList 虚拟化）════ */}
      {showList && (() => {
        // SectionList 数据：节点 section + 边 section
        const sections = [
          {
            key: 'nodes',
            title: `节点（${nodes.length}）`,
            data: nodes as (RelNode | RelEdge)[],
          },
          ...(edges.length > 0 ? [{
            key: 'edges',
            title: `关系连线（${edges.length}）`,
            data: edges as (RelNode | RelEdge)[],
          }] : []),
        ];

        const overlayStyle = {
          position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.45)',
          opacity: sheetOverlay,
        };
        const sheetStyle = {
          position: 'absolute' as const, left: 0, right: 0, bottom: 0,
          height: SHEET_H,
          backgroundColor: '#F5EEE6',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          transform: [{ translateY: sheetY }],
        };

        return (
          <>
            {/* 遮罩：点击关闭 */}
            <Animated.View style={overlayStyle} pointerEvents="auto">
              <Pressable style={{ flex: 1 }} onPress={closeList} />
            </Animated.View>

            {/* 抽屉主体 */}
            <Animated.View style={sheetStyle}>
              {/* 拖拽把手：下拉关闭 */}
              {(() => {
                const dragGesture = Gesture.Pan()
                  .onStart((_e) => { /* sheetY 作为起始值 */ })
                  .onUpdate((e) => {
                    const next = e.translationY;
                    sheetY.value = next < 0 ? 0 : next;
                    sheetOverlay.value = interpolate(sheetY.value, [0, SHEET_H], [1, 0], Extrapolate.CLAMP);
                  })
                  .onEnd((e) => {
                    if (e.translationY > 80 || e.velocityY > 600) {
                      sheetY.value = withSpring(SHEET_H, { damping: 22, stiffness: 180 });
                      sheetOverlay.value = withTiming(0, { duration: 180 });
                      runOnJS(closeList)();
                    } else {
                      sheetY.value = withSpring(0, { damping: 22, stiffness: 180 });
                      sheetOverlay.value = withTiming(1, { duration: 180 });
                    }
                  });
                return (
                  <GestureDetector gesture={dragGesture}>
                    <Animated.View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
                      <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#C8B8A2' }} />
                    </Animated.View>
                  </GestureDetector>
                );
              })()}

              {/* 标题栏 */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between',
                alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: THEME.text }}>网络概览</Text>
                <Pressable onPress={closeList} hitSlop={12}><X size={22} color={THEME.sub} /></Pressable>
              </View>

              {/* 虚拟化列表 */}
              <SectionList
                sections={sections}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 40, gap: 6 }}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews
                initialNumToRender={12}
                maxToRenderPerBatch={10}
                windowSize={5}
                renderSectionHeader={({ section }) => (
                  <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub,
                    paddingTop: 10, paddingBottom: 4 }}>
                    {section.title}
                  </Text>
                )}
                renderItem={({ item, section }) => {
                  if (section.key === 'nodes') {
                    const n = item as RelNode;
                    const cfg = QUALITY_CONFIG[n.quality];
                    return (
                      <View style={{ backgroundColor: THEME.card, borderRadius: 14, borderWidth: 1.5,
                        borderColor: cfg.color + '40', padding: 12,
                        flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 18,
                          backgroundColor: cfg.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 18 }}>{n.avatar_emoji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: THEME.text }}>
                            {n.name}{n.is_center ? ' ⭐' : ''}
                          </Text>
                          <Text style={{ fontSize: 11, color: THEME.sub }}>
                            {n.role}{n.is_center ? '（中心）' : ''}
                          </Text>
                        </View>
                        <Pressable hitSlop={8} onPress={() => {
                          setEditNode(n);
                          setNodeForm({ name: n.name, role: n.role, tags: n.tags, quality: n.quality,
                            trust_score: n.trust_score, comfort_score: n.comfort_score,
                            distance: n.distance, angle: n.angle, avatar_emoji: n.avatar_emoji,
                            note: n.note, is_center: n.is_center, node_color: n.node_color || '#8B5E3C',
                            node_image_url: n.node_image_url ?? null });
                          setNodeImageLocalUri(n.node_image_url ?? null);
                          setNodeImageError('');
                          closeList();
                          setTimeout(() => setShowNodeForm(true), 300);
                        }} style={{ padding: 4 }}>
                          <Edit2 size={14} color={THEME.sub} />
                        </Pressable>
                        <Pressable hitSlop={8} onPress={() => deleteNode(n.id)} style={{ padding: 4 }}>
                          <Trash2 size={14} color="#C07070" />
                        </Pressable>
                      </View>
                    );
                  }
                  // edges section
                  const e = item as RelEdge;
                  const s = nodes.find(n => n.id === e.source_id);
                  const t = nodes.find(n => n.id === e.target_id);
                  const arrow = e.direction === 'both' ? '↔' : e.direction === 'source_to_target' ? '→' : '←';
                  const styleIcon = e.line_style === 'curve' ? '⌒' : e.line_style === 'dashed' ? '- -' : '—';
                  return (
                    <View style={{ backgroundColor: THEME.card, borderRadius: 12, borderWidth: 1,
                      borderColor: QUALITY_CONFIG[e.quality].color + '30', padding: 10,
                      flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 13, flex: 1, color: THEME.text }}>
                        {s?.name ?? '?'} {arrow} {t?.name ?? '?'}
                        {e.label ? <Text style={{ color: THEME.accent }}>  「{e.label}」</Text> : null}
                        {e.trust_score > 0 ? <Text style={{ color: THEME.primary }}>  ★{e.trust_score}</Text> : null}
                        <Text style={{ color: THEME.sub, fontSize: 11 }}>  {styleIcon}</Text>
                      </Text>
                      <Pressable hitSlop={8} onPress={() => {
                        setEditEdge(e);
                        setEdgeForm({ source_id: e.source_id, target_id: e.target_id,
                          label: e.label, direction: e.direction, quality: e.quality,
                          trust_score: e.trust_score, line_style: e.line_style ?? 'solid' });
                        closeList();
                        setTimeout(() => setShowEdgeForm(true), 300);
                      }} style={{ padding: 4 }}>
                        <Edit2 size={13} color={THEME.sub} />
                      </Pressable>
                      <Pressable hitSlop={8} onPress={async () => {
                        await supabase.from('rel_edges').delete().eq('id', e.id);
                        setEdges(prev => prev.filter(x => x.id !== e.id));
                      }} style={{ padding: 4 }}>
                        <Trash2 size={13} color="#C07070" />
                      </Pressable>
                    </View>
                  );
                }}
              />
            </Animated.View>
          </>
        );
      })()}

      {/* ════ Modal：AI 洞察 ════ */}
      <Modal visible={showInsight} transparent animationType="slide" onRequestClose={() => setShowInsight(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          onPress={() => setShowInsight(false)}>
          <Pressable style={{ backgroundColor: THEME.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
            padding: 24, paddingBottom: 44 }} onPress={() => {}}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: THEME.text }}>✨ 关系洞察</Text>
              <Pressable onPress={() => setShowInsight(false)}><X size={22} color={THEME.sub} /></Pressable>
            </View>
            {aiLoading
              ? <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <ActivityIndicator color={THEME.primary} />
                  <Text style={{ marginTop: 10, fontSize: 12, color: THEME.sub }}>AI 分析中…</Text>
                </View>
              : <View style={{ backgroundColor: '#F5EEE6', borderRadius: 16, padding: 16 }}>
                  <Text style={{ fontSize: 14, color: THEME.text, lineHeight: 24 }}>{aiInsight}</Text>
                </View>
            }
            <Pressable onPress={() => { setShowInsight(false); router.push('/(app)/chat/satir' as RelativePathString); }}
              style={{ marginTop: 16, borderRadius: 14, backgroundColor: THEME.accent,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13 }}>
              <Sparkles size={16} color="#fff" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>找 AI 深入探讨</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ════ 色盘弹窗 ════ */}
      <ColorPickerModal
        visible={colorPickerTarget !== null}
        initialColor={colorPickerTarget === 'node' ? nodeForm.node_color : (customBgColor || currentBg.color)}
        onClose={() => setColorPickerTarget(null)}
        onSelect={hex => {
          if (colorPickerTarget === 'node') {
            setNodeForm(f => ({ ...f, node_color: hex }));
          } else {
            setCustomBgColor(hex);
          }
          setColorPickerTarget(null);
        }}
      />
    </View>
  );
}
