import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
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
  InteractionManager,
  PanResponder,
  StyleSheet,
} from "react-native";
import AnimatedReanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withDecay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
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
import { leaveRoom, createRoom, joinRoom } from "../../utils/rooms";
import { fetchMyRoomsCached, invalidateRoomCache, prefetchRoom } from "../../utils/roomCache";
import { getAllNicknames, setRoomNickname } from "../../utils/nicknames";
import { fetchLatestMessageTimes } from "../../utils/messages";
import { getAllLastSeen } from "../../utils/lastSeen";
import { colors } from "../../utils/theme";
import { SkyCloud, DecorativeCloud } from "../../components/SkyCloud";
import type { Room } from "../../utils/supabase";
import { SunGlow, useSunGlowAnimation } from "../../components/SunGlow";
import { CONTINENTS } from "../../continents";
import { roomVariant, roomGlobePos } from "../../utils/roomVisuals";

const AnimatedPath = AnimatedReanimated.createAnimatedComponent(Path);
const MAX_VISIBLE_ROOMS = 8;

// Decorative background clouds — positions within fixed W x SKY_HEIGHT
const DECORATIVE = [
  { x: W * 0.75, y: SKY_HEIGHT * 0.08, width: W * 0.28, opacity: 0.15, variant: 1, driftY:  7, duration: 55000 },
  { x: W * 0.02, y: SKY_HEIGHT * 0.35, width: W * 0.22, opacity: 0.12, variant: 5, driftY: 10, duration: 70000 },
  { x: W * 0.55, y: SKY_HEIGHT * 0.52, width: W * 0.25, opacity: 0.18, variant: 4, driftY:  6, duration: 45000 },
  { x: W * 0.25, y: SKY_HEIGHT * 0.70, width: W * 0.32, opacity: 0.13, variant: 2, driftY:  9, duration: 62000 },
];


const GLOBE_R = Math.min(W, H * 0.65) * 0.40;
const GLOBE_STARS = Array.from({ length: 44 }, (_, i) => ({
  x: (i * 53.7 + 11) % W,
  y: (i * 97.3 + 19) % (H * 0.88),
  r: 0.5 + (i * 7 % 3) * 0.5,
  o: 0.3 + (i * 13 % 10) * 0.04,
}));

// Simplified continent polygon data — [lon_rad, lat_rad] pairs
// Coordinates converted from degrees (× Math.PI/180) — geographically recognizable outlines
// Web platform intentionally unsupported for animated SVG path d strings (Reanimated 4.x worklet limitation)


// Tab bar height approx (from _layout)
const TAB_BAR_HEIGHT = 88;
// Cloud zone starts below header; uses full content area down to tab bar
const SKY_TOP_OFFSET = 100;
const SKY_CONTENT_HEIGHT = H - TAB_BAR_HEIGHT;
const UNREAD_PHOTOS_KEY = "unread_photos_v1";
const CLOUD_POS_KEY = "cloud_pos_v1";
/** Base diameter (px) before scale; `scale: 40` covers the screen from center. */
const TAP_BLOOM_BASE = 48;

async function loadSavedPositions(): Promise<Record<string, { x: number; y: number }> | null> {
  const raw = await getItem(CLOUD_POS_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as Record<string, { x: number; y: number }>;
}

async function saveAllCloudPositions(map: Record<string, { x: number; y: number }>): Promise<void> {
  await setItem(CLOUD_POS_KEY, JSON.stringify(map));
}

async function saveCloudPosition(code: string, x: number, y: number): Promise<void> {
  const raw = await getItem(CLOUD_POS_KEY);
  const map: Record<string, { x: number; y: number }> = raw ? JSON.parse(raw) : {};
  map[code] = { x, y };
  await setItem(CLOUD_POS_KEY, JSON.stringify(map));
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ChatsScreen() {
  const insets = useSafeAreaInsets();
  const { glowAnim, pulseScale } = useSunGlowAnimation();

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

  // Options sheet (shown on long-hold-in-place) — state lives in OptionsSheet
  const optionsSheetRef = useRef<OptionsSheetHandle>(null);
  const [leavingRoom, setLeavingRoom] = useState(false);

  // Multi-select mode for leaving multiple rooms at once
  const [selectModeForLeave, setSelectModeForLeave] = useState(false);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());

  // Per-cloud refs for measureInWindow (tap-to-zoom)
  const cloudRefsRef = useRef<Record<string, React.RefObject<View | null>>>({});

  const isTapZoomingRef = useRef(false);
  const [zoomingRoomId, setZoomingRoomId] = useState<string | null>(null);
  /** Window coordinates for tap bloom center (measureInWindow). */
  const [tapBloomCenter, setTapBloomCenter] = useState<{ cx: number; cy: number } | null>(null);
  const tapBloomScale = useRef(new Animated.Value(0)).current;
  const tapBloomOpacity = useRef(new Animated.Value(0)).current;

  const canvasContainerRef = useRef<View>(null);

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
          Animated.timing(zoomLevel, { toValue: 1, duration: 250, useNativeDriver: false }).start();
        } else if (z < 0.6) {
          setViewModeRef.current("globe");
          const snapZ = Math.max(0.18, Math.min(0.55, z));
          zoomValueRef.current = snapZ;
          Animated.timing(zoomLevel, { toValue: snapZ, duration: 250, useNativeDriver: false }).start();
        } else {
          setViewModeRef.current("globe");
          zoomValueRef.current = 0.55;
          Animated.timing(zoomLevel, { toValue: 0.55, duration: 250, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  // Globe entry point stays at 0.35 — user can pinch further to 0.18 floor
  const goToGlobe = useCallback(() => {
    zoomValueRef.current = 0.35;
    Animated.timing(zoomLevel, { toValue: 0.35, duration: 400, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
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
  const cloudBaseValuesRef = useRef<Record<string, { x: number; y: number }>>({});
  const cloudBaseListenerIdsRef = useRef<Record<string, { x: string; y: string }>>({});
  const [, setAnimsReady] = useState(0); // force re-render after effect populates anims
  // Shrink-loop result — effective cloud width after overlap resolution (initialized to full base; updated by layout effect)
  const effectiveCwRef = useRef<number>(W * 0.54);
  // Saved positions loaded from SecureStore on mount (all-or-nothing per D-04)
  const savedPositionsRef = useRef<Record<string, { x: number; y: number }> | null>(null);
  // Gate: layout effect must not run until saved positions have been attempted to load
  const [positionsLoaded, setPositionsLoaded] = useState(false);
  // Track previous room IDs to detect new rooms added mid-session
  const prevRoomIdsRef = useRef<Set<string>>(new Set());
  // Per-cloud scale animated values for spring scale-in animation on new clouds
  const cloudScalesRef = useRef<Record<string, Animated.Value>>({});
  const prevRoomIdStringRef = useRef("");
  const lastFitRoomIdsRef = useRef("");
  const hasLoadedRef = useRef(false);

  // Stop all loops on unmount
  useEffect(() => {
    return () => { Object.values(cloudLoopsRef.current).forEach((l) => l.stop()); };
  }, []);

  // Load saved cloud positions from SecureStore on mount — set positionsLoaded when done so layout effect can proceed
  useEffect(() => {
    loadSavedPositions().then((pos) => {
      savedPositionsRef.current = pos;
      setPositionsLoaded(true);
    });
  }, []);

  // ─── Data loading ────────────────────────────────────────────────────────────
  async function load() {
    try {
      const [roomList, nameMap, lastSeenMap] = await Promise.all([
        fetchMyRoomsCached(),
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
      hasLoadedRef.current = true;
    }
  }

  useFocusEffect(useCallback(() => { if (!hasLoadedRef.current) setLoading(true); load(); }, []));

  // When Chats screen is focused, clear "currently viewing room" (user came back from room)
  useFocusEffect(useCallback(() => { currentRoomCodeRef.current = null; }, []));

  const roomIdString = rooms.map((room) => room.id).filter(Boolean).join(",");

  // Supabase realtime: new photo INSERT → add room to unread if not currently viewing
  useEffect(() => {
    getDeviceId().then((id) => { myDeviceIdRef.current = id; });
    if (!roomIdString) return;
    const roomFilter = `room_id=in.(${roomIdString})`;

    const channel = supabase
      .channel("messages-insert")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: roomFilter },
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
          prefetchRoom(room.code);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomIdString]);

  // Cloud width — always start at full base size; shrink loop reduces only if actual collisions occur
  const cloudW = useMemo(() => W * 0.54, []);

  // Reposition clouds without overlap (called when cloud size changes)
  const fitCloudsToView = useCallback(() => {
    const displayRooms = rooms.slice(0, MAX_VISIBLE_ROOMS);
    if (displayRooms.length === 0) return;
    const cw = effectiveCwRef.current;
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
      let x = cloudBaseValuesRef.current[room.id]?.x ?? 0;
      let y = cloudBaseValuesRef.current[room.id]?.y ?? 0;
      for (let pass = 0; pass < 2; pass++) {
        for (const other of displayRooms) {
          if (other.id === room.id) continue;
          const oa = cloudAnimsRef.current[other.id];
          if (!oa) continue;
          const ox = cloudBaseValuesRef.current[other.id]?.x ?? 0;
          const oy = cloudBaseValuesRef.current[other.id]?.y ?? 0;
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

  // ─── Cloud bounce animations — start on mount and when rooms change ─────────
  useEffect(() => {
    if (!positionsLoaded) return;

    const displayRooms = rooms.slice(0, MAX_VISIBLE_ROOMS);
    const newIds = displayRooms.map(r => r.id).join(",");
    if (newIds === prevRoomIdStringRef.current) return;
    prevRoomIdStringRef.current = newIds;

    const handle = InteractionManager.runAfterInteractions(() => {

    const currentRoomIds = new Set(displayRooms.map((r) => r.id));
    const newRoomIds = new Set<string>();
    currentRoomIds.forEach((id) => { if (!prevRoomIdsRef.current.has(id)) newRoomIds.add(id); });
    prevRoomIdsRef.current = currentRoomIds;

    effectiveCwRef.current = cloudW;

    // Stop all running loops and clear anims when rooms or count changes
    Object.values(cloudLoopsRef.current).forEach((l) => l.stop());
    Object.entries(cloudBaseListenerIdsRef.current).forEach(([roomId, ids]) => {
      const anims = cloudAnimsRef.current[roomId];
      if (anims) {
        anims.baseX.removeListener(ids.x);
        anims.baseY.removeListener(ids.y);
      }
    });
    cloudBaseListenerIdsRef.current = {};
    cloudLoopsRef.current = {};
    cloudAnimsRef.current = {};
    cloudPanRespondersRef.current = {};
    cloudBaseValuesRef.current = {};

    // ── Position resolution: saved positions or fresh layout ─────────────────
    const PAD = 14;

    // Try saved positions (all-or-nothing per D-04)
    const savedPos = savedPositionsRef.current;
    const allSaved = savedPos !== null && displayRooms.every((r) => savedPos[r.code] !== undefined);

    let finalPositions: { x: number; y: number }[] | null = null;

    if (allSaved && savedPos) {
      // Verify no collisions in saved layout at current cloudW
      const cw = cloudW;
      const ch = cw * (185 / 240);
      const cloudH = ch * 0.62;
      const savedPlaced = displayRooms.map((r) => savedPos[r.code]);
      let savedHasCollision = false;
      for (let i = 0; i < savedPlaced.length && !savedHasCollision; i++) {
        for (let j = i + 1; j < savedPlaced.length; j++) {
          const dx = Math.abs((savedPlaced[i].x + cw / 2) - (savedPlaced[j].x + cw / 2));
          const dy = Math.abs((savedPlaced[i].y + cloudH / 2) - (savedPlaced[j].y + cloudH / 2));
          if (dx < cw + PAD && dy < cloudH + PAD) { savedHasCollision = true; break; }
        }
      }
      if (!savedHasCollision) {
        finalPositions = savedPlaced;
        effectiveCwRef.current = cw;
      } else {
        // Discard saved positions — collision detected
        savedPositionsRef.current = null;
      }
    }

    // Fresh layout with shrink-until-fits loop (D-01, D-02, D-03)
    if (!finalPositions) {
      let cw = cloudW;
      while (true) {
        const ch = cw * (185 / 240);
        const cloudH = ch * 0.62;
        const minX = 0;
        const maxX = Math.max(0, W - cw);
        const minY = SKY_TOP_OFFSET;
        const maxY = Math.max(minY, SKY_CONTENT_HEIGHT - ch);

        // Compute cols from how many clouds actually fit side-by-side at this width.
        // cellW = cw + PAD so each cell is exactly one cloud wide with a gap.
        // canFitCols: how many such cells fit across W (treating last cell as needing no right PAD).
        const canFitCols = Math.max(1, Math.floor((W + PAD) / (cw + PAD)));
        const cols = Math.min(canFitCols, Math.ceil(Math.sqrt(displayRooms.length)));
        const cellW = cw + PAD;
        const cellH = ch + PAD;

        const attempt: { x: number; y: number }[] = [];

        displayRooms.forEach((_, n) => {
          const col = n % cols;
          const row = Math.floor(n / cols);
          const x = Math.max(minX, Math.min(maxX, col * cellW));
          const y = Math.max(minY, Math.min(maxY, minY + row * cellH));
          attempt.push({ x, y });
        });

        // Verify final layout is collision-free
        let hasCollision = false;
        for (let i = 0; i < attempt.length && !hasCollision; i++) {
          for (let j = i + 1; j < attempt.length; j++) {
            const dx = Math.abs((attempt[i].x + cw / 2) - (attempt[j].x + cw / 2));
            const dy = Math.abs((attempt[i].y + cloudH / 2) - (attempt[j].y + cloudH / 2));
            if (dx < cw + PAD && dy < cloudH + PAD) { hasCollision = true; break; }
          }
        }

        if (!hasCollision || cw <= W * 0.40) {
          effectiveCwRef.current = cw;
          finalPositions = attempt;
          break;
        }
        cw = Math.max(W * 0.40, cw * 0.90);
      }
    }

    // Save resolved positions to SecureStore and update ref for future tab-switch re-runs
    const posMap: Record<string, { x: number; y: number }> = {};
    displayRooms.forEach((room, i) => {
      if (finalPositions) posMap[room.code] = finalPositions[i];
    });
    savedPositionsRef.current = posMap;
    saveAllCloudPositions(posMap);

    const cw = effectiveCwRef.current;
    const ch = cw * (185 / 240);
    const minX = 0;
    const maxX = Math.max(0, W - cw);
    const minY = SKY_TOP_OFFSET;
    const maxY = Math.max(minY, SKY_CONTENT_HEIGHT - ch);

    displayRooms.forEach((room, i) => {
      const startX = finalPositions ? finalPositions[i].x : 0;
      const startY = finalPositions ? finalPositions[i].y : 0;

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
      cloudBaseValuesRef.current[room.id] = { x: startX, y: startY };
      const xListenerId = baseX.addListener(({ value }) => {
        const curr = cloudBaseValuesRef.current[room.id] ?? { x: value, y: startY };
        cloudBaseValuesRef.current[room.id] = { x: value, y: curr.y };
      });
      const yListenerId = baseY.addListener(({ value }) => {
        const curr = cloudBaseValuesRef.current[room.id] ?? { x: startX, y: value };
        cloudBaseValuesRef.current[room.id] = { x: curr.x, y: value };
      });
      cloudBaseListenerIdsRef.current[room.id] = { x: xListenerId, y: yListenerId };

      // Spring scale-in for new rooms (D-05); existing rooms go to scale 1 immediately
      if (newRoomIds.has(room.id)) {
        cloudScalesRef.current[room.id] = new Animated.Value(0);
        Animated.spring(cloudScalesRef.current[room.id], {
          toValue: 1,
          tension: 120,
          friction: 8,
          useNativeDriver: false,
        }).start();
      } else if (!cloudScalesRef.current[room.id]) {
        cloudScalesRef.current[room.id] = new Animated.Value(1);
      } else {
        cloudScalesRef.current[room.id].setValue(1);
      }

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
    lastFitRoomIdsRef.current = newIds;

    }); // end InteractionManager.runAfterInteractions

    return () => handle.cancel();
  }, [rooms, cloudW, fitCloudsToView, positionsLoaded]);

  // fitCloudsToView on focus — skip when rooms haven't changed since last fit
  useFocusEffect(
    useCallback(() => {
      const currentIds = rooms.slice(0, MAX_VISIBLE_ROOMS).map(r => r.id).join(",");
      if (currentIds === lastFitRoomIdsRef.current) return;
      const t = setTimeout(() => {
        fitCloudsToView();
        lastFitRoomIdsRef.current = currentIds;
      }, 300);
      return () => clearTimeout(t);
    }, [fitCloudsToView, rooms])
  );

  function markRoomReadAfterNav(roomCode: string) {
    InteractionManager.runAfterInteractions(() => {
      setUnreadRooms((prev) => {
        const next = new Set(prev);
        next.delete(roomCode);
        return next;
      });
      getItem(UNREAD_PHOTOS_KEY).then((raw) => {
        const map: Record<string, boolean> = raw ? JSON.parse(raw) : {};
        map[roomCode] = false;
        setItem(UNREAD_PHOTOS_KEY, JSON.stringify(map));
      });
    });
  }

  // Warm white bloom from cloud center → full screen (native driver), then navigate.
  function zoomIntoCloud(room: Room, cloudCX: number, cloudCY: number, unread: boolean) {
    if (isTapZoomingRef.current) return;
    isTapZoomingRef.current = true;
    setTapBloomCenter({ cx: cloudCX, cy: cloudCY });
    tapBloomScale.setValue(0);
    tapBloomOpacity.setValue(1);

    requestAnimationFrame(() => {
      Animated.timing(tapBloomScale, {
        toValue: 40,
        duration: 700,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          console.log("[cloud tap] navigating", Date.now());
          router.push({
            pathname: "/room/[code]",
            params: unread
              ? { code: room.code, unread: "true" }
              : { code: room.code },
          });
          if (unread) markRoomReadAfterNav(room.code);
        }
      });
    });
  }

  useFocusEffect(
    useCallback(() => {
      // Reset when this screen becomes visible again (e.g. back from room), not on blur.
      isTapZoomingRef.current = false;
      tapBloomScale.setValue(0);
      tapBloomOpacity.setValue(0);
      setTapBloomCenter(null);
      setZoomingRoomId(null);
    }, [tapBloomScale, tapBloomOpacity])
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
      optionsSheetRef.current?.show(room);
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
        startX = cloudBaseValuesRef.current[room.id]?.x ?? 0;
        startY = cloudBaseValuesRef.current[room.id]?.y ?? 0;
        cloudLoopsRef.current[room.id]?.stop();

        pressTimer = setTimeout(() => {
          if (!dragging) {
            longFired = true;
            onOptionsRef.current(room);
          }
        }, 250);
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
          const currX = cloudBaseValuesRef.current[room.id]?.x ?? startX;
          const currY = cloudBaseValuesRef.current[room.id]?.y ?? startY;
          const clampedX = Math.max(minX, Math.min(maxX, currX));
          const clampedY = Math.max(minY, Math.min(maxY, currY));
          cloudLoopsRef.current[room.id]?.restartAt(clampedX, clampedY);
          // Update in-memory ref immediately so the next tab-switch re-layout uses the dragged position
          if (!savedPositionsRef.current) savedPositionsRef.current = {};
          savedPositionsRef.current[room.code] = { x: clampedX, y: clampedY };
          saveCloudPosition(room.code, clampedX, clampedY);
        } else if (!longFired) {
          onTapRef.current(room);
        }
      },

      onPanResponderTerminate: () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        dragging = false;
        setLiftedRoomId(null);
        const currX = cloudBaseValuesRef.current[room.id]?.x ?? startX;
        const currY = cloudBaseValuesRef.current[room.id]?.y ?? startY;
        cloudLoopsRef.current[room.id]?.restartAt(
          Math.max(minX, Math.min(maxX, currX)),
          Math.max(minY, Math.min(maxY, currY)),
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
    console.log("[cloud tap] start", Date.now());
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
      const unread = unreadRooms.has(room.code);
      // Hide room name immediately (hideLabel on SkyCloud) before measureInWindow / zoom.
      setZoomingRoomId(room.id);

      // Measure cloud screen position for camera-zoom transition
      const cloudRef = cloudRefsRef.current[room.id];
      if (cloudRef?.current) {
        cloudRef.current.measureInWindow((mx, my, mw, mh) => {
          if (mw === 0 || mh === 0) {
            // Fallback: measureInWindow returned zeros — plain push
            console.log("[cloud tap] navigating", Date.now());
            router.push({
              pathname: "/room/[code]",
              params: unread ? { code: room.code, unread: "true" } : { code: room.code },
            });
            if (unread) markRoomReadAfterNav(room.code);
            return;
          }
          // Zoom toward cloud center
          const cloudCX = mx + mw / 2;
          const cloudCY = my + mh / 2;
          zoomIntoCloud(room, cloudCX, cloudCY, unread);
        });
      } else {
        // No ref — fallback to plain push
        console.log("[cloud tap] navigating", Date.now());
        router.push({
          pathname: "/room/[code]",
          params: unread ? { code: room.code, unread: "true" } : { code: room.code },
        });
        if (unread) markRoomReadAfterNav(room.code);
      }
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
    optionsSheetRef.current?.hide();
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
    optionsSheetRef.current?.hide();
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
  // extrapolate:'clamp' prevents out-of-range recalculations during pinch gesture
  const skyScale = zoomLevel.interpolate({ inputRange: [0.18, 0.55, 1], outputRange: [0.18, 0.55, 1], extrapolate: "clamp" });
  const skyOpacity = zoomLevel.interpolate({ inputRange: [0.18, 0.55, 0.78], outputRange: [0, 0, 1], extrapolate: "clamp" });
  const globeOpacity = zoomLevel.interpolate({ inputRange: [0.18, 0.55, 0.78], outputRange: [1, 1, 0], extrapolate: "clamp" });
  // Full-screen underlay: same spine as globe — space when globe visible, sky when not
  const screenBgColor = zoomLevel.interpolate({
    inputRange: [0.18, 0.55, 0.78],
    outputRange: [colors.spaceBackdrop, colors.spaceBackdrop, colors.sky],
    extrapolate: "clamp",
  });
  const globeScale = zoomLevel.interpolate({ inputRange: [0.18, 0.35, 0.55], outputRange: [1.7, 1.0, 1.35], extrapolate: "clamp" });

  // Content area height for globe centering (full screen minus tab bar)
  const contentHeight = H - TAB_BAR_HEIGHT;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { zIndex: -1, backgroundColor: screenBgColor },
        ]}
      />
    <View style={{ flex: 1 }}>

      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Scene — full area (behind header), position absolute */}
        {!loading && rooms.length > 0 && (
          <View
            ref={canvasContainerRef}
            onLayout={(e) => {
              skyHeightRef.current = e.nativeEvent.layout.height;
            }}
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
            }}
            {...sceneZoomResponder.panHandlers}
          >
            <Animated.View
              pointerEvents="box-none"
              style={{
                ...StyleSheet.absoluteFillObject,
                transform: [{ scale: skyScale }],
                opacity: skyOpacity,
              }}
            >
              <SunGlow
                width={W}
                height={H}
                glowAnim={glowAnim}
                pulseScale={pulseScale}
                rayOuterHeightFactor={0.42}
                rayMidHeightFactor={0.32}
                rayInnerHeightFactor={0.22}
                rayOuterOpacity={0.14}
                rayMidOpacity={0.10}
                rayInnerOpacity={0.16}
                sunOuterSize={310}
                sunMidSize={230}
                sunCoreSize={140}
                sunHighlightSize={26}
                sunMidOffset={40}
                sunCoreOffset={85}
                sunHighlightOffsetX={106}
                sunHighlightOffsetY={100}
              />
              {DECORATIVE.map((d, i) => (
                <DecorativeCloud key={i} x={d.x} y={d.y} width={d.width} opacity={d.opacity}
                  variant={d.variant} driftY={d.driftY} duration={d.duration} />
              ))}
              {rooms.slice(0, MAX_VISIBLE_ROOMS).map((room) => {
                const anims = cloudAnimsRef.current[room.id];
                const cw = effectiveCwRef.current;
                if (!anims) return null;
                const pr = getOrCreateCloudPanResponder(room, anims, cw);
                const cloudScale = cloudScalesRef.current[room.id] ?? new Animated.Value(1);
                // Ensure per-cloud ref exists for measureInWindow on tap (per D-11)
                if (!cloudRefsRef.current[room.id]) {
                  cloudRefsRef.current[room.id] = React.createRef<View>();
                }
                return (
                  <Animated.View
                    key={room.id}
                    style={{
                      position: "absolute", left: 0, top: 0,
                      transform: [{ translateX: anims.animX }, { translateY: anims.animY }],
                    }}
                    {...pr.panHandlers}
                  >
                    <Animated.View style={{ transform: [{ scale: cloudScale }] }}>
                      <View style={{
                        width: cw, height: cw * (185 / 240),
                        shadowColor: colors.pureBlack,
                        shadowOffset: { width: 0, height: liftedRoomId === room.id ? 8 : 2 },
                        shadowOpacity: liftedRoomId === room.id ? 0.18 : 0.06,
                        shadowRadius: liftedRoomId === room.id ? 16 : 4,
                        elevation: liftedRoomId === room.id ? 12 : 2,
                        zIndex: liftedRoomId === room.id ? 20 : 1,
                      }}>
                        <SkyCloud
                          ref={cloudRefsRef.current[room.id]}
                          name={nicknames[room.code] ?? room.code}
                          width={cw}
                          unread={unreadRooms.has(room.code)}
                          lifted={liftedRoomId === room.id}
                          variant={roomVariant(room.code)}
                          hideLabel={zoomingRoomId === room.id}
                        />
                      </View>
                    </Animated.View>
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
                    setTimeout(() => {
                      router.push({
                        pathname: "/room/[code]",
                        params: unread ? { code: room.code, unread: "true" } : { code: room.code },
                      });
                    }, 420);
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

      <OptionsSheet
        ref={optionsSheetRef}
        nicknames={nicknames}
        leavingRoom={leavingRoom}
        onRename={(room) => {
          optionsSheetRef.current?.hide();
          setTimeout(() => {
            setRenameInput(nicknames[room.code] ?? "");
            setRenaming(room);
          }, 300);
        }}
        onShare={(code) => handleShareCode(code)}
        onSelectToLeave={(room) => enterSelectModeToLeave(room)}
        onLeave={(room) => handleLeaveRoom(room)}
      />

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

      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: (tapBloomCenter?.cx ?? 0) - TAP_BLOOM_BASE / 2,
          top: (tapBloomCenter?.cy ?? 0) - TAP_BLOOM_BASE / 2,
          width: TAP_BLOOM_BASE,
          height: TAP_BLOOM_BASE,
          borderRadius: TAP_BLOOM_BASE / 2,
          backgroundColor: "#FFFDF8",
          zIndex: 100000,
          opacity: tapBloomOpacity,
          transform: [{ scale: tapBloomScale }],
        }}
      />
    </View>
  );
}

// ─── Options sheet (extracted to avoid re-rendering ChatsScreen) ─────────────

type OptionsSheetHandle = { show: (room: Room) => void; hide: () => void };

const OptionsSheet = forwardRef<OptionsSheetHandle, {
  nicknames: Record<string, string>;
  leavingRoom: boolean;
  onRename: (room: Room) => void;
  onShare: (code: string) => void;
  onSelectToLeave: (room: Room) => void;
  onLeave: (room: Room) => void;
}>(function OptionsSheet({ nicknames, leavingRoom, onRename, onShare, onSelectToLeave, onLeave }, ref) {
  const [room, setRoom] = useState<Room | null>(null);

  useImperativeHandle(ref, () => ({
    show: (r: Room) => setRoom(r),
    hide: () => setRoom(null),
  }));

  return (
    <Modal
      visible={room !== null}
      transparent
      animationType="none"
      onRequestClose={() => setRoom(null)}
    >
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(61,46,46,0.35)", justifyContent: "flex-end" }}
        activeOpacity={1}
        onPress={() => setRoom(null)}
      >
        <View style={{ backgroundColor: colors.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 48 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: colors.charcoal, marginBottom: 4 }}>
            {room ? (nicknames[room.code] ?? room.code) : ""}
          </Text>
          <Text style={{ fontSize: 12, color: colors.ash, letterSpacing: 2, marginBottom: 24 }}>
            {room?.code}
          </Text>

          <TouchableOpacity
            onPress={() => room && onRename(room)}
            style={{ flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.mist }}
          >
            <Text style={{ fontSize: 16, color: colors.charcoal, fontWeight: "600", flex: 1 }}>Rename</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => room && onShare(room.code)}
            style={{ flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.mist }}
          >
            <Text style={{ fontSize: 16, color: colors.charcoal, fontWeight: "600", flex: 1 }}>Share Room Code</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => room && onSelectToLeave(room)}
            style={{ flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.mist }}
          >
            <Text style={{ fontSize: 16, color: colors.charcoal, fontWeight: "600", flex: 1 }}>Select multiple to leave</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              if (!room) return;
              Alert.alert(
                "Leave Room?",
                "You can rejoin anytime with the room code.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Leave", style: "destructive", onPress: () => onLeave(room) },
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
  );
});

type SharedNum = { value: number };

// ─── Continent art (SVG line art rotating with globe) ─────────────────────────
const ContinentPaths = React.memo(function ContinentPaths({ rotLon, rotLat }: { rotLon: SharedNum; rotLat: SharedNum }) {
  const animatedProps = useAnimatedProps(() => {
    "worklet";
    let d = "";
    for (let c = 0; c < CONTINENTS.length; c++) {
      const pts = CONTINENTS[c];
      // Per-point projection with z-based culling — no lat clamping (that caused straight edges)
      let pathStr = "";
      let movePending = true;
      let hadCull = false;
      for (let i = 0; i < pts.length; i++) {
        const lon = pts[i][0] + rotLon.value;
        const lat = pts[i][1] + rotLat.value;
        const cosLat = Math.cos(lat);
        const x3 = cosLat * Math.sin(lon);
        const y3 = Math.sin(lat);
        const z3 = cosLat * Math.cos(lon);
        if (z3 <= 0) { movePending = true; hadCull = true; continue; } // behind globe — break path
        const sx = Math.round((GLOBE_R + x3 * GLOBE_R) * 10) / 10;
        const sy = Math.round((GLOBE_R - y3 * GLOBE_R) * 10) / 10;
        if (movePending) { pathStr += `M${sx} ${sy}`; movePending = false; }
        else pathStr += `L${sx} ${sy}`;
      }
      if (pathStr) d += pathStr + (hadCull ? "" : "Z");
    }
    return { d: d || "M0 0" };
  });

  return (
    <Svg
      width={GLOBE_R * 2}
      height={GLOBE_R * 2}
      viewBox={`0 0 ${GLOBE_R * 2} ${GLOBE_R * 2}`}
      pointerEvents="none"
      style={{ position: "absolute", left: 0, top: 0 }}
    >
      <AnimatedPath
        animatedProps={animatedProps}
        fill="rgba(30,80,90,0.6)"
        stroke="rgba(180,220,255,0.7)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
});

// ─── Globe view ───────────────────────────────────────────────────────────────
function cloudLonOffset(id: string): number {
  return ((id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 37) - 18) * 0.02;
}

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
    const screenY = cy - y3 * GLOBE_R;
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

  const displayRooms = rooms.slice(0, MAX_VISIBLE_ROOMS);

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
    <View style={{ flex: 1, backgroundColor: colors.spaceBackdrop }}>
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
            backgroundColor: colors.globeOcean,
            shadowColor: colors.globeOceanShadow,
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
              backgroundColor: colors.globeOceanLight,
              opacity: 0.6,
              top: GLOBE_R * 0.2,
              left: GLOBE_R * 0.2,
            }}
          />
          {/* Continent art — rotates with globe, clipped to sphere by overflow:hidden */}
          <ContinentPaths rotLon={rotLon} rotLat={rotLat} />
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
