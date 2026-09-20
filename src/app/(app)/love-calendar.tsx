/**
 * love-calendar.tsx — 亲密关系日历
 * 月历视图，记录关系事件、心情，标记纪念日
 */
import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, X, Check, Heart, Trash2 } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/client/supabase';

// ── 类型定义 ────────────────────────────────────────────────────
interface RelEvent {
  id: string;
  event_date: string;   // YYYY-MM-DD
  title: string;
  content: string;
  mood: string;
  mood_score: number;
  is_anniversary: boolean;
  anniversary_label: string;
}

const MOODS = [
  { id: 'loved',   emoji: '🥰', label: '被爱', color: '#E06A8C' },
  { id: 'happy',   emoji: '😊', label: '快乐', color: '#E8A365' },
  { id: 'calm',    emoji: '😌', label: '平静', color: '#7A9D8C' },
  { id: 'sad',     emoji: '😢', label: '难过', color: '#5B9BD5' },
  { id: 'anxious', emoji: '😰', label: '焦虑', color: '#9B8EC4' },
  { id: 'angry',   emoji: '😤', label: '生气', color: '#C4856A' },
];

const ANNIVERSARY_LABELS = ['在一起', '初吻', '结婚', '求婚', '相识', '分手', '复合', '其他'];

const THEME = {
  bg: '#FFF8FB',
  header: '#FFF0F5',
  headerBorder: '#F5C8D8',
  primary: '#E06A8C',
  text: '#3D1020',
  sub: '#A05878',
  card: '#FFFFFF',
  cardBorder: '#F5C8D8',
};

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

// 本地日期字符串（避免UTC偏移）
function toLocalDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDateLabel(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  return `${y}年${m}月${d}日`;
}

function daysDiff(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  const ms = now.getTime() - target.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default function LoveCalendarScreen() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [events, setEvents] = useState<RelEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // 表单
  const emptyForm = () => ({
    title: '', content: '', mood: 'happy',
    mood_score: 7, is_anniversary: false, anniversary_label: '在一起',
  });
  const [form, setForm] = useState(emptyForm());

  // 加载事件
  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('relationship_events').select('*').order('event_date', { ascending: false });
      setEvents((data ?? []) as RelEvent[]);
      setLoading(false);
    })();
  }, []));

  // 月历计算
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toLocalDateStr(now.getFullYear(), now.getMonth(), now.getDate());

  const eventsByDate: Record<string, RelEvent[]> = {};
  events.forEach(e => {
    if (!eventsByDate[e.event_date]) eventsByDate[e.event_date] = [];
    eventsByDate[e.event_date].push(e);
  });

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const saveEvent = async () => {
    if (!selectedDate || !form.title.trim()) return;
    const payload = { ...form, event_date: selectedDate };
    const { data } = await supabase.from('relationship_events').insert(payload).select().single();
    if (data) {
      setEvents(prev => [data as RelEvent, ...prev]);
      setShowAdd(false);
      setForm(emptyForm());
    }
  };

  const deleteEvent = async (id: string) => {
    await supabase.from('relationship_events').delete().eq('id', id);
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];

  // 纪念日列表
  const anniversaries = events.filter(e => e.is_anniversary);

  return (
    <View style={{ flex: 1, backgroundColor: THEME.bg }}>
      <StatusBar style="dark" />

      {/* 顶部导航 */}
      <View style={{
        backgroundColor: THEME.header, borderBottomWidth: 1, borderBottomColor: THEME.headerBorder,
        paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
        <Pressable onPress={() => router.back()} style={{
          width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(224,106,140,0.12)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <ArrowLeft size={20} color={THEME.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: THEME.text }}>📅 关系日历</Text>
          <Text style={{ fontSize: 12, color: THEME.sub, marginTop: 1 }}>记录你们共同的故事</Text>
        </View>
        {selectedDate && (
          <Pressable onPress={() => setShowAdd(true)} style={{
            width: 36, height: 36, borderRadius: 18, backgroundColor: THEME.primary,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Plus size={20} color="#FFFFFF" />
          </Pressable>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 40 }}>

        {/* 月份导航 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 }}>
          <Pressable onPress={prevMonth} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: THEME.header, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={20} color={THEME.primary} />
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: '800', color: THEME.text }}>
            {year} 年 {month + 1} 月
          </Text>
          <Pressable onPress={nextMonth} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: THEME.header, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={20} color={THEME.primary} />
          </Pressable>
        </View>

        {/* 月历 */}
        <View style={{ marginHorizontal: 16, backgroundColor: THEME.card, borderRadius: 22, borderWidth: 1.5, borderColor: THEME.cardBorder, padding: 14 }}>
          {/* 周标签 */}
          <View style={{ flexDirection: 'row', marginBottom: 8 }}>
            {WEEK_LABELS.map(d => (
              <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: THEME.sub, fontWeight: '600' }}>{d}</Text>
              </View>
            ))}
          </View>
          {/* 日期格子 */}
          {Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) }).map((_, weekIdx) => (
            <View key={weekIdx} style={{ flexDirection: 'row', marginBottom: 4 }}>
              {Array.from({ length: 7 }).map((_, dayOfWeek) => {
                const dayNum = weekIdx * 7 + dayOfWeek - firstDay + 1;
                if (dayNum < 1 || dayNum > daysInMonth) return <View key={dayOfWeek} style={{ flex: 1, height: 40 }} />;
                const dateStr = toLocalDateStr(year, month, dayNum);
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const dayEvents = eventsByDate[dateStr] ?? [];
                const hasAnniversary = dayEvents.some(e => e.is_anniversary);
                const moodEvent = dayEvents[0];
                const moodCfg = moodEvent ? MOODS.find(m => m.id === moodEvent.mood) : null;
                return (
                  <Pressable key={dayOfWeek} onPress={() => setSelectedDate(prev => prev === dateStr ? null : dateStr)} style={{
                    flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12,
                    backgroundColor: isSelected ? THEME.primary : isToday ? THEME.primary + '18' : 'transparent',
                  }}>
                    <Text style={{ fontSize: 13, fontWeight: isToday || isSelected ? '700' : '400', color: isSelected ? '#FFFFFF' : THEME.text }}>
                      {dayNum}
                    </Text>
                    {dayEvents.length > 0 && (
                      <View style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
                        {hasAnniversary && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: isSelected ? '#FFFFFF' : THEME.primary }} />}
                        {moodCfg && !hasAnniversary && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: isSelected ? '#FFFFFF' : moodCfg.color }} />}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {/* 选中日期的事件 */}
        {selectedDate && (
          <View style={{ marginHorizontal: 16, marginTop: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: THEME.text }}>
                {formatDateLabel(selectedDate)}
              </Text>
              {selectedEvents.length === 0 && (
                <Pressable onPress={() => setShowAdd(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: THEME.primary + '18', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Plus size={14} color={THEME.primary} />
                  <Text style={{ fontSize: 12, color: THEME.primary, fontWeight: '600' }}>记录</Text>
                </Pressable>
              )}
            </View>
            {selectedEvents.length === 0 ? (
              <View style={{ padding: 24, alignItems: 'center', backgroundColor: THEME.card, borderRadius: 18, borderWidth: 1, borderColor: THEME.cardBorder }}>
                <Text style={{ fontSize: 28, marginBottom: 8 }}>🌸</Text>
                <Text style={{ fontSize: 13, color: THEME.sub }}>这一天还没有记录，点击添加</Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {selectedEvents.map(ev => {
                  const mood = MOODS.find(m => m.id === ev.mood);
                  return (
                    <View key={ev.id} style={{
                      backgroundColor: THEME.card, borderRadius: 18, borderWidth: 1.5,
                      borderColor: ev.is_anniversary ? THEME.primary + '60' : THEME.cardBorder,
                      padding: 14,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                        <Text style={{ fontSize: 24 }}>{mood?.emoji ?? '😊'}</Text>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: THEME.text }}>{ev.title}</Text>
                            {ev.is_anniversary && (
                              <View style={{ backgroundColor: THEME.primary + '20', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 10, color: THEME.primary, fontWeight: '700' }}>
                                  💕 {ev.anniversary_label}
                                </Text>
                              </View>
                            )}
                          </View>
                          {ev.content.length > 0 && (
                            <Text style={{ fontSize: 12, color: THEME.sub, marginTop: 4, lineHeight: 18 }}>{ev.content}</Text>
                          )}
                          {ev.is_anniversary && (
                            <Text style={{ fontSize: 11, color: THEME.primary, marginTop: 6, fontWeight: '600' }}>
                              🗓 已过 {daysDiff(ev.event_date)} 天
                            </Text>
                          )}
                        </View>
                        <Pressable onPress={() => deleteEvent(ev.id)}>
                          <Trash2 size={16} color={THEME.sub} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* 纪念日列表 */}
        {anniversaries.length > 0 && (
          <View style={{ marginHorizontal: 16, marginTop: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: THEME.text, marginBottom: 10 }}>
              💕 纪念日
            </Text>
            <View style={{ gap: 8 }}>
              {anniversaries.map(ev => (
                <View key={ev.id} style={{
                  backgroundColor: '#FFF0F5', borderRadius: 16, borderWidth: 1.5,
                  borderColor: THEME.cardBorder, padding: 14,
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                }}>
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: THEME.primary + '18',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Heart size={20} color={THEME.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: THEME.text }}>{ev.anniversary_label}</Text>
                    <Text style={{ fontSize: 11, color: THEME.sub, marginTop: 2 }}>
                      {formatDateLabel(ev.event_date)} · 已 {daysDiff(ev.event_date)} 天
                    </Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: THEME.primary }}>
                    Day {daysDiff(ev.event_date)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {loading && <ActivityIndicator color={THEME.primary} style={{ marginTop: 32 }} />}
      </ScrollView>

      {/* 添加事件 Modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={() => setShowAdd(false)}>
          <Pressable style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 }} onPress={() => {}}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: THEME.text }}>
                记录 {selectedDate ? formatDateLabel(selectedDate) : '今天'}
              </Text>
              <Pressable onPress={() => setShowAdd(false)}>
                <X size={22} color={THEME.sub} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* 心情 */}
              <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 8 }}>今天的心情</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {MOODS.map(m => (
                  <Pressable key={m.id} onPress={() => setForm(f => ({ ...f, mood: m.id }))} style={{
                    flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center',
                    backgroundColor: form.mood === m.id ? m.color + '25' : '#F5F0F8',
                    borderWidth: 2, borderColor: form.mood === m.id ? m.color : 'transparent',
                  }}>
                    <Text style={{ fontSize: 18 }}>{m.emoji}</Text>
                    <Text style={{ fontSize: 9, color: form.mood === m.id ? m.color : THEME.sub, fontWeight: '600', marginTop: 2 }}>{m.label}</Text>
                  </Pressable>
                ))}
              </View>

              {/* 标题 */}
              <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 6 }}>事件标题 *</Text>
              <TextInput value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))}
                placeholder="发生了什么？"
                placeholderTextColor={THEME.sub + '80'}
                style={{ backgroundColor: '#FFF5F8', borderRadius: 12, borderWidth: 1.5, borderColor: THEME.cardBorder, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: THEME.text, marginBottom: 14 }}
              />

              {/* 内容 */}
              <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 6 }}>详细记录（可选）</Text>
              <TextInput value={form.content} onChangeText={v => setForm(f => ({ ...f, content: v }))}
                placeholder="写下你的感受和想法…"
                placeholderTextColor={THEME.sub + '80'} multiline
                style={{ backgroundColor: '#FFF5F8', borderRadius: 12, borderWidth: 1.5, borderColor: THEME.cardBorder, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: THEME.text, minHeight: 80, marginBottom: 14 }}
              />

              {/* 纪念日开关 */}
              <Pressable onPress={() => setForm(f => ({ ...f, is_anniversary: !f.is_anniversary }))} style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: form.is_anniversary ? '#FFF0F5' : '#F5F0F8',
                borderRadius: 14, padding: 14, marginBottom: 14,
                borderWidth: 1.5, borderColor: form.is_anniversary ? THEME.cardBorder : 'transparent',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Heart size={16} color={form.is_anniversary ? THEME.primary : THEME.sub} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: form.is_anniversary ? THEME.primary : THEME.sub }}>
                    标记为纪念日
                  </Text>
                </View>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: form.is_anniversary ? THEME.primary : '#E0D8E8', alignItems: 'center', justifyContent: 'center' }}>
                  {form.is_anniversary && <Check size={14} color="#FFFFFF" />}
                </View>
              </Pressable>

              {form.is_anniversary && (
                <>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 8 }}>纪念日类型</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    {ANNIVERSARY_LABELS.map(l => (
                      <Pressable key={l} onPress={() => setForm(f => ({ ...f, anniversary_label: l }))} style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8,
                        backgroundColor: form.anniversary_label === l ? THEME.primary : '#F5F0F8',
                      }}>
                        <Text style={{ fontSize: 12, color: form.anniversary_label === l ? '#FFFFFF' : THEME.sub, fontWeight: '600' }}>{l}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              {/* 保存 */}
              <Pressable onPress={saveEvent} style={{
                borderRadius: 16, backgroundColor: THEME.primary,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, paddingVertical: 14, marginBottom: 8,
              }}>
                <Check size={18} color="#FFFFFF" />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>保存记录</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
