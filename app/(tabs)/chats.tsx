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
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";

const { width: W, height: H } = Dimensions.get("window");

import * as Haptics from "expo-haptics";
import { fetchMyRooms, leaveRoom, createRoom, joinRoom } from "../../utils/rooms";
import { getAllNicknames, setRoomNickname } from "../../utils/nicknames";
import { fetchLatestMessageTimes } from "../../utils/messages";
import { getAllLastSeen } from "../../utils/lastSeen";
import { getItem, setItem } from "../../utils/storage";
import { colors } from "../../utils/theme";
import { SkyCloud, DecorativeCloud } from "../../components/SkyCloud";
import type { Room } from "../../utils/supabase";

// ─── Cloud layout defaults ────────────────────────────────────────────────────
const BASE_CLOUD_W = W * 0.54;

// Sky canvas spans ~2.2× the screen in each direction — clouds spread across this space
const SKY_W = W * 2.2;
const SKY_H = H * 2.2;

const CLOUD_SLOTS = [
  { left: SKY_W * 0.04,  top: SKY_H * 0.04,  scale: 1.15 },
  { left: SKY_W * 0.48,  top: SKY_H * 0.06,  scale: 0.82 },
  { left: SKY_W * 0.76,  top: SKY_H * 0.14,  scale: 1.00 },
  { left: SKY_W * 0.14,  top: SKY_H * 0.30,  scale: 1.08 },
  { left: SKY_W * 0.56,  top: SKY_H * 0.32,  scale: 0.90 },
  { left: SKY_W * 0.82,  top: SKY_H * 0.45,  scale: 1.00 },
  { left: SKY_W * 0.24,  top: SKY_H * 0.56,  scale: 0.85 },
  { left: SKY_W * 0.62,  top: SKY_H * 0.60,  scale: 1.05 },
];

const DECORATIVE = [
  { x: SKY_W * 0.88, y: SKY_H * 0.08,  width: W * 0.28, opacity: 0.15, variant: 1, driftX: 18, driftY:  7, duration: 11000 },
  { x: SKY_W * 0.02, y: SKY_H * 0.35,  width: W * 0.22, opacity: 0.12, variant: 5, driftX: 14, driftY: 10, duration: 14000 },
  { x: SKY_W * 0.68, y: SKY_H * 0.52,  width: W * 0.25, opacity: 0.18, variant: 4, driftX: 22, driftY:  6, duration:  9000 },
  { x: SKY_W * 0.30, y: SKY_H * 0.70,  width: W * 0.32, opacity: 0.13, variant: 2, driftX: 16, driftY:  9, duration: 12500 },
];

const STORAGE_KEY = "cloud_pos_v1";

// Stable shape variant per room — derived from room code so it never changes
function roomVariant(code: string): number {
  return code.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 8;
}

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

  // Lifted cloud (visual drag state)
  const [liftedRoomId, setLiftedRoomId] = useState<string | null>(null);

  // Zoom-into-cloud transition
  const rootViewRef = useRef<View>(null);
  const cloudRefs = useRef<Record<string, View | null>>({});
  const pendingRoomCode = useRef("");
  const zoomScaleAnim = useRef(new Animated.Value(1)).current;
  const [zoomOrigin, setZoomOrigin] = useState<{
    x: number; y: number; w: number; h: number; cx: number; cy: number;
  } | null>(null);

  // ─── Sky canvas zoom + pan ───────────────────────────────────────────────────
  const canvasZoom      = useRef(new Animated.Value(1)).current;
  const canvasPan       = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const canvasZoomValue = useRef(1); // JS-side mirror of canvasZoom for pinch math
  const canvasCenter    = useRef({ x: W / 2, y: H / 2 }); // updated on layout
  const canvasViewSize  = useRef({ width: W, height: H * 0.75 }); // updated on layout

  // Track zoom value from both spring animations and direct setValue
  useEffect(() => {
    const id = canvasZoom.addListener(({ value }) => { canvasZoomValue.current = value; });
    return () => canvasZoom.removeListener(id);
  }, []);

  // Fit all clouds into view as large as possible
  function fitCloudsToView() {
    const currentRooms = roomsRef.current;
    if (currentRooms.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let found = false;

    currentRooms.slice(0, 8).forEach((room, i) => {
      const anim = cloudAnims.current[room.id];
      if (!anim) return;
      const si = cloudSlotIndex.current[room.id] ?? i;
      const cw = BASE_CLOUD_W * CLOUD_SLOTS[si % CLOUD_SLOTS.length].scale;
      const ch = cw * (185 / 240);
      const x  = (anim.x as any)._value;
      const y  = (anim.y as any)._value;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + cw);
      maxY = Math.max(maxY, y + ch);
      found = true;
    });

    if (!found) return;

    const PAD  = 52;
    const bboxW  = maxX - minX;
    const bboxH  = maxY - minY;
    const bboxCX = (minX + maxX) / 2;
    const bboxCY = (minY + maxY) / 2;

    const { width: vw, height: vh } = canvasViewSize.current;
    const s = Math.max(0.15, Math.min(2.0, Math.min(
      (vw - PAD * 2) / bboxW,
      (vh - PAD * 2) / bboxH,
    )));

    // With transform [translateX(tx), translateY(ty), scale(s)] where scale is around view center,
    // a canvas-local point (cx,cy) appears at: tx + (cx - vw/2)*s + vw/2
    // So to center bboxCX at vw/2: tx = (vw/2 - bboxCX) * s
    const tx = (vw / 2 - bboxCX) * s;
    const ty = (vh / 2 - bboxCY) * s;

    canvasPan.flattenOffset();
    Animated.parallel([
      Animated.spring(canvasZoom, { toValue: s, useNativeDriver: false, tension: 50, friction: 12 }),
      Animated.spring(canvasPan,  { toValue: { x: tx, y: ty }, useNativeDriver: false, tension: 50, friction: 12 }),
    ]).start();
  }

  // Fit-to-content after each data load (fires on every screen focus via loadCount)
  const [loadCount, setLoadCount] = useState(0);
  useEffect(() => {
    if (loadCount > 0) fitCloudsToView();
  }, [loadCount]);

  // Sky pan + pinch-zoom responder — fires on empty sky, loses to cloud PRs (they're inner)
  const skyPanResponder = useRef((() => {
    let isPinching    = false;
    let lastPinchDist = 0;

    function pinchDist(touches: any[]): number {
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,   // don't compete on tap — clouds win automatically
      onMoveShouldSetPanResponder:  () => true,    // claim on move for pan + pinch
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: () => {
        canvasPan.stopAnimation();
        canvasZoom.stopAnimation();
        canvasPan.extractOffset();
        isPinching    = false;
        lastPinchDist = 0;
      },

      onPanResponderMove: (e, gs) => {
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2) {
          isPinching = true;
          const dist = pinchDist(touches);
          const midX = (touches[0].pageX + touches[1].pageX) / 2;
          const midY = (touches[0].pageY + touches[1].pageY) / 2;

          if (lastPinchDist > 0) {
            const ratio   = dist / lastPinchDist;
            const newZoom = Math.max(0.25, Math.min(3.0, canvasZoomValue.current * ratio));
            const actual  = newZoom / canvasZoomValue.current; // ratio after clamping

            canvasZoom.setValue(newZoom);
            canvasZoomValue.current = newZoom;

            // Shift pan so the point under the pinch midpoint stays fixed
            const { x: vcx, y: vcy } = canvasCenter.current;
            canvasPan.setValue({
              x: (canvasPan.x as any)._value + (1 - actual) * (midX - vcx),
              y: (canvasPan.y as any)._value + (1 - actual) * (midY - vcy),
            });
          }
          lastPinchDist = dist;
        } else if (!isPinching) {
          canvasPan.setValue({ x: gs.dx, y: gs.dy });
        }
      },

      onPanResponderRelease: () => {
        canvasPan.flattenOffset();
        isPinching    = false;
        lastPinchDist = 0;
      },
      onPanResponderTerminate: () => {
        canvasPan.flattenOffset();
        isPinching    = false;
        lastPinchDist = 0;
      },
    });
  })()).current;

  // Per-cloud drag state (keyed by room.id)
  const savedPositions = useRef<Record<string, { x: number; y: number }>>({});
  const cloudAnims    = useRef<Record<string, Animated.ValueXY>>({});
  const cloudScales   = useRef<Record<string, Animated.Value>>({});
  const panResponders    = useRef<Record<string, ReturnType<typeof PanResponder.create>>>({});
  const cloudSlotIndex   = useRef<Record<string, number>>({});  // room.id → slot index
  const roomsRef         = useRef<Room[]>([]);                  // live rooms list for collision

  // ─── Collision detection ─────────────────────────────────────────────────────
  function resolveCollisions(
    roomId: string,
    x: number, y: number,
    cw: number, ch: number,
  ): { x: number; y: number } {
    const CLOUD_H = ch * 0.62; // only the solid cloud body, not the full SVG height
    const PAD = 14;
    let px = x, py = y;
    // Two passes handle most overlap chains without over-pushing
    for (let pass = 0; pass < 2; pass++) {
      for (const other of roomsRef.current) {
        if (other.id === roomId) continue;
        const oa = cloudAnims.current[other.id];
        if (!oa) continue;
        const si   = cloudSlotIndex.current[other.id] ?? 0;
        const ocw  = BASE_CLOUD_W * CLOUD_SLOTS[si % CLOUD_SLOTS.length].scale;
        const och  = (ocw * (185 / 240)) * 0.62;
        const ox   = (oa.x as any)._value;
        const oy   = (oa.y as any)._value;
        const mxc  = px + cw  / 2,  myc = py + CLOUD_H / 2;
        const oxc  = ox + ocw / 2,  oyc = oy + och     / 2;
        const ovX  = (cw + ocw) / 2 + PAD - Math.abs(mxc - oxc);
        const ovY  = (CLOUD_H + och) / 2 + PAD - Math.abs(myc - oyc);
        if (ovX > 0 && ovY > 0) {
          if (ovX < ovY) { px += mxc < oxc ? -ovX : ovX; }
          else            { py += myc < oyc ? -ovY : ovY; }
        }
      }
    }
    return { x: px, y: py };
  }

  // Stable callbacks so PanResponder closures never go stale
  const onTapRef     = useRef<(room: Room, slotIndex: number) => void>(() => {});
  const onOptionsRef = useRef<(room: Room) => void>(() => {});
  // Updated every render
  onTapRef.current     = (room, slotIndex) => handleCloudPress(room, slotIndex);
  onOptionsRef.current = (room) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setOptionsRoom(room); };
  roomsRef.current     = rooms; // keep live reference for collision detection

  // ─── Persist / restore cloud positions ──────────────────────────────────────
  async function loadSavedPositions() {
    try {
      const raw = await getItem(STORAGE_KEY);
      if (raw) savedPositions.current = JSON.parse(raw);
    } catch {}
  }

  async function saveCloudPosition(code: string, x: number, y: number) {
    savedPositions.current[code] = { x, y };
    await setItem(STORAGE_KEY, JSON.stringify(savedPositions.current));
  }

  // ─── Per-cloud anim / pan responder ─────────────────────────────────────────
  function getOrInitAnim(room: Room, slotIndex: number): Animated.ValueXY {
    if (!cloudAnims.current[room.id]) {
      const saved = savedPositions.current[room.code];
      const slot  = CLOUD_SLOTS[slotIndex % CLOUD_SLOTS.length];
      let initX = saved?.x ?? slot.left;
      let initY = saved?.y ?? slot.top;
      // For brand-new clouds (no saved position) find a spot that doesn't overlap
      if (!saved) {
        const cw = BASE_CLOUD_W * slot.scale;
        const ch = cw * (185 / 240);
        const resolved = resolveCollisions(room.id, initX, initY, cw, ch);
        initX = resolved.x;
        initY = resolved.y;
      }
      cloudAnims.current[room.id] = new Animated.ValueXY({ x: initX, y: initY });
    }
    return cloudAnims.current[room.id];
  }

  function getOrInitScale(room: Room): Animated.Value {
    if (!cloudScales.current[room.id]) {
      cloudScales.current[room.id] = new Animated.Value(1);
    }
    return cloudScales.current[room.id];
  }

  function getOrCreatePanResponder(room: Room, slotIndex: number) {
    if (panResponders.current[room.id]) return panResponders.current[room.id];

    cloudSlotIndex.current[room.id] = slotIndex; // record for collision detection

    const anim      = getOrInitAnim(room, slotIndex);
    const scaleAnim = getOrInitScale(room);
    const cw        = BASE_CLOUD_W * CLOUD_SLOTS[slotIndex % CLOUD_SLOTS.length].scale;
    const ch        = cw * (185 / 240); // matches VB_H/VB_W in SkyCloud

    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    let dragging  = false;
    let longFired = false;
    let startX    = 0;
    let startY    = 0;

    const pr = PanResponder.create({
      onStartShouldSetPanResponder:     () => true,
      onMoveShouldSetPanResponder:      () => true,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: () => {
        dragging  = false;
        longFired = false;
        startX = (anim.x as any)._value;
        startY = (anim.y as any)._value;
        anim.stopAnimation();

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
            Animated.spring(scaleAnim, {
              toValue: 1.1, useNativeDriver: true, tension: 200, friction: 8,
            }).start();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          anim.setValue({ x: startX + gs.dx, y: startY + gs.dy });
        }
      },

      onPanResponderRelease: (_, gs) => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }

        if (dragging) {
          setLiftedRoomId(null);
          Animated.spring(scaleAnim, {
            toValue: 1, useNativeDriver: true, tension: 200, friction: 8,
          }).start();
          // Clamp within the sky canvas bounds
          const rawX = startX + gs.dx;
          const rawY = startY + gs.dy;
          const clampedX = Math.max(-SKY_W * 0.1, Math.min(SKY_W * 0.95, rawX));
          const clampedY = Math.max(-SKY_H * 0.05, Math.min(SKY_H * 0.85, rawY));
          // Push away from overlapping clouds
          const { x: finalX, y: finalY } = resolveCollisions(room.id, clampedX, clampedY, cw, ch);
          // Only animate if the position was actually adjusted — avoids magnetic snap feeling
          if (Math.abs(finalX - rawX) > 1 || Math.abs(finalY - rawY) > 1) {
            Animated.spring(anim, {
              toValue: { x: finalX, y: finalY },
              useNativeDriver: true, tension: 120, friction: 10,
            }).start();
          }
          saveCloudPosition(room.code, finalX, finalY);
        } else if (!longFired) {
          // Tap — pulse then zoom
          Animated.sequence([
            Animated.timing(scaleAnim, { toValue: 1.08, duration: 90, useNativeDriver: true }),
            Animated.timing(scaleAnim, { toValue: 1,    duration: 90, useNativeDriver: true }),
          ]).start();
          onTapRef.current(room, slotIndex);
        }
      },

      onPanResponderTerminate: () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        dragging = false;
        setLiftedRoomId(null);
        Animated.spring(scaleAnim, {
          toValue: 1, useNativeDriver: true, tension: 200, friction: 8,
        }).start();
      },
    });

    panResponders.current[room.id] = pr;
    return pr;
  }

  // ─── Zoom animation ──────────────────────────────────────────────────────────
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

  // ─── Data loading ────────────────────────────────────────────────────────────
  async function load() {
    try {
      const [roomList, nameMap, lastSeenMap] = await Promise.all([
        fetchMyRooms(),
        getAllNicknames(),
        getAllLastSeen(),
        loadSavedPositions(),
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
      setLoadCount((c) => c + 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

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

  // ─── Cloud tap (zoom) ────────────────────────────────────────────────────────
  function handleCloudPress(room: Room, slotIndex: number) {
    const cloudRef = cloudRefs.current[room.id];
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
          <Animated.View
            onLayout={(e) => {
              const { x, y, width, height } = e.nativeEvent.layout;
              canvasCenter.current = { x: x + width / 2, y: y + height / 2 };
              canvasViewSize.current = { width, height };
            }}
            style={{
              flex: 1,
              transform: [
                { translateX: canvasPan.x },
                { translateY: canvasPan.y },
                { scale: canvasZoom },
              ],
            }}
            {...skyPanResponder.panHandlers}
          >
            {/* Decorative background clouds */}
            {DECORATIVE.map((d, i) => (
              <DecorativeCloud key={i} x={d.x} y={d.y} width={d.width} opacity={d.opacity}
                variant={d.variant} driftX={d.driftX} driftY={d.driftY} duration={d.duration} />
            ))}

            {/* Room clouds — freely draggable */}
            {rooms.slice(0, 8).map((room, i) => {
              const slot  = CLOUD_SLOTS[i % CLOUD_SLOTS.length];
              const cw    = BASE_CLOUD_W * slot.scale;
              const anim  = getOrInitAnim(room, i);
              const scaleAnim = getOrInitScale(room);
              const pr    = getOrCreatePanResponder(room, i);

              return (
                <Animated.View
                  key={room.id}
                  style={{
                    position: "absolute",
                    transform: [
                      { translateX: anim.x },
                      { translateY: anim.y },
                      { scale: scaleAnim },
                    ],
                    // Lifted shadow
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: liftedRoomId === room.id ? 8 : 2 },
                    shadowOpacity: liftedRoomId === room.id ? 0.18 : 0.06,
                    shadowRadius:  liftedRoomId === room.id ? 16 : 4,
                    elevation:     liftedRoomId === room.id ? 12 : 2,
                    zIndex:        liftedRoomId === room.id ? 20 : 1,
                  }}
                  {...pr.panHandlers}
                >
                  <SkyCloud
                    ref={(r) => { cloudRefs.current[room.id] = r; }}
                    name={nicknames[room.code] ?? room.code}
                    width={cw}
                    unread={unreadRooms.has(room.code)}
                    lifted={liftedRoomId === room.id}
                    variant={roomVariant(room.code)}
                  />
                </Animated.View>
              );
            })}
          </Animated.View>
        )}
      </SafeAreaView>

      {/* Zoom overlay */}
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
  );
}
