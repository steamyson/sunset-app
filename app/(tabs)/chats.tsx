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
  StyleSheet,
} from "react-native";
import AnimatedReanimated, {
  useSharedValue,
  useAnimatedStyle,
  withDecay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Text } from "../../components/Text";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

const { width: W, height: H } = Dimensions.get("window");

// Approximate sky container height (screen minus header + tab bar)
const SKY_HEIGHT = H * 0.6;

import * as Haptics from "expo-haptics";
import { supabase } from "../../utils/supabase";
import { getItem, setItem } from "../../utils/storage";
import { getDeviceId } from "../../utils/device";
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

// Tab bar height approx (from _layout)
const TAB_BAR_HEIGHT = 88;
// Cloud zone starts below header; uses full content area down to tab bar
const SKY_TOP_OFFSET = 100;
const SKY_CONTENT_HEIGHT = H - TAB_BAR_HEIGHT;
const UNREAD_PHOTOS_KEY = "unread_photos_v1";

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ChatsScreen() {
  const insets = useSafeAreaInsets();
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

  // Multi-select mode for leaving multiple rooms at once
  const [selectModeForLeave, setSelectModeForLeave] = useState(false);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());

  // Unified zoom: 1 = sky, 0.18-0.55 = globe (deeper zoom at lower values), 0.78+ = return to sky
  const zoomLevel = useRef(new Animated.Value(1)).current;
  const zoomValueRef = useRef(1);
  const zoomLastDist = useRef(0);

  // Lifted cloud (being dragged) — for visual feedback
  const [liftedRoomId, setLiftedRoomId] = useState<string | null>(null);

  // Refs for realtime / unread handling
  const currentRoomCodeRef = useRef<string | null>(null);
  const roomsRef = useRef<Room[]>([]);
  const myDeviceIdRef = useRef<string | null>(null);
  roomsRef.current = rooms;

  // Unified pinch (2-finger) — updates zoom directly, no setState during gesture
  const sceneZoomResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (ev) => ev.nativeEvent.touches.length >= 2,
      onPanResponderTerminationRequest: () => true,
      onPanResponderGrant: (ev) => {
        if (ev.nativeEvent.touches.length >= 2) {
          const t0 = ev.nativeEvent.touches[0];
          const t1 = ev.nativeEvent.touches[1];
          zoomLastDist.current = Math.hypot(t1.pageX - t0.pageX, t1.pageY - t0.pageY);
        }
      },
      onPanResponderMove: (ev) => {
        if (ev.nativeEvent.touches.length >= 2 && zoomLastDist.current > 0) {
          const t0 = ev.nativeEvent.touches[0];
          const t1 = ev.nativeEvent.touches[1];
          const dist = Math.hypot(t1.pageX - t0.pageX, t1.pageY - t0.pageY);
          const ratio = dist / zoomLastDist.current;
          let next = zoomValueRef.current * ratio;
          next = Math.max(0.18, Math.min(1, next)); // allow full range during pinch
          zoomValueRef.current = next;
          zoomLevel.setValue(next);
          zoomLastDist.current = dist;
        }
      },
      onPanResponderRelease: () => {
        zoomLastDist.current = 0;
        const z = zoomValueRef.current;
        // Globe zoom: 0.35–0.55 = slight zoom into globe. z >= 0.78 = return to sky.
        if (z >= 0.78) {
          zoomValueRef.current = 1;
          setViewModeRef.current("sky");
          Animated.timing(zoomLevel, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        } else if (z < 0.6) {
          setViewModeRef.current("globe");
          const snapZ = Math.max(0.18, Math.min(0.55, z));
          zoomValueRef.current = snapZ;
          Animated.timing(zoomLevel, { toValue: snapZ, duration: 250, useNativeDriver: true }).start();
        } else {
          setViewModeRef.current("globe");
          zoomValueRef.current = 0.55;
          Animated.timing(zoomLevel, { toValue: 0.55, duration: 250, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  // Globe entry point stays at 0.35 — user can pinch further to 0.18 floor
  const goToGlobe = useCallback(() => {
    zoomValueRef.current = 0.35;
    Animated.timing(zoomLevel, { toValue: 0.35, duration: 400, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
  }, [zoomLevel]);

  const goToSky = useCallback(() => {
    zoomValueRef.current = 1;
    Animated.timing(zoomLevel, { toValue: 1, duration: 400, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
  }, [zoomLevel]);

  const [viewMode, setViewMode] = useState<"sky" | "globe">("sky");
  const setViewModeRef = useRef(setViewMode);
  setViewModeRef.current = setViewMode;

  const goToGlobeWithMode = useCallback(() => {
    setViewMode("globe");
    goToGlobe();
  }, [goToGlobe]);

  const goToSkyWithMode = useCallback(() => {
    setViewMode("sky");
    goToSky();
  }, [goToSky]);

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

  // When Chats screen is focused, clear "currently viewing room" (user came back from room)
  useFocusEffect(useCallback(() => { currentRoomCodeRef.current = null; }, []));

  // Supabase realtime: new photo INSERT → add room to unread if not currently viewing
  useEffect(() => {
    getDeviceId().then((id) => { myDeviceIdRef.current = id; });
    const channel = supabase
      .channel("messages-insert")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload: { new: { room_id: string; sender_device_id: string } }) => {
          const { room_id, sender_device_id } = payload.new;
          if (sender_device_id === myDeviceIdRef.current) return;
          const room = roomsRef.current.find((r) => r.id === room_id);
          if (!room) return;
          if (currentRoomCodeRef.current === room.code) return;
          setUnreadRooms((prev) => new Set([...prev, room.code]));
          const raw = await getItem(UNREAD_PHOTOS_KEY);
          const map: Record<string, boolean> = raw ? JSON.parse(raw) : {};
          map[room.code] = true;
          await setItem(UNREAD_PHOTOS_KEY, JSON.stringify(map));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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
    const minX = 0;
    const maxX = Math.max(0, W - cw);
    const minY = SKY_TOP_OFFSET;
    const maxY = Math.max(minY, SKY_CONTENT_HEIGHT - ch);
    const PAD = 14;
    const updates: { anims: { baseX: Animated.Value; baseY: Animated.Value }; x: number; y: number }[] = [];
    displayRooms.forEach((room) => {
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
      updates.push({ anims, x: clampedX, y: clampedY });
    });
    const bboxLeft = Math.min(...updates.map((u) => u.x));
    const bboxTop = Math.min(...updates.map((u) => u.y));
    const bboxRight = Math.max(...updates.map((u) => u.x + cw));
    const bboxBottom = Math.max(...updates.map((u) => u.y + ch));
    const fits =
      bboxLeft >= 0 &&
      bboxTop >= SKY_TOP_OFFSET &&
      bboxRight <= W &&
      bboxBottom <= SKY_CONTENT_HEIGHT;
    if (fits) return;
    const springConfig = { tension: 60, friction: 12, useNativeDriver: false };
    updates.forEach(({ anims, x, y }) => {
      Animated.spring(anims.baseX, { toValue: x, ...springConfig }).start();
      Animated.spring(anims.baseY, { toValue: y, ...springConfig }).start();
    });
  }, [rooms, cloudW]);

  // ─── Cloud bounce animations — start on mount and when rooms change (BUG FIX 1, FEATURES 1–3) ─
  useEffect(() => {
    const displayRooms = rooms.slice(0, 8);
    const cw = cloudW;
    const ch = cw * (185 / 240);
    const minX = 0;
    const maxX = Math.max(0, W - cw);
    const minY = SKY_TOP_OFFSET;
    const maxY = Math.max(minY, SKY_CONTENT_HEIGHT - ch);

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
      const n = placed.length;
      const totalClouds = displayRooms.length;
      const cols = Math.max(1, Math.ceil(Math.sqrt(totalClouds)));
      const rows = Math.ceil(totalClouds / cols);
      const cellW = (maxX - minX) / cols || cw;
      const cellH = (maxY - minY) / rows || ch;
      const col = n % cols;
      const row = Math.floor(n / cols);
      const baseX = minX + col * cellW + (cellW - cw) / 2;
      const baseY = minY + row * cellH + (cellH - ch) / 2;
      const jitter = Math.min(15, cellW * 0.15, cellH * 0.15);
      for (let attempt = 0; attempt < 30; attempt++) {
        const x = baseX + (Math.random() - 0.5) * 2 * jitter;
        const y = baseY + (Math.random() - 0.5) * 2 * jitter;
        const clampedX = Math.max(minX, Math.min(maxX - cw, x));
        const clampedY = Math.max(minY, Math.min(maxY - ch, y));
        if (!overlaps(clampedX, clampedY)) return { x: clampedX, y: clampedY };
      }
      return {
        x: Math.max(minX, Math.min(maxX - cw, baseX)),
        y: Math.max(minY, Math.min(maxY - ch, baseY)),
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
      // Subtle, deterministic drift per room: lateral ±6px over ~8–12s
      const driftAmt = 6;
      const durationX = 8000 + (v % 4) * 1000;  // 8–11s
      const durationY = 10000 + (v % 4) * 1500; // 10–14.5s
      const startToRight = (v % 2) === 0;       // deterministic direction

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

  // fitCloudsToView on focus, with 300ms delay so screen transition completes first
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => fitCloudsToView(), 300);
      return () => clearTimeout(t);
    }, [fitCloudsToView])
  );

  // Callbacks for pan responder (tap vs long-press vs drag)
  const onTapRef     = useRef<(room: Room) => void>(() => {});
  const onOptionsRef = useRef<(room: Room) => void>(() => {});
  onTapRef.current   = handleCloudPress;
  onOptionsRef.current = (room) => {
    if (selectModeForLeave) {
      toggleSelectModeSelection(room);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setOptionsRoom(room);
    }
  };

  function getOrCreateCloudPanResponder(room: Room, anims: { baseX: Animated.Value; baseY: Animated.Value }, cw: number) {
    if (cloudPanRespondersRef.current[room.id]) return cloudPanRespondersRef.current[room.id];
    const ch = cw * (185 / 240);
    const minX = 0, maxX = Math.max(0, W - cw);
    const minY = SKY_TOP_OFFSET, maxY = Math.max(SKY_TOP_OFFSET, SKY_CONTENT_HEIGHT - ch);

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

  // Tap cloud → navigate into room (or toggle selection when in select mode)
  function handleCloudPress(room: Room) {
    if (selectModeForLeave) {
      setSelectedRoomIds((prev) => {
        const next = new Set(prev);
        if (next.has(room.id)) next.delete(room.id);
        else next.add(room.id);
        return next;
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      currentRoomCodeRef.current = room.code;
      setUnreadRooms((prev) => {
        const next = new Set(prev);
        next.delete(room.code);
        return next;
      });
      getItem(UNREAD_PHOTOS_KEY).then((raw) => {
        const map: Record<string, boolean> = raw ? JSON.parse(raw) : {};
        map[room.code] = false;
        setItem(UNREAD_PHOTOS_KEY, JSON.stringify(map));
      });
      const unread = unreadRooms.has(room.code);
      router.push(`/room/${room.code}${unread ? "?unread=true" : ""}`);
    }
  }

  function toggleSelectModeSelection(room: Room) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(room.id)) next.delete(room.id);
      else next.add(room.id);
      return next;
    });
  }

  function enterSelectModeToLeave(room: Room) {
    setOptionsRoom(null);
    setSelectModeForLeave(true);
    setSelectedRoomIds(new Set([room.id]));
  }

  function exitSelectMode() {
    setSelectModeForLeave(false);
    setSelectedRoomIds(new Set());
  }

  // ─── Options sheet actions ───────────────────────────────────────────────────
  function handleLeaveRoom(room: Room) {
    setLeavingRoom(true);
    // Optimistic: remove room from UI immediately
    setRooms((prev) => prev.filter((r) => r.id !== room.id));
    setOptionsRoom(null);
    const code = room.code;
    leaveRoom(code).catch((e) => {
      console.error("Failed to leave room", code, e);
    }).finally(() => {
      setLeavingRoom(false);
    });
  }

  function handleLeaveMultipleRooms(roomIds: Set<string>) {
    if (roomIds.size === 0) return;
    const toLeave = rooms.filter((r) => roomIds.has(r.id));
    setLeavingRoom(true);
    // Optimistic: drop all selected rooms from UI at once
    setRooms((prev) => prev.filter((r) => !roomIds.has(r.id)));
    exitSelectMode();

    const codes = toLeave.map((room) => room.code);
    Promise.allSettled(codes.map((code) => leaveRoom(code))).then((results) => {
      const failed = results
        .map((res, idx) => ({ res, code: codes[idx] }))
        .filter((x) => x.res.status === "rejected");
      if (failed.length > 0) {
        console.error("Failed to leave some rooms", failed.map((f) => f.code));
      }
    }).finally(() => {
      setLeavingRoom(false);
    });
  }

  async function saveRename() {
    if (!renaming) return;
    await setRoomNickname(renaming.code, renameInput);
    setNicknames((prev) => ({ ...prev, [renaming.code]: renameInput.trim() }));
    setRenaming(null);
  }

  // Interpolations: 0.18–0.55 = globe (deeper zoom at lower values), 0.78+ = sky
  const skyScale = zoomLevel.interpolate({ inputRange: [0.18, 0.55, 1], outputRange: [0.18, 0.55, 1] });
  const skyOpacity = zoomLevel.interpolate({ inputRange: [0.18, 0.55, 0.78], outputRange: [0, 0, 1] });
  const globeOpacity = zoomLevel.interpolate({ inputRange: [0.18, 0.55, 0.78], outputRange: [1, 1, 0] });
  const spaceBgOpacity = zoomLevel.interpolate({ inputRange: [0.18, 0.55, 0.8], outputRange: [1, 1, 0] });
  const globeScale = zoomLevel.interpolate({ inputRange: [0.18, 0.35, 0.55], outputRange: [1.7, 1.0, 1.35] });

  // Content area height for globe centering (full screen minus tab bar)
  const contentHeight = H - TAB_BAR_HEIGHT;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.sky }}>
    <View style={{ flex: 1 }}>

      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Scene — full area (behind header), position absolute */}
        {!loading && rooms.length > 0 && (
          <View
            onLayout={(e) => { skyHeightRef.current = e.nativeEvent.layout.height; }}
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
            }}
            {...sceneZoomResponder.panHandlers}
          >
            <Animated.View
              pointerEvents="none"
              style={{
                ...StyleSheet.absoluteFillObject,
                backgroundColor: "#0a0f1e",
                opacity: spaceBgOpacity,
              }}
            />
            <Animated.View
              pointerEvents="box-none"
              style={{
                ...StyleSheet.absoluteFillObject,
                transform: [{ scale: skyScale }],
                opacity: skyOpacity,
              }}
            >
              {/* Sunset glow — reduced extent and intensity to match original */}
              <Animated.View pointerEvents="none" style={{
                position: "absolute", top: 0, alignSelf: "center",
                width: W * 1.6, height: H * 0.42,
                borderBottomLeftRadius: W * 0.8, borderBottomRightRadius: W * 0.8,
                backgroundColor: "#F5A623", opacity: Animated.multiply(glowAnim, 0.14),
              }} />
              <Animated.View pointerEvents="none" style={{
                position: "absolute", top: 0, alignSelf: "center",
                width: W * 1.15, height: H * 0.32,
                borderBottomLeftRadius: W * 0.6, borderBottomRightRadius: W * 0.6,
                backgroundColor: "#E8642A", opacity: Animated.multiply(glowAnim, 0.10),
              }} />
              <Animated.View pointerEvents="none" style={{
                position: "absolute", top: 0, alignSelf: "center",
                width: W * 0.85, height: H * 0.22,
                borderBottomLeftRadius: W * 0.45, borderBottomRightRadius: W * 0.45,
                backgroundColor: "#FFF59D", opacity: Animated.multiply(glowAnim, 0.16),
              }} />
              {/* Sun — back to original position at top */}
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
              {DECORATIVE.map((d, i) => (
                <DecorativeCloud key={i} x={d.x} y={d.y} width={d.width} opacity={d.opacity}
                  variant={d.variant} driftY={d.driftY} duration={d.duration} />
              ))}
              {rooms.slice(0, 8).map((room) => {
                const anims = cloudAnimsRef.current[room.id];
                const cw = cloudW;
                if (!anims) return null;
                const pr = getOrCreateCloudPanResponder(room, anims, cw);
                return (
                  <Animated.View
                    key={room.id}
                    style={{
                      position: "absolute", left: 0, top: 0,
                      transform: [{ translateX: anims.animX }, { translateY: anims.animY }],
                    }}
                    {...pr.panHandlers}
                  >
                    <View style={{
                      width: cw, height: cw * (185 / 240),
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: liftedRoomId === room.id ? 8 : 2 },
                      shadowOpacity: liftedRoomId === room.id ? 0.18 : 0.06,
                      shadowRadius: liftedRoomId === room.id ? 16 : 4,
                      elevation: liftedRoomId === room.id ? 12 : 2,
                      zIndex: liftedRoomId === room.id ? 20 : 1,
                    }}>
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
            </Animated.View>
            <Animated.View
              pointerEvents={viewMode === "globe" ? "box-none" : "none"}
              style={{
                ...StyleSheet.absoluteFillObject,
                opacity: globeOpacity,
                transform: [{ scale: globeScale }],
              }}
            >
              {viewMode === "globe" ? (
                <GlobeView
                  rooms={rooms}
                  nicknames={nicknames}
                  unreadRooms={unreadRooms}
                  onClose={goToSkyWithMode}
                  onEnterRoom={(room) => {
                    currentRoomCodeRef.current = room.code;
                    setUnreadRooms((prev) => {
                      const next = new Set(prev);
                      next.delete(room.code);
                      return next;
                    });
                    getItem(UNREAD_PHOTOS_KEY).then((raw) => {
                      const map: Record<string, boolean> = raw ? JSON.parse(raw) : {};
                      map[room.code] = false;
                      setItem(UNREAD_PHOTOS_KEY, JSON.stringify(map));
                    });
                    const unread = unreadRooms.has(room.code);
                    setTimeout(() => router.push(`/room/${room.code}${unread ? "?unread=true" : ""}`), 420);
                  }}
                  zoomLevel={zoomLevel}
                  zoomValueRef={zoomValueRef}
                  contentHeight={contentHeight}
                />
              ) : null}
            </Animated.View>
          </View>
        )}

        {/* Select-mode bar (when selecting clouds to leave) */}
        {selectModeForLeave && viewMode === "sky" && (
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 12,
              paddingHorizontal: 20,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              zIndex: 100,
            }}
          >
            <TouchableOpacity
              onPress={exitSelectMode}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 20,
                backgroundColor: colors.mist,
                borderRadius: 14,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.charcoal }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (selectedRoomIds.size === 0) return;
                Alert.alert(
                  `Leave ${selectedRoomIds.size} room${selectedRoomIds.size === 1 ? "" : "s"}?`,
                  "You can rejoin anytime with the room code.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Leave", style: "destructive", onPress: () => handleLeaveMultipleRooms(selectedRoomIds) },
                  ]
                );
              }}
              disabled={selectedRoomIds.size === 0 || leavingRoom}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 24,
                backgroundColor: selectedRoomIds.size > 0 ? colors.magenta : colors.ash + "66",
                borderRadius: 14,
              }}
            >
              {leavingRoom ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={{ fontSize: 16, fontWeight: "700", color: "white" }}>
                  Leave {selectedRoomIds.size} room{selectedRoomIds.size === 1 ? "" : "s"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Header — on top with zIndex; box-none so touches pass through to clouds below */}
        <View
          pointerEvents="box-none"
          style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: 8,
          flexDirection: "row",
          alignItems: "center",
          zIndex: 100,
          backgroundColor: "transparent",
        }}>
          <View style={{ flex: 1, alignItems: "flex-start" }}>
            {rooms.length > 0 && (
              <TouchableOpacity
                onPress={() => (viewMode === "sky" ? goToGlobeWithMode() : goToSkyWithMode())}
                activeOpacity={0.85}
                style={{
                  width: 42, height: 42, borderRadius: 21,
                  backgroundColor: viewMode === "globe" ? colors.ember : colors.mist,
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <Ionicons name="globe-outline" size={22} color={viewMode === "globe" ? "white" : colors.charcoal} />
              </TouchableOpacity>
            )}
          </View>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }} pointerEvents="none">
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              style={{ fontSize: 28, fontWeight: "800", color: colors.ember, letterSpacing: -0.5, maxWidth: 180, textAlign: "center" }}
            >
              Your Sky
            </Text>
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

        {/* Content — loading / empty (scene is absolute when rooms > 0) */}
        {loading && (
          <View style={{ flex: 1, justifyContent: "center", paddingTop: 120 }}>
            <ActivityIndicator color={colors.ember} size="large" />
          </View>
        )}
        {!loading && rooms.length === 0 && (
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
        )}
      </SafeAreaView>

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
              onPress={() => optionsRoom && enterSelectModeToLeave(optionsRoom)}
              style={{ flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.mist }}
            >
              <Text style={{ fontSize: 16, color: colors.charcoal, fontWeight: "600", flex: 1 }}>Select multiple to leave</Text>
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
function cloudLonOffset(id: string): number {
  return ((id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 37) - 18) * 0.02;
}

type SharedNum = { value: number };

function GlobeCloudItem({
  room,
  baseLon,
  baseLat,
  lonOffset,
  rotLon,
  rotLat,
  cloudOrbitLon,
  cx,
  cy,
  nicknames,
  unreadRooms,
  onPress,
}: {
  room: Room;
  baseLon: number;
  baseLat: number;
  lonOffset: number;
  rotLon: SharedNum;
  rotLat: SharedNum;
  cloudOrbitLon: SharedNum;
  cx: number;
  cy: number;
  nicknames: Record<string, string>;
  unreadRooms: Set<string>;
  onPress: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    "worklet";
    const adjLon = baseLon + rotLon.value + lonOffset + cloudOrbitLon.value;
    const adjLat = Math.max(-0.6, Math.min(0.6, baseLat + rotLat.value));
    const x3 = Math.cos(adjLat) * Math.sin(adjLon);
    const y3 = Math.sin(adjLat);
    const z3 = Math.cos(adjLat) * Math.cos(adjLon);
    const screenX = cx + x3 * GLOBE_R;
    const screenY = cy - y3 * GLOBE_R * 0.6;
    const cw = 72 + z3 * 18;
    const opacity = z3 > 0 ? 1 : 0;
    const zIdx = Math.round(z3 * 10);
    return {
      position: "absolute" as const,
      left: screenX - cw / 2,
      top: screenY - cw * 0.4,
      width: cw,
      opacity,
      zIndex: zIdx,
    };
  });

  return (
    <AnimatedReanimated.View style={animatedStyle}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        style={{ flex: 1, minWidth: 1, minHeight: 1 }}
      >
        <SkyCloud
          name={nicknames[room.code] ?? room.code}
          width={72}
          unread={unreadRooms.has(room.code)}
          variant={roomVariant(room.code)}
        />
      </TouchableOpacity>
    </AnimatedReanimated.View>
  );
}

function GlobeView({
  rooms,
  nicknames,
  unreadRooms,
  onClose,
  onEnterRoom,
  zoomLevel,
  zoomValueRef,
  contentHeight,
}: {
  rooms: Room[];
  nicknames: Record<string, string>;
  unreadRooms: Set<string>;
  onClose: () => void;
  onEnterRoom: (room: Room) => void;
  zoomLevel: Animated.Value;
  zoomValueRef: React.MutableRefObject<number>;
  contentHeight?: number;
}) {
  const rotLon = useSharedValue(0);
  const rotLat = useSharedValue(0);
  const cloudOrbitLon = useSharedValue(0);
  const startLon = useRef(0);
  const startLat = useRef(0);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  // 1-finger drag to rotate; only on background layer so cloud taps always reach clouds
  const globePan = useRef<ReturnType<typeof PanResponder.create>>(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (ev, gs) => {
        const dist = Math.sqrt(gs.dx * gs.dx + gs.dy * gs.dy);
        return ev.nativeEvent.touches.length === 1 && dist > 8;
      },
      onPanResponderTerminationRequest: () => true,
      onPanResponderGrant: () => {
        startLon.current = rotLon.value;
        startLat.current = rotLat.value;
      },
      onPanResponderMove: (ev, gs) => {
        if (ev.nativeEvent.touches.length === 1) {
          rotLon.value = startLon.current + gs.dx * 0.012;
          rotLat.value = clamp(startLat.current - gs.dy * 0.012, -0.6, 0.6);
        }
      },
      onPanResponderRelease: (_ev, gs) => {
        const vx = (gs as { vx?: number }).vx ?? 0;
        const vy = (gs as { vy?: number }).vy ?? 0;
        rotLon.value = withDecay({
          velocity: vx * 0.01,
          deceleration: 0.997,
        });
        rotLat.value = withDecay({
          velocity: -vy * 0.01,
          deceleration: 0.997,
          clamp: [-0.6, 0.6],
        });
      },
    })
  );

  const cx = W / 2;
  const cy = (contentHeight ?? H) / 2;

  const displayRooms = rooms.slice(0, 8);

  const orbitAngle0 = useSharedValue(0);
  const orbitAngle1 = useSharedValue(0);
  const orbitAngle2 = useSharedValue(0);
  const orbitAngle3 = useSharedValue(0);
  const orbitAngles = [orbitAngle0, orbitAngle1, orbitAngle2, orbitAngle3];
  const orbitDurations = [55000, 72000, 95000, 118000];

  useEffect(() => {
    orbitAngles.forEach((angle, tier) => {
      angle.value = withRepeat(
        withTiming(2 * Math.PI, { duration: orbitDurations[tier] }),
        -1,
        false
      );
    });
    cloudOrbitLon.value = withRepeat(
      withTiming(2 * Math.PI, { duration: 75000 }),
      -1,
      false
    );
  }, []);

  const orbitStyle0 = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbitAngle0.value * (180 / Math.PI)}deg` }],
  }));
  const orbitStyle1 = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbitAngle1.value * (180 / Math.PI)}deg` }],
  }));
  const orbitStyle2 = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbitAngle2.value * (180 / Math.PI)}deg` }],
  }));
  const orbitStyle3 = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbitAngle3.value * (180 / Math.PI)}deg` }],
  }));
  const orbitStyles = [orbitStyle0, orbitStyle1, orbitStyle2, orbitStyle3];

  const starsByTier = useMemo(() => {
    const tiers: { tier: number; stars: (typeof GLOBE_STARS[0] & { i: number })[] }[] = Array.from(
      { length: 4 },
      (_, t) => ({ tier: t, stars: [] })
    );
    GLOBE_STARS.forEach((s, i) => {
      tiers[i % 4].stars.push({ ...s, i });
    });
    return tiers;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#0a0f1e" }}>
      {/* Background: stars (grouped by orbit speed) + globe with pan handlers */}
      <View style={StyleSheet.absoluteFill} {...globePan.current.panHandlers}>
        {starsByTier.map(({ tier, stars }) => (
          <AnimatedReanimated.View
            key={tier}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, orbitStyles[tier]]}
          >
            {stars.map((s) => (
              <View
                key={s.i}
                pointerEvents="none"
                style={{
                  position: "absolute" as const,
                  left: s.x,
                  top: s.y,
                  width: s.r * 2,
                  height: s.r * 2,
                  borderRadius: s.r,
                  backgroundColor: "white",
                  opacity: s.o,
                }}
              />
            ))}
          </AnimatedReanimated.View>
        ))}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: cx - GLOBE_R,
            top: cy - GLOBE_R,
            width: GLOBE_R * 2,
            height: GLOBE_R * 2,
            borderRadius: GLOBE_R,
            backgroundColor: "#1a3a5c",
            shadowColor: "#4A90D9",
            shadowOffset: { width: 0, height: 0 },
            shadowRadius: 40,
            shadowOpacity: 0.8,
            elevation: 20,
            zIndex: 0,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              position: "absolute",
              width: GLOBE_R * 0.6,
              height: GLOBE_R * 0.6,
              borderRadius: GLOBE_R * 0.3,
              backgroundColor: "#2a5f8f",
              opacity: 0.6,
              top: GLOBE_R * 0.2,
              left: GLOBE_R * 0.2,
            }}
          />
        </View>
      </View>

      {/* Foreground: clouds + hint — pan handlers so dragging on clouds also rotates globe */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none" {...globePan.current.panHandlers}>
        {displayRooms.map((room) => (
          <GlobeCloudItem
            key={room.id}
            room={room}
            baseLon={roomGlobePos(room.code).lon}
            baseLat={roomGlobePos(room.code).lat}
            lonOffset={cloudLonOffset(room.id)}
            rotLon={rotLon}
            rotLat={rotLat}
            cloudOrbitLon={cloudOrbitLon}
            cx={cx}
            cy={cy}
            nicknames={nicknames}
            unreadRooms={unreadRooms}
            onPress={() => {
              onClose();
              onEnterRoom(room);
            }}
          />
        ))}
        <TouchableOpacity
          onPress={onClose}
          style={{
            position: "absolute",
            bottom: 48,
            left: 0,
            right: 0,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", opacity: 0.4, fontSize: 12 }}>
            pinch to return to your sky
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
