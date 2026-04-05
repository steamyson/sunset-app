import {
  View,
  TouchableOpacity,
  Modal,
  Image,
  ActivityIndicator,
  ScrollView,
  FlatList,
  Dimensions,
  Platform,
  Linking,
  Animated,
  PanResponder,
} from "react-native";
import { Text } from "../../components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Lazy-load react-native-maps at module level so it's stable across renders
// and never imported on web where it isn't needed.
const mapsLib = Platform.OS !== "web" ? require("react-native-maps") : null;
const MapView   = mapsLib?.default ?? null;
const Marker    = mapsLib?.Marker ?? null;
const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const PROVIDER_GOOGLE = GOOGLE_MAPS_KEY ? (mapsLib?.PROVIDER_GOOGLE ?? null) : null;
const mapStyle  = Platform.OS === "android"
  ? require("../../utils/mapStyle").default
  : [];
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import { fetchMessagesWithLocation, thumbUrl, type Message } from "../../utils/messages";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { fetchMyRoomsCached } from "../../utils/roomCache";
import { getDeviceId } from "../../utils/device";
import { reverseGeocode } from "../../utils/geocoding";
import { colors, interaction, spacing } from "../../utils/theme";
import { CloudCard } from "../../components/CloudCard";
import { FilteredImage } from "../../components/FilteredImage";

const SCREEN_W = Dimensions.get("window").width;
const MAP_PAGE_SIZE = 100;

type MapMode = "mine" | "rooms";

// ─── Web fallback ────────────────────────────────────────────────────────────
function WebFallback({ messages, mode, onToggle }: {
  messages: Message[];
  mode: MapMode;
  onToggle: (m: MapMode) => void;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.sky }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: 32, paddingBottom: 16, alignItems: "center" }}>
        <Text style={{ fontSize: 32, fontWeight: "800", color: colors.ember, letterSpacing: -1 }}>Map</Text>
        <Text style={{ fontSize: 13, color: colors.ash, marginTop: 4 }}>where the sky meets the earth</Text>
      </View>
      <ModeToggle mode={mode} onToggle={onToggle} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 48 }}>🗺️</Text>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.charcoal, marginTop: 16, textAlign: "center" }}>
          Map view is available on iOS & Android
        </Text>
        <Text style={{ fontSize: 13, color: colors.ash, marginTop: 8, textAlign: "center", lineHeight: 20 }}>
          {messages.length} sunset{messages.length !== 1 ? "s" : ""} with location in this view.
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ─── Toggle ──────────────────────────────────────────────────────────────────
function ModeToggle({ mode, onToggle }: { mode: MapMode; onToggle: (m: MapMode) => void }) {
  return (
    <View style={{
      marginHorizontal: 20, marginBottom: 12,
      flexDirection: "row",
      backgroundColor: colors.mist,
      borderRadius: 16, padding: 4,
    }}>
      {(["mine", "rooms"] as MapMode[]).map((m) => (
        <TouchableOpacity
          key={m}
          onPress={() => onToggle(m)}
          activeOpacity={interaction.activeOpacity}
          style={{
            flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center",
            backgroundColor: mode === m ? colors.charcoal : "transparent",
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: mode === m ? colors.cream : colors.ash }}>
            {m === "mine" ? "✦ My Sunsets" : "◈ Room Sunsets"}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Clustering (extracted to utils/clustering.ts) ──────────────────────────
import { clusterMessages, clusterNewestWithPhoto, type Cluster } from "../../utils/clustering";

// ─── Pin modal ───────────────────────────────────────────────────────────────
function PinModal({ messages, onClose }: { messages: Message[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const galleryAnim = useRef(new Animated.Value(700)).current;
  const carouselRef = useRef<ScrollView>(null);
  const openGalleryRef = useRef(() => {});
  const closeGalleryRef = useRef(() => {});

  const current = messages[index];

  useEffect(() => {
    setPlaceName(null);
    if (current.lat && current.lng) {
      reverseGeocode(current.lat, current.lng).then(setPlaceName);
    }
  }, [current.id]);

  // Update refs every render to avoid stale closures
  openGalleryRef.current = () => {
    galleryAnim.setValue(700);
    setGalleryOpen(true);
    Animated.spring(galleryAnim, { toValue: 0, tension: 120, friction: 8, useNativeDriver: true }).start();
  };
  closeGalleryRef.current = () => {
    Animated.spring(galleryAnim, { toValue: 700, tension: 120, friction: 8, useNativeDriver: true })
      .start(({ finished }) => { if (finished) setGalleryOpen(false); });
  };

  const handlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, gs) => {
        if (gs.dy < -20 || (Math.abs(gs.dy) < 5 && Math.abs(gs.dx) < 5)) openGalleryRef.current();
      },
    })
  ).current;

  const galleryHeaderPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 10,
      onPanResponderRelease: (_, gs) => { if (gs.dy > 50) closeGalleryRef.current(); },
    })
  ).current;

  function jumpToIndex(i: number) {
    closeGalleryRef.current();
    setTimeout(() => {
      carouselRef.current?.scrollTo({ x: i * SCREEN_W, animated: false });
      setIndex(i);
    }, 350);
  }

  const date = new Date(current.created_at);
  const dateLabel = date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const timeLabel = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const PHOTO_W = SCREEN_W - 32;
  const THUMB_W = Math.floor((SCREEN_W - 12) / 3);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(61,46,46,0.6)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.sky, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" }}>

          {/* Swipeable photo carousel */}
          <ScrollView
            ref={carouselRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) =>
              setIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))
            }
          >
            {messages.map((msg) => (
              <View key={msg.id} style={{ width: SCREEN_W, paddingHorizontal: 16, paddingTop: 16 }}>
                <View style={{ borderRadius: 18, overflow: "hidden", borderWidth: 1.5, borderColor: colors.mist }}>
                  <FilteredImage
                    uri={msg.photo_url}
                    filter={msg.filter}
                    adjustments={(() => { try { return msg.adjustments ? JSON.parse(msg.adjustments) : null; } catch { return null; } })()}
                    width={PHOTO_W}
                    height={PHOTO_W * 0.9}
                  />
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Dot / counter indicator */}
          {messages.length > 1 && (
            <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 10 }}>
              {messages.length <= 8 ? (
                messages.map((_, i) => (
                  <View key={i} style={{
                    height: 6, borderRadius: 3,
                    width: i === index ? 18 : 6,
                    backgroundColor: i === index ? colors.ember : colors.mist,
                  }} />
                ))
              ) : (
                <Text style={{ fontSize: 12, color: colors.ash, fontWeight: "600" }}>
                  {index + 1} of {messages.length}
                </Text>
              )}
            </View>
          )}

          {/* Drag handle pill + view all */}
          <View
            {...handlePanResponder.panHandlers}
            style={{ alignItems: "center", paddingTop: 10, paddingBottom: 8 }}
          >
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.mist }} />
            {messages.length > 1 && (
              <Text style={{ fontSize: 11, color: colors.ash, marginTop: 5, letterSpacing: 0.3 }}>
                view all {messages.length}
              </Text>
            )}
          </View>

          {/* Info */}
          <View style={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 40 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <Text style={{ fontSize: 18 }}>📍</Text>
              <Text style={{ fontSize: 17, fontWeight: "800", color: colors.charcoal, flex: 1 }}>
                {placeName ?? "Locating…"}
              </Text>
            </View>
            <Text style={{ fontSize: 14, color: colors.ash, marginLeft: 28 }}>
              {dateLabel} · {timeLabel}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={{ marginTop: 20, backgroundColor: colors.charcoal, borderRadius: 16, padding: 16, alignItems: "center" }}
            >
              <Text style={{ color: colors.cream, fontWeight: "700", fontSize: 15 }}>Close</Text>
            </TouchableOpacity>
          </View>

          {/* Gallery overlay */}
          {galleryOpen && (
            <Animated.View
              style={{
                position: "absolute",
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: colors.sky,
                transform: [{ translateY: galleryAnim }],
              }}
            >
              {/* Drag handle header */}
              <View
                {...galleryHeaderPanResponder.panHandlers}
                style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}
              >
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.mist }} />
              </View>
              {/* Title + close */}
              <View style={{
                flexDirection: "row", alignItems: "center",
                paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
              }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: colors.charcoal }}>
                  {messages.length} sunset{messages.length !== 1 ? "s" : ""} here
                </Text>
                <TouchableOpacity
                  onPress={() => closeGalleryRef.current()}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="chevron-down" size={22} color={colors.charcoal} />
                </TouchableOpacity>
              </View>
              {/* Thumbnail grid */}
              <FlatList
                data={messages}
                keyExtractor={(m) => m.id}
                numColumns={3}
                contentContainerStyle={{ paddingBottom: 40 }}
                renderItem={({ item, index: i }) => (
                  <TouchableOpacity
                    onPress={() => jumpToIndex(i)}
                    activeOpacity={interaction.activeOpacity}
                    style={{ margin: 2 }}
                  >
                    <Image
                      source={{ uri: thumbUrl(item.photo_url, 300) }}
                      style={{ width: THUMB_W, height: THUMB_W, borderRadius: 8 }}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                )}
              />
            </Animated.View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Native map ──────────────────────────────────────────────────────────────
// Badge is only shown when zoomed in past this threshold (city scale)
const BADGE_DELTA_THRESHOLD = 0.5;
const PIN_SIZE = 48;

/**
 * Android Fabric: RN's Image component never paints into the Marker
 * bitmap snapshot (tested remote, file://, data: URIs + tracksViewChanges
 * + key remounting).  The only reliable path is the Marker's native
 * `image` prop, which goes through Google Maps SDK BitmapDescriptorFactory.
 *
 * Flow: download → resize to 96px → use local file URI as `image` prop.
 */
const PIN_THUMB_SIZE = 96;

function ClusterMapMarker({
  cluster,
  zoomedIn,
  onOpen,
}: {
  cluster: Cluster;
  zoomedIn: boolean;
  onOpen: (messages: Message[]) => void;
}) {
  const thumbMsg = useMemo(() => clusterNewestWithPhoto(cluster.messages), [cluster]);
  const remoteUri = thumbMsg?.photo_url || null;
  const [localThumb, setLocalThumb] = useState<string | null>(null);

  useEffect(() => {
    if (!remoteUri || !thumbMsg) {
      setLocalThumb(null);
      return;
    }
    let cancelled = false;
    const thumbDest = `${FileSystem.cacheDirectory}map_pin_${thumbMsg.id}_${PIN_THUMB_SIZE}.jpg`;

    (async () => {
      try {
        const thumbInfo = await FileSystem.getInfoAsync(thumbDest);
        if (!thumbInfo.exists) {
          const origDest = `${FileSystem.cacheDirectory}map_pin_${thumbMsg.id}.jpg`;
          const origInfo = await FileSystem.getInfoAsync(origDest);
          if (!origInfo.exists) {
            const dl = await FileSystem.downloadAsync(remoteUri, origDest);
            if (cancelled) return;
            if (dl.status < 200 || dl.status >= 300) {
              await FileSystem.deleteAsync(origDest, { idempotent: true });
              return;
            }
          }
          const resized = await manipulateAsync(
            origDest,
            [{ resize: { width: PIN_THUMB_SIZE } }],
            { compress: 0.7, format: SaveFormat.JPEG },
          );
          if (cancelled) return;
          await FileSystem.moveAsync({ from: resized.uri, to: thumbDest });
        }
        if (!cancelled) setLocalThumb(thumbDest);
      } catch (e: any) {
        if (!cancelled) console.warn(`[MapPin] ${cluster.id}: ${e?.message ?? e}`);
      }
    })();
    return () => { cancelled = true; };
  }, [remoteUri, thumbMsg?.id, cluster.id]);

  const hasThumb = Boolean(localThumb);

  return (
    <Marker
      coordinate={{ latitude: cluster.lat, longitude: cluster.lng }}
      tracksViewChanges={false}
      image={hasThumb ? { uri: localThumb! } : undefined}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onOpen(cluster.messages);
      }}
    >
      {!hasThumb ? (
        <View style={{ alignItems: "center" }} collapsable={false}>
          <View
            collapsable={false}
            style={{
              width: PIN_SIZE,
              height: PIN_SIZE,
              borderRadius: PIN_SIZE / 2,
              borderWidth: 3,
              borderColor: "white",
              backgroundColor: colors.mist,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 20 }}>🌅</Text>
          </View>
          <View
            style={{
              width: 0, height: 0,
              borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 8,
              borderLeftColor: "transparent", borderRightColor: "transparent",
              borderTopColor: "white", marginTop: 2,
            }}
          />
        </View>
      ) : null}
    </Marker>
  );
}

function MapSkeleton() {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.sky, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.mist, opacity }} />
      <Animated.View style={{ width: 140, height: 14, borderRadius: 7, backgroundColor: colors.mist, opacity, marginTop: 16 }} />
    </View>
  );
}

function NativeMap({ messages, myCoords }: {
  messages: Message[];
  myCoords: { latitude: number; longitude: number } | null;
}) {
  const [selected, setSelected] = useState<Message[] | null>(null);
  const [zoomedIn, setZoomedIn] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<any>(null);
  const hasAutoFitRef = useRef(false);

  const USA_REGION = {
    latitude: 39.5,
    longitude: -98.35,
    latitudeDelta: 42,
    longitudeDelta: 58,
  };

  const clusters = useMemo(() => clusterMessages(messages), [messages]);

  // Reset auto-fit when messages change (e.g. mode toggle) so map re-centers
  useEffect(() => {
    hasAutoFitRef.current = false;
  }, [messages]);

  useEffect(() => {
    if (!mapReady || clusters.length === 0 || hasAutoFitRef.current || !mapRef.current) return;
    hasAutoFitRef.current = true;

    const EDGE_PADDING = 64;

    if (clusters.length === 1) {
      mapRef.current.animateToRegion({
        latitude: clusters[0].lat,
        longitude: clusters[0].lng,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      }, 500);
    } else {
      const coords = clusters.map((c) => ({
        latitude: c.lat,
        longitude: c.lng,
      }));
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: EDGE_PADDING, right: EDGE_PADDING, bottom: EDGE_PADDING, left: EDGE_PADDING },
        animated: true,
      });
    }
  }, [mapReady, clusters]);

  function goToMyLocation() {
    if (!myCoords || !mapRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mapRef.current.animateToRegion({
      ...myCoords,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    }, 600);
  }

  function toggleSatellite() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSatellite((s) => !s);
  }

  const mapFabStyle = {
    position: "absolute" as const,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    shadowColor: colors.pureBlack,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={USA_REGION}
        onMapReady={() => setMapReady(true)}
        mapType={satellite ? "satellite" : "standard"}
        customMapStyle={
          Platform.OS === "android" && PROVIDER_GOOGLE && !satellite ? mapStyle : []
        }
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        minZoomLevel={0}
        maxZoomLevel={19}
        onRegionChangeComplete={(r: { latitudeDelta: number }) => {
          const nowIn = r.latitudeDelta < BADGE_DELTA_THRESHOLD;
          setZoomedIn((prev) => (prev === nowIn ? prev : nowIn));
        }}
      >
        {clusters.map((cluster) => (
          <ClusterMapMarker
            key={cluster.id}
            cluster={cluster}
            zoomedIn={zoomedIn}
            onOpen={setSelected}
          />
        ))}
        {myCoords ? (
          <Marker
            coordinate={myCoords}
            tracksViewChanges={false}
            zIndex={999}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={{ alignItems: "center", justifyContent: "center" }} collapsable={false}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: colors.mapLocationDot,
                  borderWidth: 3,
                  borderColor: colors.pureWhite,
                }}
              />
            </View>
          </Marker>
        ) : null}
      </MapView>

      {selected && <PinModal messages={selected} onClose={() => setSelected(null)} />}

      {/* Satellite / roadmap — above locate */}
      <TouchableOpacity
        onPress={toggleSatellite}
        accessibilityLabel={satellite ? "Show map" : "Show satellite"}
        style={{
          ...mapFabStyle,
          bottom: 80,
          backgroundColor: satellite ? colors.charcoal : colors.cream,
        }}
      >
        <Ionicons
          name={satellite ? "map-outline" : "globe-outline"}
          size={22}
          color={satellite ? colors.cream : colors.ember}
        />
      </TouchableOpacity>

      {/* Custom locate-me button — bottom right, above tab bar */}
      <TouchableOpacity
        onPress={goToMyLocation}
        accessibilityLabel="My location"
        style={{
          ...mapFabStyle,
          bottom: 28,
          backgroundColor: colors.cream,
        }}
      >
        <Ionicons name="locate" size={22} color={colors.ember} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function MapScreen() {
  const [mode, setMode] = useState<MapMode>("mine");
  const [messages, setMessages] = useState<Message[]>([]);
  const [myCoords, setMyCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoadedRef.current) setLoading(true);
      setLoadError(null);
      setHasMore(true);
      (async () => {
        try {
          const [deviceId, rooms] = await Promise.all([getDeviceId(), fetchMyRoomsCached()]);
          if (cancelled) return;
          const roomIds = rooms.map((r) => r.id);
          const msgs = await fetchMessagesWithLocation({
            deviceId,
            roomIds,
            mode,
            range: { from: 0, to: MAP_PAGE_SIZE - 1 },
          });
          if (cancelled) return;
          setMessages(msgs);
          setHasMore(msgs.length === MAP_PAGE_SIZE);
        } catch (e) {
          console.error(e);
          if (!cancelled) setLoadError("Could not load map sunsets right now.");
        } finally {
          if (!cancelled) {
            setLoading(false);
            hasLoadedRef.current = true;
          }
        }

        try {
          const locResult = await Location.requestForegroundPermissionsAsync();
          if (cancelled) return;
          if (locResult.status === "granted") {
            setLocationDenied(false);
            try {
              const lastKnown = await Location.getLastKnownPositionAsync();
              if (lastKnown && !cancelled) {
                setMyCoords({ latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude });
              }
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              if (!cancelled) {
                setMyCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
              }
            } catch {}
          } else {
            setLocationDenied(true);
          }
        } catch {}
      })();
      return () => {
        cancelled = true;
      };
    }, [mode])
  );

  if (Platform.OS === "web") {
    return <WebFallback messages={messages} mode={mode} onToggle={setMode} />;
  }

  if (!loading && locationDenied) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.sky }}>
        <ModeToggle mode={mode} onToggle={setMode} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <Ionicons name="location-outline" size={56} color={colors.ember} />
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.charcoal, marginTop: 20, textAlign: "center" }}>
            Location access needed
          </Text>
          <Text style={{ fontSize: 14, color: colors.ash, marginTop: 10, textAlign: "center", lineHeight: 22 }}>
            Dusk uses your location to pin sunsets on the map and show you what's been caught nearby — it's never shared without your knowledge.
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openSettings()}
            style={{ marginTop: 20, backgroundColor: colors.ember, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 18 }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Map fills everything */}
      {loading ? (
        <MapSkeleton />
      ) : (
        <NativeMap messages={messages} myCoords={myCoords} />
      )}

      {/* Mode toggle — floats over the map, below status bar */}
      <SafeAreaView edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0, pointerEvents: "box-none" }}>
        <ModeToggle mode={mode} onToggle={setMode} />
      </SafeAreaView>

      {/* Empty state */}
      {!loading && messages.length === 0 && (
        <CloudCard seed={2} style={{ position: "absolute", bottom: 20, alignSelf: "center", maxWidth: 280 }}>
          <View style={{ paddingHorizontal: 20, paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ fontSize: 22, marginBottom: 6 }}>🌅</Text>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.charcoal, textAlign: "center" }}>
              No sunsets pinned yet
            </Text>
            <Text style={{ fontSize: 12, color: colors.ash, marginTop: 4, textAlign: "center" }}>
              Go catch one — your photos with location{"\n"}will appear here as pins
            </Text>
          </View>
        </CloudCard>
      )}

      {/* Count pill */}
      {!loading && messages.length > 0 && (
        <View style={{
          position: "absolute", bottom: 32, alignSelf: "center",
          backgroundColor: colors.charcoal,
          paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20,
        }}>
          <Text style={{ color: colors.cream, fontWeight: "700", fontSize: 13 }}>
            {messages.length} sunset{messages.length !== 1 ? "s" : ""} captured here
          </Text>
        </View>
      )}

      {!loading && loadError && (
        <CloudCard seed={5} style={{ position: "absolute", bottom: 20, alignSelf: "center", maxWidth: 300 }}>
          <View style={{ paddingHorizontal: 20, paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.charcoal, textAlign: "center" }}>
              {loadError}
            </Text>
            <Text style={{ fontSize: 12, color: colors.ash, marginTop: 4, textAlign: "center" }}>
              Switch tabs and return to retry.
            </Text>
          </View>
        </CloudCard>
      )}

      {!loading && !loadError && hasMore && (
        <View style={{ position: "absolute", bottom: 76, alignSelf: "center" }}>
          <TouchableOpacity
            onPress={() => {
              setLoadingMore(true);
              (async () => {
                try {
                  const [deviceId, rooms] = await Promise.all([getDeviceId(), fetchMyRoomsCached()]);
                  const roomIds = rooms.map((r) => r.id);
                  const from = messages.length;
                  const next = await fetchMessagesWithLocation({
                    deviceId,
                    roomIds,
                    mode,
                    range: { from, to: from + MAP_PAGE_SIZE - 1 },
                  });
                  setMessages((prev) => {
                    const existing = new Set(prev.map((m) => m.id));
                    return [...prev, ...next.filter((m) => !existing.has(m.id))];
                  });
                  setHasMore(next.length === MAP_PAGE_SIZE);
                } catch (e) {
                  console.error(e);
                } finally {
                  setLoadingMore(false);
                }
              })();
            }}
            disabled={loadingMore}
            style={{
              backgroundColor: colors.charcoal,
              borderRadius: 20,
              paddingHorizontal: 18,
              paddingVertical: 10,
              minWidth: 124,
              alignItems: "center",
            }}
          >
            {loadingMore ? (
              <ActivityIndicator color={colors.cream} size="small" />
            ) : (
              <Text style={{ color: colors.cream, fontWeight: "700", fontSize: 13 }}>Load More</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
