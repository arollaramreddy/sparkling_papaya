const express = require("express");
const cors = require("cors");
const pdf = require("pdf-parse");
const Anthropic = require("@anthropic-ai/sdk").default;
require("dotenv").config();

const app = express();
const PORT = 3001;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

const CANVAS_TOKEN = process.env.CANVAS_TOKEN;
const CANVAS_BASE_URL =
  process.env.CANVAS_BASE_URL || "https://canvas.asu.edu/api/v1";

// Anthropic client (lazy – only created when needed)
let anthropic = null;
function getAnthropic() {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "your_anthropic_api_key_here") {
      throw new Error("ANTHROPIC_API_KEY is not set in .env file");
    }
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

// ── Canvas API helpers ────────────────────────────────────

// Single-page Canvas request
async function canvasRequest(path) {
  const url = `${CANVAS_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CANVAS_TOKEN}` },
  });

  if (!res.ok) {
    const text = await res.text();
    const error = new Error(`Canvas API error (${res.status})`);
    error.status = res.status;
    error.detail = text;
    throw error;
  }

  return res.json();
}

// Paginated Canvas request – follows Link: <...>; rel="next"
async function canvasRequestAll(path, maxPages = 10) {
  let url = `${CANVAS_BASE_URL}${path}`;
  let all = [];

  for (let page = 0; page < maxPages; page++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${CANVAS_TOKEN}` },
    });

    if (!res.ok) {
      const text = await res.text();
      const error = new Error(`Canvas API error (${res.status})`);
      error.status = res.status;
      error.detail = text;
      throw error;
    }

    const data = await res.json();
    all = all.concat(data);

    // Check for next page in Link header
    const link = res.headers.get("link");
    if (!link) break;

    const next = link.split(",").find((s) => s.includes('rel="next"'));
    if (!next) break;

    const match = next.match(/<([^>]+)>/);
    if (!match) break;

    url = match[1]; // absolute URL from Canvas
  }

  return all;
}

// Download a file from Canvas (follows redirects, returns Buffer)
async function downloadCanvasFile(fileUrl) {
  const res = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${CANVAS_TOKEN}` },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Failed to download file (${res.status})`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// In-memory cache for extracted PDF text (fileId -> text)
const textCache = new Map();

// ── Existing Endpoints ────────────────────────────────────

// 1. Test login – verify token by fetching current user
app.get("/api/test-login", async (req, res) => {
  if (!CANVAS_TOKEN) {
    return res
      .status(500)
      .json({ error: "CANVAS_TOKEN is not set in .env file" });
  }

  try {
    const user = await canvasRequest("/users/self");
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.primary_email || user.login_id || "N/A",
        avatar_url: user.avatar_url,
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error:
        err.status === 401
          ? "Invalid or expired Canvas token"
          : `Canvas API error: ${err.message}`,
    });
  }
});

// 2. List courses
app.get("/api/courses", async (req, res) => {
  try {
    const courses = await canvasRequestAll(
      "/courses?per_page=50&enrollment_state=active"
    );
    res.json(
      courses.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.course_code,
        enrollment_term_id: c.enrollment_term_id,
      }))
    );
  } catch (err) {
    res
      .status(err.status || 500)
      .json({ error: `Failed to fetch courses: ${err.message}` });
  }
});

// 3. Assignments for a course
app.get("/api/courses/:courseId/assignments", async (req, res) => {
  try {
    const assignments = await canvasRequestAll(
      `/courses/${req.params.courseId}/assignments?per_page=50&order_by=due_at`
    );
    res.json(
      assignments.map((a) => ({
        id: a.id,
        name: a.name,
        due_at: a.due_at,
        points_possible: a.points_possible,
        html_url: a.html_url,
      }))
    );
  } catch (err) {
    res
      .status(err.status || 500)
      .json({ error: `Failed to fetch assignments: ${err.message}` });
  }
});

// 4. Files for a course
app.get("/api/courses/:courseId/files", async (req, res) => {
  try {
    const files = await canvasRequest(
      `/courses/${req.params.courseId}/files?per_page=20`
    );
    res.json(
      files.map((f) => ({
        id: f.id,
        display_name: f.display_name,
        size: f.size,
        url: f.url,
        created_at: f.created_at,
      }))
    );
  } catch (err) {
    res
      .status(err.status || 500)
      .json({ error: `Failed to fetch files: ${err.message}` });
  }
});

// ── New Endpoints: Modules & AI ───────────────────────────

// 5. List modules for a course (with item count)
app.get("/api/modules", async (req, res) => {
  const { courseId } = req.query;
  if (!courseId) return res.status(400).json({ error: "courseId is required" });

  try {
    const modules = await canvasRequestAll(
      `/courses/${courseId}/modules?per_page=50&include[]=items_count`
    );
    res.json(
      modules.map((m) => ({
        id: m.id,
        name: m.name,
        position: m.position,
        items_count: m.items_count,
        state: m.state,
      }))
    );
  } catch (err) {
    res
      .status(err.status || 500)
      .json({ error: `Failed to fetch modules: ${err.message}` });
  }
});

// 6. List files inside a module (professor-uploaded files only)
app.get("/api/module-files", async (req, res) => {
  const { courseId, moduleId } = req.query;
  if (!courseId || !moduleId) {
    return res.status(400).json({ error: "courseId and moduleId are required" });
  }

  try {
    const items = await canvasRequestAll(
      `/courses/${courseId}/modules/${moduleId}/items?per_page=100`
    );

    // Filter to only File and ExternalUrl types (professor uploads)
    // Ignore: Assignment, Discussion, Quiz, SubHeader, Page (student-facing)
    const fileItems = items.filter(
      (item) => item.type === "File" || item.type === "ExternalUrl"
    );

    // For File items, fetch file metadata to get URL and content type
    const enriched = await Promise.all(
      fileItems.map(async (item) => {
        if (item.type === "File" && item.content_id) {
          try {
            const file = await canvasRequest(
              `/courses/${courseId}/files/${item.content_id}`
            );
            return {
              id: file.id,
              module_item_id: item.id,
              display_name: file.display_name,
              filename: file.filename,
              size: file.size,
              content_type: file.content_type || "",
              url: file.url,
              created_at: file.created_at,
              type: "File",
              is_pdf:
                (file.content_type || "").includes("pdf") ||
                (file.filename || "").toLowerCase().endsWith(".pdf"),
            };
          } catch {
            return {
              id: item.content_id,
              module_item_id: item.id,
              display_name: item.title,
              type: "File",
              is_pdf: (item.title || "").toLowerCase().endsWith(".pdf"),
              error: "Could not fetch file details",
            };
          }
        }

        // External URL
        return {
          id: item.id,
          module_item_id: item.id,
          display_name: item.title,
          external_url: item.external_url,
          type: "ExternalUrl",
          is_pdf: false,
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({ error: `Failed to fetch module files: ${err.message}` });
  }
});

// 7. Extract text from a PDF file
app.get("/api/file-text", async (req, res) => {
  const { fileId, courseId } = req.query;
  if (!fileId || !courseId) {
    return res.status(400).json({ error: "fileId and courseId are required" });
  }

  // Return cached text if available
  if (textCache.has(fileId)) {
    return res.json({ fileId, text: textCache.get(fileId), cached: true });
  }

  try {
    // Get file metadata (includes download URL)
    const file = await canvasRequest(`/courses/${courseId}/files/${fileId}`);

    if (!file.url) {
      return res.status(404).json({ error: "File has no download URL" });
    }

    const isPdf =
      (file.content_type || "").includes("pdf") ||
      (file.filename || "").toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return res
        .status(400)
        .json({ error: "Only PDF files can be extracted" });
    }

    // Download the PDF
    const buffer = await downloadCanvasFile(file.url);

    // Extract text
    let text = "";
    try {
      const pdfData = await pdf(buffer);
      text = pdfData.text || "";
    } catch (pdfErr) {
      return res.json({
        fileId,
        text: "",
        warning: "Could not extract text – the PDF may be scanned/image-based",
      });
    }

    if (!text.trim()) {
      return res.json({
        fileId,
        text: "",
        warning: "PDF appears to be empty or scanned (no extractable text)",
      });
    }

    // Cache the extracted text
    textCache.set(fileId, text);

    res.json({
      fileId,
      text,
      pages: text.split(/\f/).length, // form-feed page breaks
      chars: text.length,
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({ error: `Failed to extract text: ${err.message}` });
  }
});

// 8. Summarize a single file
app.post("/api/summarize-file", async (req, res) => {
  const { fileId, courseId, fileName } = req.body;
  if (!fileId || !courseId) {
    return res.status(400).json({ error: "fileId and courseId are required" });
  }

  try {
    // Get the text (from cache or extract)
    let text = textCache.get(String(fileId));
    if (!text) {
      const file = await canvasRequest(`/courses/${courseId}/files/${fileId}`);
      if (!file.url) return res.status(404).json({ error: "No download URL" });

      const buffer = await downloadCanvasFile(file.url);
      const pdfData = await pdf(buffer);
      text = pdfData.text || "";
      if (text) textCache.set(String(fileId), text);
    }

    if (!text || !text.trim()) {
      return res.json({
        fileId,
        summary: "No extractable text found in this PDF.",
      });
    }

    // Truncate very long texts to ~30k chars to stay within context limits
    const truncated = text.length > 30000 ? text.slice(0, 30000) + "\n\n[... truncated]" : text;

    const ai = getAnthropic();
    const message = await ai.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `You are a study assistant. Summarize the following course material from "${fileName || "a PDF"}".

Provide:
1. **Summary** (2-4 sentences)
2. **Key Points** (bullet list, max 8)
3. **Important Definitions** (if any)
4. **Likely Exam Topics** (bullet list, max 5)
5. **Quick Study Notes** (2-3 short takeaways)

Be concise and student-friendly. Use markdown formatting.

---
${truncated}`,
        },
      ],
    });

    const summary = message.content[0]?.text || "No summary generated.";

    res.json({ fileId, fileName, summary });
  } catch (err) {
    res
      .status(500)
      .json({ error: `Summarization failed: ${err.message}` });
  }
});

// 9. Summarize all PDFs in a module
app.post("/api/summarize-module", async (req, res) => {
  const { courseId, moduleId, moduleName } = req.body;
  if (!courseId || !moduleId) {
    return res
      .status(400)
      .json({ error: "courseId and moduleId are required" });
  }

  try {
    // Fetch module items
    const items = await canvasRequestAll(
      `/courses/${courseId}/modules/${moduleId}/items?per_page=100`
    );

    const fileItems = items.filter((item) => item.type === "File" && item.content_id);

    // Collect text from all PDFs in this module
    const texts = [];
    for (const item of fileItems) {
      try {
        const cached = textCache.get(String(item.content_id));
        if (cached) {
          texts.push({ name: item.title, text: cached });
          continue;
        }

        const file = await canvasRequest(
          `/courses/${courseId}/files/${item.content_id}`
        );
        const isPdf =
          (file.content_type || "").includes("pdf") ||
          (file.filename || "").toLowerCase().endsWith(".pdf");

        if (!isPdf || !file.url) continue;

        const buffer = await downloadCanvasFile(file.url);
        const pdfData = await pdf(buffer);
        const text = pdfData.text || "";
        if (text) {
          textCache.set(String(item.content_id), text);
          texts.push({ name: item.title, text });
        }
      } catch {
        // Skip files that can't be processed
      }
    }

    if (texts.length === 0) {
      return res.json({
        moduleId,
        moduleName,
        summary: "No extractable PDF content found in this module.",
        fileCount: 0,
      });
    }

    // Combine texts with file headers, truncate to ~40k chars total
    let combined = texts
      .map((t) => `--- ${t.name} ---\n${t.text}`)
      .join("\n\n");
    if (combined.length > 40000) {
      combined = combined.slice(0, 40000) + "\n\n[... truncated]";
    }

    const ai = getAnthropic();
    const message = await ai.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are a study assistant. Summarize the following course module "${moduleName || "Module"}".
It contains ${texts.length} PDF file(s).

Provide:
1. **Module Overview** (3-5 sentences covering all files)
2. **Key Concepts** (bullet list, max 10)
3. **Important Definitions** (if any)
4. **Likely Exam Topics** (bullet list, max 7)
5. **Study Notes** (key takeaways for exam prep)
6. **Per-File Summaries** (one short paragraph per file)

Be concise and student-friendly. Use markdown formatting.

---
${combined}`,
        },
      ],
    });

    const summary = message.content[0]?.text || "No summary generated.";

    res.json({
      moduleId,
      moduleName,
      summary,
      fileCount: texts.length,
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: `Module summarization failed: ${err.message}` });
  }
});

// ── Start ──────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Backend running → http://localhost:${PORT}`);
  console.log(
    `Canvas token: ${CANVAS_TOKEN ? "loaded" : "MISSING – set CANVAS_TOKEN in .env"}`
  );
  console.log(
    `Anthropic key: ${process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "your_anthropic_api_key_here" ? "loaded" : "MISSING – set ANTHROPIC_API_KEY in .env for AI summaries"}`
  );
});
