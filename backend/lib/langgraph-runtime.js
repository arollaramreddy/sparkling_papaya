const { FEATURE_CATALOG } = require("./db");
const {
  getLearningGaps,
  getRecentWorkflowRuns,
  getStoredPreferences,
} = require("./intelligence");
const { GLOBAL_INBOX_SCOPE, listRecentEvents, listWorkflowJobs } = require("./state-sync");

function listReviewSessions(db, userId, courseId = null, limit = 10) {
  if (!userId) return [];
  if (courseId) {
    return db
      .prepare(`
        SELECT title, scheduled_for, duration_minutes, goal, status, created_at
        FROM review_sessions
        WHERE user_id = ? AND course_id = ?
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(String(userId), String(courseId), limit);
  }

  return db
    .prepare(`
      SELECT title, scheduled_for, duration_minutes, goal, status, created_at
      FROM review_sessions
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(String(userId), limit);
}

function listAutonomousActions(db, userId, courseId = null, limit = 12) {
  if (!userId) return [];
  if (courseId) {
    return db
      .prepare(`
        SELECT action_type, title, detail, status, created_at
        FROM autonomous_actions
        WHERE user_id = ? AND course_id = ?
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(String(userId), String(courseId), limit);
  }

  return db
    .prepare(`
      SELECT action_type, title, detail, status, created_at
      FROM autonomous_actions
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(String(userId), limit);
}

function listRecentActivity(db, userId, limit = 20) {
  if (!userId) return [];
  return db
    .prepare(`
      SELECT event_type, path, entity_type, entity_id, payload_json, created_at
      FROM activity_events
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(String(userId), limit)
    .map((row) => ({
      ...row,
      payload: row.payload_json ? JSON.parse(row.payload_json) : {},
    }));
}

function buildCanvasSignals(courseState, selectedModule, selectedTopic) {
  if (!courseState) {
    return {
      dueSoon: [],
      lowScores: [],
      missingAssignments: [],
      newContentCandidates: [],
      discussionHotspots: [],
    };
  }

  const dueSoon = (courseState.assignments || [])
    .filter((assignment) => assignment.due_at && !assignment.is_completed)
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
    .slice(0, 6)
    .map((assignment) => ({
      id: assignment.id,
      name: assignment.name,
      due_at: assignment.due_at,
      points_possible: assignment.points_possible,
    }));

  const lowScores = (courseState.assignments || [])
    .filter(
      (assignment) =>
        assignment.score !== null &&
        assignment.score !== undefined &&
        assignment.points_possible
    )
    .map((assignment) => ({
      id: assignment.id,
      name: assignment.name,
      score: assignment.score,
      points_possible: assignment.points_possible,
      percent: Math.round((Number(assignment.score) / Number(assignment.points_possible)) * 100),
    }))
    .filter((assignment) => assignment.percent < 75)
    .slice(0, 8);

  const missingAssignments = (courseState.assignments || [])
    .filter((assignment) => assignment.missing)
    .slice(0, 8)
    .map((assignment) => ({
      id: assignment.id,
      name: assignment.name,
      due_at: assignment.due_at,
      points_possible: assignment.points_possible,
    }));

  const newContentCandidates = (selectedModule?.items || courseState.modules?.flatMap((module) => module.items || []) || [])
    .filter((item) => item.type === "File" || item.is_pdf)
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      display_name: item.display_name,
      type: item.type,
      is_pdf: Boolean(item.is_pdf),
    }));

  const discussionHotspots = (courseState.discussions || [])
    .filter((discussion) => Number(discussion.unread_count || 0) > 0)
    .sort((a, b) => Number(b.unread_count || 0) - Number(a.unread_count || 0))
    .slice(0, 8)
    .map((discussion) => ({
      id: discussion.id,
      title: discussion.title,
      unread_count: discussion.unread_count,
    }));

  return {
    dueSoon,
    lowScores,
    missingAssignments,
    newContentCandidates,
    discussionHotspots,
    selectedModule: selectedModule
      ? {
          id: selectedModule.id,
          name: selectedModule.name,
          items_count: selectedModule.items_count,
        }
      : null,
    selectedTopic: selectedTopic
      ? {
          id: selectedTopic.id,
          display_name: selectedTopic.display_name,
          type: selectedTopic.type,
          is_pdf: Boolean(selectedTopic.is_pdf),
        }
      : null,
  };
}

function buildQueueSignals(workflowJobs) {
  const queued = workflowJobs.filter((job) => job.status === "queued").length;
  const running = workflowJobs.filter((job) => job.status === "running").length;
  const failed = workflowJobs.filter((job) => job.status === "failed").length;
  const recentJobTypes = [...new Set(workflowJobs.slice(0, 8).map((job) => job.job_type))];

  return {
    queued,
    running,
    failed,
    recentJobTypes,
  };
}

function buildEventSignals(events) {
  const counts = events.reduce((acc, event) => {
    acc[event.event_type] = (acc[event.event_type] || 0) + 1;
    return acc;
  }, {});

  return {
    totalRecentEvents: events.length,
    eventTypeCounts: counts,
    dominantTriggers: Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([eventType, count]) => ({ eventType, count })),
  };
}

function buildAgentRegistry() {
  return {
    runtimeVersion: "2.0",
    extensionPoints: [
      "state_watchers",
      "event_classifiers",
      "autonomous_planners",
      "resource_generators",
      "video_agents",
      "intervention_agents",
      "message_agents",
      "assessment_agents",
    ],
    supportedTriggers: [
      "new_material_posted",
      "new_announcement_posted",
      "new_discussion_posted",
      "grade_released",
      "assignment_posted",
      "assignment_marked_missing",
      "new_message_received",
      "message_reply_received",
    ],
    productFeatures: FEATURE_CATALOG,
  };
}

function indexEntities(items, getId) {
  return Object.fromEntries(
    (items || [])
      .filter(Boolean)
      .map((item) => [String(getId(item)), item])
  );
}

function buildNormalizedWorkspace(allCourseStates, inboxState) {
  const courses = allCourseStates.map((courseState) => courseState.course);
  const modules = allCourseStates.flatMap((courseState) =>
    (courseState.modules || []).map((module) => ({
      ...module,
      course_id: courseState.course.id,
      course_name: courseState.course.name,
    }))
  );
  const moduleItems = modules.flatMap((module) =>
    (module.items || []).map((item) => ({
      ...item,
      module_id: module.id,
      module_name: module.name,
      course_id: module.course_id,
      course_name: module.course_name,
    }))
  );
  const assignments = allCourseStates.flatMap((courseState) =>
    (courseState.assignments || []).map((assignment) => ({
      ...assignment,
      course_id: courseState.course.id,
      course_name: courseState.course.name,
    }))
  );
  const discussions = allCourseStates.flatMap((courseState) =>
    (courseState.discussions || []).map((discussion) => ({
      ...discussion,
      course_id: courseState.course.id,
      course_name: courseState.course.name,
    }))
  );
  const announcements = allCourseStates.flatMap((courseState) =>
    (courseState.announcements || []).map((announcement) => ({
      ...announcement,
      course_id: courseState.course.id,
      course_name: courseState.course.name,
    }))
  );

  return {
    courses,
    modules,
    moduleItems,
    assignments,
    discussions,
    announcements,
    messages: inboxState.messages || [],
    byId: {
      courses: indexEntities(courses, (item) => item.id),
      modules: indexEntities(modules, (item) => item.id),
      moduleItems: indexEntities(moduleItems, (item) => item.id),
      assignments: indexEntities(assignments, (item) => item.id),
      discussions: indexEntities(discussions, (item) => item.id),
      announcements: indexEntities(announcements, (item) => item.id),
      messages: indexEntities(inboxState.messages || [], (item) => item.id),
    },
  };
}

async function buildLangGraphRuntimeState({
  db,
  request,
  accessToken,
  sessionId,
  userId,
  listActiveCanvasCourses,
  buildWorkspaceState,
  buildInboxState,
  ensureTopicText,
  computeInterventionScore,
}) {
  const courseId = request.courseId || null;
  const storedPreferences = getStoredPreferences(db, userId);
  const preferences = {
    ...storedPreferences,
    ...(request.preferences || {}),
  };

  const [activeCourses, inboxState] = await Promise.all([
    listActiveCanvasCourses(accessToken).catch(() => []),
    buildInboxState(accessToken).catch(() => ({ syncedAt: new Date().toISOString(), messages: [] })),
  ]);
  const workspaceCourses = courseId
    ? [{ id: String(courseId) }, ...activeCourses.filter((course) => String(course.id) !== String(courseId))]
    : activeCourses;
  const limitedCourses = workspaceCourses.slice(0, 8);
  const allCourseStates = await Promise.all(
    limitedCourses.map((course) => buildWorkspaceState(course.id, accessToken).catch(() => null))
  ).then((states) => states.filter(Boolean));
  const courseState =
    allCourseStates.find((state) => String(state.course.id) === String(courseId)) ||
    allCourseStates[0] ||
    null;

  const selectedModule =
    courseState && request.moduleId
      ? (courseState.modules || []).find((module) => String(module.id) === String(request.moduleId)) || null
      : null;
  const selectedTopic =
    selectedModule && request.topicId
      ? (selectedModule.items || []).find((item) => String(item.id) === String(request.topicId)) || null
      : null;
  const topicText =
    courseState && selectedTopic
      ? await ensureTopicText(courseId, selectedTopic, accessToken).catch(() => "")
      : "";

  const courseEvents = userId ? listRecentEvents(db, userId, courseId, 25) : [];
  const globalEvents = userId ? listRecentEvents(db, userId, null, 25) : [];
  const workflowJobs = userId ? listWorkflowJobs(db, userId, courseId, 25) : [];
  const globalWorkflowJobs = userId ? listWorkflowJobs(db, userId, null, 25) : [];
  const learningGaps = getLearningGaps(db, userId, courseId, 12);
  const recentWorkflows = getRecentWorkflowRuns(db, userId, courseId, 10);
  const reviewSessions = listReviewSessions(db, userId, courseId, 10);
  const autonomousActions = listAutonomousActions(db, userId, courseId, 12);
  const recentActivity = listRecentActivity(db, userId, 20);
  const intervention =
    courseState && userId
      ? computeInterventionScore({
          db,
          userId,
          courseId,
          canvasState: courseState,
        })
      : null;

  const canvasSignals = buildCanvasSignals(courseState, selectedModule, selectedTopic);
  const normalizedWorkspace = buildNormalizedWorkspace(allCourseStates, inboxState);

  const runtimeState = {
    meta: {
      generatedAt: new Date().toISOString(),
      runtimeVersion: "2.0",
      source: "langgraph_agent_runtime",
      sessionId: sessionId || null,
      userId: userId || null,
    },
    request: {
      courseId,
      moduleId: request.moduleId || null,
      topicId: request.topicId || null,
      workflowType: request.workflowType || "course_brief",
      preferences,
    },
    canvas: {
      activeCourses,
      allCourseStates,
      normalizedWorkspace,
      courseState,
      inboxState,
      selectedModule,
      selectedTopic,
      topicText,
      signals: canvasSignals,
    },
    memory: {
      storedPreferences,
      preferences,
      learningGaps,
      recentWorkflows,
      reviewSessions,
      autonomousActions,
    },
    telemetry: {
      recentActivity,
      courseEvents,
      globalEvents: globalEvents.filter(
        (event) => String(event.course_id || event.courseId || event.entity_id || "") === GLOBAL_INBOX_SCOPE
      ),
      workflowJobs,
      globalWorkflowJobs,
      queueSignals: buildQueueSignals(workflowJobs),
      eventSignals: buildEventSignals(courseEvents),
    },
    intelligence: {
      intervention,
      supportNetwork: intervention?.autonomousSupportNetwork || null,
      recommendations: intervention?.recommendations || [],
      performance: intervention?.performance || null,
      metrics: intervention?.metrics || null,
    },
    agentRegistry: buildAgentRegistry(),
    llmContext: {
        course: courseState
        ? {
            id: courseState.course.id,
            name: courseState.course.name,
            code: courseState.course.code,
            stats: courseState.stats,
          }
        : null,
      workspaceSummary: {
        activeCourses: activeCourses.length,
        loadedCourseStates: allCourseStates.length,
        modules: normalizedWorkspace.modules.length,
        moduleItems: normalizedWorkspace.moduleItems.length,
        assignments: normalizedWorkspace.assignments.length,
        discussions: normalizedWorkspace.discussions.length,
        announcements: normalizedWorkspace.announcements.length,
        messages: normalizedWorkspace.messages.length,
      },
      selectedModule: selectedModule
        ? {
            id: selectedModule.id,
            name: selectedModule.name,
            items_count: selectedModule.items_count,
          }
        : null,
      selectedTopic: selectedTopic
        ? {
            id: selectedTopic.id,
            display_name: selectedTopic.display_name,
            type: selectedTopic.type,
            is_pdf: Boolean(selectedTopic.is_pdf),
          }
        : null,
      dueSoon: canvasSignals.dueSoon,
      lowScores: canvasSignals.lowScores,
      missingAssignments: canvasSignals.missingAssignments,
      discussionHotspots: canvasSignals.discussionHotspots,
      recentStateEvents: courseEvents.slice(0, 10),
      queuedJobs: workflowJobs.slice(0, 10).map((job) => ({
        job_type: job.job_type,
        priority: job.priority,
        status: job.status,
      })),
      learningGaps: learningGaps.slice(0, 8),
      recommendations: intervention?.recommendations || [],
      topicTextExcerpt: topicText ? topicText.slice(0, 18000) : "",
    },
  };

  return runtimeState;
}

module.exports = {
  buildLangGraphRuntimeState,
};
