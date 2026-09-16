export type VideoPlatform = "jitsi" | "zoom" | "sferum" | "webrtc";

export interface PlatformInfo {
  id: VideoPlatform;
  name: string;
  icon: string;
  hint: string;
  disabled?: boolean;
  needsLink?: boolean;
}

export const PLATFORMS: PlatformInfo[] = [
  { id: "jitsi", name: "Jitsi", icon: "Video", hint: "Своя комната, без установки" },
  { id: "zoom", name: "Zoom", icon: "Camera", hint: "Нужна постоянная ссылка", needsLink: true },
  { id: "sferum", name: "Сферум", icon: "GraduationCap", hint: "Нужна постоянная ссылка", needsLink: true },
  { id: "webrtc", name: "Web RTC", icon: "Radio", hint: "Скоро", disabled: true },
];

const KEY = "video_platform";
const LINK_KEY = "video_platform_link";

export function getPlatform(): VideoPlatform {
  const v = localStorage.getItem(KEY) as VideoPlatform | null;
  return v && PLATFORMS.some(p => p.id === v && !p.disabled) ? v : "jitsi";
}

export function setPlatform(p: VideoPlatform) {
  localStorage.setItem(KEY, p);
  window.dispatchEvent(new Event("video-platform-changed"));
}

export function getPlatformLink(p: VideoPlatform): string {
  return localStorage.getItem(`${LINK_KEY}_${p}`) || "";
}

export function setPlatformLink(p: VideoPlatform, link: string) {
  localStorage.setItem(`${LINK_KEY}_${p}`, link.trim());
  window.dispatchEvent(new Event("video-platform-changed"));
}

export default PLATFORMS;
