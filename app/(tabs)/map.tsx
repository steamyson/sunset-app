import {
  View,
  TouchableOpacity,
  Modal,
  Image,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Platform,
} from "react-native";
import { Text } from "../../components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useEffect, useRef, useState } from "react";

// Lazy-load react-native-maps at module level so it's stable across renders
// and never imported on web where it isn't needed.
const mapsLib = Platform.OS !== "web" ? require("react-native-maps") : null;
const MapView   = mapsLib?.default ?? null;
const Marker    = mapsLib?.Marker ?? null;
const PROVIDER_GOOGLE = mapsLib?.PROVIDER_GOOGLE ?? null;
const mapStyle  = Platform.OS === "android"
  ? require("../../utils/mapStyle").default
  : [];
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { fetchMessagesWithLocation, type Message } from "../../utils/messages";
import { fetchMyRooms } from "../../utils/rooms";
import { getDeviceId } from "../../utils/device";
import { reverseGeocode } from "../../utils/geocoding";
import { colors } from "../../utils/theme";
import { CloudCard } from "../../components/CloudCard";

const SCREEN_W = Dimensions.get("window").width;

type MapMode = "mine" | "rooms";

// ─── Web fallback ────────────────────────────────────────────────────────────
function WebFallback({ messages, mode, onToggle }: {
  messages: Message[];
  mode: MapMode;
  onToggle: (m: MapMode) => void;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.sky }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 32, paddingBottom: 16, alignItems: "center" }}>
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
          activeOpacity={0.8}
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

// ─── Clustering ──────────────────────────────────────────────────────────────
type Cluster = { id: string; lat: number; lng: number; messages: Message[] };

function clusterMessages(messages: Message[], radiusM = 80): Cluster[] {
  const clusters: Cluster[] = [];
  for (const msg of messages) {
    if (!msg.lat || !msg.lng) continue;
    const existing = clusters.find((c) => {
      const dLat = (c.lat - msg.lat!) * 111_000;
      const dLng = (c.lng - msg.lng!) * 111_000 * Math.cos(c.lat * (Math.PI / 180));
      return Math.sqrt(dLat * dLat + dLng * dLng) < radiusM;
    });
    if (existing) {
      existing.messages.push(msg);
    } else {
      clusters.push({ id: msg.id, lat: msg.lat, lng: msg.lng, messages: [msg] });
    }
  }
  return clusters;
}

// ─── Pin modal ───────────────────────────────────────────────────────────────
function PinModal({ messages, onClose }: { messages: Message[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const current = messages[index];

  useEffect(() => {
    setPlaceName(null);
    if (current.lat && current.lng) {
      reverseGeocode(current.lat, current.lng).then(setPlaceName);
    }
  }, [current.id]);

  const date = new Date(current.created_at);
  const dateLabel = date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const timeLabel = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const PHOTO_W = SCREEN_W - 32;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(61,46,46,0.6)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.sky, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" }}>

          {/* Swipeable photo carousel */}
          <ScrollView
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
                  <Image
                    source={{ uri: msg.photo_url }}
                    style={{ width: PHOTO_W, height: PHOTO_W * 0.9 }}
                    resizeMode="cover"
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
        </View>
      </View>
    </Modal>
  );
}

// ─── Native map ──────────────────────────────────────────────────────────────
// Badge is only shown when zoomed in past this threshold (city scale)
const BADGE_DELTA_THRESHOLD = 0.5;

function NativeMap({ messages, myCoords }: {
  messages: Message[];
  myCoords: { latitude: number; longitude: number } | null;
}) {
  const [selected, setSelected] = useState<Message[] | null>(null);
  const [zoomedIn, setZoomedIn] = useState(false);
  const mapRef = useRef<any>(null);

  const USA_REGION = {
    latitude: 39.5,
    longitude: -98.35,
    latitudeDelta: 42,
    longitudeDelta: 58,
  };

  function goToMyLocation() {
    if (!myCoords || !mapRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mapRef.current.animateToRegion({
      ...myCoords,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    }, 600);
  }

  const clusters = clusterMessages(messages);

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={USA_REGION}
        customMapStyle={Platform.OS === "android" ? mapStyle : []}
        showsUserLocation
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
          <Marker
            key={cluster.id}
            coordinate={{ latitude: cluster.lat, longitude: cluster.lng }}
            tracksViewChanges={false}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelected(cluster.messages);
            }}
          >
            <View style={{ alignItems: "center" }}>
              <View style={{
                width: 48, height: 48, borderRadius: 24,
                borderWidth: 3, borderColor: "white",
                overflow: "hidden",
                shadowColor: colors.charcoal,
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.3,
                shadowRadius: 6,
                elevation: 6,
              }}>
                <Image source={{ uri: cluster.messages[0].photo_url }} style={{ width: 48, height: 48 }} resizeMode="cover" />
              </View>
              {/* Count badge — only at city scale, in normal flow so nothing clips it */}
              {cluster.messages.length > 1 && zoomedIn && (
                <View style={{
                  backgroundColor: colors.ember,
                  borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2,
                  marginTop: 3,
                  minWidth: 20, alignItems: "center",
                  shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.3, shadowRadius: 2, elevation: 3,
                }}>
                  <Text style={{ color: "white", fontSize: 11, fontWeight: "800", lineHeight: 14 }}>
                    {cluster.messages.length}
                  </Text>
                </View>
              )}
              {/* Pin tail */}
              <View style={{
                width: 0, height: 0,
                borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 8,
                borderLeftColor: "transparent", borderRightColor: "transparent",
                borderTopColor: "white", marginTop: 2,
              }} />
            </View>
          </Marker>
        ))}
      </MapView>

      {selected && <PinModal messages={selected} onClose={() => setSelected(null)} />}

      {/* Custom locate-me button — bottom right, above tab bar */}
      <TouchableOpacity
        onPress={goToMyLocation}
        style={{
          position: "absolute", bottom: 28, right: 20,
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: colors.cream,
          alignItems: "center", justifyContent: "center",
          shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
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

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        setLoading(true);
        try {
          const [deviceId, rooms] = await Promise.all([getDeviceId(), fetchMyRooms()]);
          if (cancelled) return;
          const roomIds = rooms.map((r) => r.id);

          const msgs = await fetchMessagesWithLocation({ deviceId, roomIds, mode });
          if (cancelled) return;
          setMessages(msgs);
        } catch (e) {
          console.error(e);
        } finally {
          if (!cancelled) setLoading(false);
        }

        // Location runs after map is already visible
        try {
          const locResult = await Location.requestForegroundPermissionsAsync();
          if (cancelled) return;

          if (locResult.status === "granted") {
            setLocationDenied(false);
            try {
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              if (!cancelled) {
                setMyCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
              }
            } catch {
              // GPS unavailable — map still works, just no user dot
            }
          } else {
            setLocationDenied(true);
          }
        } catch {
          // Location permission error — non-fatal
        }
      }

      load();
      return () => { cancelled = true; };
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
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Map fills everything */}
      {loading ? (
        <View style={{ flex: 1, backgroundColor: colors.sky, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.ember} size="large" />
        </View>
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
    </View>
  );
}
