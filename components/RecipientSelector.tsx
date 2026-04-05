import {
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Text } from "./Text";
import { useEffect, useState } from "react";
import { getLocalRoomCodes } from "../utils/rooms";
import { getAllNicknames } from "../utils/nicknames";
import { colors, interaction } from "../utils/theme";

type Props = {
  onSend: (roomCodes: string[], myMap: boolean) => void;
  onCancel: () => void;
  sending: boolean;
};

export default function RecipientSelector({ onSend, onCancel, sending }: Props) {
  const [rooms, setRooms] = useState<string[]>([]);
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [myMap, setMyMap] = useState(false);

  useEffect(() => {
    Promise.all([getLocalRoomCodes(), getAllNicknames()]).then(([codes, nicks]) => {
      setRooms(codes);
      setNicknames(nicks);
    });
  }, []);

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  return (
    <View
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.cream,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: 24,
        paddingBottom: 48,
      }}
    >
      <Text
        style={{
          fontSize: 22,
          fontWeight: "800",
          color: colors.charcoal,
          marginBottom: 4,
        }}
      >
        Send to...
      </Text>
      <Text style={{ fontSize: 13, color: colors.ash, marginBottom: 20 }}>
        {myMap && selected.size === 0
          ? "Save to your map"
          : myMap && selected.size > 0
          ? `Send to ${selected.size} ${selected.size === 1 ? "room" : "rooms"} + save to map`
          : "Choose which rooms get this sunset"}
      </Text>

      <TouchableOpacity
        onPress={() => setMyMap((p) => !p)}
        activeOpacity={interaction.activeOpacity}
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 16,
          borderRadius: 14,
          backgroundColor: myMap ? colors.charcoal : "white",
          borderWidth: 1.5,
          borderColor: myMap ? colors.charcoal : colors.mist,
          marginBottom: 10,
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: myMap ? colors.cream : colors.ash,
            backgroundColor: myMap ? colors.ember : "transparent",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 14,
          }}
        >
          {myMap && (
            <Text style={{ color: "white", fontSize: 11, fontWeight: "900" }}>
              ✓
            </Text>
          )}
        </View>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "700",
            color: myMap ? colors.cream : colors.charcoal,
          }}
        >
          My Map
        </Text>
      </TouchableOpacity>

      {rooms.length === 0 ? (
        <Text
          style={{ color: colors.ash, textAlign: "center", paddingVertical: 20 }}
        >
          You haven't joined any rooms yet.
        </Text>
      ) : (
        <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 10 }}>
            {rooms.map((code) => {
              const isSelected = selected.has(code);
              return (
                <TouchableOpacity
                  key={code}
                  onPress={() => toggle(code)}
                  activeOpacity={interaction.activeOpacity}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 16,
                    borderRadius: 14,
                    backgroundColor: isSelected ? colors.charcoal : "white",
                    borderWidth: 1.5,
                    borderColor: isSelected ? colors.charcoal : colors.mist,
                  }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: isSelected ? colors.cream : colors.ash,
                      backgroundColor: isSelected ? colors.ember : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 14,
                    }}
                  >
                    {isSelected && (
                      <Text
                        style={{ color: "white", fontSize: 11, fontWeight: "900" }}
                      >
                        ✓
                      </Text>
                    )}
                  </View>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "700",
                      letterSpacing: nicknames[code] ? 0 : 4,
                      color: isSelected ? colors.cream : colors.charcoal,
                    }}
                  >
                    {nicknames[code] ?? code}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
        <TouchableOpacity
          onPress={onCancel}
          style={{
            flex: 1,
            padding: 16,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: colors.mist,
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.charcoal, fontWeight: "600" }}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onSend(Array.from(selected), myMap)}
          disabled={(selected.size === 0 && !myMap) || sending}
          activeOpacity={interaction.activeOpacitySubtle}
          style={{
            flex: 2,
            padding: 16,
            borderRadius: 14,
            backgroundColor: (selected.size > 0 || myMap) ? colors.ember : colors.mist,
            alignItems: "center",
          }}
        >
          {sending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>
              {selected.size > 0 && myMap
                ? "Send + Save to Map"
                : myMap && selected.size === 0
                ? "Save to My Map"
                : selected.size === 0
                ? "Select a room"
                : `Send to ${selected.size} ${selected.size === 1 ? "room" : "rooms"}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
