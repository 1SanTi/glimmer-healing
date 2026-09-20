/**
 * audioStore.ts — 本地音频库管理
 *
 * 使用 AsyncStorage 持久化音频元数据
 * 使用 expo-file-system 将音频文件复制到 App 文档目录
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

// ── 类型定义 ────────────────────────────────────────────────────
export type AudioUsage = 'meditation' | 'test' | 'breath' | 'hope_tree' | 'background' | 'sleep' | 'particle_healing';

export interface AudioItem {
  id: string;
  name: string;
  uri: string;          // 持久化本地路径
  duration: number;     // 秒
  usages: AudioUsage[];
  createdAt: number;    // Unix ms
}

const STORAGE_KEY = 'audio_library_v1';

// ── 读取全部音频 ─────────────────────────────────────────────────
export async function getAllAudios(): Promise<AudioItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const items: AudioItem[] = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

// ── 保存（全量写入） ─────────────────────────────────────────────
async function saveAll(items: AudioItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ── 新增音频 ─────────────────────────────────────────────────────
export async function addAudio(
  sourceUri: string,
  name: string,
  duration = 0,
): Promise<AudioItem> {
  const id = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ext = sourceUri.split('.').pop()?.toLowerCase() ?? 'mp3';
  const destUri = `${FileSystem.documentDirectory}audio/${id}.${ext}`;

  // 确保目录存在
  await FileSystem.makeDirectoryAsync(
    `${FileSystem.documentDirectory}audio/`,
    { intermediates: true },
  );

  // 复制到 App 沙盒（持久化）
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });

  const item: AudioItem = {
    id,
    name,
    uri: destUri,
    duration,
    usages: [],
    createdAt: Date.now(),
  };

  const all = await getAllAudios();
  await saveAll([...all, item]);
  return item;
}

// ── 更新用途 ─────────────────────────────────────────────────────
export async function updateAudioUsages(
  id: string,
  usages: AudioUsage[],
): Promise<void> {
  const all = await getAllAudios();
  const updated = all.map(a => (a.id === id ? { ...a, usages } : a));
  await saveAll(updated);
}

// ── 更新名称 ─────────────────────────────────────────────────────
export async function updateAudioName(id: string, name: string): Promise<void> {
  const all = await getAllAudios();
  const updated = all.map(a => (a.id === id ? { ...a, name } : a));
  await saveAll(updated);
}

// ── 删除音频 ─────────────────────────────────────────────────────
export async function deleteAudio(id: string): Promise<void> {
  const all = await getAllAudios();
  const target = all.find(a => a.id === id);
  if (target) {
    try {
      await FileSystem.deleteAsync(target.uri, { idempotent: true });
    } catch {
      // 文件不存在时忽略
    }
  }
  await saveAll(all.filter(a => a.id !== id));
}

// ── 获取某场景已配置的第一条音频 URI ─────────────────────────────
export async function getUsageUri(
  usage: AudioUsage,
): Promise<string | null> {
  const all = await getAllAudios();
  const found = all.find(a => a.usages.includes(usage));
  if (!found) return null;
  // 验证文件是否存在
  try {
    const info = await FileSystem.getInfoAsync(found.uri);
    if (info.exists) return found.uri;
  } catch {
    // ignore
  }
  return null;
}

// ── 工具：将秒格式化为 mm:ss ─────────────────────────────────────
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
