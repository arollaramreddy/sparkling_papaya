import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildFeed,
  draftReply,
  loadMessages,
  loadRuntimeState,
  loadStateEvents,
  runAgenticWorkflow,
  runLocalPdfWorkflow,
  runAutonomousMonitor,
  savePreferences,
  sendReply,
} from "./autonomousInboxApi";
import { DEFAULT_PREFERENCES } from "./AutonomousAgentsWorkingView";

const EMPTY_PARAMS = {};

function isHiddenSessionError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("no authenticated session") ||
    message.includes("login in the main app first") ||
    message.includes("failed to check session")
  );
}

function setNestedValue(object, path, value) {
  const keys = path.split(".");
  const result = { ...object };
  let pointer = result;

  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    pointer[key] = { ...(pointer[key] || {}) };
    pointer = pointer[key];
  }

  pointer[keys[keys.length - 1]] = value;
  return result;
}

function resolveMaterialContext(runtimeState, event) {
  const workspace = runtimeState?.canvas?.normalizedWorkspace;
  const courseId = String(event?.course_id || "");
  const detail = event?.detail || {};
  const moduleId = String(detail.moduleId || "");
  const course = workspace?.byId?.courses?.[courseId] || null;
  const module = workspace?.byId?.modules?.[moduleId] || null;
  const moduleItems = workspace?.moduleItems || [];
  const item =
    moduleItems.find((entry) => String(entry.id) === String(event?.entity_id || "")) ||
    moduleItems.find((entry) => String(entry.content_id || "") === String(event?.entity_id || "")) ||
    moduleItems.find(
      (entry) =>
        String(entry.module_id || "") === moduleId &&
        String(entry.display_name || "").trim() === String(event?.title || "").trim()
    ) ||
    null;

  return {
    eventId: event?.id,
    eventType: event?.event_type,
    courseId,
    courseName: course?.name || `Course ${courseId}`,
    moduleId: moduleId || item?.module_id || "",
    moduleName: module?.name || detail.moduleName || item?.module_name || "Module",
    topicId: item?.id ? String(item.id) : null,
    fileName: item?.display_name || event?.title || "New material",
    entityId: event?.entity_id || null,
    createdAt: event?.created_at || null,
    subtitle:
      event?.event_type === "new_module_posted"
        ? "Professor posted a new module"
        : "Professor posted new course material",
  };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read local PDF"));
    reader.readAsDataURL(file);
  });
}

export default function useAutonomousInboxFeed(initialParams, currentUserName = "") {
  const stableParams = initialParams || EMPTY_PARAMS;
  const [runtimeState, setRuntimeState] = useState(null);
  const [rawMessages, setRawMessages] = useState([]);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [stateEvents, setStateEvents] = useState([]);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [materialWorkflow, setMaterialWorkflow] = useState(null);
  const [localMaterialCards, setLocalMaterialCards] = useState([]);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [draftingMessageId, setDraftingMessageId] = useState(null);
  const [sendingMessageId, setSendingMessageId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [clarificationInputs, setClarificationInputs] = useState({});
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [runtimeResult, messagesResult] = await Promise.allSettled([
        loadRuntimeState(stableParams),
        loadMessages(20),
      ]);
      const eventsResult = await loadStateEvents(40).catch(() => []);

      if (messagesResult.status === "fulfilled") {
        setRawMessages(messagesResult.value || []);
      } else {
        setRawMessages([]);
      }

      if (runtimeResult.status === "fulfilled") {
        setRuntimeState(runtimeResult.value);
      } else {
        setRuntimeState(null);
        if (messagesResult.status !== "fulfilled") {
          throw runtimeResult.reason;
        }
        if (!isHiddenSessionError(runtimeResult.reason)) {
          setError(runtimeResult.reason?.message || "Runtime state unavailable, showing raw inbox only");
        }
      }
      setStateEvents(eventsResult || []);
    } catch (err) {
      if (!isHiddenSessionError(err)) {
        setError(err.message || "Failed to load autonomous inbox state");
      } else {
        setError("");
      }
    } finally {
      setLoading(false);
    }
  }, [stableParams]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    setError("");
    try {
      await runAutonomousMonitor();
      const [runtimeResult, messagesResult] = await Promise.allSettled([
        loadRuntimeState(stableParams),
        loadMessages(20),
      ]);
      const eventsResult = await loadStateEvents(40).catch(() => []);

      if (messagesResult.status === "fulfilled") {
        setRawMessages(messagesResult.value || []);
      } else {
        setRawMessages([]);
      }

      if (runtimeResult.status === "fulfilled") {
        setRuntimeState(runtimeResult.value);
      } else {
        setRuntimeState(null);
        if (messagesResult.status !== "fulfilled") {
          throw runtimeResult.reason;
        }
        if (!isHiddenSessionError(runtimeResult.reason)) {
          setError(runtimeResult.reason?.message || "Runtime state unavailable, showing raw inbox only");
        }
      }
      setStateEvents(eventsResult || []);
    } catch (err) {
      if (!isHiddenSessionError(err)) {
        setError(err.message || "Failed to sync autonomous inbox state");
      } else {
        setError("");
      }
    } finally {
      setSyncing(false);
    }
  }, [stableParams]);

  const onPreferenceChange = useCallback(async (path, value) => {
    const next = setNestedValue(preferences, path, value);
    setPreferences(next);
    try {
      await savePreferences(next);
    } catch (err) {
      setError(err.message || "Failed to save preferences");
    }
  }, [preferences]);

  const onDraftReply = useCallback(async (item) => {
    if (!item?.id) return;
    setDraftingMessageId(item.id);
    setError("");
    try {
      const result = await draftReply(item.id, clarificationInputs[item.id] || "");
      setDrafts((current) => ({
        ...current,
        [item.id]: {
          draft: result.draft || "",
          requiresClarification: Boolean(result.requiresClarification),
          clarificationQuestion: result.clarificationQuestion || "",
          missingContext: result.missingContext || [],
          summary: result.summary || "",
        },
      }));
    } catch (err) {
      setError(err.message || "Failed to draft reply");
    } finally {
      setDraftingMessageId(null);
    }
  }, [clarificationInputs]);

  const onClarificationChange = useCallback((messageId, value) => {
    setClarificationInputs((current) => ({
      ...current,
      [messageId]: value,
    }));
  }, []);

  const onSendReply = useCallback(async (item) => {
    if (!item?.id) return;
    setSendingMessageId(item.id);
    setError("");
    let draftState = drafts[item.id];
    let draft = draftState?.draft || "";
    if (!draft) {
      try {
        const result = await draftReply(item.id, clarificationInputs[item.id] || "");
        draft = result.draft || "";
        setDrafts((current) => ({
          ...current,
          [item.id]: {
            draft,
            requiresClarification: Boolean(result.requiresClarification),
            clarificationQuestion: result.clarificationQuestion || "",
            missingContext: result.missingContext || [],
            summary: result.summary || "",
          },
        }));
        if (result.requiresClarification || !draft) {
          setError(result.clarificationQuestion || "The agent needs more context before sending.");
          setSendingMessageId(null);
          return;
        }
      } catch (err) {
        setError(err.message || "Failed to draft reply before sending");
        setSendingMessageId(null);
        return;
      }
    }

    try {
      await sendReply(item.id, draft);
      await syncNow();
    } catch (err) {
      setError(err.message || "Failed to send reply");
    } finally {
      setSendingMessageId(null);
    }
  }, [clarificationInputs, drafts, syncNow]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const feed = useMemo(
    () => buildFeed(runtimeState, preferences, rawMessages, currentUserName),
    [runtimeState, preferences, rawMessages, currentUserName]
  );

  const materialCards = useMemo(
    () =>
      [
        ...localMaterialCards,
        ...(stateEvents || [])
          .filter(
            (event) =>
              event?.event_type === "new_material_posted" || event?.event_type === "new_module_posted"
          )
          .map((event) => resolveMaterialContext(runtimeState, event))
          .filter((item) => item.courseId),
      ],
    [localMaterialCards, runtimeState, stateEvents]
  );

  const onOpenMaterial = useCallback(
    async (item) => {
      if (!item?.courseId) return;
      setSelectedMaterial(item);
      setMaterialWorkflow(null);
      setMaterialLoading(true);
      setError("");
      try {
        const workflow = await runAgenticWorkflow({
          courseId: item.courseId,
          moduleId: item.moduleId || null,
          topicId: item.topicId || null,
          workflowType: item.topicId ? "topic_deep_dive" : "module_mastery",
          preferences,
        });
        setMaterialWorkflow(workflow);
      } catch (err) {
        setError(err.message || "Failed to generate learning material");
      } finally {
        setMaterialLoading(false);
      }
    },
    [preferences]
  );

  const onTestLocalPdf = useCallback(
    async ({ file, courseId }) => {
      if (!file || !courseId) return;
      setSelectedMaterial(null);
      setMaterialWorkflow(null);
      setMaterialLoading(true);
      setError("");

      try {
        const fileData = await fileToBase64(file);
        const workflow = await runLocalPdfWorkflow({
          courseId,
          fileName: file.name,
          fileData,
          workflowType: "topic_deep_dive",
          preferences,
        });

        const testMaterial = {
          eventId: workflow.runId,
          eventType: "local_pdf_uploaded",
          courseId: workflow.testMaterial?.courseId || String(courseId),
          courseName: workflow.testMaterial?.courseName || `Course ${courseId}`,
          moduleId: workflow.testMaterial?.moduleId || "local-upload-tests",
          moduleName: workflow.testMaterial?.moduleName || "Local PDF Test Uploads",
          topicId: workflow.topicId || workflow.testMaterial?.id || null,
          fileName: workflow.testMaterial?.fileName || file.name,
          entityId: workflow.testMaterial?.id || workflow.topicId || null,
          createdAt: workflow.testMaterial?.createdAt || new Date().toISOString(),
          subtitle: workflow.testMaterial?.subtitle || "Local PDF uploaded for autonomous testing",
          source: "local_upload_test",
        };

        setLocalMaterialCards((current) => [
          testMaterial,
          ...current.filter((item) => String(item.entityId) !== String(testMaterial.entityId)),
        ]);
        setSelectedMaterial(testMaterial);
        setMaterialWorkflow(workflow);
      } catch (err) {
        setError(err.message || "Failed to run local PDF test");
      } finally {
        setMaterialLoading(false);
      }
    },
    [preferences]
  );

  return {
    drafts,
    error,
    feed,
    loading,
    materialCards,
    materialLoading,
    materialWorkflow,
    draftingMessageId,
    clarificationInputs,
    onOpenMaterial,
    onClarificationChange,
    onDraftReply,
    onPreferenceChange,
    onSendReply,
    onTestLocalPdf,
    preferences,
    rawMessages,
    refresh,
    runtimeState,
    selectedMaterial,
    sendingMessageId,
    syncNow,
    syncing,
  };
}
