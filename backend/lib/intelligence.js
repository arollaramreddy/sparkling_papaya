function parseJson(text, fallback = null) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getStoredPreferences(db, userId) {
  if (!userId) return {};
  const row = db
    .prepare("SELECT preferences_json FROM preferences WHERE user_id = ?")
    .get(String(userId));
  return parseJson(row?.preferences_json, {}) || {};
}

function getLearningGaps(db, userId, courseId = null, limit = 20) {
  if (!userId) return [];
  if (courseId) {
    return db
      .prepare(`
        SELECT gap_title, severity, evidence, recommendation, created_at
        FROM learning_gaps
        WHERE user_id = ? AND course_id = ?
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(String(userId), String(courseId), limit);
  }

  return db
    .prepare(`
      SELECT gap_title, severity, evidence, recommendation, created_at
      FROM learning_gaps
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(String(userId), limit);
}

function getRecentWorkflowRuns(db, userId, courseId = null, limit = 10) {
  if (!userId) return [];
  if (courseId) {
    return db
      .prepare(`
        SELECT id, workflow_type, status, summary, created_at
        FROM workflow_runs
        WHERE user_id = ? AND course_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(String(userId), String(courseId), limit);
  }

  return db
    .prepare(`
      SELECT id, workflow_type, status, summary, created_at
      FROM workflow_runs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(String(userId), limit);
}

function getRecentEvents(db, userId, courseId = null, limit = 40) {
  if (!userId) return [];
  if (courseId) {
    return db
      .prepare(`
        SELECT event_type, path, entity_type, entity_id, payload_json, created_at
        FROM activity_events
        WHERE user_id = ?
          AND (
            entity_id = ?
            OR json_extract(payload_json, '$.courseId') = ?
            OR json_extract(payload_json, '$.entityId') = ?
          )
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(String(userId), String(courseId), String(courseId), String(courseId), limit);
  }

  return db
    .prepare(`
      SELECT event_type, path, entity_type, entity_id, payload_json, created_at
      FROM activity_events
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(String(userId), limit);
}

function getAssignmentsFromCanvasState(canvasState) {
  const assignments = Array.isArray(canvasState?.assignments) ? canvasState.assignments : [];
  return assignments
    .map((assignment) => ({
      id: assignment.id ? String(assignment.id) : null,
      name: assignment.name || "Assignment",
      due_at: assignment.due_at || null,
      points_possible: assignment.points_possible ?? null,
      score: assignment.score ?? null,
      grade: assignment.grade ?? null,
      submitted_at: assignment.submitted_at || null,
      missing: Boolean(assignment.missing),
      submission_status: assignment.submission_status || null,
    }))
    .sort((a, b) => new Date(a.due_at || 0) - new Date(b.due_at || 0));
}

function getPerformanceSignals(assignments) {
  const graded = assignments.filter(
    (assignment) =>
      assignment.points_possible &&
      assignment.points_possible > 0 &&
      assignment.score !== null &&
      assignment.score !== undefined
  );
  const normalized = graded
    .map((assignment) => ({
      ...assignment,
      percent: clamp((Number(assignment.score) / Number(assignment.points_possible)) * 100, 0, 100),
    }))
    .sort((a, b) => new Date(a.due_at || 0) - new Date(b.due_at || 0));

  const lowScores = normalized.filter((assignment) => assignment.percent < 70);
  const moderateScores = normalized.filter((assignment) => assignment.percent >= 70 && assignment.percent < 80);
  const missingAssignments = assignments.filter((assignment) => assignment.missing);
  const latestThree = normalized.slice(-3);
  const earliestThree = normalized.slice(0, 3);
  const recentAverage = latestThree.length
    ? latestThree.reduce((sum, assignment) => sum + assignment.percent, 0) / latestThree.length
    : null;
  const baselineAverage = earliestThree.length
    ? earliestThree.reduce((sum, assignment) => sum + assignment.percent, 0) / earliestThree.length
    : null;
  const overallAverage = normalized.length
    ? normalized.reduce((sum, assignment) => sum + assignment.percent, 0) / normalized.length
    : null;
  const trendDelta =
    recentAverage !== null && baselineAverage !== null ? recentAverage - baselineAverage : null;

  return {
    gradedAssignments: normalized.length,
    overallAverage,
    recentAverage,
    baselineAverage,
    trendDelta,
    lowScores,
    moderateScores,
    missingAssignments,
  };
}

function buildRiskDrivers({
  now,
  assignments,
  events,
  learningGaps,
  recentRuns,
  lastSession,
  performance,
}) {
  const drivers = [];
  const upcoming24h = assignments.filter((item) => new Date(item.due_at) - now <= 24 * 60 * 60 * 1000 && new Date(item.due_at) > now);
  const upcoming72h = assignments.filter((item) => new Date(item.due_at) - now <= 72 * 60 * 60 * 1000 && new Date(item.due_at) > now);
  const overdue = assignments.filter((item) => new Date(item.due_at) <= now);
  const highGapCount = learningGaps.filter((gap) => String(gap.severity).toLowerCase() === "high").length;
  const mediumGapCount = learningGaps.filter((gap) => String(gap.severity).toLowerCase() === "medium").length;
  const lastEventAt = events[0]?.created_at ? new Date(events[0].created_at) : null;
  const hoursSinceEvent = lastEventAt ? Math.round((now - lastEventAt) / (60 * 60 * 1000)) : null;
  const lastWorkflowAt = recentRuns[0]?.created_at ? new Date(recentRuns[0].created_at) : null;
  const daysSinceWorkflow = lastWorkflowAt ? Math.round((now - lastWorkflowAt) / (24 * 60 * 60 * 1000)) : null;
  const avgSessionMinutes = lastSession?.avg_minutes ? Number(lastSession.avg_minutes) : 0;
  const weeklyEvents = events.filter((event) => now - new Date(event.created_at) <= 7 * 24 * 60 * 60 * 1000).length;

  if (overdue.length) {
    drivers.push({
      key: "overdue_work",
      label: "Overdue work",
      points: clamp(overdue.length * 20, 20, 40),
      evidence: `${overdue.length} overdue item${overdue.length > 1 ? "s" : ""} detected`,
    });
  }

  if (upcoming24h.length) {
    drivers.push({
      key: "due_within_24h",
      label: "Urgent due date pressure",
      points: clamp(upcoming24h.length * 15, 15, 30),
      evidence: `${upcoming24h.length} deliverable${upcoming24h.length > 1 ? "s" : ""} due within 24 hours`,
    });
  } else if (upcoming72h.length >= 2) {
    drivers.push({
      key: "due_within_72h",
      label: "Stacked near-term deadlines",
      points: clamp(upcoming72h.length * 8, 8, 24),
      evidence: `${upcoming72h.length} deliverables due within 72 hours`,
    });
  }

  if (highGapCount || mediumGapCount) {
    drivers.push({
      key: "knowledge_gaps",
      label: "Persistent knowledge gaps",
      points: clamp(highGapCount * 12 + mediumGapCount * 6, 6, 32),
      evidence: `${highGapCount} high and ${mediumGapCount} medium learning gaps stored`,
    });
  }

  if (hoursSinceEvent !== null && hoursSinceEvent >= 48) {
    drivers.push({
      key: "low_recent_activity",
      label: "Low recent engagement",
      points: hoursSinceEvent >= 120 ? 18 : 10,
      evidence: `No recorded activity for ${hoursSinceEvent} hours`,
    });
  }

  if (weeklyEvents < 8) {
    drivers.push({
      key: "thin_clickstream",
      label: "Thin study clickstream",
      points: weeklyEvents < 4 ? 12 : 6,
      evidence: `${weeklyEvents} tracked study events in the past 7 days`,
    });
  }

  if (daysSinceWorkflow !== null && daysSinceWorkflow >= 7) {
    drivers.push({
      key: "stale_agent_support",
      label: "No recent agent support",
      points: daysSinceWorkflow >= 14 ? 10 : 6,
      evidence: `Last workflow run was ${daysSinceWorkflow} days ago`,
    });
  }

  if (avgSessionMinutes > 0 && avgSessionMinutes < 10) {
    drivers.push({
      key: "fragmented_sessions",
      label: "Fragmented session pattern",
      points: 6,
      evidence: `Average session length is ${avgSessionMinutes.toFixed(1)} minutes`,
    });
  }

  if (performance.lowScores.length) {
    drivers.push({
      key: "low_performance",
      label: "Low scoring assessments",
      points: clamp(performance.lowScores.length * 12, 12, 30),
      evidence: `${performance.lowScores.length} graded item${performance.lowScores.length > 1 ? "s" : ""} below 70%`,
    });
  }

  if (performance.missingAssignments.length) {
    drivers.push({
      key: "missing_submissions",
      label: "Missing submissions",
      points: clamp(performance.missingAssignments.length * 14, 14, 28),
      evidence: `${performance.missingAssignments.length} assignment${performance.missingAssignments.length > 1 ? "s are" : " is"} marked missing`,
    });
  }

  if (performance.trendDelta !== null && performance.trendDelta <= -8) {
    drivers.push({
      key: "downward_grade_trend",
      label: "Downward grade trend",
      points: performance.trendDelta <= -15 ? 18 : 10,
      evidence: `Recent graded work is ${Math.abs(performance.trendDelta).toFixed(1)} points below the early baseline`,
    });
  }

  return {
    drivers,
    metrics: {
      overdueAssignments: overdue.length,
      dueIn24Hours: upcoming24h.length,
      dueIn72Hours: upcoming72h.length,
      highGapCount,
      mediumGapCount,
      weeklyEvents,
      avgSessionMinutes,
      hoursSinceEvent,
      daysSinceWorkflow,
      overallAverage: performance.overallAverage,
      recentAverage: performance.recentAverage,
      lowScoreCount: performance.lowScores.length,
      missingAssignmentCount: performance.missingAssignments.length,
    },
  };
}

function deriveRiskLevel(score) {
  if (score >= 75) return "critical";
  if (score >= 55) return "high";
  if (score >= 30) return "elevated";
  return "stable";
}

function buildAutonomousSupportNetwork({ level, performance, learningGaps, assignments }) {
  const primaryLowScore = performance.lowScores[0];
  const primaryGap = learningGaps[0];
  const upcoming = assignments.filter((assignment) => assignment.due_at).slice(0, 3);
  const team = [
    {
      agent: "Performance Watcher",
      mission: "Track marks, missing work, and trend changes",
      status: primaryLowScore || performance.missingAssignments.length ? "active" : "monitoring",
    },
    {
      agent: "Recovery Planner",
      mission: "Break poor performance into a concrete rebound sequence",
      status: level === "high" || level === "critical" ? "active" : "ready",
    },
    {
      agent: "Concept Rebuilder",
      mission: "Explain weak concepts with extra context and adapted teaching",
      status: primaryGap ? "active" : "ready",
    },
    {
      agent: "Resource Curator",
      mission: "Collect better notes, examples, practice, and video-like material",
      status: primaryLowScore || primaryGap ? "active" : "ready",
    },
    {
      agent: "Support Handoff",
      mission: "Trigger the next agent when a student is still struggling",
      status: level === "critical" ? "active" : "ready",
    },
  ];

  const handoffs = [];
  if (primaryLowScore) {
    handoffs.push({
      from: "Performance Watcher",
      to: "Recovery Planner",
      reason: `${primaryLowScore.name} is below target performance`,
    });
    handoffs.push({
      from: "Recovery Planner",
      to: "Concept Rebuilder",
      reason: `The student needs concept repair for the material behind ${primaryLowScore.name}`,
    });
    handoffs.push({
      from: "Concept Rebuilder",
      to: "Resource Curator",
      reason: "The student should receive extra explanations, examples, and video-first support",
    });
  }

  if (level === "critical") {
    handoffs.push({
      from: "Resource Curator",
      to: "Support Handoff",
      reason: "Escalate to a higher-touch recovery workflow because risk remains critical",
    });
  }

  return {
    team,
    handoffs,
    proactiveGoals: [
      primaryLowScore ? `Raise the next attempt above 80% for ${primaryLowScore.name}` : "Keep performance stable on upcoming work",
      primaryGap ? `Close the gap in ${primaryGap.gap_title}` : "Prevent new weak spots from forming",
      upcoming[0] ? `Protect the next deadline: ${upcoming[0].name}` : "Maintain steady study rhythm",
    ],
  };
}

function buildRecommendations({ level, assignments, learningGaps, preferences, performance }) {
  const recommendations = [];
  const primaryGap = learningGaps[0];
  const dueSoon = assignments.slice(0, 3);

  if (level === "critical" || level === "high") {
    recommendations.push("Start a structured recovery block today with one urgent deliverable and one weak concept.");
  } else {
    recommendations.push("Keep a short, repeatable study rhythm and use agents to front-load harder material.");
  }

  if (primaryGap) {
    recommendations.push(`Run a deep-dive workflow for ${primaryGap.gap_title} and turn it into a practice-first explanation.`);
  }

  if (dueSoon.length) {
    recommendations.push(`Prepare for ${dueSoon[0].name} first, then sequence the remaining upcoming deadlines by effort.`);
  }

  if (performance.lowScores[0]) {
    recommendations.push(`Start a grade recovery loop for ${performance.lowScores[0].name} and rebuild the concept chain behind that score.`);
  }

  if (performance.missingAssignments[0]) {
    recommendations.push(`Create an assignment rescue plan for ${performance.missingAssignments[0].name} before adding more new study goals.`);
  }

  if ((preferences?.studyStyle || "").toLowerCase() === "visual") {
    recommendations.push("Prefer video-first and concept-map outputs when planning the next review sessions.");
  }

  return recommendations.slice(0, 4);
}

function computeInterventionScore({ db, userId, courseId = null, canvasState = null, now = new Date() }) {
  if (!userId) {
    return {
      score: 0,
      level: "stable",
      drivers: [],
      metrics: {},
      recommendations: [],
      preferences: {},
    };
  }

  const assignments = getAssignmentsFromCanvasState(canvasState);
  const performance = getPerformanceSignals(assignments);
  const events = getRecentEvents(db, userId, courseId, 60);
  const learningGaps = getLearningGaps(db, userId, courseId, 20);
  const recentRuns = getRecentWorkflowRuns(db, userId, courseId, 12);
  const lastSession = db
    .prepare(`
      SELECT AVG(
        CASE
          WHEN logout_at IS NOT NULL THEN (julianday(logout_at) - julianday(login_at)) * 24 * 60
          ELSE (julianday('now') - julianday(login_at)) * 24 * 60
        END
      ) AS avg_minutes
      FROM sessions
      WHERE user_id = ?
      ORDER BY login_at DESC
      LIMIT 10
    `)
    .get(String(userId));
  const preferences = getStoredPreferences(db, userId);

  const { drivers, metrics } = buildRiskDrivers({
    now,
    assignments,
    events,
    learningGaps,
    recentRuns,
    lastSession,
    performance,
  });

  const score = clamp(drivers.reduce((sum, item) => sum + item.points, 0), 0, 100);
  const level = deriveRiskLevel(score);

  return {
    score,
    level,
    drivers,
    metrics,
    recommendations: buildRecommendations({ level, assignments, learningGaps, preferences, performance }),
    preferences,
    performance: {
      gradedAssignments: performance.gradedAssignments,
      overallAverage: performance.overallAverage,
      recentAverage: performance.recentAverage,
      trendDelta: performance.trendDelta,
      lowScores: performance.lowScores.slice(0, 5),
      moderateScores: performance.moderateScores.slice(0, 5),
      missingAssignments: performance.missingAssignments.slice(0, 5),
    },
    autonomousSupportNetwork: buildAutonomousSupportNetwork({
      level,
      performance,
      learningGaps,
      assignments,
    }),
    context: {
      courseId: courseId ? String(courseId) : null,
      courseName: canvasState?.course?.name || null,
      assignmentCount: assignments.length,
      learningGapCount: learningGaps.length,
      recentWorkflowCount: recentRuns.length,
    },
  };
}

function generateAutonomousReviewPlan({
  db,
  userId,
  courseId,
  canvasState,
  intervention,
  now = new Date(),
}) {
  const assignments = getAssignmentsFromCanvasState(canvasState);
  const performance = getPerformanceSignals(assignments);
  const learningGaps = getLearningGaps(db, userId, courseId, 6);
  const focusAssignments = assignments.filter((item) => new Date(item.due_at) > now).slice(0, 3);
  const reviewSessions = [];
  const autonomousActions = [];

  const addSession = (title, offsetHours, durationMinutes, goal) => {
    reviewSessions.push({
      title,
      scheduled_for: new Date(now.getTime() + offsetHours * 60 * 60 * 1000).toISOString(),
      duration_minutes: durationMinutes,
      goal,
      status: "suggested",
    });
  };

  focusAssignments.forEach((assignment, index) => {
    addSession(
      `Prep: ${assignment.name}`,
      6 + index * 18,
      intervention.level === "critical" ? 50 : 35,
      `Reduce deadline risk for ${assignment.name}`
    );
  });

  learningGaps.slice(0, 2).forEach((gap, index) => {
    addSession(
      `Rebuild: ${gap.gap_title}`,
      12 + index * 24,
      30,
      gap.recommendation || `Strengthen understanding of ${gap.gap_title}`
    );
  });

  autonomousActions.push({
    action_type: "intervention",
    title: "Adaptive intervention packet",
    detail: `Risk level is ${intervention.level}. Prioritize ${intervention.drivers[0]?.label || "the next study block"} and refresh the student dashboard with a recovery path.`,
    status: "proposed",
  });

  if (focusAssignments[0]) {
    autonomousActions.push({
      action_type: "reminder",
      title: "Deadline protection reminder",
      detail: `Trigger a reminder and quick-start workspace for ${focusAssignments[0].name}.`,
      status: "proposed",
    });
  }

  if (learningGaps[0]) {
    autonomousActions.push({
      action_type: "resource",
      title: "Targeted concept rebuild",
      detail: `Launch a deep-dive + video generation run for ${learningGaps[0].gap_title}.`,
      status: "proposed",
    });
  }

  if (performance.lowScores[0]) {
    addSession(
      `Recover: ${performance.lowScores[0].name}`,
      4,
      45,
      `Understand why the student scored low and generate support material for ${performance.lowScores[0].name}`
    );
    autonomousActions.push({
      action_type: "intervention",
      title: "Grade rebound handoff",
      detail: `Performance agent flags ${performance.lowScores[0].name} for a tutor/support-curator handoff with extra material and practice.`,
      status: "proposed",
    });
  }

  if (performance.missingAssignments[0]) {
    autonomousActions.push({
      action_type: "reminder",
      title: "Missing work rescue",
      detail: `Create a rescue checklist for ${performance.missingAssignments[0].name} and surface the fastest completion path.`,
      status: "proposed",
    });
  }

  return {
    reviewSessions: reviewSessions.slice(0, 5),
    autonomousActions: autonomousActions.slice(0, 4),
  };
}

function persistAutonomousReviewPlan({
  db,
  workflowRunId = null,
  userId,
  courseId = null,
  reviewSessions,
  autonomousActions,
}) {
  const insertSession = db.prepare(`
    INSERT INTO review_sessions
    (workflow_run_id, user_id, course_id, title, scheduled_for, duration_minutes, goal, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAction = db.prepare(`
    INSERT INTO autonomous_actions
    (workflow_run_id, user_id, course_id, action_type, title, detail, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const session of reviewSessions || []) {
    insertSession.run(
      workflowRunId,
      String(userId),
      courseId ? String(courseId) : null,
      session.title,
      session.scheduled_for,
      Number(session.duration_minutes || 30),
      session.goal || "",
      session.status || "suggested"
    );
  }

  for (const action of autonomousActions || []) {
    insertAction.run(
      workflowRunId,
      String(userId),
      courseId ? String(courseId) : null,
      action.action_type || "study_action",
      action.title || "Action",
      action.detail || "",
      action.status || "proposed"
    );
  }
}

module.exports = {
  buildAutonomousSupportNetwork,
  computeInterventionScore,
  generateAutonomousReviewPlan,
  getLearningGaps,
  getRecentWorkflowRuns,
  getStoredPreferences,
  persistAutonomousReviewPlan,
};
