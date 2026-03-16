import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  View,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { supabase } from "../../utils/supabase";
import { getPostsForRoom, type Post } from "../../utils/posts";
import { Text } from "../../components/Text";
import { colors } from "../../utils/theme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

type PostWithUrl = Post & { signedUrl: string | null };

function formatCountdown(expiresAtISO: string): string {
  const now = Date.now();
  const expires = new Date(expiresAtISO).getTime();
  const diff = expires - now;
  if (diff <= 0) return "expired";
  const totalSecs = Math.floor(diff / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  }
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export default function RoomFeedScreen() {
  const params = useLocalSearchParams<{ code: string }>();
  const code = params.code?.toString() ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostWithUrl[]>([]);

  async function load() {
    if (!code) return;
    setLoading(true);
    setError(null);
    try {
      // Resolve room_id from room code
      const { data: room, error: roomErr } = await supabase
        .from("rooms")
        .select("id")
        .eq("code", code.toUpperCase())
        .maybeSingle();

      if (roomErr) throw new Error(roomErr.message);
      if (!room) throw new Error("Room not found.");

      const rawPosts = await getPostsForRoom(room.id);

      // Create signed URLs for each media_url (1h validity)
      const mapped: PostWithUrl[] = [];
      for (const p of rawPosts) {
        const { data, error: urlErr } = await supabase.storage
          .from("post-media")
          .createSignedUrl(p.media_url, 3600);
        if (urlErr) {
          console.error("Failed to create signed URL for post", p.id, urlErr);
          mapped.push({ ...p, signedUrl: null });
        } else {
          mapped.push({ ...p, signedUrl: data.signedUrl });
        }
      }

      setPosts(mapped);
    } catch (e: any) {
      console.error(e);
      setError(e.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [code])
  );

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (posts.length > 0) {
      // Update countdown once per second
      timer = setInterval(() => {
        setPosts((prev) => [...prev]);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [posts.length]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.sky, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.ember} size="large" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.sky, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.charcoal, textAlign: "center", marginBottom: 8 }}>
          Couldn&apos;t load this room
        </Text>
        <Text style={{ fontSize: 14, color: colors.ash, textAlign: "center" }}>
          {error}
        </Text>
      </SafeAreaView>
    );
  }

  if (posts.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.sky, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.charcoal, textAlign: "center", marginBottom: 6 }}>
          No posts yet
        </Text>
        <Text style={{ fontSize: 14, color: colors.ash, textAlign: "center", lineHeight: 22 }}>
          Capture your first sunset in this room to see it here.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        pagingEnabled
        snapToAlignment="center"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={{ width: SCREEN_W, height: SCREEN_H }}>
            {item.signedUrl ? (
              <Image
                source={{ uri: item.signedUrl }}
                style={{ width: SCREEN_W, height: SCREEN_H }}
                resizeMode="cover"
              />
            ) : (
              <View style={{ flex: 1, backgroundColor: colors.sky, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: colors.charcoal }}>Unable to load photo</Text>
              </View>
            )}

            {/* Gradient overlay for caption area */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: SCREEN_H * 0.28,
                backgroundColor: "rgba(0,0,0,0.45)",
              }}
            />

            {/* Caption */}
            <View
              style={{
                position: "absolute",
                left: 20,
                right: 20,
                bottom: 40,
              }}
            >
              {item.caption ? (
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: "white",
                    textAlign: "left",
                  }}
                  numberOfLines={3}
                >
                  {item.caption}
                </Text>
              ) : null}
            </View>

            {/* Expiry countdown */}
            <View
              style={{
                position: "absolute",
                top: 40,
                right: 16,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 16,
                backgroundColor: "rgba(0,0,0,0.55)",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: "white" }}>
                {formatCountdown(item.expires_at)}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

