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
  { id: "webrtc", name: "Web RTC", icon: "Radio", hint: "Встроенный звонок, размытие фона" },
];

const KEY = "video_platform";
const JITSI_HOST_KEY = "jitsi_host";
export const DEFAULT_JITSI_HOST = "meet.jit.si";

const DEAD_HOSTS = ["hispania-35.ru"];

export function getJitsiHost(): string {
  const raw = (localStorage.getItem(JITSI_HOST_KEY) || "").trim();
  const v = raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!v || DEAD_HOSTS.includes(v)) return DEFAULT_JITSI_HOST;
  return v;
}

export function setJitsiHost(host: string) {
  const clean = host.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  localStorage.setItem(JITSI_HOST_KEY, clean);
  window.dispatchEvent(new Event("video-platform-changed"));
}

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
