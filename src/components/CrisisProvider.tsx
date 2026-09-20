import React, { createContext, useContext, useState, useCallback } from 'react';
import { View, Text, Pressable, Linking, ScrollView, Modal } from 'react-native';
import { CRISIS_HOTLINES } from '@/lib/constants';

type CrisisContextType = {
  showCrisisPanel: () => void;
  hideCrisisPanel: () => void;
};

const CrisisContext = createContext<CrisisContextType>({
  showCrisisPanel: () => {},
  hideCrisisPanel: () => {},
});

export function useCrisis() {
  return useContext(CrisisContext);
}

export function CrisisProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  const showCrisisPanel = useCallback(() => setVisible(true), []);
  const hideCrisisPanel = useCallback(() => setVisible(false), []);

  return (
    <CrisisContext.Provider value={{ showCrisisPanel, hideCrisisPanel }}>
      {children}
      <CrisisPanel visible={visible} onClose={hideCrisisPanel} />
    </CrisisContext.Provider>
  );
}

function CrisisPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 bg-black/80 items-center justify-center px-6">
        <View className="w-full bg-card rounded-3xl overflow-hidden" style={{ maxHeight: '85%' }}>
          {/* 顶部 */}
          <View className="bg-primary px-6 pt-8 pb-6 items-center">
            <Text className="text-4xl mb-2">💛</Text>
            <Text className="text-primary-foreground text-2xl font-bold text-center">你不孤单</Text>
            <Text className="text-primary-foreground/90 text-sm text-center mt-2">
              我们感受到你正在经历一些困难时刻
            </Text>
          </View>

          {/* 滚动区域：技术引导 + 热线 + 底部提示，全部在同一 ScrollView 内，
              底部「我现在好一点了」按钮 sticky 固定在卡片底部，不随滚动移动 */}
          <ScrollView
            className="px-6 py-5"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {/* 保险箱技术引导 */}
            <View className="bg-muted rounded-2xl p-4 mb-4">
              <Text className="text-foreground font-semibold text-base mb-2">🔒 保险箱技术</Text>
              <Text className="text-muted-foreground text-sm leading-6">
                闭上眼睛，想象一个坚固的保险箱。{'\n'}
                把那些让你难受的想法，一个个放进去。{'\n'}
                锁上保险箱，把钥匙放在你看得到的地方。{'\n'}
                你随时可以打开它，但现在，先让它们在里面休息。
              </Text>
            </View>

            {/* 安全岛技术 */}
            <View className="bg-accent/10 rounded-2xl p-4 mb-4">
              <Text className="text-foreground font-semibold text-base mb-2">🏝 安全岛技术</Text>
              <Text className="text-muted-foreground text-sm leading-6">
                想象一个让你感到完全安全的地方。{'\n'}
                可以是真实的，也可以是想象的。{'\n'}
                感受那里的阳光、温度和气息。{'\n'}
                你可以随时回到这里，这里永远为你敞开。
              </Text>
            </View>

            {/* 热线 */}
            <Text className="text-foreground font-semibold text-base mb-3">📞 专业帮助热线</Text>
            {CRISIS_HOTLINES.map((hotline, idx) => (
              <Pressable
                key={idx}
                className="bg-muted rounded-xl px-4 py-3 mb-2 flex-row items-center justify-between"
                onPress={() => Linking.openURL(`tel:${hotline.number}`)}
              >
                <View className="flex-1 mr-3">
                  <Text className="text-foreground text-sm font-medium">{hotline.name}</Text>
                  <Text className="text-primary text-base font-bold mt-0.5">{hotline.number}</Text>
                </View>
                <View className="bg-primary rounded-xl px-3 py-1.5">
                  <Text className="text-primary-foreground text-sm font-medium">拨打</Text>
                </View>
              </Pressable>
            ))}

            {/* 底部提示文字与按钮同处滚动区域末尾，保证永远可见 */}
            <Text className="text-muted-foreground text-xs text-center mt-4 mb-4">
              专业的人在等待帮助你，你值得被支持
            </Text>

            <Pressable
              className="bg-primary rounded-2xl py-4 items-center mb-2"
              onPress={onClose}
            >
              <Text className="text-primary-foreground font-semibold text-base">我现在好一点了</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
