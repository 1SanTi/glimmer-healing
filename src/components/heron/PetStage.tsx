import { View, Text } from 'react-native';
import { Brain, Wrench, Briefcase, Sparkles } from 'lucide-react-native';
import type { PetState } from '@/types/types';

interface Props {
  state: PetState;
  size?: number;
}

const STATE_LABEL: Record<PetState, string> = {
  idle: '我在这里陪你',
  thinking: '让我想想…',
  'tool-using': '正在使用工具',
  working: '正在为你工作',
};

const STATE_ICON: Record<PetState, typeof Brain> = {
  idle: Sparkles, thinking: Brain, 'tool-using': Wrench, working: Briefcase,
};

/** 仅展示状态标签，不再渲染角色立绘卡片 */
export function PetStage({ state }: Props) {
  const Icon = STATE_ICON[state];
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: 'rgba(245,240,232,0.96)',
      borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
      borderWidth: 1, borderColor: 'rgba(122,157,140,0.22)',
      shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 }, elevation: 1,
    }}>
      <Icon size={13} color="#7A9D8C" />
      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: '#4a5568' }}>
        {STATE_LABEL[state]}
      </Text>
    </View>
  );
}