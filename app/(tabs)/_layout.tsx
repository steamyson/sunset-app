import { Tabs, router } from "expo-router";
import { TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../utils/theme";

function TabIcon({ name, focused }: { name: keyof typeof Ionicons.glyphMap; focused: boolean }) {
  return (
    <View style={{
      alignItems: "center", justifyContent: "center",
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: focused ? `${colors.ember}22` : "transparent",
    }}>
      <Ionicons
        name={focused ? name : `${name}-outline` as keyof typeof Ionicons.glyphMap}
        size={22}
        color={focused ? colors.ember : colors.ash}
      />
    </View>
  );
}

function CameraButton() {
  return (
    <TouchableOpacity
      onPress={() => router.push("/camera")}
      activeOpacity={0.85}
      style={{
        top: -18,
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: colors.ember,
        alignItems: "center", justifyContent: "center",
        shadowColor: colors.ember,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 10,
        elevation: 10,
      }}
    >
      <Ionicons name="camera" size={28} color="white" />
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 68 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.sky,
          borderTopColor: colors.mist,
          borderTopWidth: 1,
          paddingBottom: insets.bottom + 8,
          paddingTop: 10,
          height: tabBarHeight,
        },
        tabBarActiveTintColor: colors.ember,
        tabBarInactiveTintColor: colors.ash,
        tabBarLabelStyle: { fontFamily: "Caveat_700Bold", fontSize: 13, letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Feed",
          tabBarIcon: ({ focused }) => <TabIcon name="sunny" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: "Chats",
          tabBarIcon: ({ focused }) => <TabIcon name="chatbubbles" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{ title: "", tabBarButton: () => <CameraButton /> }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "Map",
          tabBarIcon: ({ focused }) => <TabIcon name="map" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => <TabIcon name="person-circle" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
