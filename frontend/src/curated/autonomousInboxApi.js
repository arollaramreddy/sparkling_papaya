import { getApiBase } from "../apiBase";

const API = getApiBase();

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function getReplyPreferences(preferences = {}) {
  const reply = preferences.reply || {};
  return {
    length: reply.length || "short",
    tone: reply.tone || "supportive",
    interactivity: reply.interactivity || "balanced",
    emoji: Boolean(reply.emoji),
    includeNextSteps: reply.includeNextSteps !== false,
    includeCourseContext: reply.includeCourseContext !== false,
    signoffStyle: reply.signoffStyle || "simple",
  };
}

function classifyMessageIntent(message, runtimeState) {
  const text = `${String(message?.subject || "").toLowerCase()}\n${String(message?.last_message || "").toLowerCase()}`;
  const courseNames = (runtimeState?.canvas?.normalizedWorkspace?.courses || [])
    .map((course) => String(course.name || "").toLowerCase())
    .filter(Boolean);

  return {
    isCourseRelated:
      /(grade|score|assignment|homework|quiz|exam|module|discussion|course|canvas|deadline|points)/.test(
        text
      ) || courseNames.some((courseName) => text.includes(courseName)),
    needsReply: /(can you|could you|please|what|when|where|why|how|\?)/.test(text),
    asksForGrade: /(grade|score|points|mark)/.test(text),
    asksForAssignment: /(assignment|homework|quiz|exam|due)/.test(text),
  };
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .trim();
}

function deriveMessageCourseContext(message, runtimeState) {
  const courses = runtimeState?.canvas?.normalizedWorkspace?.courses || [];
  const assignments = runtimeState?.canvas?.normalizedWorkspace?.assignments || [];
  const normalizedMessage = normalizeName(
    `${message?.subject || ""}\n${message?.last_message || ""}`
  );
  const directCourseId = message?.course_id ? String(message.course_id) : "";
  if (directCourseId) {
    const directCourse = courses.find((course) => String(course.id) === directCourseId);
    if (directCourse) {
      return directCourse;
    }
  }

  const contextHints = [
    normalizeName(message?.context_name || ""),
    normalizeName(message?.context_code || ""),
  ].filter(Boolean);

  if (contextHints.length) {
    const contextMatches = courses.filter((course) => {
      const name = normalizeName(course.name || "");
      const code = normalizeName(course.code || "");
      return contextHints.some((hint) => hint === name || hint === code || (name && hint.includes(name)) || (code && hint.includes(code)));
    });

    if (contextMatches.length === 1) {
      return contextMatches[0];
    }
  }

  const explicitCourseMatches = courses.filter((course) => {
    const name = normalizeName(course.name || "");
    const code = normalizeName(course.code || "");
    return (name && normalizedMessage.includes(name)) || (code && normalizedMessage.includes(code));
  });

  if (explicitCourseMatches.length === 1) {
    return explicitCourseMatches[0];
  }

  const assignmentMatches = assignments.filter((assignment) => {
    const assignmentName = normalizeName(assignment.name || "");
    return assignmentName && normalizedMessage.includes(assignmentName);
  });

  const assignmentCourseIds = Array.from(
    new Set(assignmentMatches.map((assignment) => String(assignment.course_id || "")))
  ).filter(Boolean);

  if (assignmentCourseIds.length === 1) {
    return courses.find((course) => String(course.id) === assignmentCourseIds[0]) || null;
  }

  return null;
}

function messageMatchesUser(message, currentUserName) {
  const allowedSenders = ["ramreddy arolla"];
  if (message?.sent_by_current_user) {
    return false;
  }

  const senderName = normalizeName(message?.last_author_name || message?.author_name || "");
  if (senderName) {
    return allowedSenders.includes(senderName);
  }

  if (!currentUserName) return false;

  const normalizedUser = normalizeName(currentUserName);
  return Boolean(normalizedUser) && allowedSenders.includes(normalizedUser);
}

function buildFeed(runtimeState, preferences = {}, rawMessages = [], currentUserName = "") {
  const runtimeMessages = runtimeState?.canvas?.inboxState?.messages || [];
  const messageMap = new Map();
  [...runtimeMessages, ...rawMessages].forEach((message) => {
    if (!message?.id) return;
    messageMap.set(String(message.id), message);
  });
  const messages = Array.from(messageMap.values())
    .filter((message) => messageMatchesUser(message, currentUserName))
    .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
  const replyPreferences = getReplyPreferences(preferences);

  return messages.slice(0, 12).map((message) => {
    const intent = classifyMessageIntent(message, runtimeState);
    const matchedCourse = deriveMessageCourseContext(message, runtimeState);
    return {
      id: message.id,
      type: "message",
      title: message.subject || "Message",
      subtitle:
        matchedCourse?.name ||
        message.counterpart_name ||
        message.last_author_name ||
        "Inbox",
      createdAt: message.last_message_at || runtimeState?.meta?.generatedAt || null,
      status: intent.needsReply ? "draft_ready" : "watching",
      priority:
        intent.asksForGrade || intent.asksForAssignment
          ? "high"
          : intent.needsReply
            ? "normal"
            : "low",
      intent,
      matchedCourse,
      rawMessage: message,
      replyPreferences,
    };
  });
}

async function loadRuntimeState(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });

  const query = search.toString() ? `?${search.toString()}` : "";
  return fetchJson(`/langgraph/runtime-state${query}`, { headers: {} });
}

async function runAutonomousMonitor() {
  return fetchJson("/autonomous-monitor/run", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

async function loadPreferences() {
  const auth = await fetchJson("/auth/me", { headers: {} });
  return auth?.user ? auth.user : null;
}

async function savePreferences(preferences) {
  return fetchJson("/preferences", {
    method: "POST",
    body: JSON.stringify(preferences),
  });
}

async function loadMessages(limit = 20) {
  return fetchJson(`/messages?limit=${encodeURIComponent(limit)}`, {
    headers: {},
  });
}

async function loadStateEvents(limit = 40) {
  return fetchJson(`/state-events?limit=${encodeURIComponent(limit)}`, {
    headers: {},
  });
}

async function runAgenticWorkflow(payload) {
  return fetchJson("/agentic-workflow", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function runLocalPdfWorkflow(payload) {
  return fetchJson("/local-pdf-workflow", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function draftReply(messageId, extraContext = "") {
  return fetchJson(`/messages/${messageId}/draft-reply`, {
    method: "POST",
    body: JSON.stringify({ extraContext }),
  });
}

async function sendReply(messageId, body) {
  return fetchJson(`/messages/${messageId}/send-reply`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export {
  buildFeed,
  draftReply,
  loadPreferences,
  loadMessages,
  loadRuntimeState,
  loadStateEvents,
  messageMatchesUser,
  runAgenticWorkflow,
  runLocalPdfWorkflow,
  runAutonomousMonitor,
  savePreferences,
  sendReply,
};
