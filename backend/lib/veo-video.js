const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GENERATED_ROOT = path.join(__dirname, "..", "generated");
const VEO_VIDEO_DIR = path.join(GENERATED_ROOT, "veo-videos");
const DEFAULT_VEO_MODEL = "veo-3.1-generate-preview";
const DEFAULT_ASPECT_RATIO = "16:9";
const DEFAULT_POLL_INTERVAL_MS = 10000;
const DEFAULT_MAX_POLLS = 30;

function ensureVeoVideoDir() {
  fs.mkdirSync(VEO_VIDEO_DIR, { recursive: true });
  return VEO_VIDEO_DIR;
}

function getVeoConfig() {
  const apiKey = process.env.GOOGLE_VEO_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const model = process.env.GOOGLE_VEO_MODEL || DEFAULT_VEO_MODEL;

  if (!apiKey) {
    throw new Error("GOOGLE_VEO_API_KEY is not set in backend/.env");
  }

  return { apiKey, model };
}

function normalizePrompt(prompt) {
  return String(prompt || "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildVideoHash({ title, prompt, model, aspectRatio }) {
  return crypto
    .createHash("sha1")
    .update(`${title}::${model}::${aspectRatio}::${prompt}`)
    .digest("hex")
    .slice(0, 16);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startVideoOperation({ prompt, model, aspectRatio, apiKey }) {
  const response = await fetch(`${GEMINI_API_BASE_URL}/models/${model}:predictLongRunning`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        aspectRatio,
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Veo request failed (${response.status})${data?.error?.message ? `: ${data.error.message}` : ""}`
    );
  }

  if (!data?.name) {
    throw new Error("Veo did not return an operation name");
  }

  return data.name;
}

async function pollVideoOperation({ operationName, apiKey }) {
  const response = await fetch(`${GEMINI_API_BASE_URL}/${operationName}`, {
    headers: {
      "x-goog-api-key": apiKey,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Veo operation polling failed (${response.status})${data?.error?.message ? `: ${data.error.message}` : ""}`
    );
  }

  return data;
}

function getGeneratedVideoUri(operation) {
  return (
    operation?.response?.generatedVideos?.[0]?.video?.uri ||
    operation?.response?.generated_videos?.[0]?.video?.uri ||
    operation?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
    ""
  );
}

async function downloadVideo({ videoUri, apiKey, filePath }) {
  const response = await fetch(videoUri, {
    headers: {
      "x-goog-api-key": apiKey,
    },
    redirect: "follow",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to download generated video (${response.status})${text ? `: ${text}` : ""}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, buffer);
}

async function generateVeoVideo({
  title = "lesson-video",
  prompt,
  backendUrl,
  aspectRatio = DEFAULT_ASPECT_RATIO,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxPolls = DEFAULT_MAX_POLLS,
}) {
  const normalizedPrompt = normalizePrompt(prompt);
  if (!normalizedPrompt) {
    throw new Error("Video prompt is required");
  }

  const { apiKey, model } = getVeoConfig();
  ensureVeoVideoDir();

  const hash = buildVideoHash({
    title,
    prompt: normalizedPrompt,
    model,
    aspectRatio,
  });

  const fileName = `${hash}.mp4`;
  const filePath = path.join(VEO_VIDEO_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    const operationName = await startVideoOperation({
      prompt: normalizedPrompt,
      model,
      aspectRatio,
      apiKey,
    });

    let operation = null;
    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      operation = await pollVideoOperation({ operationName, apiKey });
      if (operation?.done) break;
      await sleep(pollIntervalMs);
    }

    if (!operation?.done) {
      throw new Error("Veo video generation timed out before completion");
    }

    if (operation?.error?.message) {
      throw new Error(`Veo operation failed: ${operation.error.message}`);
    }

    const videoUri = getGeneratedVideoUri(operation);
    if (!videoUri) {
      throw new Error("Veo did not return a downloadable video URI");
    }

    await downloadVideo({ videoUri, apiKey, filePath });
  }

  return {
    fileName,
    filePath,
    url: `${backendUrl}/generated/veo-videos/${fileName}`,
  };
}

module.exports = {
  ensureVeoVideoDir,
  generateVeoVideo,
};
