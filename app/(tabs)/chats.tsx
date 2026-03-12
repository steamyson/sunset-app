import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Share,
  Alert,
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
import { SkyCloud, DecorativeCloud } from "../../components/SkyCloud";
import type { Room } from "../../utils/supabase";

// ─── Cloud layout config ──────────────────────────────────────────────────────
const BASE_CLOUD_W = W * 0.54;

const CLOUD_POSITIONS = [
  { left: W * 0.02,  top: H * 0.03, scale: 1.15 },
  { left: W * 0.42,  top: H * 0.09, scale: 0.80 },
  { left: W * 0.04,  top: H * 0.26, scale: 1.00 },
  { left: W * 0.44,  top: H * 0.30, scale: 1.08 },
  { left: W * 0.02,  top: H * 0.48, scale: 0.88 },
  { left: W * 0.42,  top: H * 0.52, scale: 1.00 },
  { left: W * 0.08,  top: H * 0.66, scale: 0.85 },
  { left: W * 0.46,  top: H * 0.70, scale: 1.05 },
];

const DECORATIVE = [
  { x: W * 0.64,  y: H * 0.13, width: W * 0.28, opacity: 0.15 },
  { x: -W * 0.03, y: H * 0.40, width: W * 0.22, opacity: 0.12 },
  { x: W * 0.72,  y: H * 0.57, width: W * 0.25, opacity: 0.18 },
  { x: W * 0.18,  y: H * 0.78, width: W * 0.32, opacity: 0.13 },
];

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ChatsScreen() {
  // Sun / glow animation
  const glowAnim   = useRef(new Animated.Value(0.5)).current;
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

  // Data
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

  // Multi-select
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [leavingMulti, setLeavingMulti] = useState(false);

  // Rename modal
  const [renaming, setRenaming] = useState<Room | null>(null);
  const [renameInput, setRenameInput] = useState("");

  // Zoom-into-cloud transition
  const rootViewRef = useRef<View>(null);
  const cloudRefs = useRef<(View | null)[]>([]);
  const pendingRoomCode = useRef("");
  const zoomScaleAnim = useRef(new Animated.Value(1)).current;
  const [zoomOrigin, setZoomOrigin] = useState<{
    x: number; y: number; w: number; h: number; cx: number; cy: number;
  } | null>(null);

  // Start zoom animation whenever origin is set
  useEffect(() => {
    if (!zoomOrigin) return;
    const { cx, cy, w, h } = zoomOrigin;
    const scaleNeeded = Math.max(
      (2 * cx) / w,
      (2 * (W - cx)) / w,
      (2 * cy) / h,
      (2 * (H - cy)) / h,
    ) * 1.4;

    zoomScaleAnim.setValue(1);
    Animated.timing(zoomScaleAnim, {
      toValue: scaleNeeded,
      duration: 380,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      router.push(`/room/${pendingRoomCode.current}`);
      setTimeout(() => setZoomOrigin(null), 200);
    });
  }, [zoomOrigin]);

  // Data loading
  async function load() {
    try {
      const [roomList, nameMap, lastSeenMap] = await Promise.all([
        fetchMyRooms(),
        getAllNicknames(),
        getAllLastSeen(),
      ]);
      setRooms(roomList);
      setNicknames(nameMap);
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

  // Room creation / joining
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

  // Cloud interaction
  function handleCloudPress(room: Room, index: number) {
    if (multiSelectMode) { toggleMultiSelect(room.code); return; }
    const cloudRef = cloudRefs.current[index];
    if (!cloudRef || !rootViewRef.current) {
      router.push(`/room/${room.code}`);
      return;
    }
    rootViewRef.current.measureInWindow((rx, ry) => {
      cloudRef.measureInWindow((x, y, w, h) => {
        const adjX = x - rx;
        const adjY = y - ry;
        pendingRoomCode.current = room.code;
        setZoomOrigin({ x: adjX, y: adjY, w, h, cx: adjX + w / 2, cy: adjY + h / 2 });
      });
    });
  }

  function handleLongPress(room: Room) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (multiSelectMode) {
      toggleMultiSelect(room.code);
    } else {
      setMultiSelectMode(true);
      setMultiSelected(new Set([room.code]));
    }
  }

  function toggleMultiSelect(code: string) {
    setMultiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function exitMultiSelect() {
    setMultiSelectMode(false);
    setMultiSelected(new Set());
  }

  async function handleLeaveSelected() {
    setLeavingMulti(true);
    try {
      for (const code of multiSelected) await leaveRoom(code);
      setRooms((prev) => prev.filter((r) => !multiSelected.has(r.code)));
      exitMultiSelect();
    } finally {
      setLeavingMulti(false);
    }
  }

  async function saveRename() {
    if (!renaming) return;
    await setRoomNickname(renaming.code, renameInput);
    setNicknames((prev) => ({ ...prev, [renaming.code]: renameInput.trim() }));
    setRenaming(null);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <View ref={rootViewRef} style={{ flex: 1, backgroundColor: colors.sky }}>

      {/* Sunset glow rays */}
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

      {/* Sun */}
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
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 32, paddingBottom: 8, flexDirection: "row", alignItems: "center" }}>
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
                width: 42, height: 42, borderRadius: 21,
                alignItems: "center", justifyContent: "center",
                shadowColor: colors.ember,
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
              }}
            >
              <Text style={{ color: "white", fontSize: 26, fontWeight: "300", lineHeight: 30 }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sky scene */}
        {loading ? (
          <ActivityIndicator color={colors.ember} style={{ marginTop: 80 }} size="large" />
        ) : rooms.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingBottom: 60 }}>
            <Text style={{ fontSize: 64 }}>⛅</Text>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.charcoal, marginTop: 20, textAlign: "center" }}>
              Your sky is empty
            </Text>
            <Text style={{ fontSize: 14, color: colors.ash, marginTop: 8, textAlign: "center", lineHeight: 22 }}>
              Create a room and your first cloud will appear here.
            </Text>
            <TouchableOpacity
              onPress={() => setShowAddRoom(true)}
              style={{ marginTop: 24, backgroundColor: colors.ember, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 }}
            >
              <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Add a Room</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {/* Decorative background clouds */}
            {DECORATIVE.map((d, i) => (
              <DecorativeCloud key={i} x={d.x} y={d.y} width={d.width} opacity={d.opacity} />
            ))}

            {/* Room clouds */}
            {rooms.slice(0, 8).map((room, i) => {
              const cfg = CLOUD_POSITIONS[i];
              const cw = BASE_CLOUD_W * cfg.scale;
              return (
                <View
                  key={room.id}
                  style={{ position: "absolute", left: cfg.left, top: cfg.top }}
                >
                  <SkyCloud
                    ref={(r) => { cloudRefs.current[i] = r; }}
                    name={nicknames[room.code] ?? room.code}
                    width={cw}
                    unread={unreadRooms.has(room.code)}
                    selected={multiSelected.has(room.code)}
                    multiSelect={multiSelectMode}
                    onPress={() => handleCloudPress(room, i)}
                    onLongPress={() => handleLongPress(room)}
                  />
                </View>
              );
            })}
          </View>
        )}
      </SafeAreaView>

      {/* Zoom overlay — expands from cloud center to fill screen */}
      {zoomOrigin && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: zoomOrigin.cx - zoomOrigin.w / 2,
            top:  zoomOrigin.cy - zoomOrigin.h / 2,
            width: zoomOrigin.w,
            height: zoomOrigin.h,
            borderRadius: zoomOrigin.w * 0.4,
            backgroundColor: colors.sky,
            transform: [{ scale: zoomScaleAnim }],
            zIndex: 50,
          }}
        />
      )}

      {/* Multi-select action bar */}
      {multiSelectMode && (
        <View style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          backgroundColor: colors.cream,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: 20, paddingBottom: 36,
          flexDirection: "row", alignItems: "center", gap: 12,
          shadowColor: "#000", shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08, shadowRadius: 12, elevation: 10,
          zIndex: 40,
        }}>
          <TouchableOpacity
            onPress={exitMultiSelect}
            style={{ paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.mist }}
          >
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.charcoal }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (multiSelected.size === 0) return;
              Alert.alert(
                `Leave ${multiSelected.size} room${multiSelected.size === 1 ? "" : "s"}?`,
                "You can rejoin any room anytime with its code.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Leave", style: "destructive", onPress: handleLeaveSelected },
                ]
              );
            }}
            disabled={multiSelected.size === 0 || leavingMulti}
            style={{
              flex: 1,
              backgroundColor: multiSelected.size === 0 ? colors.mist : colors.magenta,
              borderRadius: 14, paddingVertical: 14, alignItems: "center",
            }}
          >
            {leavingMulti
              ? <ActivityIndicator color="white" />
              : <Text style={{ fontSize: 15, fontWeight: "800", color: "white" }}>
                  Leave {multiSelected.size > 0 ? `${multiSelected.size} ` : ""}Room{multiSelected.size === 1 ? "" : "s"}
                </Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* Add room sheet */}
      <Modal
        visible={showAddRoom}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowAddRoom(false); setNewlyCreatedCode(null); setJoinCode(""); setAddError(null); }}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(61,46,46,0.4)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => { setShowAddRoom(false); setNewlyCreatedCode(null); setJoinCode(""); setAddError(null); }}
        >
          <View style={{ backgroundColor: colors.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 48 }}>
            {newlyCreatedCode ? (
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
                <TouchableOpacity
                  onPress={() => { setShowAddRoom(false); setNewlyCreatedCode(null); }}
                  style={{ paddingVertical: 12, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 14, color: colors.ash }}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
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
                  {addLoading === "join"
                    ? <ActivityIndicator color={colors.cream} />
                    : <Text style={{ fontSize: 17, fontWeight: "800", color: colors.cream }}>Join Room</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCreateRoom}
                  disabled={addLoading !== null}
                  activeOpacity={0.85}
                  style={{ backgroundColor: colors.sky, borderRadius: 16, paddingVertical: 18, alignItems: "center" }}
                >
                  {addLoading === "create"
                    ? <ActivityIndicator color={colors.ember} />
                    : <Text style={{ fontSize: 17, fontWeight: "800", color: colors.charcoal }}>Create New Room</Text>
                  }
                </TouchableOpacity>
              </>
            )}
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
    </View>
  );
}
