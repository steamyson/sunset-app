import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Share,
  Animated,
  Easing,
  Dimensions,
} from "react-native";
import { Text } from "../../components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";

const { width: W, height: H } = Dimensions.get("window");
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { fetchMyRooms, leaveRoom, createRoom, joinRoom } from "../../utils/rooms";
import { getAllNicknames, setRoomNickname } from "../../utils/nicknames";
import { fetchLatestMessageTimes } from "../../utils/messages";
import { getAllLastSeen } from "../../utils/lastSeen";
import { colors } from "../../utils/theme";
import { CloudCard } from "../../components/CloudCard";
import type { Room } from "../../utils/supabase";

export default function ChatsScreen() {
  const glowAnim  = useRef(new Animated.Value(0.5)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowAnim,   { toValue: 1,    duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1.12, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(glowAnim,   { toValue: 0.5, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1,   duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [unreadRooms, setUnreadRooms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Add room sheet
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [addLoading, setAddLoading] = useState<"join" | "create" | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [newlyCreatedCode, setNewlyCreatedCode] = useState<string | null>(null);

  async function handleJoinRoom() {
    if (joinCode.trim().length < 6) { setAddError("Enter a 6-character room code."); return; }
    setAddError(null);
    setAddLoading("join");
    try {
      const room = await joinRoom(joinCode);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const nameMap = await getAllNicknames();
      setRooms((prev) => prev.some((r) => r.id === room.id) ? prev : [room, ...prev]);
      setNicknames(nameMap);
      setJoinCode("");
      setShowAddRoom(false);
    } catch (e: any) {
      setAddError(e.message ?? "Something went wrong.");
    } finally {
      setAddLoading(null);
    }
  }

  async function handleCreateRoom() {
    setAddError(null);
    setAddLoading("create");
    try {
      const room = await createRoom();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const nameMap = await getAllNicknames();
      setRooms((prev) => [room, ...prev]);
      setNicknames(nameMap);
      setNewlyCreatedCode(room.code);
    } catch (e: any) {
      setAddError(e.message ?? "Something went wrong.");
    } finally {
      setAddLoading(null);
    }
  }

  async function handleShareCode(code: string) {
    await Share.share({ message: `Join me on Dusk to catch the golden hour! 🌅\n\nRoom code: ${code}` });
  }

  // Action sheet state
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  // Rename modal state
  const [renaming, setRenaming] = useState<Room | null>(null);
  const [renameInput, setRenameInput] = useState("");

  async function load() {
    try {
      const [roomList, nameMap, lastSeenMap] = await Promise.all([
        fetchMyRooms(),
        getAllNicknames(),
        getAllLastSeen(),
      ]);
      setRooms(roomList);
      setNicknames(nameMap);

      // Check which rooms have messages newer than last seen
      const latestTimes = await fetchLatestMessageTimes(roomList.map((r) => r.id));
      const unread = new Set<string>();
      for (const room of roomList) {
        const latest = latestTimes[room.id];
        const seen = lastSeenMap[room.code];
        if (latest && (!seen || latest > seen)) unread.add(room.code);
      }
      setUnreadRooms(unread);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  function handleLongPress(room: Room) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedRoom(room);
  }

  async function handleLeave() {
    if (!selectedRoom) return;
    setSelectedRoom(null);
    await leaveRoom(selectedRoom.code);
    setRooms((prev) => prev.filter((r) => r.id !== selectedRoom.id));
  }

  function handleRename() {
    if (!selectedRoom) return;
    setRenameInput(nicknames[selectedRoom.code] ?? "");
    setRenaming(selectedRoom);
    setSelectedRoom(null);
  }

  async function saveRename() {
    if (!renaming) return;
    await setRoomNickname(renaming.code, renameInput);
    setNicknames((prev) => ({ ...prev, [renaming.code]: renameInput.trim() }));
    setRenaming(null);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.sky }}>

      {/* ── Sunset glow rays ── */}
      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: 0, alignSelf: "center",
        width: W * 1.6, height: H * 0.55,
        borderBottomLeftRadius: W * 0.8, borderBottomRightRadius: W * 0.8,
        backgroundColor: "#F5A623", opacity: Animated.multiply(glowAnim, 0.18),
      }} />
      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: 0, alignSelf: "center",
        width: W * 1.15, height: H * 0.42,
        borderBottomLeftRadius: W * 0.6, borderBottomRightRadius: W * 0.6,
        backgroundColor: "#E8642A", opacity: Animated.multiply(glowAnim, 0.13),
      }} />
      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: 0, alignSelf: "center",
        width: W * 0.85, height: H * 0.30,
        borderBottomLeftRadius: W * 0.45, borderBottomRightRadius: W * 0.45,
        backgroundColor: "#FFF59D", opacity: Animated.multiply(glowAnim, 0.22),
      }} />

      {/* ── Sun — half-peeking above the header ── */}
      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: -155, alignSelf: "center",
        transform: [{ scale: pulseScale }],
      }}>
        <Animated.View style={{ width: 310, height: 310, borderRadius: 155, backgroundColor: "#FFFDE7", opacity: glowAnim }} />
        <View style={{ position: "absolute", width: 230, height: 230, borderRadius: 115, backgroundColor: "#FFF9C4", opacity: 0.88, left: 40, top: 40 }} />
        <View style={{
          position: "absolute", width: 140, height: 140, borderRadius: 70,
          backgroundColor: "#FFF59D", left: 85, top: 85,
          shadowColor: "#FFE135", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 28, elevation: 14,
        }} />
        <View style={{ position: "absolute", width: 26, height: 26, borderRadius: 13, backgroundColor: "#FFFDE7", opacity: 0.9, left: 106, top: 100 }} />
      </Animated.View>

      <SafeAreaView style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: 32, paddingBottom: 20, flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }} />
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 32, fontWeight: "800", color: colors.ember, letterSpacing: -1 }}>Chats</Text>
            <Text style={{ fontSize: 13, color: colors.ash, marginTop: 4 }}>quiet moments, shared words</Text>
          </View>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
          <TouchableOpacity
            onPress={() => setShowAddRoom(true)}
            activeOpacity={0.85}
            style={{
              backgroundColor: colors.ember,
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: colors.ember,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.35,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            <Text style={{ color: "white", fontSize: 26, fontWeight: "300", lineHeight: 30 }}>+</Text>
          </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.ember} style={{ marginTop: 60 }} />
        ) : rooms.length === 0 ? (
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <Text style={{ fontSize: 52 }}>💬</Text>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.charcoal, marginTop: 16 }}>
              No rooms yet
            </Text>
            <Text style={{ fontSize: 14, color: colors.ash, marginTop: 8, textAlign: "center", paddingHorizontal: 32, lineHeight: 22 }}>
              Create a room and share the code with a friend — they'll join with one tap.
            </Text>
            <TouchableOpacity
              onPress={() => setShowAddRoom(true)}
              style={{ marginTop: 24, backgroundColor: colors.ember, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 }}
            >
              <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Create a Room</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ paddingBottom: 32 }}>
            {rooms.map((room, i) => {
              const nickname = nicknames[room.code];
              return (
                <CloudCard key={room.id} seed={i}>
                <TouchableOpacity
                  onPress={() => router.push(`/room/${room.code}`)}
                  onLongPress={() => handleLongPress(room)}
                  activeOpacity={0.8}
                  style={{ padding: 20 }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      {nickname ? (
                        <>
                          <Text style={{ fontSize: 18, fontWeight: "800", color: colors.charcoal }}>{nickname}</Text>
                          <Text style={{ fontSize: 12, color: colors.ash, letterSpacing: 2, marginTop: 3 }}>{room.code}</Text>
                        </>
                      ) : (
                        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.charcoal, letterSpacing: 4 }}>{room.code}</Text>
                      )}
                      <Text style={{ fontSize: 12, color: colors.ash, marginTop: 6 }}>
                        {room.members.length} {room.members.length === 1 ? "person" : "people"} · hold for options
                      </Text>
                    </View>
                    <View>
                      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.mist, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="sunny" size={20} color={colors.ember} />
                      </View>
                      {unreadRooms.has(room.code) && (
                        <View style={{
                          position: "absolute", top: -2, right: -2,
                          width: 13, height: 13, borderRadius: 7,
                          backgroundColor: colors.ember,
                          borderWidth: 2, borderColor: colors.cream,
                        }} />
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
                </CloudCard>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Add room sheet */}
      <Modal visible={showAddRoom} transparent animationType="slide" onRequestClose={() => { setShowAddRoom(false); setNewlyCreatedCode(null); setJoinCode(""); setAddError(null); }}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(61,46,46,0.4)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => { setShowAddRoom(false); setNewlyCreatedCode(null); setJoinCode(""); setAddError(null); }}
        >
          <View style={{ backgroundColor: colors.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 48 }}>

            {newlyCreatedCode ? (
              // Created — show code + share
              <>
                <Text style={{ fontSize: 13, color: colors.ash, letterSpacing: 2, textTransform: "uppercase", textAlign: "center", marginBottom: 12 }}>room created!</Text>
                <View style={{ backgroundColor: colors.sky, borderRadius: 16, paddingVertical: 18, alignItems: "center", marginBottom: 20 }}>
                  <Text style={{ fontSize: 42, fontWeight: "900", color: colors.charcoal, letterSpacing: 10 }}>{newlyCreatedCode}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleShareCode(newlyCreatedCode)}
                  style={{ backgroundColor: colors.ember, borderRadius: 16, paddingVertical: 18, alignItems: "center", marginBottom: 12 }}
                >
                  <Text style={{ fontSize: 17, fontWeight: "800", color: colors.cream }}>Share Code</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowAddRoom(false); setNewlyCreatedCode(null); }} style={{ paddingVertical: 12, alignItems: "center" }}>
                  <Text style={{ fontSize: 14, color: colors.ash }}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              // Join or create
              <>
                <Text style={{ fontSize: 22, fontWeight: "800", color: colors.charcoal, marginBottom: 20 }}>Add a Room</Text>

                <TextInput
                  value={joinCode}
                  onChangeText={(t) => { setAddError(null); setJoinCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)); }}
                  placeholder="ROOM CODE"
                  placeholderTextColor={colors.ash}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={6}
                  style={{
                    backgroundColor: "white", borderWidth: 2,
                    borderColor: joinCode.length > 0 ? colors.ember : colors.mist,
                    borderRadius: 16, paddingHorizontal: 24, paddingVertical: 16,
                    fontSize: 28, fontWeight: "800", letterSpacing: 10,
                    color: colors.charcoal, textAlign: "center", marginBottom: 12,
                  }}
                />

                {addError && <Text style={{ color: colors.magenta, textAlign: "center", marginBottom: 12, fontSize: 13 }}>{addError}</Text>}

                <TouchableOpacity
                  onPress={handleJoinRoom}
                  disabled={addLoading !== null}
                  activeOpacity={0.85}
                  style={{ backgroundColor: colors.charcoal, borderRadius: 16, paddingVertical: 18, alignItems: "center", marginBottom: 10 }}
                >
                  {addLoading === "join" ? <ActivityIndicator color={colors.cream} /> : <Text style={{ fontSize: 17, fontWeight: "800", color: colors.cream }}>Join Room</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCreateRoom}
                  disabled={addLoading !== null}
                  activeOpacity={0.85}
                  style={{ backgroundColor: colors.sky, borderRadius: 16, paddingVertical: 18, alignItems: "center" }}
                >
                  {addLoading === "create" ? <ActivityIndicator color={colors.ember} /> : <Text style={{ fontSize: 17, fontWeight: "800", color: colors.charcoal }}>Create New Room</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Action sheet */}
      <Modal visible={selectedRoom !== null} transparent animationType="slide">
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(61,46,46,0.4)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setSelectedRoom(null)}
        >
          <View style={{ backgroundColor: colors.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ash, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16, textAlign: "center" }}>
              {nicknames[selectedRoom?.code ?? ""] ?? selectedRoom?.code}
            </Text>

            <TouchableOpacity
              onPress={handleRename}
              style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 18, borderRadius: 16, backgroundColor: "white", marginBottom: 10 }}
            >
              <Ionicons name="pencil-outline" size={22} color={colors.charcoal} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.charcoal }}>Rename Room</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleLeave}
              style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 18, borderRadius: 16, backgroundColor: "white", marginBottom: 10 }}
            >
              <Ionicons name="exit-outline" size={22} color={colors.magenta} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.magenta }}>Leave Room</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSelectedRoom(null)}
              style={{ padding: 16, borderRadius: 16, alignItems: "center", marginTop: 4 }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ash }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Rename modal */}
      <Modal visible={renaming !== null} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(61,46,46,0.5)", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{ backgroundColor: colors.cream, borderRadius: 24, padding: 28, width: "100%" }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.charcoal, marginBottom: 6 }}>Rename Room</Text>
            <Text style={{ fontSize: 13, color: colors.ash, marginBottom: 20 }}>
              Give {renaming?.code} a nickname just for you
            </Text>
            <TextInput
              value={renameInput}
              onChangeText={setRenameInput}
              placeholder="e.g. Beach Squad, Sunday Crew..."
              placeholderTextColor={colors.ash}
              autoFocus
              style={{
                backgroundColor: "white", borderWidth: 1.5, borderColor: colors.mist,
                borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                fontSize: 16, color: colors.charcoal, marginBottom: 16,
              }}
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => setRenaming(null)}
                style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.mist, alignItems: "center" }}
              >
                <Text style={{ color: colors.charcoal, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveRename}
                style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: colors.ember, alignItems: "center" }}
              >
                <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </View>
  );
}
