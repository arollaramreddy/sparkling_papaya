const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const GENERATED_ROOT = path.join(__dirname, "..", "generated");
const LESSON_VIDEO_DIR = path.join(GENERATED_ROOT, "lesson-videos");

function ensureLessonVideoDir() {
  fs.mkdirSync(LESSON_VIDEO_DIR, { recursive: true });
  return LESSON_VIDEO_DIR;
}

function getRendererModules() {
  const bundler = require(path.join(
    __dirname,
    "..",
    "..",
    "frontend",
    "node_modules",
    "@remotion",
    "bundler"
  ));
  const renderer = require(path.join(
    __dirname,
    "..",
    "..",
    "frontend",
    "node_modules",
    "@remotion",
    "renderer"
  ));

  return { bundler, renderer };
}

function buildLessonHash({ title, lesson }) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify({ title, lesson }))
    .digest("hex")
    .slice(0, 16);
}

async function renderLessonVideo({ title = "lesson-video", lesson, backendUrl }) {
  if (!lesson?.slides?.length) {
    throw new Error("A lesson with slides is required to render a video");
  }

  ensureLessonVideoDir();

  const { bundler, renderer } = getRendererModules();
  const hash = buildLessonHash({ title, lesson });
  const fileName = `${hash}.mp4`;
  const outputLocation = path.join(LESSON_VIDEO_DIR, fileName);

  if (!fs.existsSync(outputLocation)) {
    const entryPoint = path.join(
      __dirname,
      "..",
      "..",
      "frontend",
      "src",
      "remotion",
      "index.jsx"
    );

    const serveUrl = await bundler.bundle({
      entryPoint,
      webpackOverride: (config) => config,
    });

    const compositions = await renderer.getCompositions(serveUrl, {
      inputProps: { lesson },
    });

    const composition = renderer.selectComposition({
      id: "LessonVideo",
      compositions,
      inputProps: { lesson },
    });

    const browserExecutable = await renderer.ensureBrowser();

    await renderer.renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation,
      inputProps: { lesson },
      chromiumOptions: {
        browserExecutable,
      },
    });
  }

  return {
    fileName,
    filePath: outputLocation,
    url: `${backendUrl}/generated/lesson-videos/${fileName}`,
  };
}

module.exports = {
  ensureLessonVideoDir,
  renderLessonVideo,
};
