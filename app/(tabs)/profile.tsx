import {
  View,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  TextInput,
  Modal,
  Alert,
} from "react-native";
import { Text } from "../../components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getAlias } from "../../utils/aliases";
import { getDeviceId } from "../../utils/device";
import { fetchSunsetTime } from "../../utils/sunset";
import { getLocalNickname, setLocalNickname, syncDeviceToSupabase } from "../../utils/identity";
import { fetchMyRooms, leaveRoom, createRoom } from "../../utils/rooms";
import { getAllNicknames, setRoomNickname } from "../../utils/nicknames";
import {
  getAlertsEnabled,
  setAlertsEnabled,
  requestNotificationPermission,
  scheduleSunsetAlert,
  cancelSunsetAlert,
} from "../../utils/notifications";
import { colors } from "../../utils/theme";
import { CloudCard } from "../../components/CloudCard";
import type { Room } from "../../utils/supabase";

export default function ProfileScreen() {
  const [alias, setAlias] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string>("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomNicknames, setRoomNicknames] = useState<Record<string, string>>({});
  const [alertsEnabled, setAlertsEnabledState] = useState(false);
  const [sunsetLabel, setSunsetLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingAlert, setTogglingAlert] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Edit nickname modal
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [savingNickname, setSavingNickname] = useState(false);

  // Leave room confirm
  const [leavingRoom, setLeavingRoom] = useState<Room | null>(null);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        const [id, nick, enabled, sunset, roomList, nickMap] = await Promise.all([
          getDeviceId(),
          getLocalNickname(),
          getAlertsEnabled(),
          fetchSunsetTime(),
          fetchMyRooms(),
          getAllNicknames(),
        ]);
        setDeviceId(id);
        setAlias(getAlias(id));
        setNickname(nick ?? "");
        setAlertsEnabledState(enabled);
        if (sunset) setSunsetLabel(sunset.formattedLocal);
        setRooms(roomList);
        setRoomNicknames(nickMap);
        setLoading(false);
      }
      load();
    }, [])
  );

  async function handleSaveNickname() {
    if (!nicknameInput.trim() || !deviceId) return;
    setSavingNickname(true);
    await setLocalNickname(nicknameInput.trim());
    await syncDeviceToSupabase(deviceId, nicknameInput.trim());
    setNickname(nicknameInput.trim());
    setEditingNickname(false);
    setSavingNickname(false);
  }

  async function handleAlertToggle(value: boolean) {
    if (Platform.OS === "web") return;
    setTogglingAlert(true);
    try {
      if (value) {
        const granted = await requestNotificationPermission();
        if (!granted) return;
        await setAlertsEnabled(true);
        setAlertsEnabledState(true);
        await scheduleSunsetAlert();
      } else {
        await setAlertsEnabled(false);
        setAlertsEnabledState(false);
        await cancelSunsetAlert();
      }
    } finally {
      setTogglingAlert(false);
    }
  }

  async function handleLeaveRoom(room: Room) {
    await leaveRoom(room.code);
    setRooms((prev) => prev.filter((r) => r.id !== room.id));
    setLeavingRoom(null);
  }

  async function handleCreateRoom() {
    setCreatingRoom(true);
    try {
      const room = await createRoom();
      setRooms((prev) => [room, ...prev]);
    } catch (e) {
      console.error(e);
    } finally {
      setCreatingRoom(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.sky, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.ember} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.sky }}>
      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={{ paddingTop: 32, paddingBottom: 20, alignItems: "center" }}>
          <Text style={{ fontSize: 32, fontWeight: "800", color: colors.ember, letterSpacing: -1 }}>Profile</Text>
          <Text style={{ fontSize: 13, color: colors.ash, marginTop: 4 }}>your collection of dusks</Text>
        </View>

        {/* Identity card */}
        <CloudCard seed={0} style={{ marginTop: 0 }}>
        <View style={{ padding: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <View style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: colors.mist, alignItems: "center", justifyContent: "center",
            }}>
              <Text style={{ fontSize: 28 }}>🌸</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: "800", color: colors.charcoal }}>
                {nickname || alias}
              </Text>
              {nickname && (
                <Text style={{ fontSize: 12, color: colors.ash, marginTop: 2, fontStyle: "italic" }}>
                  alias: {alias}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => { setNicknameInput(nickname); setEditingNickname(true); }}
              style={{
                backgroundColor: colors.mist, paddingHorizontal: 14,
                paddingVertical: 8, borderRadius: 12,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.charcoal }}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>
        </CloudCard>

        {/* Sunset info */}
        {sunsetLabel && (
          <CloudCard seed={3} bg={colors.mist}>
          <View style={{ padding: 18, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ fontSize: 32 }}>🌇</Text>
            <View>
              <Text style={{ fontSize: 12, color: colors.ash, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 }}>
                Today's Sunset
              </Text>
              <Text style={{ fontSize: 24, fontWeight: "800", color: colors.charcoal }}>{sunsetLabel}</Text>
            </View>
          </View>
          </CloudCard>
        )}

        {/* Rooms */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ash, letterSpacing: 1.5, textTransform: "uppercase" }}>
            My Rooms
          </Text>
          <TouchableOpacity
            onPress={handleCreateRoom}
            disabled={creatingRoom}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            {creatingRoom
              ? <ActivityIndicator color={colors.ember} size="small" />
              : <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ember }}>+ New Room</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={{ gap: 10, marginBottom: 24 }}>
          {rooms.length === 0 ? (
            <Text style={{ color: colors.ash, fontSize: 14, textAlign: "center", paddingVertical: 20 }}>
              No rooms yet — create or join one from the home screen.
            </Text>
          ) : rooms.map((room, i) => {
            const rNick = roomNicknames[room.code];
            return (
              <CloudCard key={room.id} seed={i + 1}>
              <View style={{
                padding: 18,
                flexDirection: "row", alignItems: "center",
              }}>
                <View style={{ flex: 1 }}>
                  {rNick ? (
                    <>
                      <Text style={{ fontSize: 16, fontWeight: "800", color: colors.charcoal }}>{rNick}</Text>
                      <Text style={{ fontSize: 11, color: colors.ash, letterSpacing: 2, marginTop: 2 }}>{room.code}</Text>
                    </>
                  ) : (
                    <Text style={{ fontSize: 18, fontWeight: "800", color: colors.charcoal, letterSpacing: 4 }}>{room.code}</Text>
                  )}
                  <Text style={{ fontSize: 12, color: colors.ash, marginTop: 4 }}>
                    {room.members.length} {room.members.length === 1 ? "member" : "members"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setLeavingRoom(room)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8,
                    borderRadius: 10, borderWidth: 1.5, borderColor: colors.mist,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ash }}>Leave</Text>
                </TouchableOpacity>
              </View>
              </CloudCard>
            );
          })}
        </View>

        {/* Settings */}
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ash, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
          Settings
        </Text>

        <CloudCard seed={4} style={{ marginBottom: 48 }}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 20, justifyContent: "space-between" }}>
            <View style={{ flex: 1, marginRight: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.charcoal }}>Sunset Alerts</Text>
              <Text style={{ fontSize: 13, color: colors.ash, marginTop: 3, lineHeight: 18 }}>
                {Platform.OS === "web"
                  ? "Available on iOS & Android only"
                  : `Notify me 3 min before sunset${sunsetLabel ? ` (${sunsetLabel})` : ""}`}
              </Text>
            </View>
            {togglingAlert
              ? <ActivityIndicator color={colors.ember} />
              : <Switch
                  value={alertsEnabled}
                  onValueChange={handleAlertToggle}
                  disabled={Platform.OS === "web"}
                  trackColor={{ false: colors.mist, true: colors.ember }}
                  thumbColor="white"
                />
            }
          </View>

          <View style={{ height: 1, backgroundColor: colors.mist, marginHorizontal: 20 }} />

          <View style={{ padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.charcoal }}>About Dusk</Text>
            <Text style={{ fontSize: 13, color: colors.ash, marginTop: 3, lineHeight: 18 }}>
              Photos expire after 24 hours. No accounts. No data stored beyond your device and rooms.
            </Text>
          </View>
        </View>
        </CloudCard>

      </ScrollView>

      {/* Edit nickname modal */}
      <Modal visible={editingNickname} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(61,46,46,0.5)", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{ backgroundColor: colors.cream, borderRadius: 24, padding: 28, width: "100%" }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.charcoal, marginBottom: 16 }}>
              Change your name
            </Text>
            <TextInput
              value={nicknameInput}
              onChangeText={setNicknameInput}
              placeholder="Your name or nickname"
              placeholderTextColor={colors.ash}
              autoFocus
              maxLength={24}
              style={{
                backgroundColor: "white", borderWidth: 1.5, borderColor: colors.mist,
                borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                fontSize: 18, fontWeight: "700", color: colors.charcoal, marginBottom: 16,
              }}
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => setEditingNickname(false)}
                style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.mist, alignItems: "center" }}
              >
                <Text style={{ color: colors.charcoal, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveNickname}
                disabled={!nicknameInput.trim() || savingNickname}
                style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: colors.ember, alignItems: "center" }}
              >
                {savingNickname
                  ? <ActivityIndicator color="white" />
                  : <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Leave room confirm modal */}
      <Modal visible={leavingRoom !== null} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(61,46,46,0.5)", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{ backgroundColor: colors.cream, borderRadius: 24, padding: 28, width: "100%" }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.charcoal, marginBottom: 8 }}>
              Leave {leavingRoom?.code}?
            </Text>
            <Text style={{ fontSize: 14, color: colors.ash, marginBottom: 24, lineHeight: 20 }}>
              You'll no longer see photos sent to this room. You can rejoin anytime with the code.
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => setLeavingRoom(null)}
                style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.mist, alignItems: "center" }}
              >
                <Text style={{ color: colors.charcoal, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => leavingRoom && handleLeaveRoom(leavingRoom)}
                style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: colors.magenta, alignItems: "center" }}
              >
                <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Leave Room</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
