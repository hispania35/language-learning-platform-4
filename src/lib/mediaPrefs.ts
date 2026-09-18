const CAM_KEY = "hispania_cam_id";
const MIC_KEY = "hispania_mic_id";

export function getCamId(): string {
  return localStorage.getItem(CAM_KEY) || "";
}

export function getMicId(): string {
  return localStorage.getItem(MIC_KEY) || "";
}

export function setCamId(id: string) {
  if (id) localStorage.setItem(CAM_KEY, id);
  else localStorage.removeItem(CAM_KEY);
}

export function setMicId(id: string) {
  if (id) localStorage.setItem(MIC_KEY, id);
  else localStorage.removeItem(MIC_KEY);
}

export function videoConstraint(ideal = true): MediaTrackConstraints | boolean {
  const id = getCamId();
  const base: MediaTrackConstraints = ideal
    ? { width: { ideal: 1280 }, height: { ideal: 720 } }
    : {};
  if (id) base.deviceId = { ideal: id };
  return Object.keys(base).length ? base : true;
}

export function audioConstraint(): MediaTrackConstraints {
  const id = getMicId();
  const base: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  if (id) base.deviceId = { ideal: id };
  return base;
}
