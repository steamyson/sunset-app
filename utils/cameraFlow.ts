import type { FlashMode } from "expo-camera";

export const FLASH_CYCLE: FlashMode[] = ["off", "on", "auto"];

export const FLASH_ICON: Record<FlashMode, "flash-off" | "flash"> = {
  off: "flash-off",
  on: "flash",
  auto: "flash",
  screen: "flash",
};

export const FLASH_LABEL: Record<FlashMode, string> = {
  off: "Off",
  on: "On",
  auto: "Auto",
  screen: "Screen",
};

export function nextFlashMode(current: FlashMode): FlashMode {
  const idx = FLASH_CYCLE.indexOf(current);
  return FLASH_CYCLE[(idx + 1) % FLASH_CYCLE.length];
}

