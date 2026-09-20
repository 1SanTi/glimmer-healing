import { Tabs } from 'expo-router';
import { Home, Heart, FlaskConical, BookOpen, User } from 'lucide-react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#E8A365',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          height: 68,
          backgroundColor: '#FFFFFF',
          borderTopColor: '#F0EDE8',
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: '首页',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="heal"
        options={{
          title: '疗愈',
          tabBarIcon: ({ color, size }) => <Heart size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="play"
        options={{
          title: '测玩',
          tabBarIcon: ({ color, size }) => <FlaskConical size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="academy"
        options={{
          title: '学苑',
          tabBarIcon: ({ color, size }) => <BookOpen size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
