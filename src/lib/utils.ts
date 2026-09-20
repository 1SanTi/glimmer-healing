import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CRISIS_KEYWORDS } from '@/lib/constants';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function detectCrisis(text: string): boolean {
  return CRISIS_KEYWORDS.some(keyword => text.includes(keyword));
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function getMoodEmoji(mood: string): string {
  const map: Record<string, string> = {
    happy: '😊', calm: '😌', sad: '😔',
    anxious: '😰', angry: '😤', tired: '😴',
    grateful: '🙏', excited: '🤩', confused: '😕', depressed: '😞',
  };
  return map[mood] || '😌';
}

export function getMoodLabel(mood: string): string {
  const map: Record<string, string> = {
    happy: '开心', calm: '平静', sad: '低落',
    anxious: '焦虑', angry: '愤怒', tired: '疲惫',
    grateful: '感恩', excited: '激动', confused: '困惑', depressed: '压抑',
  };
  return map[mood] || '平静';
}

export function getMoodColor(mood: string): string {
  const map: Record<string, string> = {
    happy: '#E8A365', calm: '#7A9D8C', sad: '#9B8EC4',
    anxious: '#E8C56A', angry: '#E88A7D', tired: '#5B9BD5',
    grateful: '#A8C8A0', excited: '#F4845F', confused: '#B0A8D4', depressed: '#8896A8',
  };
  return map[mood] || '#7A9D8C';
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

// 根据心情状态获取联动推荐
export function getMoodRecommendations(moods: string | string[]): { title: string; action: string; route: string; emoji: string }[] {
  const moodList = Array.isArray(moods) ? moods : moods.split(',');
  const neg = ['sad', 'anxious', 'angry', 'depressed', 'confused'];
  const low = ['tired'];
  const pos = ['happy', 'grateful', 'excited'];
  if (moodList.some(m => neg.includes(m))) {
    return [
      { title: '罗杰斯的温暖倾听', action: '前往对话', route: '/(app)/(tabs)/heal', emoji: '🌻' },
      { title: '释放压力气球', action: '前往游戏', route: '/(app)/(tabs)/play', emoji: '🎈' },
      { title: '树洞倾诉心事', action: '匿名倾诉', route: '/(app)/(tabs)/heal', emoji: '🌿' },
    ];
  } else if (moodList.some(m => low.includes(m))) {
    return [
      { title: '呼吸冥想放松', action: '开始冥想', route: '/(app)/(tabs)/play', emoji: '🍃' },
      { title: '皮尔斯觉察身体', action: '前往对话', route: '/(app)/(tabs)/heal', emoji: '✨' },
      { title: '心灵速写', action: '去游戏舱', route: '/(app)/(tabs)/play', emoji: '🎨' },
    ];
  } else if (moodList.some(m => pos.includes(m))) {
    return [
      { title: '记录幸福时刻', action: '写幸福日志', route: '/(app)/(tabs)/academy', emoji: '✨' },
      { title: '培养品格优势', action: '去学苑', route: '/(app)/(tabs)/academy', emoji: '🌟' },
      { title: '分享给树洞', action: '去树洞', route: '/(app)/(tabs)/heal', emoji: '💛' },
    ];
  } else {
    return [
      { title: '心理知识科普', action: '去学苑', route: '/(app)/(tabs)/academy', emoji: '📚' },
      { title: '做个心理测试', action: '去测玩', route: '/(app)/(tabs)/play', emoji: '🧪' },
      { title: '贝克认知重构', action: '前往对话', route: '/(app)/(tabs)/heal', emoji: '🔍' },
    ];
  }
}
