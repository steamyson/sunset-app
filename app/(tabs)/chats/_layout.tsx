import { Stack } from "expo-router";

export default function ChatsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "transparent" },
      }}
    >
      {/*
        Native stack sets display:none on the screen *below* a normal card.
        transparentModal keeps the sky (index) visible so edge-drag can reveal it.
      */}
      <Stack.Screen
        name="[code]"
        options={{
          presentation: "transparentModal",
          animation: "slide_from_right",
          contentStyle: { backgroundColor: "transparent" },
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}
