import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  PanResponder,
} from "react-native";
import { Text } from "../../components/Text";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

const { width: W, height: H } = Dimensions.get("window");

// Approximate sky container height (screen minus header + tab bar)
const SKY_HEIGHT = H * 0.6;

import * as Haptics from "expo-haptics";
import { fetchMyRooms, leaveRoom, createRoom, joinRoom } from "../../utils/rooms";
import { getAllNicknames, setRoomNickname } from "../../utils/nicknames";
import { fetchLatestMessageTimes } from "../../utils/messages";
import { getAllLastSeen } from "../../utils/lastSeen";
import { colors } from "../../utils/theme";
import { SkyCloud, DecorativeCloud } from "../../components/SkyCloud";
import type { Room } from "../../utils/supabase";

// Decorative background clouds — positions within fixed W x SKY_HEIGHT
const DECORATIVE = [
  { x: W * 0.75, y: SKY_HEIGHT * 0.08, width: W * 0.28, opacity: 0.15, variant: 1, driftY:  7, duration: 55000 },
  { x: W * 0.02, y: SKY_HEIGHT * 0.35, width: W * 0.22, opacity: 0.12, variant: 5, driftY: 10, duration: 70000 },
  { x: W * 0.55, y: SKY_HEIGHT * 0.52, width: W * 0.25, opacity: 0.18, variant: 4, driftY:  6, duration: 45000 },
  { x: W * 0.25, y: SKY_HEIGHT * 0.70, width: W * 0.32, opacity: 0.13, variant: 2, driftY:  9, duration: 62000 },
];


// Stable shape variant per room — derived from room code so it never changes
function roomVariant(code: string): number {
  return code.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 8;
}

// Deterministic globe position from room code (for globe view)
function roomGlobePos(code: string): { lon: number; lat: number } {
  const sum = code.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    lon: ((sum * 137.508) % 360) * (Math.PI / 180),
    lat: (((sum * 67.1) % 60) - 30) * (Math.PI / 180),
  };
}

const GLOBE_R = Math.min(W, H * 0.65) * 0.40;
const GLOBE_STARS = Array.from({ length: 44 }, (_, i) => ({
  x: (i * 53.7 + 11) % W,
  y: (i * 97.3 + 19) % (H * 0.88),
  r: 0.5 + (i * 7 % 3) * 0.5,
  o: 0.3 + (i * 13 % 10) * 0.04,
}));

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

  // Rename modal
  const [renaming, setRenaming] = useState<Room | null>(null);
  const [renameInput, setRenameInput] = useState("");

  // Options sheet (shown on long-hold-in-place)
  const [optionsRoom, setOptionsRoom] = useState<Room | null>(null);
  const [leavingRoom, setLeavingRoom] = useState(false);

  // Globe view toggle
  const [showGlobe, setShowGlobe] = useState(false);

  // Lifted cloud (being dragged) — for visual feedback
  const [liftedRoomId, setLiftedRoomId] = useState<string | null>(null);

  // Sky container height (from onLayout)
  const skyHeightRef = useRef(SKY_HEIGHT);

  // Per-cloud animX, animY and loops — recreated when rooms or room count changes
  const cloudAnimsRef = useRef<Record<string, {
    animX: Animated.Value | Animated.AnimatedAddition<number>;
    animY: Animated.Value | Animated.AnimatedAddition<number>;
    baseX: Animated.Value;
    baseY: Animated.Value;
    driftX: Animated.Value;
    driftY: Animated.Value;
  }>>({});
  const cloudLoopsRef    = useRef<Record<string, { stop: () => void; restartAt: (x: number, y: number) => void }>>({});
  const cloudPanRespondersRef = useRef<Record<string, ReturnType<typeof PanResponder.create>>>({});
  const [, setAnimsReady] = useState(0); // force re-render after effect populates anims

  // Stop all loops on unmount
  useEffect(() => {
    return () => { Object.values(cloudLoopsRef.current).forEach((l) => l.stop()); };
  }, []);

  // ─── Data loading ────────────────────────────────────────────────────────────
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

  // Cloud width responsive to room count (reactive) — shrink more for 6–8 clouds to avoid overlap
  const cloudW = useMemo(() => {
    const n = Math.max(rooms.length, 1);
    const base = Math.max(W * 0.18, Math.min(W * 0.54, W * 0.54 * (3 / n) + W * 0.18));
    return base;
  }, [rooms.length]);

  // Reposition clouds without overlap (called when cloud size changes)
  const fitCloudsToView = useCallback(() => {
    const displayRooms = rooms.slice(0, 8);
    if (displayRooms.length === 0) return;
    const cw = cloudW;
    const ch = cw * (185 / 240);
    const skyH = skyHeightRef.current;
    const minX = 0;
    const maxX = Math.max(0, W - cw);
    const minY = 0;
    const maxY = Math.max(0, skyH - ch);
    const PAD = 14;
    displayRooms.forEach((room, i) => {
      const anims = cloudAnimsRef.current[room.id];
      if (!anims) return;
      let x = (anims.baseX as any)._value;
      let y = (anims.baseY as any)._value;
      for (let pass = 0; pass < 2; pass++) {
        for (const other of displayRooms) {
          if (other.id === room.id) continue;
          const oa = cloudAnimsRef.current[other.id];
          if (!oa) continue;
          const ox = (oa.baseX as any)._value;
          const oy = (oa.baseY as any)._value;
          const dx = Math.abs((x + cw / 2) - (ox + cw / 2));
          const dy = Math.abs((y + ch / 2) - (oy + ch / 2));
          const overlapX = cw + PAD - dx;
          const overlapY = ch * 0.62 + PAD - dy;
          if (overlapX > 0 && overlapY > 0) {
            if (overlapX < overlapY) x += x < ox ? -overlapX : overlapX;
            else y += y < oy ? -overlapY : overlapY;
          }
        }
      }
      const clampedX = Math.max(minX, Math.min(maxX, x));
      const clampedY = Math.max(minY, Math.min(maxY, y));
      anims.baseX.setValue(clampedX);
      anims.baseY.setValue(clampedY);
    });
  }, [rooms, cloudW]);

  // ─── Cloud bounce animations — start on mount and when rooms change (BUG FIX 1, FEATURES 1–3) ─
  useEffect(() => {
    const displayRooms = rooms.slice(0, 8);
    const cw = cloudW;
    const ch = cw * (185 / 240);
    const skyH = skyHeightRef.current;
    const minX = 0;
    const maxX = Math.max(0, W - cw);
    const minY = 0;
    const maxY = Math.max(0, skyH - ch);

    // Stop all running loops and clear anims when rooms or count changes
    Object.values(cloudLoopsRef.current).forEach((l) => l.stop());
    cloudLoopsRef.current = {};
    cloudAnimsRef.current = {};
    cloudPanRespondersRef.current = {};

    const PAD = 14;
    const cloudH = ch * 0.62; // collision height
    const placed: { x: number; y: number }[] = [];

    function overlaps(x: number, y: number): boolean {
      for (const p of placed) {
        const dx = Math.abs((x + cw / 2) - (p.x + cw / 2));
        const dy = Math.abs((y + cloudH / 2) - (p.y + cloudH / 2));
        if (dx < cw + PAD && dy < cloudH + PAD) return true;
      }
      return false;
    }

    function findNonOverlappingPosition(): { x: number; y: number } {
      for (let attempt = 0; attempt < 80; attempt++) {
        const x = Math.random() * (maxX - minX || 1) + minX;
        const y = Math.random() * (maxY - minY || 1) + minY;
        if (!overlaps(x, y)) return { x, y };
      }
      // Fallback: place in a grid cell
      const n = placed.length;
      const cols = Math.ceil(Math.sqrt(n + 1));
      const rows = Math.ceil((n + 1) / cols);
      const cellW = (maxX - minX) / cols || cw;
      const cellH = (maxY - minY) / rows || ch;
      const col = n % cols;
      const row = Math.floor(n / cols);
      const x = minX + col * cellW + (cellW - cw) / 2 + (Math.random() - 0.5) * 20;
      const y = minY + row * cellH + (cellH - ch) / 2 + (Math.random() - 0.5) * 20;
      return {
        x: Math.max(minX, Math.min(maxX - cw, x)),
        y: Math.max(minY, Math.min(maxY - ch, y)),
      };
    }

    displayRooms.forEach((room) => {
      const { x: startX, y: startY } = findNonOverlappingPosition();
      placed.push({ x: startX, y: startY });

      // Base = anchor position (drop location). Drift = oscillation on top. Position = base + drift.
      const baseX = new Animated.Value(startX);
      const baseY = new Animated.Value(startY);
      const driftX = new Animated.Value(0);
      const driftY = new Animated.Value(0);
      cloudAnimsRef.current[room.id] = {
        animX: Animated.add(baseX, driftX),
        animY: Animated.add(baseY, driftY),
        baseX,
        baseY,
        driftX,
        driftY,
      };

      const v = roomVariant(room.code);
      const durationX = 18000 + v * 2000;
      const durationY = 25000 + v * 2500;
      const driftAmt = 30;
      const startToRight = Math.random() > 0.5;

      let active = true;
      const loopX = Animated.loop(
        Animated.sequence(
          startToRight
            ? [
                Animated.timing(driftX, { toValue: driftAmt, duration: durationX / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
                Animated.timing(driftX, { toValue: -driftAmt, duration: durationX, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
                Animated.timing(driftX, { toValue: 0, duration: durationX / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
              ]
            : [
                Animated.timing(driftX, { toValue: -driftAmt, duration: durationX / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
                Animated.timing(driftX, { toValue: driftAmt, duration: durationX, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
                Animated.timing(driftX, { toValue: 0, duration: durationX / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
              ]
        )
      );
      const loopY = Animated.loop(
        Animated.sequence([
          Animated.timing(driftY, { toValue: driftAmt, duration: durationY, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
          Animated.timing(driftY, { toValue: -driftAmt, duration: durationY * 2, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
          Animated.timing(driftY, { toValue: 0, duration: durationY, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        ])
      );

      const stop = () => {
        active = false;
        loopX.stop();
        loopY.stop();
        driftX.stopAnimation();
        driftY.stopAnimation();
        driftX.setValue(0);
        driftY.setValue(0);
      };

      const restartAt = (newX: number, newY: number) => {
        stop();
        const clampedX = Math.max(minX, Math.min(maxX, newX));
        const clampedY = Math.max(minY, Math.min(maxY, newY));
        baseX.setValue(clampedX);
        baseY.setValue(clampedY);
        active = true;
        const goRight = clampedX < (minX + maxX) / 2;
        const loopXNew = Animated.loop(
          Animated.sequence(
            goRight
              ? [
                  Animated.timing(driftX, { toValue: driftAmt, duration: durationX / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
                  Animated.timing(driftX, { toValue: -driftAmt, duration: durationX, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
                  Animated.timing(driftX, { toValue: 0, duration: durationX / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
                ]
              : [
                  Animated.timing(driftX, { toValue: -driftAmt, duration: durationX / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
                  Animated.timing(driftX, { toValue: driftAmt, duration: durationX, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
                  Animated.timing(driftX, { toValue: 0, duration: durationX / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
                ]
          )
        );
        const loopYNew = Animated.loop(
          Animated.sequence([
            Animated.timing(driftY, { toValue: driftAmt, duration: durationY, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
            Animated.timing(driftY, { toValue: -driftAmt, duration: durationY * 2, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
            Animated.timing(driftY, { toValue: 0, duration: durationY, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
          ])
        );
        loopXNew.start();
        loopYNew.start();
        cloudLoopsRef.current[room.id] = {
          stop: () => { active = false; loopXNew.stop(); loopYNew.stop(); driftX.stopAnimation(); driftY.stopAnimation(); driftX.setValue(0); driftY.setValue(0); },
          restartAt,
        };
      };

      cloudLoopsRef.current[room.id] = { stop, restartAt };
      loopX.start();
      loopY.start();
    });
    setAnimsReady((n) => n + 1);
    fitCloudsToView();
  }, [rooms, cloudW, fitCloudsToView]);

  // Callbacks for pan responder (tap vs long-press vs drag)
  const onTapRef     = useRef<(room: Room) => void>(() => {});
  const onOptionsRef = useRef<(room: Room) => void>(() => {});
  onTapRef.current     = handleCloudPress;
  onOptionsRef.current = (room) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setOptionsRoom(room); };

  function getOrCreateCloudPanResponder(room: Room, anims: { baseX: Animated.Value; baseY: Animated.Value }, cw: number) {
    if (cloudPanRespondersRef.current[room.id]) return cloudPanRespondersRef.current[room.id];
    const ch = cw * (185 / 240);
    const skyH = skyHeightRef.current;
    const minX = 0, maxX = Math.max(0, W - cw);
    const minY = 0, maxY = Math.max(0, skyH - ch);

    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    let dragging = false;
    let longFired = false;
    let startX = 0;
    let startY = 0;

    const pr = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: () => {
        dragging = false;
        longFired = false;
        startX = (anims.baseX as any)._value;
        startY = (anims.baseY as any)._value;
        cloudLoopsRef.current[room.id]?.stop();

        pressTimer = setTimeout(() => {
          if (!dragging) {
            longFired = true;
            onOptionsRef.current(room);
          }
        }, 500);
      },

      onPanResponderMove: (_, gs) => {
        const dist = Math.sqrt(gs.dx * gs.dx + gs.dy * gs.dy);
        if (dist > 8) {
          if (!dragging) {
            dragging = true;
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
            setLiftedRoomId(room.id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          anims.baseX.setValue(startX + gs.dx);
          anims.baseY.setValue(startY + gs.dy);
        }
      },

      onPanResponderRelease: (_, gs) => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }

        if (dragging) {
          setLiftedRoomId(null);
          const currX = (anims.baseX as any)._value;
          const currY = (anims.baseY as any)._value;
          const clampedX = Math.max(minX, Math.min(maxX, currX));
          const clampedY = Math.max(minY, Math.min(maxY, currY));
          cloudLoopsRef.current[room.id]?.restartAt(clampedX, clampedY);
        } else if (!longFired) {
          onTapRef.current(room);
        }
      },

      onPanResponderTerminate: () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        dragging = false;
        setLiftedRoomId(null);
        cloudLoopsRef.current[room.id]?.restartAt(
          Math.max(minX, Math.min(maxX, (anims.baseX as any)._value)),
          Math.max(minY, Math.min(maxY, (anims.baseY as any)._value)),
        );
      },
    });

    cloudPanRespondersRef.current[room.id] = pr;
    return pr;
  }

  // ─── Room creation / joining ─────────────────────────────────────────────────
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

  // Tap cloud → navigate into room
  function handleCloudPress(room: Room) {
    router.push(`/room/${room.code}`);
  }

  // ─── Options sheet actions ───────────────────────────────────────────────────
  async function handleLeaveRoom(room: Room) {
    setLeavingRoom(true);
    try {
      await leaveRoom(room.code);
      setRooms((prev) => prev.filter((r) => r.id !== room.id));
      setOptionsRoom(null);
    } finally {
      setLeavingRoom(false);
    }
  }

  async function saveRename() {
    if (!renaming) return;
    await setRoomNickname(renaming.code, renameInput);
    setNicknames((prev) => ({ ...prev, [renaming.code]: renameInput.trim() }));
    setRenaming(null);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.sky }}>
    <View style={{ flex: 1 }}>

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
          <View style={{ flex: 1, alignItems: "flex-start" }}>
            {rooms.length > 0 && (
              <TouchableOpacity
                onPress={() => setShowGlobe((v) => !v)}
                activeOpacity={0.85}
                style={{
                  width: 42, height: 42, borderRadius: 21,
                  backgroundColor: showGlobe ? colors.ember : colors.mist,
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <Ionicons name="globe-outline" size={22} color={showGlobe ? "white" : colors.charcoal} />
              </TouchableOpacity>
            )}
          </View>
          <View style={{ flex: 1, alignItems: "center" }}>
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
          <View
            onLayout={(e) => {
              skyHeightRef.current = e.nativeEvent.layout.height;
            }}
            style={{ flex: 1, width: W }}
          >
            {/* Decorative background clouds */}
            {DECORATIVE.map((d, i) => (
              <DecorativeCloud key={i} x={d.x} y={d.y} width={d.width} opacity={d.opacity}
                variant={d.variant} driftY={d.driftY} duration={d.duration} />
            ))}

            {/* Room clouds — tap to enter, long-press for options, drag to move */}
            {rooms.slice(0, 8).map((room) => {
              const anims = cloudAnimsRef.current[room.id];
              const cw = cloudW;
              if (!anims) return null;
              const pr = getOrCreateCloudPanResponder(room, anims, cw);

              return (
                <Animated.View
                  key={room.id}
                  pointerEvents="box-none"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    transform: [
                      { translateX: anims.animX },
                      { translateY: anims.animY },
                    ],
                  }}
                  {...pr.panHandlers}
                >
                  <View
                    style={{
                      width: cw,
                      height: cw * (185 / 240),
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: liftedRoomId === room.id ? 8 : 2 },
                      shadowOpacity: liftedRoomId === room.id ? 0.18 : 0.06,
                      shadowRadius: liftedRoomId === room.id ? 16 : 4,
                      elevation: liftedRoomId === room.id ? 12 : 2,
                      zIndex: liftedRoomId === room.id ? 20 : 1,
                    }}
                  >
                    <SkyCloud
                      name={nicknames[room.code] ?? room.code}
                      width={cw}
                      unread={unreadRooms.has(room.code)}
                      lifted={liftedRoomId === room.id}
                      variant={roomVariant(room.code)}
                    />
                  </View>
                </Animated.View>
              );
            })}
          </View>
        )}
      </SafeAreaView>

      {/* Globe overlay — toggled via header button */}
      {showGlobe && rooms.length > 0 && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
          <GlobeView
            rooms={rooms}
            nicknames={nicknames}
            unreadRooms={unreadRooms}
            onClose={() => setShowGlobe(false)}
          />
        </View>
      )}

      {/* Options sheet (long hold in place) */}
      <Modal
        visible={optionsRoom !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setOptionsRoom(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(61,46,46,0.35)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setOptionsRoom(null)}
        >
          <View style={{ backgroundColor: colors.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 48 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.charcoal, marginBottom: 4 }}>
              {optionsRoom ? (nicknames[optionsRoom.code] ?? optionsRoom.code) : ""}
            </Text>
            <Text style={{ fontSize: 12, color: colors.ash, letterSpacing: 2, marginBottom: 24 }}>
              {optionsRoom?.code}
            </Text>

            <TouchableOpacity
              onPress={() => {
                if (!optionsRoom) return;
                setOptionsRoom(null);
                setTimeout(() => {
                  setRenameInput(nicknames[optionsRoom.code] ?? "");
                  setRenaming(optionsRoom);
                }, 300);
              }}
              style={{ flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.mist }}
            >
              <Text style={{ fontSize: 16, color: colors.charcoal, fontWeight: "600", flex: 1 }}>Rename</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => optionsRoom && handleShareCode(optionsRoom.code)}
              style={{ flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.mist }}
            >
              <Text style={{ fontSize: 16, color: colors.charcoal, fontWeight: "600", flex: 1 }}>Share Room Code</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (!optionsRoom) return;
                Alert.alert(
                  "Leave Room?",
                  "You can rejoin anytime with the room code.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Leave", style: "destructive", onPress: () => handleLeaveRoom(optionsRoom) },
                  ]
                );
              }}
              disabled={leavingRoom}
              style={{ flexDirection: "row", alignItems: "center", paddingVertical: 16 }}
            >
              {leavingRoom
                ? <ActivityIndicator color={colors.magenta} />
                : <Text style={{ fontSize: 16, color: colors.magenta, fontWeight: "600" }}>Leave Room</Text>
              }
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
    </View>
  );
}

// ─── Globe view ───────────────────────────────────────────────────────────────
function GlobeView({
  rooms,
  nicknames,
  unreadRooms,
  onClose,
}: {
  rooms: Room[];
  nicknames: Record<string, string>;
  unreadRooms: Set<string>;
  onClose: () => void;
}) {
  const [rot, setRot] = useState({ lon: 0, lat: 0 });
  const rotRef = useRef(0);

  useEffect(() => {
    const t = setInterval(() => {
      rotRef.current += 0.004;
      setRot((r) => ({ ...r, lon: rotRef.current }));
    }, 50);
    return () => clearInterval(t);
  }, []);

  const cx = W / 2;
  const cy = H * 0.47;
  const cloudW = W * 0.22 * 0.52;

  const projected = rooms.slice(0, 8).map((room) => {
    const { lon, lat } = roomGlobePos(room.code);
    const dLon = lon - rot.lon;
    const x = GLOBE_R * Math.sin(dLon) * Math.cos(lat);
    const y = GLOBE_R * (Math.sin(lat) * Math.cos(rot.lat) - Math.cos(dLon) * Math.cos(lat) * Math.sin(rot.lat));
    const depth = Math.cos(dLon) * Math.cos(lat) * Math.cos(rot.lat) + Math.sin(lat) * Math.sin(rot.lat);
    return { room, x, y, depth };
  }).sort((a, b) => a.depth - b.depth);

  return (
    <View style={{ flex: 1, backgroundColor: "#0D1B2A" }}>
      {GLOBE_STARS.map((s, i) => (
        <View key={i} pointerEvents="none" style={{
          position: "absolute", left: s.x, top: s.y,
          width: s.r * 2, height: s.r * 2, borderRadius: s.r,
          backgroundColor: "white", opacity: s.o,
        }} />
      ))}
      <View pointerEvents="none" style={{
        position: "absolute",
        left: cx - GLOBE_R * 1.18, top: cy - GLOBE_R * 1.18,
        width: GLOBE_R * 2.36, height: GLOBE_R * 2.36,
        borderRadius: GLOBE_R * 1.18,
        backgroundColor: "#4A90D9", opacity: 0.18,
      }} />
      <View pointerEvents="none" style={{
        position: "absolute",
        left: cx - GLOBE_R, top: cy - GLOBE_R,
        width: GLOBE_R * 2, height: GLOBE_R * 2,
        borderRadius: GLOBE_R,
        backgroundColor: "#1E4DA0",
        overflow: "hidden",
      }}>
        <View style={{
          position: "absolute",
          width: GLOBE_R * 1.4, height: GLOBE_R * 1.4, borderRadius: GLOBE_R * 0.7,
          backgroundColor: "#4A90D9", opacity: 0.35,
          top: GLOBE_R * 0.1, left: GLOBE_R * 0.15,
        }} />
        <View style={{
          position: "absolute",
          width: GLOBE_R * 0.55, height: GLOBE_R * 0.38, borderRadius: GLOBE_R * 0.28,
          backgroundColor: "white", opacity: 0.07,
          top: GLOBE_R * 0.18, left: GLOBE_R * 0.28,
        }} />
      </View>
      {projected.map(({ room, x, y, depth }) => {
        if (depth < -0.05) return null;
        const cw = cloudW * Math.max(0.35, depth);
        const alpha = depth < 0.15 ? Math.max(0, (depth + 0.05) / 0.2) : 1;
        return (
          <View key={room.id} pointerEvents="none" style={{
            position: "absolute",
            left: cx + x - cw / 2,
            top: cy + y - (cw * 185 / 240) / 2,
            opacity: alpha,
          }}>
            <SkyCloud
              name={nicknames[room.code] ?? room.code}
              width={cw}
              unread={unreadRooms.has(room.code)}
              variant={roomVariant(room.code)}
            />
          </View>
        );
      })}
      <TouchableOpacity
        onPress={onClose}
        style={{
          position: "absolute",
          bottom: 100,
          left: 0,
          right: 0,
          alignItems: "center",
        }}
      >
        <View style={{
          backgroundColor: "rgba(255,255,255,0.15)",
          paddingHorizontal: 20,
          paddingVertical: 10,
          borderRadius: 22,
        }}>
          <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "600" }}>
            tap to return
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}
