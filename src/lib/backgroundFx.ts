import { ImageSegmenter, FilesetResolver } from "@mediapipe/tasks-vision";

export type BgMode = "none" | "blur" | "image";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";

let segmenter: ImageSegmenter | null = null;
let loading: Promise<ImageSegmenter> | null = null;

async function getSegmenter(): Promise<ImageSegmenter> {
  if (segmenter) return segmenter;
  if (loading) return loading;
  loading = (async () => {
    const files = await FilesetResolver.forVisionTasks(WASM_URL);
    segmenter = await ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
    return segmenter;
  })();
  return loading;
}

export interface FxHandle {
  stream: MediaStream;
  setMode: (mode: BgMode, imageUrl?: string) => void;
  stop: () => void;
}

export async function createBackgroundFx(
  source: MediaStreamTrack,
  initialMode: BgMode = "blur",
  initialImage?: string,
): Promise<FxHandle> {
  const seg = await getSegmenter();

  const settings = source.getSettings();
  const width = settings.width || 640;
  const height = settings.height || 480;

  const video = document.createElement("video");
  video.srcObject = new MediaStream([source]);
  video.muted = true;
  video.playsInline = true;
  await video.play();

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d", { willReadFrequently: false })!;

  const tmp = document.createElement("canvas");
  tmp.width = width;
  tmp.height = height;
  const tctx = tmp.getContext("2d", { willReadFrequently: true })!;

  let mode: BgMode = initialMode;
  let bgImg: HTMLImageElement | null = null;
  let running = true;

  const loadImage = (url: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { bgImg = img; };
    img.src = url;
  };
  if (initialImage) loadImage(initialImage);

  const render = () => {
    if (!running) return;
    if (video.readyState < 2) { requestAnimationFrame(render); return; }

    if (mode === "none") {
      ctx.filter = "none";
      ctx.drawImage(video, 0, 0, width, height);
      requestAnimationFrame(render);
      return;
    }

    try {
      seg.segmentForVideo(video, performance.now(), result => {
        const mask = result.categoryMask?.getAsUint8Array();
        if (!mask) {
          ctx.drawImage(video, 0, 0, width, height);
          result.close();
          return;
        }

        ctx.save();
        ctx.filter = "none";
        if (mode === "image" && bgImg) {
          ctx.drawImage(bgImg, 0, 0, width, height);
        } else {
          ctx.filter = "blur(12px)";
          ctx.drawImage(video, 0, 0, width, height);
        }
        ctx.restore();

        tctx.filter = "none";
        tctx.globalCompositeOperation = "source-over";
        tctx.clearRect(0, 0, width, height);
        tctx.drawImage(video, 0, 0, width, height);

        const frame = tctx.getImageData(0, 0, width, height);
        const px = frame.data;
        for (let i = 0; i < mask.length; i++) {
          px[i * 4 + 3] = mask[i] > 0 ? 0 : 255;
        }
        tctx.putImageData(frame, 0, 0);

        ctx.drawImage(tmp, 0, 0, width, height);
        result.close();
      });
    } catch {
      ctx.filter = "none";
      ctx.drawImage(video, 0, 0, width, height);
    }

    requestAnimationFrame(render);
  };
  render();

  const stream = out.captureStream(24);

  return {
    stream,
    setMode: (m, url) => {
      mode = m;
      if (url) loadImage(url);
    },
    stop: () => {
      running = false;
      video.pause();
      video.srcObject = null;
      stream.getTracks().forEach(t => t.stop());
    },
  };
}

export default createBackgroundFx;
