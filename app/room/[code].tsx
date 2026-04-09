import { Redirect, useLocalSearchParams } from "expo-router";

/** Legacy `/room/:code` URLs redirect into the Chats stack so the sky stays mounted underneath. */
export default function RoomRouteRedirect() {
  const { code } = useLocalSearchParams<{ code: string }>();
  if (!code || typeof code !== "string") {
    return <Redirect href="/(tabs)/chats" />;
  }
  return <Redirect href={`/(tabs)/chats/${code.trim()}`} />;
}
