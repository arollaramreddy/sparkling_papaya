import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  detectLessonVisualScene,
  getLessonVisualKeywords,
  getSlideVisualLabels,
} from "../lesson/visuals";
import "./manualStudentInteraction.css";

const DEFAULT_SETTINGS = {
  previewLength: 2000,
};

const COURSE_COLORS = [
  "#8C1D40",
  "#1A5276",
  "#1E6B45",
  "#6C3483",
  "#B7950B",
  "#784212",
  "#0F766E",
  "#922B21",
];

const LESSON_MODE_OPTIONS = [
  { id: "quick", label: "Quick" },
  { id: "detailed", label: "Detailed" },
];

const AGENT_PACK_OPTIONS = [
  {
    id: "flashcards",
    label: "Flashcards",
    description: "Recall cards for review.",
  },
];

const STUDY_PLAN_CONFIG = {
  id: "study-plan",
  label: "Study Plan",
  defaults: {
    hoursPerWeek: 8,
    sessionMinutes: 60,
    pace: "balanced",
    includeAssignments: true,
    focusDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  },
};

const DAY_NAMES = [
  { short: "Mon", full: "Monday" },
  { short: "Tue", full: "Tuesday" },
  { short: "Wed", full: "Wednesday" },
  { short: "Thu", full: "Thursday" },
  { short: "Fri", full: "Friday" },
  { short: "Sat", full: "Saturday" },
  { short: "Sun", full: "Sunday" },
];

const DEFAULT_DAILY_MINUTES = Math.round(
  (STUDY_PLAN_CONFIG.defaults.hoursPerWeek * 60) /
    STUDY_PLAN_CONFIG.defaults.focusDays.length
);

const DEFAULT_STUDY_PLAN_PREFERENCES = {
  availableDailyMinutes: DEFAULT_DAILY_MINUTES,
  hoursPerWeek: STUDY_PLAN_CONFIG.defaults.hoursPerWeek,
  sessionLength: STUDY_PLAN_CONFIG.defaults.sessionMinutes,
  horizonDays: 7,
  pace: STUDY_PLAN_CONFIG.defaults.pace,
  preferredTimeOfDay: "evening",
  includeBreaks: true,
  weekendStudy: true,
  includeAssignments: STUDY_PLAN_CONFIG.defaults.includeAssignments,
  focusDays: [...STUDY_PLAN_CONFIG.defaults.focusDays],
};

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateInput, days) {
  const date = new Date(`${dateInput}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateInput;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  if (!dateStr) return "No due date";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatShortDate(dateValue) {
  if (!dateValue) return "";
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatSize(bytes) {
  if (!bytes) return "";
  const kb = bytes / 1024;
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
}

function formatScore(score, pointsPossible) {
  if (score === null || score === undefined) return "-";
  if (pointsPossible === null || pointsPossible === undefined) return `${score}`;
  return `${score} / ${pointsPossible}`;
}

function renderInline(text) {
  return text.split(/\*\*(.*?)\*\*/g).map((part, index) =>
    index % 2 === 1 ? <strong key={index}>{part}</strong> : <span key={index}>{part}</span>
  );
}

function renderMarkdown(text) {
  if (!text) return null;
  return text.split("\n").map((line, index) => {
    if (line.startsWith("### ")) {
      return (
        <h4 key={index} className="md-h4">
          {renderInline(line.slice(4))}
        </h4>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h3 key={index} className="md-h3">
          {renderInline(line.slice(3))}
        </h3>
      );
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return (
        <li key={index} className="md-li">
          {renderInline(line.slice(2))}
        </li>
      );
    }
    if (/^\d+\.\s/.test(line)) {
      return (
        <li key={index} className="md-li">
          {renderInline(line.replace(/^\d+\.\s/, ""))}
        </li>
      );
    }
    if (!line.trim()) return <br key={index} />;
    return (
      <p key={index} className="md-p">
        {renderInline(line)}
      </p>
    );
  });
}

function optionLetter(index) {
  return ["A", "B", "C", "D"][index] || String.fromCharCode(65 + index);
}

function normalizeQuizQuestion(question = {}) {
  const rawOptions = Array.isArray(question.options)
    ? question.options
    : Array.isArray(question.choices)
      ? question.choices
      : [];
  const options = rawOptions
    .map((option) => (typeof option === "string" ? option : option?.text || option?.label || ""))
    .map((option) => String(option || "").trim())
    .filter(Boolean)
    .slice(0, 4);

  let correctOption = String(
    question.correct_answer ||
      question.correct_option ||
      question.correctAnswer ||
      ""
  )
    .trim()
    .toUpperCase();

  if (!["A", "B", "C", "D"].includes(correctOption) && options.length) {
    const answerText = String(question.answer || "").trim().toLowerCase();
    const matchedIndex = options.findIndex((option) => option.toLowerCase() === answerText);
    if (matchedIndex >= 0) {
      correctOption = optionLetter(matchedIndex);
    }
  }

  return {
    question: question.question || "Quiz question",
    explanation: question.explanation || "",
    options,
    correctOption,
    answer: question.answer || "",
    difficulty: question.difficulty || "",
  };
}

function formatStudyPace(value) {
  const labels = {
    light: "Light pace",
    balanced: "Balanced pace",
    intensive: "Intensive pace",
  };
  return labels[value] || "Balanced pace";
}

function formatStudyWindow(value) {
  const labels = {
    morning: "Best in the morning",
    afternoon: "Best in the afternoon",
    evening: "Best in the evening",
    late_night: "Best late at night",
  };
  return labels[value] || "Flexible time";
}

function formatSessionLabel(minutes) {
  const total = Number(minutes) || 60;
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}m`;
  if (hours > 0) return `${hours}h`;
  return `${remainder}m`;
}

function buildStudyTimeline(sessions = [], preferences = {}) {
  const startDate = getToday();
  const sessionLength = Math.max(Number(preferences.sessionLength) || 30, 15);
  const dailyMinutes = Math.max(Number(preferences.availableDailyMinutes) || 60, sessionLength);
  const sessionsPerDay = Math.max(1, Math.floor(dailyMinutes / sessionLength));

  return sessions.map((session, index) => {
    const dayOffset = Math.floor(index / sessionsPerDay);
    const date = addDays(startDate, dayOffset);
    return {
      ...session,
      scheduleDate: date,
      scheduleLabel: `Day ${dayOffset + 1}`,
    };
  });
}

function buildStudyPlannerViewModel(sessions = [], preferences = {}, overview = "") {
  const sessionLength = Math.max(Number(preferences.sessionLength) || 60, 15);
  const focusDays = Array.isArray(preferences.focusDays) && preferences.focusDays.length
    ? preferences.focusDays
    : [...STUDY_PLAN_CONFIG.defaults.focusDays];
  const timeline = buildStudyTimeline(sessions, preferences);
  const sessionsPerWeek = Math.max(1, focusDays.length);
  const dailySchedule = [];

  timeline.forEach((session, index) => {
    const weekIndex = Math.floor(index / sessionsPerWeek);
    const dayInWeek = index % sessionsPerWeek;
    const dayMeta = DAY_NAMES.find((day) => day.short === focusDays[dayInWeek]) || DAY_NAMES[dayInWeek] || DAY_NAMES[0];
    const date = addDays(getToday(), index);

    if (!dailySchedule[weekIndex]) {
      dailySchedule[weekIndex] = {
        weekLabel: `Week ${weekIndex + 1}`,
        focus: "",
        days: [],
      };
    }

    dailySchedule[weekIndex].days.push({
      dayKey: dayMeta.short,
      label: dayMeta.full,
      date,
      schedule: `${formatSessionLabel(session.duration_minutes || sessionLength)} study block`,
      tasks: [session.goal || session.title],
    });
  });

  const weeklyPlan = dailySchedule.map((week, index) => ({
    day: week.weekLabel,
    focus:
      week.days
        .map((day) => day.tasks?.[0] || "")
        .filter(Boolean)
        .slice(0, 2)
        .join(" • ") || `Focus on the key ideas from week ${index + 1}.`,
  }));

  const milestones = timeline.slice(0, 4).map((session, index) => ({
    title: session.title,
    reason: session.goal,
    dueDate: session.scheduleDate || addDays(getToday(), index),
  }));

  return {
    overview:
      overview ||
      "Generated from module content and your preferences.",
    weeklyPlan,
    milestones,
    dailySchedule,
  };
}

function inferSemesterLabel(course) {
  const source = `${course.name || ""} ${course.code || ""}`.replace(/[_-]/g, " ");
  const patterns = [
    { season: "Spring", regex: /\b(?:spring|sp)\s*(20\d{2})\b/i },
    { season: "Summer", regex: /\b(?:summer|su)\s*(20\d{2})\b/i },
    { season: "Fall", regex: /\b(?:fall|fa)\s*(20\d{2})\b/i },
    { season: "Winter", regex: /\b(?:winter|wi)\s*(20\d{2})\b/i },
    { season: "Spring", regex: /\b(20\d{2})\s*(?:spring|sp)\b/i },
    { season: "Summer", regex: /\b(20\d{2})\s*(?:summer|su)\b/i },
    { season: "Fall", regex: /\b(20\d{2})\s*(?:fall|fa)\b/i },
    { season: "Winter", regex: /\b(20\d{2})\s*(?:winter|wi)\b/i },
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern.regex);
    if (match?.[1]) {
      return `${pattern.season} ${match[1]}`;
    }
  }

  return "Others";
}

function semesterSortValue(label) {
  if (label === "Others") return -1;
  const match = label.match(/^(Spring|Summer|Fall|Winter)\s+(20\d{2})$/);
  if (!match) return -1;
  const seasonOrder = { Spring: 1, Summer: 2, Fall: 3, Winter: 4 };
  return Number(match[2]) * 10 + seasonOrder[match[1]];
}

function deadlineStatus(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  const hours = diff / (1000 * 60 * 60);
  if (diff < 0) return { label: "Overdue", cls: "overdue" };
  if (hours < 24) return { label: "Due today", cls: "urgent" };
  if (hours < 72) return { label: `${Math.ceil(hours / 24)}d left`, cls: "soon" };
  if (hours < 168) return { label: `${Math.ceil(hours / 24)}d left`, cls: "week" };
  return null;
}

const LESSON_PANEL_VARIANTS = {
  initial: { opacity: 0, y: 18, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    y: -12,
    scale: 0.985,
    transition: { duration: 0.28, ease: [0.4, 0, 1, 1] },
  },
};

const LESSON_STAGGER_VARIANTS = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
};

const LESSON_ITEM_VARIANTS = {
  initial: { opacity: 0, y: 12, scale: 0.96 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
  },
};

function renderLessonVisual(slide, lesson, reduceMotion = false) {
  const keywords = getSlideVisualLabels(slide);
  const bullets = (slide.bullets || []).filter(Boolean);
  const visualSteps = (bullets.length ? bullets : [slide.example, slide.definition]).filter(Boolean).slice(0, 3);
  const shapeLabels = (keywords.length ? keywords : visualSteps).slice(0, 4);
  const scene = detectLessonVisualScene(slide);
  const motionProps = reduceMotion ? {} : { variants: LESSON_ITEM_VARIANTS };

  if (scene === "world-map") {
    return (
      <motion.div
        className="manual-lesson-visual manual-lesson-visual-world-map"
        aria-hidden="true"
        {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}
      >
        <motion.div className="manual-lesson-map-board" {...motionProps}>
          <div className="manual-lesson-world-grid" />
          {["Maps", "Banking", shapeLabels[0] || "Users"].map((label, index) => (
            <motion.div
              key={label}
              className={`manual-lesson-world-node node-${index + 1}`}
              animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }}
              transition={reduceMotion ? undefined : { duration: 2.2, repeat: Infinity, delay: index * 0.45 }}
              {...motionProps}
            >
              <span>{label}</span>
            </motion.div>
          ))}
          <motion.div className="manual-lesson-data-packet packet-west" animate={reduceMotion ? undefined : { x: [0, 156], y: [0, 52], opacity: [0, 1, 1, 0] }} transition={reduceMotion ? undefined : { duration: 2.6, repeat: Infinity }} />
          <motion.div className="manual-lesson-data-packet packet-east" animate={reduceMotion ? undefined : { x: [0, -146], y: [0, 38], opacity: [0, 1, 1, 0] }} transition={reduceMotion ? undefined : { duration: 2.6, repeat: Infinity, delay: 0.8 }} />
          <motion.div className="manual-lesson-data-packet packet-south" animate={reduceMotion ? undefined : { x: [0, 52], y: [0, -128], opacity: [0, 1, 1, 0] }} transition={reduceMotion ? undefined : { duration: 2.2, repeat: Infinity, delay: 1.2 }} />
        </motion.div>
        <motion.div className="manual-lesson-map-caption" {...motionProps}>
          <strong>{shapeLabels[1] || "Real-time updates"}</strong>
          <span>{shapeLabels[2] || "Global users need fresh data instantly"}</span>
        </motion.div>
      </motion.div>
    );
  }

  if (scene === "replication-cluster") {
    return (
      <motion.div
        className="manual-lesson-visual manual-lesson-visual-replication"
        aria-hidden="true"
        {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}
      >
        <motion.div className="manual-lesson-system-cluster solo" {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}>
          <motion.div
            className="manual-lesson-db-core"
            animate={reduceMotion ? undefined : { scale: [1, 1.04, 1] }}
            transition={reduceMotion ? undefined : { duration: 2.2, repeat: Infinity }}
            {...motionProps}
          >
            <strong>{shapeLabels[0] || "Primary DB"}</strong>
            <span>{shapeLabels[1] || "sync source"}</span>
          </motion.div>
          <motion.div className="manual-lesson-db-replica replica-a" {...motionProps}><span>{shapeLabels[2] || "Replica A"}</span></motion.div>
          <motion.div className="manual-lesson-db-replica replica-b" {...motionProps}><span>{shapeLabels[3] || "Replica B"}</span></motion.div>
          <motion.div className="manual-lesson-db-replica replica-c" {...motionProps}><span>Replica C</span></motion.div>
          <motion.div className="manual-lesson-replication-wave wave-a" animate={reduceMotion ? undefined : { scale: [0.4, 1.2], opacity: [0.7, 0] }} transition={reduceMotion ? undefined : { duration: 1.8, repeat: Infinity }} />
          <motion.div className="manual-lesson-replication-wave wave-b" animate={reduceMotion ? undefined : { scale: [0.4, 1.2], opacity: [0.7, 0] }} transition={reduceMotion ? undefined : { duration: 1.8, repeat: Infinity, delay: 0.6 }} />
          <motion.div className="manual-lesson-replication-wave wave-c" animate={reduceMotion ? undefined : { scale: [0.4, 1.2], opacity: [0.7, 0] }} transition={reduceMotion ? undefined : { duration: 1.8, repeat: Infinity, delay: 1.2 }} />
        </motion.div>
      </motion.div>
    );
  }

  if (scene === "workload-balancing") {
    return (
      <motion.div
        className="manual-lesson-visual manual-lesson-visual-workload"
        aria-hidden="true"
        {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}
      >
        <motion.div className="manual-lesson-workload-source" {...motionProps}>
          <strong>{shapeLabels[0] || "Incoming traffic"}</strong>
        </motion.div>
        <motion.div className="manual-lesson-workload-split" {...motionProps} />
        <motion.div className="manual-lesson-workload-servers" {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}>
          {["Server A", "Server B", "Server C"].map((label, index) => (
            <motion.div key={label} className="manual-lesson-workload-server" {...motionProps}>
              <span>{shapeLabels[index + 1] || label}</span>
              <div className="manual-lesson-load-bar">
                <motion.div
                  className="manual-lesson-load-fill"
                  animate={reduceMotion ? undefined : { scaleX: [0.55 + index * 0.1, 1, 0.65 + index * 0.08] }}
                  transition={reduceMotion ? undefined : { duration: 2, repeat: Infinity, delay: index * 0.35 }}
                />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    );
  }

  if (scene === "request-routing") {
    return (
      <motion.div
        className="manual-lesson-visual manual-lesson-visual-routing"
        aria-hidden="true"
        {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}
      >
        <div className="manual-lesson-process-track routing">
          {(shapeLabels.length ? shapeLabels : ["Client", "API", "Cache", "Database"]).slice(0, 4).map((item, index, list) => (
            <motion.div key={item} className="manual-lesson-process-step" {...motionProps}>
              <div className={`manual-lesson-process-node node-${index + 1}`}>{item}</div>
              {index < list.length - 1 ? <div className="manual-lesson-process-link" /> : null}
            </motion.div>
          ))}
          <div className="manual-lesson-process-token" />
        </div>
      </motion.div>
    );
  }

  if (scene === "distributed-systems") {
    return (
      <motion.div
        className="manual-lesson-visual manual-lesson-visual-system"
        aria-hidden="true"
        {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}
      >
        <motion.div className="manual-lesson-system-world" {...motionProps}>
          <div className="manual-lesson-world-grid" />
          <motion.div
            className="manual-lesson-world-node node-west"
            animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }}
            transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity }}
            {...motionProps}
          >
            <span>Maps</span>
          </motion.div>
          <motion.div
            className="manual-lesson-world-node node-east"
            animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }}
            transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity, delay: 0.6 }}
            {...motionProps}
          >
            <span>Banking</span>
          </motion.div>
          <motion.div
            className="manual-lesson-world-node node-south"
            animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }}
            transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity, delay: 1.2 }}
            {...motionProps}
          >
            <span>Users</span>
          </motion.div>
          <motion.div className="manual-lesson-world-link link-west" {...motionProps} />
          <motion.div className="manual-lesson-world-link link-east" {...motionProps} />
          <motion.div className="manual-lesson-world-link link-south" {...motionProps} />
          <motion.div
            className="manual-lesson-data-packet packet-west"
            animate={reduceMotion ? undefined : { x: [0, 148], y: [0, 68], opacity: [0, 1, 1, 0] }}
            transition={reduceMotion ? undefined : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="manual-lesson-data-packet packet-east"
            animate={reduceMotion ? undefined : { x: [0, -156], y: [0, 40], opacity: [0, 1, 1, 0] }}
            transition={reduceMotion ? undefined : { duration: 2.8, repeat: Infinity, delay: 0.8, ease: "easeInOut" }}
          />
          <motion.div
            className="manual-lesson-data-packet packet-south"
            animate={reduceMotion ? undefined : { x: [0, 42], y: [0, -118], opacity: [0, 1, 1, 0] }}
            transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity, delay: 1.3, ease: "easeInOut" }}
          />
        </motion.div>

        <motion.div className="manual-lesson-system-cluster" {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}>
          <motion.div
            className="manual-lesson-db-core"
            animate={reduceMotion ? undefined : { scale: [1, 1.04, 1], boxShadow: ["0 20px 44px rgba(2, 6, 23, 0.32)", "0 26px 60px rgba(34, 211, 238, 0.24)", "0 20px 44px rgba(2, 6, 23, 0.32)"] }}
            transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity }}
            {...motionProps}
          >
            <strong>Distributed DB</strong>
            <span>shared state</span>
          </motion.div>
          <motion.div className="manual-lesson-db-replica replica-a" {...motionProps}>
            <span>Replica A</span>
          </motion.div>
          <motion.div className="manual-lesson-db-replica replica-b" {...motionProps}>
            <span>Replica B</span>
          </motion.div>
          <motion.div className="manual-lesson-db-replica replica-c" {...motionProps}>
            <span>Replica C</span>
          </motion.div>
          <motion.div className="manual-lesson-db-pulse pulse-a" {...motionProps} />
          <motion.div className="manual-lesson-db-pulse pulse-b" {...motionProps} />
          <motion.div className="manual-lesson-db-pulse pulse-c" {...motionProps} />
          <motion.div
            className="manual-lesson-replication-wave wave-a"
            animate={reduceMotion ? undefined : { scale: [0.4, 1.2], opacity: [0.7, 0] }}
            transition={reduceMotion ? undefined : { duration: 1.8, repeat: Infinity }}
          />
          <motion.div
            className="manual-lesson-replication-wave wave-b"
            animate={reduceMotion ? undefined : { scale: [0.4, 1.2], opacity: [0.7, 0] }}
            transition={reduceMotion ? undefined : { duration: 1.8, repeat: Infinity, delay: 0.6 }}
          />
          <motion.div
            className="manual-lesson-replication-wave wave-c"
            animate={reduceMotion ? undefined : { scale: [0.4, 1.2], opacity: [0.7, 0] }}
            transition={reduceMotion ? undefined : { duration: 1.8, repeat: Infinity, delay: 1.2 }}
          />
        </motion.div>

        <motion.div className="manual-lesson-system-load" {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}>
          {["Traffic", "Reads", "Writes"].map((label, index) => (
            <motion.div key={label} className={`manual-lesson-load-lane lane-${index + 1}`} {...motionProps}>
              <span>{label}</span>
              <div className="manual-lesson-load-bar">
                <motion.div
                  className="manual-lesson-load-fill"
                  animate={reduceMotion ? undefined : { scaleX: [0.62, 1, 0.7] }}
                  transition={reduceMotion ? undefined : { duration: 2.2, repeat: Infinity, delay: index * 0.4 }}
                />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    );
  }

  if (scene === "comparison") {
    const leftItems = shapeLabels.slice(0, 2);
    const rightItems = (shapeLabels.slice(2, 4).length ? shapeLabels.slice(2, 4) : ["Contrast", "Outcome"]);
    return (
      <motion.div
        className="manual-lesson-visual manual-lesson-visual-compare"
        aria-hidden="true"
        {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}
      >
        <motion.div className="manual-lesson-compare-column left" {...motionProps}>
          <span className="manual-lesson-compare-label">Side A</span>
          {leftItems.map((item) => (
            <motion.div key={item} className="manual-lesson-compare-card" {...motionProps}>
              {item}
            </motion.div>
          ))}
        </motion.div>
        <motion.div className="manual-lesson-compare-axis" {...motionProps}>
          <span>vs</span>
        </motion.div>
        <motion.div className="manual-lesson-compare-column right" {...motionProps}>
          <span className="manual-lesson-compare-label">Side B</span>
          {rightItems.map((item) => (
            <motion.div key={item} className="manual-lesson-compare-card" {...motionProps}>
              {item}
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    );
  }

  if (scene === "process-flow") {
    const flowItems = (shapeLabels.length ? shapeLabels : ["Input", "Process", "Output"]).slice(0, 4);
    return (
      <motion.div
        className="manual-lesson-visual manual-lesson-visual-process"
        aria-hidden="true"
        {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}
      >
        <div className="manual-lesson-process-track">
          {flowItems.map((item, index) => (
            <motion.div key={item} className="manual-lesson-process-step" {...motionProps}>
              <div className={`manual-lesson-process-node node-${index + 1}`}>{item}</div>
              {index < flowItems.length - 1 ? <div className="manual-lesson-process-link" /> : null}
            </motion.div>
          ))}
          <div className="manual-lesson-process-token" />
        </div>
      </motion.div>
    );
  }

  if (scene === "network") {
    const nodeLabels = (shapeLabels.length ? shapeLabels : ["Client", "Server", "Cache", "API"]).slice(0, 4);
    return (
      <motion.div
        className="manual-lesson-visual manual-lesson-visual-network"
        aria-hidden="true"
        {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}
      >
        <motion.div className="manual-lesson-network-hub" {...motionProps}>
          <strong>{nodeLabels[1] || "Server"}</strong>
          <span>central service</span>
        </motion.div>
        {nodeLabels.map((label, index) => (
          <motion.div
            key={`${label}-${index}`}
            className={`manual-lesson-network-node network-node-${index + 1}`}
            {...motionProps}
          >
            {label}
          </motion.div>
        ))}
        <div className="manual-lesson-network-connector connector-1" />
        <div className="manual-lesson-network-connector connector-2" />
        <div className="manual-lesson-network-connector connector-3" />
        <div className="manual-lesson-network-ping ping-1" />
        <div className="manual-lesson-network-ping ping-2" />
      </motion.div>
    );
  }

  if (slide.type === "title") {
    return (
      <motion.div
        className="manual-lesson-visual manual-lesson-visual-title"
        aria-hidden="true"
        {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}
      >
        <div className="manual-lesson-orbit-shell">
          <span className="manual-lesson-orbit-ring ring-a" />
          <span className="manual-lesson-orbit-ring ring-b" />
          <motion.span className="manual-lesson-orbit-core" {...motionProps}>
            {lesson.slides.length}
          </motion.span>
          {keywords.slice(0, 3).map((keyword, index) => (
            <motion.span
              key={`${keyword}-${index}`}
              className={`manual-lesson-orbit-node node-${index + 1}`}
              {...motionProps}
            >
              {keyword}
            </motion.span>
          ))}
        </div>
        <div className="manual-lesson-visual-stats">
          <motion.div className="manual-lesson-visual-stat" {...motionProps}>
            <strong>{lesson.estimated_minutes || 0}m</strong>
            <span>guided pace</span>
          </motion.div>
          <motion.div className="manual-lesson-visual-stat" {...motionProps}>
            <strong>{lesson.subject || "Topic"}</strong>
            <span>focus area</span>
          </motion.div>
        </div>
      </motion.div>
    );
  }

  if (slide.type === "definition") {
    return (
      <motion.div
        className="manual-lesson-visual manual-lesson-visual-definition"
        aria-hidden="true"
        {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}
      >
        <motion.div className="manual-lesson-concept-card" {...motionProps}>
          <span className="manual-lesson-concept-label">Concept</span>
          <strong>{slide.term || slide.heading || "Key idea"}</strong>
          <p>{slide.definition || "Important idea explained visually."}</p>
        </motion.div>
        <div className="manual-lesson-shape-board definition-board">
          <motion.div className="manual-lesson-shape shape-pill shape-primary" {...motionProps}>
            <span>{slide.term || keywords[0] || "Idea"}</span>
          </motion.div>
          <motion.div className="manual-lesson-shape-link" {...motionProps} />
          <motion.div className="manual-lesson-shape shape-rect shape-secondary" {...motionProps}>
            <span>{shapeLabels[1] || "Meaning"}</span>
          </motion.div>
          <motion.div className="manual-lesson-shape-link vertical" {...motionProps} />
          {(slide.example || keywords[2]) ? (
            <motion.div className="manual-lesson-example-bubble" {...motionProps}>
              <span>Example</span>
              <strong>{slide.example || keywords[2]}</strong>
            </motion.div>
          ) : null}
        </div>
      </motion.div>
    );
  }

  if (slide.type === "example") {
    return (
      <motion.div
        className="manual-lesson-visual manual-lesson-visual-example"
        aria-hidden="true"
        {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}
      >
        <motion.div className="manual-lesson-example-track" {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}>
          {visualSteps.map((step, index) => (
            <motion.div
              key={`${step}-${index}`}
              className="manual-lesson-example-step"
              style={{ "--lesson-step-delay": `${index * 180}ms` }}
              {...motionProps}
            >
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </motion.div>
          ))}
        </motion.div>
        <motion.div className="manual-lesson-object-row" {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}>
          {shapeLabels.slice(0, 3).map((label, index) => (
            <motion.div
              key={`${label}-${index}`}
              className={`manual-lesson-object object-${index + 1}`}
              style={{ "--lesson-step-delay": `${index * 180}ms` }}
              {...motionProps}
            >
              <span className="manual-lesson-object-core">{label}</span>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="manual-lesson-visual manual-lesson-visual-summary"
      aria-hidden="true"
      {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}
    >
      <motion.div className="manual-lesson-shape-flow" {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}>
        {shapeLabels.slice(0, 3).map((item, index) => (
          <motion.div key={`${item}-flow-${index}`} className="manual-lesson-flow-step" {...motionProps}>
            <motion.div className={`manual-lesson-shape flow-shape-${index + 1}`} {...motionProps}>
              <span>{item}</span>
            </motion.div>
            {index < Math.min(shapeLabels.slice(0, 3).length - 1, 2) ? (
              <motion.div className="manual-lesson-flow-arrow" {...motionProps} />
            ) : null}
          </motion.div>
        ))}
      </motion.div>
      <motion.div className="manual-lesson-summary-grid" {...(reduceMotion ? {} : { variants: LESSON_STAGGER_VARIANTS })}>
        {shapeLabels.map((item, index) => (
          <motion.div
            key={`${item}-${index}`}
            className="manual-lesson-summary-chip"
            style={{ "--lesson-step-delay": `${index * 140}ms` }}
            {...motionProps}
          >
            {item}
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}

function LessonPlayer({ lesson, onClose, inline = false, apiBase }) {
  const reduceMotion = useReducedMotion();
  const [slideIndex, setSlideIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [audioUrls, setAudioUrls] = useState({});
  const [audioLoading, setAudioLoading] = useState({});
  const [muted, setMuted] = useState(false);
  const audioRef = useRef(null);
  const advanceTimeoutRef = useRef(null);

  const slide = lesson.slides[slideIndex] || {};
  const isFirst = slideIndex === 0;
  const isLast = slideIndex === lesson.slides.length - 1;
  const progress = ((slideIndex + 1) / lesson.slides.length) * 100;
  const currentAudioReady = Boolean(audioUrls[slide.id]);
  const currentAudioLoading = Boolean(audioLoading[slide.id]);

  const ensureAudioForSlide = useCallback(
    async (targetSlide) => {
      if (!targetSlide?.id || !targetSlide?.narration) return null;
      if (audioUrls[targetSlide.id]) return audioUrls[targetSlide.id];
      if (audioLoading[targetSlide.id]) return null;

      setAudioLoading((current) => ({ ...current, [targetSlide.id]: true }));

      try {
        const response = await fetch(`${apiBase}/generate-lesson-audio`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lessonTitle: lesson.title,
            slideId: targetSlide.id,
            narration: targetSlide.narration,
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "Failed to generate lesson audio");
        }

        setAudioUrls((current) => ({ ...current, [targetSlide.id]: data.audioUrl }));
        setSpeechError("");
        return data.audioUrl;
      } catch (error) {
        setSpeechError(error.message || "Failed to load lesson audio");
        return null;
      } finally {
        setAudioLoading((current) => ({ ...current, [targetSlide.id]: false }));
      }
    },
    [apiBase, audioLoading, audioUrls, lesson.title]
  );

  useEffect(() => {
    let cancelled = false;

    const narratedSlides = (lesson.slides || []).filter((item) => item?.id && item?.narration);
    narratedSlides.forEach((targetSlide) => {
      ensureAudioForSlide(targetSlide).catch(() => {});
    });

    return () => {
      cancelled = true;
    };
  }, [ensureAudioForSlide, lesson.slides]);

  const stopPlayback = useCallback(
    ({ resetTime = false } = {}) => {
      if (advanceTimeoutRef.current) {
        clearTimeout(advanceTimeoutRef.current);
        advanceTimeoutRef.current = null;
      }

      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.onended = null;
        if (resetTime) {
          audio.currentTime = 0;
        }
      }

      setSpeaking(false);
    },
    []
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    if (!speaking) {
      audio.pause();
      return undefined;
    }

    const src = audioUrls[slide.id];
    if (!src) return undefined;

    audio.src = src;
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {
        setSpeechError("Audio playback was blocked. Press play again.");
        setSpeaking(false);
      });
    }

    function handleEnded() {
      if (isLast) {
        setSpeaking(false);
      } else {
        advanceTimeoutRef.current = setTimeout(() => {
          advanceTimeoutRef.current = null;
          setSlideIndex((current) => current + 1);
        }, 700);
      }
    }

    setSpeechError("");
    audio.muted = muted;
    audio.onended = handleEnded;

    return () => {
      if (advanceTimeoutRef.current) {
        clearTimeout(advanceTimeoutRef.current);
        advanceTimeoutRef.current = null;
      }
      audio.pause();
      audio.onended = null;
    };
  }, [audioUrls, isLast, muted, slide.id, speaking]);

  useEffect(() => () => stopPlayback({ resetTime: true }), [stopPlayback]);

  async function toggleSpeaking() {
    if (speaking) {
      stopPlayback();
    } else {
      setSpeechError("");
      let currentSrc = audioUrls[slide.id];
      if (!currentSrc) {
        currentSrc = await ensureAudioForSlide(slide);
      }
      if (!currentSrc) {
        return;
      }

      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      try {
        audio.src = currentSrc;
        audio.currentTime = 0;
        audio.muted = muted;
        await audio.play();
        setSpeaking(true);
      } catch {
        setSpeechError("Audio playback was blocked. Press play again.");
        setSpeaking(false);
      }
    }
  }

  function closePlayer() {
    stopPlayback({ resetTime: true });
    onClose?.();
  }

  const player = (
      <div className={`manual-lesson-player ${inline ? "inline" : ""}`} onClick={(event) => event.stopPropagation()}>
        <audio ref={audioRef} preload="auto" />
        <div className="manual-lesson-player-header">
          <div className="manual-toolbar-actions">
            <span className="manual-lesson-player-badge">Video Lesson</span>
            <span className="manual-lesson-player-title">{lesson.title}</span>
          </div>
          {onClose ? (
            <button className="manual-lesson-player-close" onClick={closePlayer} aria-label="Close lesson">
              ×
            </button>
          ) : null}
        </div>

        <div className="manual-lesson-stage">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.id || slideIndex}
              className={`manual-lesson-slide ${slide.type}`}
              initial={reduceMotion ? false : "initial"}
              animate={reduceMotion ? undefined : "animate"}
              exit={reduceMotion ? undefined : "exit"}
              variants={reduceMotion ? undefined : LESSON_PANEL_VARIANTS}
            >
            {!speaking ? (
              <button
                className="manual-lesson-stage-play"
                onClick={toggleSpeaking}
                type="button"
                disabled={currentAudioLoading}
              >
                {currentAudioLoading ? "Preparing narration..." : "▶ Play lesson"}
              </button>
            ) : null}
            {slide.type === "title" ? (
              <>
                <div className="manual-lesson-subject">{lesson.subject}</div>
                <h1 className="manual-lesson-heading">{slide.heading}</h1>
                {slide.subheading ? <p className="manual-lesson-subheading">{slide.subheading}</p> : null}
                <div className="manual-lesson-meta">
                  {lesson.slides.length} slides · ~{lesson.estimated_minutes} min
                </div>
                {renderLessonVisual(slide, lesson, reduceMotion)}
              </>
            ) : (
              <>
                <div className={`manual-lesson-type ${slide.type}`}>{slide.type}</div>
                <h2 className="manual-lesson-heading">{slide.heading || slide.term}</h2>
                {slide.type === "definition" ? (
                  <>
                    <p className="manual-lesson-definition">{slide.definition}</p>
                    {slide.example ? <p className="manual-lesson-example">Example: {slide.example}</p> : null}
                  </>
                ) : (
                  <ul className="manual-lesson-list">
                    {(slide.bullets || []).map((bullet, index) => (
                      <li key={`${bullet}-${index}`}>
                        <span className="manual-lesson-dot">{slide.type === "example" ? index + 1 : "●"}</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {renderLessonVisual(slide, lesson, reduceMotion)}
              </>
            )}
            </motion.div>
          </AnimatePresence>
        </div>

        {!currentAudioReady && currentAudioLoading && !speechError ? (
          <div className="manual-note">Preparing narration...</div>
        ) : null}
        {speechError ? <div className="manual-note warning">{speechError}</div> : null}
        <div className="manual-lesson-narration">{slide.narration}</div>

        <div className="manual-lesson-player-controls">
          <div className="manual-lesson-control-group">
            <button
              className="manual-lesson-control-btn"
              onClick={() => setSlideIndex((current) => current - 1)}
              disabled={isFirst}
              aria-label="Previous slide"
            >
              ⏮
            </button>
            <button
              className="manual-lesson-control-btn play"
              onClick={toggleSpeaking}
              aria-label="Play lesson"
              disabled={!speaking && currentAudioLoading}
            >
              {speaking ? "⏸" : "▶"}
            </button>
            <button
              className="manual-lesson-control-btn"
              onClick={() => setSlideIndex((current) => current + 1)}
              disabled={isLast}
              aria-label="Next slide"
            >
              ⏭
            </button>
            <button
              className="manual-lesson-control-btn"
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.muted = !muted;
                }
                setMuted((current) => !current);
                setSpeechError("");
              }}
              aria-label="Toggle narration"
            >
              {muted ? "🔇" : "🔊"}
            </button>
          </div>

          <div className="manual-lesson-progress">
            <div className="manual-lesson-progress-fill" style={{ width: `${progress}%` }} />
          </div>

          <div className="manual-lesson-index">
            {slideIndex + 1} / {lesson.slides.length}
          </div>
        </div>
      </div>
  );

  if (inline) {
    return <div className="manual-lesson-inline">{player}</div>;
  }

  return (
    <div className="manual-lesson-overlay" onClick={closePlayer}>
      {player}
    </div>
  );
}

export default function ManualStudentInteractionView({ apiBase, active }) {
  const workspaceMotionRef = useRef(null);
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesLoaded, setCoursesLoaded] = useState(false);
  const [coursesError, setCoursesError] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courseLoading, setCourseLoading] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [files, setFiles] = useState([]);
  const [modules, setModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [moduleFiles, setModuleFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [summaries, setSummaries] = useState({});
  const [moduleSummary, setModuleSummary] = useState("");
  const [summarizing, setSummarizing] = useState({});
  const [summarizingModule, setSummarizingModule] = useState(false);
  const [moduleWorkflowResults, setModuleWorkflowResults] = useState({});
  const [moduleWorkflowTarget, setModuleWorkflowTarget] = useState("flashcards");
  const [moduleWorkflowLoading, setModuleWorkflowLoading] = useState(false);
  const [moduleWorkflowError, setModuleWorkflowError] = useState("");
  const [quizSelections, setQuizSelections] = useState({});
  const [flashcardFlips, setFlashcardFlips] = useState({});
  const [studyPlanPreferences, setStudyPlanPreferences] = useState(DEFAULT_STUDY_PLAN_PREFERENCES);
  const [extractedTexts, setExtractedTexts] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [lessonJobs, setLessonJobs] = useState({});
  const [lessonModes, setLessonModes] = useState({});
  const [activeLessonFileId, setActiveLessonFileId] = useState(null);
  const lessonPanelRefs = useRef({});

  const settings = DEFAULT_SETTINGS;

  const apiFetchJson = useCallback(
    async (path, options = {}) => {
      const response = await fetch(`${apiBase}${path}`, {
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
    },
    [apiBase]
  );

  const resetCourseState = useCallback(() => {
    setSelectedCourse(null);
    setAssignments([]);
    setFiles([]);
    setModules([]);
    setSelectedModule(null);
    setModuleFiles([]);
    setSummaries({});
    setModuleSummary("");
    setSummarizing({});
    setSummarizingModule(false);
    setModuleWorkflowResults({});
    setModuleWorkflowTarget("flashcards");
    setModuleWorkflowLoading(false);
    setModuleWorkflowError("");
    setQuizSelections({});
    setFlashcardFlips({});
    setStudyPlanPreferences(DEFAULT_STUDY_PLAN_PREFERENCES);
    setExtractedTexts({});
    setSearchQuery("");
    setLessonJobs({});
    setLessonModes({});
    setActiveLessonFileId(null);
  }, []);

  const fetchCourses = useCallback(async () => {
    setCoursesLoading(true);
    setCoursesError("");
    try {
      const data = await apiFetchJson("/courses");
      setCourses(Array.isArray(data) ? data : []);
      setCoursesLoaded(true);
    } catch (error) {
      setCoursesError(error.message || "Failed to load courses");
    } finally {
      setCoursesLoading(false);
    }
  }, [apiFetchJson]);

  useEffect(() => {
    if (!active || coursesLoaded || coursesLoading) return;
    fetchCourses();
  }, [active, coursesLoaded, coursesLoading, fetchCourses]);

  useEffect(() => {
    const root = workspaceMotionRef.current;
    if (!root || typeof window === "undefined") return undefined;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = Array.from(
      root.querySelectorAll(
        ".manual-card, .manual-course-card, .manual-file-card, .manual-lesson-panel, .manual-module-item"
      )
    );

    targets.forEach((node) => node.classList.add("manual-motion-target"));

    if (prefersReducedMotion) {
      targets.forEach((node) => node.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          }
        });
      },
      {
        threshold: 0.15,
        rootMargin: "0px 0px -10% 0px",
      }
    );

    targets.forEach((node, index) => {
      node.style.setProperty("--manual-motion-delay", `${Math.min(index * 55, 360)}ms`);
      observer.observe(node);
    });

    return () => observer.disconnect();
  }, [active, selectedCourse, selectedModule, moduleFiles.length, assignments.length]);

  const semesterGroups = useMemo(() => {
    const grouped = courses.reduce((accumulator, course) => {
      const semester = inferSemesterLabel(course);
      if (!accumulator[semester]) accumulator[semester] = [];
      accumulator[semester].push(course);
      return accumulator;
    }, {});

    return Object.entries(grouped)
      .sort((left, right) => semesterSortValue(right[0]) - semesterSortValue(left[0]))
      .map(([label, items]) => ({
        label,
        items: items.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
      }));
  }, [courses]);

  useEffect(() => {
    if (!selectedSemester && semesterGroups.length) {
      setSelectedSemester(semesterGroups[0].label);
    }
  }, [selectedSemester, semesterGroups]);

  const visibleCourses = useMemo(
    () => semesterGroups.find((group) => group.label === selectedSemester)?.items || [],
    [selectedSemester, semesterGroups]
  );

  const filteredFiles = useMemo(() => {
    if (!searchQuery) return moduleFiles;
    const query = searchQuery.toLowerCase();
    return moduleFiles.filter((file) => {
      return (
        (file.display_name || "").toLowerCase().includes(query) ||
        (extractedTexts[file.id]?.text || "").toLowerCase().includes(query)
      );
    });
  }, [extractedTexts, moduleFiles, searchQuery]);

  const upcomingAssignments = useMemo(
    () =>
      assignments
        .filter((assignment) => assignment.due_at && !assignment.is_completed)
        .sort((a, b) => new Date(a.due_at) - new Date(b.due_at)),
    [assignments]
  );

  const gradedAssignments = useMemo(
    () =>
      assignments
        .filter((assignment) => assignment.score !== null && assignment.score !== undefined)
        .sort((a, b) => new Date(b.submitted_at || b.due_at || 0) - new Date(a.submitted_at || a.due_at || 0)),
    [assignments]
  );

  const pdfCount = moduleFiles.filter((file) => file.is_pdf && file.type === "File").length;
  const selectedWorkflow = moduleWorkflowResults[moduleWorkflowTarget] || null;
  const selectedQuizQuestions = selectedWorkflow?.workflow?.assets?.quiz_questions || [];
  const selectedFlashcards = selectedWorkflow?.workflow?.assets?.flashcards || [];
  const selectedStudySessions = selectedWorkflow?.workflow?.assets?.study_plan?.sessions || [];
  const answeredQuizCount = selectedQuizQuestions.reduce(
    (count, _question, index) => count + (quizSelections[`${moduleWorkflowTarget}-${index}`] ? 1 : 0),
    0
  );
  const correctQuizCount = selectedQuizQuestions.reduce((count, rawQuestion, index) => {
    const question = normalizeQuizQuestion(rawQuestion);
    return count + (quizSelections[`${moduleWorkflowTarget}-${index}`] === question.correctOption ? 1 : 0);
  }, 0);
  const flippedFlashcardCount = selectedFlashcards.reduce(
    (count, _card, index) => count + (flashcardFlips[`flashcard-${index}`] ? 1 : 0),
    0
  );
  const studyPlanView = buildStudyPlannerViewModel(
    selectedStudySessions,
    studyPlanPreferences,
    selectedWorkflow?.workflow?.overview || ""
  );

  async function handleCourseSelect(course) {
    resetCourseState();
    setSelectedCourse(course);
    setCourseLoading(true);

    try {
      const [assignmentsData, filesData, modulesData] = await Promise.all([
        apiFetchJson(`/courses/${course.id}/assignments`).catch(() => []),
        apiFetchJson(`/courses/${course.id}/files`).catch(() => []),
        apiFetchJson(`/modules?courseId=${course.id}`).catch(() => []),
      ]);

      setAssignments(Array.isArray(assignmentsData) ? assignmentsData : []);
      setFiles(Array.isArray(filesData) ? filesData : []);
      setModules(Array.isArray(modulesData) ? modulesData : []);
    } finally {
      setCourseLoading(false);
    }
  }

  async function handleModuleSelect(module) {
    if (!selectedCourse) return;
    setSelectedModule(module);
    setModuleFiles([]);
    setSummaries({});
    setModuleSummary("");
    setModuleWorkflowResults({});
    setModuleWorkflowTarget("flashcards");
    setModuleWorkflowError("");
    setQuizSelections({});
    setFlashcardFlips({});
    setStudyPlanPreferences(DEFAULT_STUDY_PLAN_PREFERENCES);
    setLoadingFiles(true);

    try {
      const data = await apiFetchJson(
        `/module-files?courseId=${selectedCourse.id}&moduleId=${module.id}`
      ).catch(() => []);
      setModuleFiles(Array.isArray(data) ? data : []);
    } finally {
      setLoadingFiles(false);
    }
  }

  async function handleExtractText(file) {
    if (!selectedCourse) return;

    setExtractedTexts((previous) => ({
      ...previous,
      [file.id]: { ...(previous[file.id] || {}), loading: true, error: "" },
    }));

    try {
      const data = await apiFetchJson(
        `/file-text?fileId=${file.id}&courseId=${selectedCourse.id}`
      );

      setExtractedTexts((previous) => ({
        ...previous,
        [file.id]: {
          text: data.text || "",
          warning: data.warning || null,
          pages: data.pages,
          chars: data.chars,
          loading: false,
          error: "",
        },
      }));
      return data.text || "";
    } catch (error) {
      setExtractedTexts((previous) => ({
        ...previous,
        [file.id]: {
          ...(previous[file.id] || {}),
          loading: false,
          error: error.message || "Failed to extract text",
        },
      }));
      return "";
    }
  }

  async function handleSummarizeFile(file) {
    if (!selectedCourse) return;
    setSummarizing((previous) => ({ ...previous, [file.id]: true }));

    try {
      const data = await apiFetchJson("/summarize-file", {
        method: "POST",
        body: JSON.stringify({
          fileId: file.id,
          courseId: selectedCourse.id,
          fileName: file.display_name,
        }),
      });

      setSummaries((previous) => ({
        ...previous,
        [file.id]: data.error ? `Error: ${data.error}` : data.summary,
      }));
    } catch {
      setSummaries((previous) => ({
        ...previous,
        [file.id]: "Failed to generate summary.",
      }));
    } finally {
      setSummarizing((previous) => ({ ...previous, [file.id]: false }));
    }
  }

  async function handleSummarizeModule() {
    if (!selectedCourse || !selectedModule) return;
    setSummarizingModule(true);
    setModuleSummary("");

    try {
      const data = await apiFetchJson("/summarize-module", {
        method: "POST",
        body: JSON.stringify({
          courseId: selectedCourse.id,
          moduleId: selectedModule.id,
          moduleName: selectedModule.name,
        }),
      });

      setModuleSummary(data.error ? `Error: ${data.error}` : data.summary);
    } catch {
      setModuleSummary("Failed to generate module summary.");
    } finally {
      setSummarizingModule(false);
    }
  }

  async function handleSummarizeAllPDFs() {
    for (const file of moduleFiles.filter((item) => item.is_pdf && item.type === "File")) {
      if (!summaries[file.id]) {
        await handleSummarizeFile(file);
      }
    }
  }

  async function handleGenerateModuleWorkflow(target = moduleWorkflowTarget) {
    if (!selectedCourse || !selectedModule) return;

    setModuleWorkflowTarget(target);
    setModuleWorkflowError("");
    setModuleWorkflowLoading(true);

    try {
      const workflow = await apiFetchJson("/agentic-workflow", {
        method: "POST",
        body: JSON.stringify({
          courseId: selectedCourse.id,
          moduleId: selectedModule.id,
          workflowType: "module_mastery",
          generationTargets: [target],
          preferences: {
            studyPlan: studyPlanPreferences,
            reply: {
              length: "medium",
              tone: "supportive",
              interactivity: "balanced",
              emoji: false,
              includeNextSteps: true,
              includeCourseContext: true,
              signoffStyle: "simple",
            },
          },
        }),
      });

      setModuleWorkflowResults((current) => ({
        ...current,
        [target]: workflow,
      }));
    } catch (error) {
      setModuleWorkflowError(error.message || "Failed to generate agent workflow.");
    } finally {
      setModuleWorkflowLoading(false);
    }
  }

  function handleQuizSelection(target, questionIndex, optionKey) {
    setQuizSelections((current) => ({
      ...current,
      [`${target}-${questionIndex}`]: optionKey,
    }));
  }

  function toggleFlashcard(cardKey) {
    setFlashcardFlips((current) => ({
      ...current,
      [cardKey]: !current[cardKey],
    }));
  }

  function setAllFlashcards(cards = [], flipped = false) {
    setFlashcardFlips(
      cards.reduce((next, _card, index) => {
        next[`flashcard-${index}`] = flipped;
        return next;
      }, {})
    );
  }

  function resetQuizSelections() {
    setQuizSelections({});
  }

  function updateStudyPlanPreference(key, value) {
    setStudyPlanPreferences((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function toggleStudyPlanDay(dayKey) {
    setStudyPlanPreferences((current) => {
      const nextFocusDays = current.focusDays.includes(dayKey)
        ? current.focusDays.filter((day) => day !== dayKey)
        : [...current.focusDays, dayKey];

      return {
        ...current,
        focusDays: nextFocusDays.length ? nextFocusDays : current.focusDays,
      };
    });
  }

  function updateLessonJob(fileId, updater) {
    setLessonJobs((previous) => {
      const current = previous[fileId] || {};
      const next =
        typeof updater === "function" ? updater(current) : { ...current, ...updater };
      return { ...previous, [fileId]: next };
    });
  }

  function pushLessonStep(fileId, step) {
    updateLessonJob(fileId, (current) => ({
      ...current,
      status: step,
      steps: [...(current.steps || []), step],
    }));
  }

  function getLessonMode(fileId) {
    return lessonModes[fileId] || "quick";
  }

  async function handleGenerateLesson(file) {
    if (!selectedCourse) return;

    const fileId = String(file.id);
    const mode = getLessonMode(fileId);

    updateLessonJob(fileId, {
      loading: true,
      error: "",
      status: "Preparing lesson preview...",
      steps: ["Preparing lesson preview..."],
      mode,
      lesson: null,
    });

    try {
      pushLessonStep(fileId, "Extracting or reusing PDF text...");
      let text = extractedTexts[file.id]?.text || "";
      if (!text) {
        text = await handleExtractText(file);
      }
      if (!text) {
        throw new Error("No extractable text in this PDF");
      }

      pushLessonStep(fileId, "Generating narrated lesson slides...");
      const lesson = await apiFetchJson("/generate-lesson", {
        method: "POST",
        body: JSON.stringify({
          title:
            mode === "detailed"
              ? `${file.display_name} - detailed lesson`
              : `${file.display_name} - quick lesson`,
          text: mode === "detailed" ? text : text.slice(0, 12000),
        }),
      });

      updateLessonJob(fileId, {
        loading: false,
        error: "",
        status: "Lesson ready",
        steps: [],
        lesson,
      });
      setActiveLessonFileId(fileId);
      requestAnimationFrame(() => {
        lessonPanelRefs.current[fileId]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    } catch (error) {
      updateLessonJob(fileId, {
        loading: false,
        error: error.message || "Lesson generation failed",
        status: "Lesson generation failed",
      });
    }
  }

  async function handleGenerateLessonVideo(file) {
    const fileId = String(file.id);
    const job = lessonJobs[fileId];
    if (!job?.lesson) return;

    updateLessonJob(fileId, {
      videoLoading: true,
      videoError: "",
      videoStatus: "Generating AI video...",
    });

    try {
      const data = await apiFetchJson("/render-lesson-video", {
        method: "POST",
        body: JSON.stringify({
          title: `${job.lesson.title || file.display_name} video`,
          lesson: job.lesson,
        }),
      });

      updateLessonJob(fileId, {
        videoLoading: false,
        videoError: "",
        videoStatus: "AI video ready",
        videoUrl: data.videoUrl,
      });
    } catch (error) {
      updateLessonJob(fileId, {
        videoLoading: false,
        videoError: error.message || "Video generation failed",
        videoStatus: "Video generation failed",
      });
    }
  }

  function renderLessonPanel(file) {
    const job = lessonJobs[String(file.id)];
    if (!job) return null;
    const fileId = String(file.id);
    const isActiveLesson = activeLessonFileId === fileId && !!job.lesson;
    return (
      <div
        className="manual-lesson-panel"
        ref={(node) => {
          lessonPanelRefs.current[fileId] = node;
        }}
      >
            <div className="manual-toolbar">
              <div>
                <h4>Video Lesson</h4>
            <div className="manual-lesson-status">
              <span
                className={`manual-lesson-badge ${
                  job.error ? "error" : job.loading ? "loading" : "ready"
                }`}
              >
                {job.error ? "Failed" : job.loading ? "Generating" : "Ready"}
              </span>
              <span className="manual-lesson-meta">{job.status}</span>
            </div>
          </div>
          <div className="manual-card-actions">
            <button
              className="manual-btn"
              onClick={() => {
                if (job.lesson && !job.loading) {
                  setActiveLessonFileId((current) => (current === fileId ? null : fileId));
                  requestAnimationFrame(() => {
                    lessonPanelRefs.current[fileId]?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                  });
                  return;
                }
                handleGenerateLesson(file);
              }}
              disabled={job.loading}
            >
              {job.loading
                ? "Generating..."
                : job.lesson
                  ? isActiveLesson
                    ? "Hide lesson"
                    : "Open lesson"
                  : job.error
                    ? "Retry video"
                    : "Generate lesson"}
            </button>
            {job.lesson ? (
              <button className="manual-btn" onClick={() => handleGenerateLesson(file)} disabled={job.loading}>
                Regenerate
              </button>
            ) : null}
            {job.lesson ? (
              <button
                className="manual-btn"
                onClick={() => handleGenerateLessonVideo(file)}
                disabled={job.loading || job.videoLoading}
              >
                {job.videoLoading
                  ? "Rendering video..."
                  : job.videoUrl
                    ? "Re-render video"
                    : "Render video"}
              </button>
            ) : null}
          </div>
        </div>

        {job.loading ? (
          <div className="manual-note">
            The lesson will open automatically here as soon as it is ready.
          </div>
        ) : null}

        {job.steps?.length ? (
          <div className="manual-lesson-steps">
            {job.steps.map((step, index) => (
              <div key={`${step}-${index}`} className="manual-lesson-step">
                <span className="manual-lesson-step-dot" />
                <span>{step}</span>
              </div>
            ))}
          </div>
        ) : null}

        {job.error ? <div className="manual-note error">{job.error}</div> : null}
        {job.videoError ? <div className="manual-note error">{job.videoError}</div> : null}

        {job.lesson ? (
          <>
            <div className="manual-lesson-meta">
              {job.lesson.subject} · {job.lesson.slides?.length || 0} slides · ~
              {job.lesson.estimated_minutes} min
            </div>
            {job.lesson.slides?.[0]?.narration ? (
              <div className="manual-lesson-script">{job.lesson.slides[0].narration}</div>
            ) : null}
            {job.videoStatus ? <div className="manual-lesson-meta">{job.videoStatus}</div> : null}
            {job.videoUrl ? (
              <video className="manual-generated-video" src={job.videoUrl} controls preload="metadata" />
            ) : null}
            {isActiveLesson ? <LessonPlayer lesson={job.lesson} inline apiBase={apiBase} /> : null}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="manual-workspace" ref={workspaceMotionRef}>
      {!selectedCourse ? (
        <div className="manual-shell">
          <div className="manual-header">
            <div className="manual-header-copy">
              <span className="panel-badge">Manual mode</span>
              <h2>Manual student interaction</h2>
              <p>Open courses, inspect modules, and run outputs.</p>
            </div>

            <div className="manual-toolbar-actions">
              <button className="manual-btn" onClick={fetchCourses} disabled={coursesLoading}>
                {coursesLoading ? "Refreshing..." : "Refresh courses"}
              </button>
            </div>
          </div>

          {coursesError ? <div className="manual-note error">{coursesError}</div> : null}

          <div className="manual-card">
            <div className="manual-toolbar">
              <div>
                <p className="manual-section-kicker">Semester tabs</p>
                <h3 className="manual-card-title">Your courses</h3>
              </div>
              <span className="manual-count-pill">{courses.length}</span>
            </div>

            {coursesLoading && !courses.length ? (
              <p className="manual-empty">Loading courses...</p>
            ) : null}

            {!coursesLoading && !semesterGroups.length ? (
              <p className="manual-empty">No courses found for this account yet.</p>
            ) : null}

            {semesterGroups.length ? (
              <>
                <div className="manual-semester-tabs" style={{ marginTop: 18 }}>
                  {semesterGroups.map((group) => (
                    <button
                      key={group.label}
                      type="button"
                      className={`manual-semester-tab ${
                        selectedSemester === group.label ? "active" : ""
                      }`}
                      onClick={() => setSelectedSemester(group.label)}
                    >
                      {group.label}
                    </button>
                  ))}
                </div>

                <div className="manual-course-grid" style={{ marginTop: 22 }}>
                  {visibleCourses.map((course, index) => {
                    const color = COURSE_COLORS[index % COURSE_COLORS.length];
                    const initials = (course.name || course.code || "CC")
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((word) => word[0])
                      .join("")
                      .toUpperCase();

                    return (
                      <button
                        key={course.id}
                        type="button"
                        className="manual-course-card"
                        onClick={() => handleCourseSelect(course)}
                      >
                        <div className="manual-course-banner" style={{ background: color }}>
                          <span className="manual-course-initials">{initials || "CC"}</span>
                        </div>
                        <div className="manual-course-body">
                          <div className="manual-course-code">{course.code || "Canvas course"}</div>
                          <div className="manual-course-name">{course.name}</div>
                          <div className="manual-course-footer">
                            <span className="manual-course-meta">{inferSemesterLabel(course)}</span>
                            <span className="manual-course-cta" style={{ color }}>
                              Open course →
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="manual-course-detail">
          <div className="manual-detail-header">
            <div className="manual-detail-copy">
              <button className="manual-back-btn" onClick={resetCourseState}>
                ← Back to semesters
              </button>
              <p className="manual-section-kicker">{inferSemesterLabel(selectedCourse)}</p>
              <h2 className="manual-detail-title">{selectedCourse.name}</h2>
              <p className="manual-muted">{selectedCourse.code || "Canvas course workspace"}</p>
            </div>

            <div className="manual-toolbar-actions">
              <button className="manual-btn" onClick={() => handleCourseSelect(selectedCourse)} disabled={courseLoading}>
                {courseLoading ? "Refreshing..." : "Refresh course"}
              </button>
            </div>
          </div>

          <div className="manual-detail-grid">
            <div className="manual-card">
              <div className="manual-toolbar">
                <div>
                  <p className="manual-section-kicker">Course content</p>
                  <h3 className="manual-card-title">Modules</h3>
                </div>
                <span className="manual-count-pill">{modules.length}</span>
              </div>

              {courseLoading ? <p className="manual-empty">Loading course data...</p> : null}
              {!courseLoading && !modules.length ? (
                <p className="manual-empty">No modules found for this course.</p>
              ) : null}

              <div className="manual-modules" style={{ marginTop: 18 }}>
                {modules.map((module) => (
                  <button
                    key={module.id}
                    type="button"
                    className={`manual-module-item ${
                      selectedModule?.id === module.id ? "active" : ""
                    }`}
                    onClick={() => handleModuleSelect(module)}
                  >
                    <div className="manual-module-name">{module.name}</div>
                    <div className="manual-muted">
                      {module.items_count != null ? `${module.items_count} items` : "Module"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="manual-card">
              {!selectedModule ? (
                <>
                  <p className="manual-section-kicker">Manual workflow</p>
                  <h3 className="manual-card-title">Open a module</h3>
                  <p className="manual-empty">Select a module to begin.</p>
                </>
              ) : (
                <>
                  <div className="manual-toolbar">
                    <div>
                      <p className="manual-section-kicker">Selected module</p>
                      <h3 className="manual-card-title">{selectedModule.name}</h3>
                    </div>
                    <div className="manual-card-actions">
                      {pdfCount > 0 ? (
                        <>
                          <button
                            className="manual-btn primary"
                            onClick={handleSummarizeModule}
                            disabled={summarizingModule}
                          >
                            {summarizingModule ? "Summarizing..." : "Summarize module"}
                          </button>
                          <button className="manual-btn" onClick={handleSummarizeAllPDFs}>
                            Summarize all PDFs
                          </button>
                          <button
                            className="manual-btn"
                            onClick={() => handleGenerateModuleWorkflow(moduleWorkflowTarget)}
                            disabled={moduleWorkflowLoading}
                          >
                            {moduleWorkflowLoading
                              ? "Running agents..."
                              : "Generate selected output"}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {loadingFiles ? <p className="manual-empty">Loading files...</p> : null}
                  {!loadingFiles && !moduleFiles.length ? (
                    <p className="manual-empty">No files in this module.</p>
                  ) : null}

                  {moduleFiles.length ? (
                    <>
                      <div className="manual-search-row" style={{ marginTop: 18 }}>
                        <input
                          className="manual-search-input"
                          type="text"
                          placeholder="Search files..."
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                        />
                        {searchQuery ? (
                          <button className="manual-btn" onClick={() => setSearchQuery("")}>
                            Clear
                          </button>
                        ) : null}
                      </div>

                      <div className="manual-file-list" style={{ marginTop: 18 }}>
                        {filteredFiles.map((file) => (
                          <div key={file.id} className="manual-file-card">
                            <div className="manual-file-header">
                              <div className="manual-file-meta">
                                <div className="manual-file-title-row">
                                  <span className={`manual-file-badge ${file.is_pdf ? "pdf" : "other"}`}>
                                    {file.is_pdf ? "PDF" : file.type === "ExternalUrl" ? "Link" : "File"}
                                  </span>
                                  <span className="manual-file-title">{file.display_name}</span>
                                </div>
                                <div className="manual-muted">
                                  {file.size ? formatSize(file.size) : null}
                                  {file.size && file.created_at ? " · " : null}
                                  {file.created_at ? formatDate(file.created_at) : null}
                                </div>
                              </div>

                              {file.is_pdf && file.type === "File" ? (
                                <div className="manual-file-actions">
                                  <div className="manual-mode-toggle">
                                    {LESSON_MODE_OPTIONS.map((mode) => (
                                      <button
                                        key={mode.id}
                                        type="button"
                                        className={`manual-mode-chip ${
                                          getLessonMode(String(file.id)) === mode.id ? "active" : ""
                                        }`}
                                        onClick={() =>
                                          setLessonModes((previous) => ({
                                            ...previous,
                                            [String(file.id)]: mode.id,
                                          }))
                                        }
                                      >
                                        {mode.label}
                                      </button>
                                    ))}
                                  </div>
                                  <button
                                    className="manual-btn"
                                    onClick={() => handleExtractText(file)}
                                    disabled={extractedTexts[file.id]?.loading}
                                  >
                                    {extractedTexts[file.id]?.loading
                                      ? "Extracting..."
                                      : extractedTexts[file.id]?.text
                                        ? "Re-extract"
                                        : "Extract text"}
                                  </button>
                                  <button
                                    className="manual-btn primary"
                                    onClick={() => handleSummarizeFile(file)}
                                    disabled={summarizing[file.id]}
                                  >
                                    {summarizing[file.id]
                                      ? "Summarizing..."
                                      : summaries[file.id]
                                        ? "Re-summarize"
                                        : "Summarize"}
                                  </button>
                                  <button
                                    className="manual-btn"
                                    onClick={() => handleGenerateLesson(file)}
                                    disabled={lessonJobs[String(file.id)]?.loading}
                                  >
                                    {lessonJobs[String(file.id)]?.loading
                                      ? "Generating lesson..."
                                      : lessonJobs[String(file.id)]?.lesson
                                        ? "Regenerate lesson"
                                        : "Video lesson"}
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            {file.type === "ExternalUrl" && file.external_url ? (
                              <div className="manual-card-actions">
                                <a className="manual-btn" href={file.external_url} target="_blank" rel="noreferrer">
                                  Open link
                                </a>
                              </div>
                            ) : null}

                            {extractedTexts[file.id] && !extractedTexts[file.id].loading ? (
                              <div className="manual-note">
                                {extractedTexts[file.id].warning ? (
                                  <div className="manual-note warning" style={{ marginBottom: 12 }}>
                                    {extractedTexts[file.id].warning}
                                  </div>
                                ) : null}
                                {extractedTexts[file.id].error ? (
                                  <div className="manual-note error" style={{ marginBottom: 12 }}>
                                    {extractedTexts[file.id].error}
                                  </div>
                                ) : null}
                                {extractedTexts[file.id].text ? (
                                  <>
                                    <div className="manual-extract-meta">
                                      {extractedTexts[file.id].chars?.toLocaleString()} chars
                                      {extractedTexts[file.id].pages
                                        ? ` · ~${extractedTexts[file.id].pages} pages`
                                        : ""}
                                    </div>
                                    <pre className="manual-extract-text">
                                      {extractedTexts[file.id].text.slice(0, settings.previewLength)}
                                      {extractedTexts[file.id].text.length > settings.previewLength
                                        ? "\n\n... (truncated in preview)"
                                        : ""}
                                    </pre>
                                  </>
                                ) : null}
                              </div>
                            ) : null}

                            {summaries[file.id] ? (
                              <div className="manual-summary-panel">
                                <h4>AI Summary</h4>
                                <div className="manual-summary-content">
                                  {renderMarkdown(summaries[file.id])}
                                </div>
                              </div>
                            ) : null}

                            {renderLessonPanel(file)}

                            {file.error ? <div className="manual-note warning">{file.error}</div> : null}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {moduleSummary ? (
            <div className="manual-card">
              <p className="manual-section-kicker">Module summary</p>
              <h3 className="manual-card-title">{selectedModule?.name}</h3>
              <div className="manual-summary-content" style={{ marginTop: 14 }}>
                {renderMarkdown(moduleSummary)}
              </div>
            </div>
          ) : null}

          {selectedModule ? (
            <div className="manual-card">
              <div className="manual-toolbar">
                <div>
                  <p className="manual-section-kicker">Agent workflow</p>
                  <h3 className="manual-card-title">Generate</h3>
                </div>
              </div>

              <div className="manual-agent-layout">
                <div className="manual-agent-targets">
                  {AGENT_PACK_OPTIONS.map((option) => {
                    const hasResult = Boolean(moduleWorkflowResults[option.id]);
                    const isActive = moduleWorkflowTarget === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`manual-agent-target ${isActive ? "active" : ""}`}
                        onClick={() => setModuleWorkflowTarget(option.id)}
                      >
                        <div className="manual-agent-target-top">
                          <strong>{option.label}</strong>
                          <span className={`manual-agent-target-state ${hasResult ? "ready" : ""}`}>
                            {hasResult ? "Ready" : "Pending"}
                          </span>
                        </div>
                        <span>{option.description}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="manual-agent-control-panel">
                  <div className="manual-agent-control-orbit" aria-hidden="true">
                    <svg viewBox="0 0 240 140" className="manual-agent-control-svg">
                      <defs>
                        <linearGradient id="manualOrbitGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#8b1e3f" stopOpacity="0.95" />
                          <stop offset="55%" stopColor="#ffb703" stopOpacity="0.85" />
                          <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.82" />
                        </linearGradient>
                      </defs>
                      <ellipse
                        className="manual-agent-orbit-ring"
                        cx="120"
                        cy="70"
                        rx="94"
                        ry="34"
                        fill="none"
                        stroke="url(#manualOrbitGradient)"
                        strokeWidth="4"
                      />
                      <ellipse
                        className="manual-agent-orbit-ring manual-agent-orbit-ring-alt"
                        cx="120"
                        cy="70"
                        rx="62"
                        ry="22"
                        fill="none"
                        stroke="url(#manualOrbitGradient)"
                        strokeWidth="3"
                      />
                      <circle className="manual-agent-orbit-node manual-agent-orbit-node-a" cx="40" cy="72" r="8" fill="#8b1e3f" />
                      <circle className="manual-agent-orbit-node manual-agent-orbit-node-b" cx="120" cy="46" r="10" fill="#ffb703" />
                      <circle className="manual-agent-orbit-node manual-agent-orbit-node-c" cx="198" cy="76" r="7" fill="#1d4ed8" />
                    </svg>
                  </div>
                  <span className="manual-agent-control-kicker">Selected output</span>
                  <h4>
                    {AGENT_PACK_OPTIONS.find((option) => option.id === moduleWorkflowTarget)?.label || "Output"}
                  </h4>
                  <p>{AGENT_PACK_OPTIONS.find((option) => option.id === moduleWorkflowTarget)?.description || "Run the selected output."}</p>

                  <div className="manual-card-actions manual-agent-control-actions">
                    <button
                      className="manual-btn primary"
                      onClick={() => handleGenerateModuleWorkflow(moduleWorkflowTarget)}
                      disabled={moduleWorkflowLoading}
                    >
                      {moduleWorkflowLoading
                        ? "Generating..."
                        : moduleWorkflowResults[moduleWorkflowTarget]
                          ? `Regenerate ${AGENT_PACK_OPTIONS.find((option) => option.id === moduleWorkflowTarget)?.label || "output"}`
                          : `Generate ${AGENT_PACK_OPTIONS.find((option) => option.id === moduleWorkflowTarget)?.label || "output"}`}
                    </button>
                    {moduleWorkflowResults[moduleWorkflowTarget] ? (
                      <button
                        className="manual-btn"
                        onClick={() =>
                          setModuleWorkflowResults((current) => ({
                            ...current,
                            [moduleWorkflowTarget]: null,
                          }))
                        }
                        disabled={moduleWorkflowLoading}
                      >
                        Clear result
                      </button>
                    ) : null}
                  </div>

                  <div className="manual-agent-control-meta">
                    <span>
                      Module: <strong>{selectedModule.name}</strong>
                    </span>
                    <span>
                      PDFs: <strong>{pdfCount}</strong>
                    </span>
                  </div>
                </div>
              </div>

              {moduleWorkflowTarget === "study_plan" ? (
                <div className="manual-study-preferences">
                  <div className="manual-study-preferences-header">
                    <h4>Study plan settings</h4>
                  </div>

                  <div className="manual-study-preferences-grid">
                    <label className="manual-study-field">
                      <span>Time per day</span>
                      <select
                        value={String(studyPlanPreferences.availableDailyMinutes)}
                        onChange={(event) =>
                          updateStudyPlanPreference("availableDailyMinutes", Number(event.target.value))
                        }
                      >
                        <option value="30">30 min</option>
                        <option value="45">45 min</option>
                        <option value="60">60 min</option>
                        <option value="90">90 min</option>
                        <option value="120">120 min</option>
                      </select>
                    </label>

                    <label className="manual-study-field">
                      <span>Session length</span>
                      <select
                        value={String(studyPlanPreferences.sessionLength)}
                        onChange={(event) =>
                          updateStudyPlanPreference("sessionLength", Number(event.target.value))
                        }
                      >
                        <option value="20">20 min</option>
                        <option value="30">30 min</option>
                        <option value="45">45 min</option>
                        <option value="60">60 min</option>
                      </select>
                    </label>

                    <label className="manual-study-field">
                      <span>Plan horizon</span>
                      <select
                        value={String(studyPlanPreferences.horizonDays)}
                        onChange={(event) =>
                          updateStudyPlanPreference("horizonDays", Number(event.target.value))
                        }
                      >
                        <option value="3">3 days</option>
                        <option value="5">5 days</option>
                        <option value="7">7 days</option>
                        <option value="14">14 days</option>
                      </select>
                    </label>

                    <label className="manual-study-field">
                      <span>Pace</span>
                      <select
                        value={studyPlanPreferences.pace}
                        onChange={(event) => updateStudyPlanPreference("pace", event.target.value)}
                      >
                        <option value="light">Light</option>
                        <option value="balanced">Balanced</option>
                        <option value="intensive">Intensive</option>
                      </select>
                    </label>

                    <label className="manual-study-field">
                      <span>Preferred time</span>
                      <select
                        value={studyPlanPreferences.preferredTimeOfDay}
                        onChange={(event) =>
                          updateStudyPlanPreference("preferredTimeOfDay", event.target.value)
                        }
                      >
                        <option value="morning">Morning</option>
                        <option value="afternoon">Afternoon</option>
                        <option value="evening">Evening</option>
                        <option value="late_night">Late night</option>
                      </select>
                    </label>

                    <div className="manual-study-field manual-study-days-field">
                      <span>Study days</span>
                      <div className="manual-study-day-chips">
                        {DAY_NAMES.map((day) => (
                          <button
                            key={day.short}
                            type="button"
                            className={`manual-study-day-chip ${
                              studyPlanPreferences.focusDays.includes(day.short) ? "active" : ""
                            }`}
                            onClick={() => toggleStudyPlanDay(day.short)}
                          >
                            {day.full}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="manual-study-check">
                      <input
                        type="checkbox"
                        checked={studyPlanPreferences.includeBreaks}
                        onChange={(event) =>
                          updateStudyPlanPreference("includeBreaks", event.target.checked)
                        }
                      />
                      <span>Include breaks</span>
                    </label>

                    <label className="manual-study-check">
                      <input
                        type="checkbox"
                        checked={studyPlanPreferences.weekendStudy}
                        onChange={(event) =>
                          updateStudyPlanPreference("weekendStudy", event.target.checked)
                        }
                      />
                      <span>Include weekends</span>
                    </label>
                  </div>
                </div>
              ) : null}

              {moduleWorkflowError ? <div className="manual-note error">{moduleWorkflowError}</div> : null}

              {!moduleWorkflowLoading && !selectedWorkflow ? (
                <p className="manual-empty">Select an output to generate.</p>
              ) : null}

              {moduleWorkflowLoading ? (
                <p className="manual-empty">Generating...</p>
              ) : null}

              {selectedWorkflow ? (
                <div className="manual-agent-pack">
                  {moduleWorkflowTarget === "video_plan" ? (
                    <div className="manual-summary-panel">
                      <h4>Video Plan</h4>
                      <div className="manual-summary-content">
                        {renderMarkdown(
                          [
                            selectedWorkflow.workflow?.assets?.video_plan?.reason || "",
                            selectedWorkflow.workflow?.assets?.video_plan?.hook
                              ? `Opening hook: ${selectedWorkflow.workflow.assets.video_plan.hook}`
                              : "",
                            ...(selectedWorkflow.workflow?.assets?.video_plan?.scenes || []).map(
                              (scene, index) => `${index + 1}. ${scene}`
                            ),
                          ]
                            .filter(Boolean)
                            .join("\n")
                        )}
                      </div>
                    </div>
                  ) : null}

                  {moduleWorkflowTarget === "study_plan" ? (
                    <div className="manual-summary-panel">
                      <div className="manual-output-head">
                        <div>
                          <h4>Study Planner</h4>
                        </div>
                      </div>
                      {selectedStudySessions.length ? (
                        <>
                          <section className="feature-card feature-output-card feature-detail-shell manual-feature-shell">
                            <div className="feature-output-hero">
                              <div>
                                <span className="panel-badge feature-panel-badge">Generated plan</span>
                                <h3>{selectedModule?.name || "Module study plan"}</h3>
                                <p>{studyPlanView.overview}</p>
                              </div>
                              <div className="feature-output-meta">
                                <span>{studyPlanPreferences.horizonDays} day horizon</span>
                                <span>{studyPlanPreferences.hoursPerWeek} hrs/week</span>
                                <span>{selectedStudySessions.length} sessions</span>
                              </div>
                            </div>

                            <div className="feature-output-grid">
                              <div className="feature-result-block">
                                <h4>Weekly Focus</h4>
                                {(studyPlanView.weeklyPlan || []).map((week, index) => (
                                  <div key={`${week.day}-${index}`} className="feature-result-item">
                                    <strong>{week.day}</strong>
                                    <p>{week.focus}</p>
                                  </div>
                                ))}
                              </div>

                              <div className="feature-result-block">
                                <h4>Milestones</h4>
                                {(studyPlanView.milestones || []).map((milestone, index) => (
                                  <div key={`${milestone.title}-${index}`} className="feature-result-item">
                                    <strong>{milestone.title}</strong>
                                    <p>{milestone.reason}</p>
                                    <span>{formatDate(milestone.dueDate)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="feature-card feature-day-planner manual-feature-day-planner">
                              <div className="feature-library-head">
                                <div>
                                  <h3>Daily Study Schedule</h3>
                                </div>
                                <div className="feature-output-meta">
                                  <span>{formatStudyPace(studyPlanPreferences.pace)}</span>
                                  <span>{formatStudyWindow(studyPlanPreferences.preferredTimeOfDay)}</span>
                                </div>
                              </div>

                              <div className="feature-week-stack">
                                {(studyPlanView.dailySchedule || []).map((week, weekIndex) => (
                                  <section key={`${week.weekLabel}-${weekIndex}`} className="feature-week-card">
                                    <div className="feature-week-header">
                                      <div>
                                        <h4>{week.weekLabel}</h4>
                                        <p>{week.focus}</p>
                                      </div>
                                    </div>
                                    <div className="feature-day-grid">
                                      {(week.days || []).map((day, dayIndex) => (
                                        <div
                                          key={`${day.dayKey}-${dayIndex}`}
                                          className={`feature-day-card ${
                                            studyPlanPreferences.focusDays.includes(day.dayKey) ? "active" : ""
                                          }`}
                                        >
                                          <div className="feature-day-header">
                                            <div>
                                              <strong>{day.label}</strong>
                                              <span>{formatShortDate(day.date)}</span>
                                            </div>
                                            <small>{day.schedule}</small>
                                          </div>
                                          <div className="feature-task-list">
                                            {(day.tasks || []).map((task, taskIndex) => (
                                              <div key={`${day.dayKey}-task-${taskIndex}`} className="feature-result-item">
                                                <strong>{task}</strong>
                                              </div>
                                            ))}
                                            {(!day.tasks || day.tasks.length === 0) ? (
                                              <p className="feature-muted">Open slot</p>
                                            ) : null}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </section>
                                ))}
                              </div>
                            </div>
                          </section>
                        </>
                      ) : (
                        <p className="manual-empty">No study plan yet.</p>
                      )}
                    </div>
                  ) : null}

                  {moduleWorkflowTarget === "quizzes" ? (
                    <div className="manual-summary-panel">
                      <div className="manual-output-head">
                        <div>
                          <h4>Quiz</h4>
                        </div>
                        <div className="manual-card-actions">
                          <button type="button" className="manual-btn" onClick={resetQuizSelections}>
                            Reset answers
                          </button>
                        </div>
                      </div>
                      {selectedQuizQuestions.length ? (
                        <div className="manual-quiz-list">
                          <div className="manual-quiz-header">
                            <div className="manual-quiz-header-metric">
                              <strong>{selectedQuizQuestions.length}</strong>
                              <span>Questions</span>
                            </div>
                            <div className="manual-quiz-header-metric">
                              <strong>4</strong>
                              <span>Options each</span>
                            </div>
                            <div className="manual-quiz-header-metric">
                              <strong>{answeredQuizCount}</strong>
                              <span>Answered</span>
                            </div>
                            <div className="manual-quiz-header-metric">
                              <strong>{correctQuizCount}</strong>
                              <span>Correct</span>
                            </div>
                          </div>
                          {selectedQuizQuestions.map((rawQuestion, index) => {
                            const question = normalizeQuizQuestion(rawQuestion);
                            const selectedOption = quizSelections[`${moduleWorkflowTarget}-${index}`] || "";
                            const isCorrect = selectedOption && selectedOption === question.correctOption;
                            const showFeedback = Boolean(selectedOption);

                            return (
                              <div key={`${question.question}-${index}`} className="manual-quiz-card">
                                <div className="manual-quiz-question">
                                  {index + 1}. {question.question}
                                </div>
                                <div className="manual-quiz-options">
                                  {question.options.map((option, optionIndex) => {
                                    const optionKey = optionLetter(optionIndex);
                                    const isSelected = selectedOption === optionKey;
                                    const isAnswer = question.correctOption === optionKey;
                                    const resultClass = showFeedback
                                      ? isAnswer
                                        ? "correct"
                                        : isSelected
                                          ? "incorrect"
                                          : ""
                                      : "";
                                    return (
                                      <button
                                        key={`${question.question}-${optionKey}`}
                                        type="button"
                                        className={`manual-quiz-option ${isSelected ? "selected" : ""} ${resultClass}`}
                                        onClick={() => handleQuizSelection(moduleWorkflowTarget, index, optionKey)}
                                      >
                                        <span className="manual-quiz-option-key">{optionKey}</span>
                                        <span>{option}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                                {showFeedback ? (
                                  <div className={`manual-quiz-feedback ${isCorrect ? "correct" : "incorrect"}`}>
                                    <strong>
                                      {isCorrect
                                        ? "Correct"
                                        : `Incorrect. Correct answer: ${question.correctOption || question.answer}`}
                                    </strong>
                                    {question.explanation ? <span>{question.explanation}</span> : null}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="manual-empty">No quiz yet.</p>
                      )}
                    </div>
                  ) : null}

                  {moduleWorkflowTarget === "flashcards" ? (
                    <div className="manual-summary-panel">
                      <div className="manual-output-head">
                        <div>
                          <h4>Flashcards</h4>
                        </div>
                        <div className="manual-card-actions">
                          <button type="button" className="manual-btn" onClick={() => setAllFlashcards(selectedFlashcards, true)}>
                            Flip all
                          </button>
                          <button type="button" className="manual-btn" onClick={() => setAllFlashcards(selectedFlashcards, false)}>
                            Reset
                          </button>
                        </div>
                      </div>
                      {selectedFlashcards.length ? (
                        <>
                          <div className="manual-flashcard-metrics">
                            <div className="manual-flashcard-metric">
                              <strong>{selectedFlashcards.length}</strong>
                              <span>Total cards</span>
                            </div>
                            <div className="manual-flashcard-metric">
                              <strong>{flippedFlashcardCount}</strong>
                              <span>Reviewed</span>
                            </div>
                          </div>
                        <div className="manual-flashcard-grid">
                          {selectedFlashcards.map((card, index) => (
                            <button
                              key={`${card.front}-${index}`}
                              type="button"
                              className={`manual-flashcard ${flashcardFlips[`flashcard-${index}`] ? "flipped" : ""}`}
                              onClick={() => toggleFlashcard(`flashcard-${index}`)}
                            >
                              <span className="manual-flashcard-side-label">
                                {flashcardFlips[`flashcard-${index}`] ? "Answer" : "Prompt"}
                              </span>
                              <strong>
                                {flashcardFlips[`flashcard-${index}`] ? card.back : card.front}
                              </strong>
                              <span className="manual-flashcard-hint">Click to flip</span>
                            </button>
                          ))}
                        </div>
                        </>
                      ) : (
                        <p className="manual-empty">No flashcards yet.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {upcomingAssignments.length ? (
            <div className="manual-card">
              <div className="manual-toolbar">
                <div>
                  <p className="manual-section-kicker">Assignments</p>
                  <h3 className="manual-card-title">Upcoming work</h3>
                </div>
                <span className="manual-count-pill">{upcomingAssignments.length}</span>
              </div>

              <div className="manual-table-wrap" style={{ marginTop: 16 }}>
                <table className="manual-table">
                  <thead>
                    <tr>
                      <th>Assignment</th>
                      <th>Due date</th>
                      <th>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingAssignments.map((assignment) => {
                      const status = deadlineStatus(assignment.due_at);
                      return (
                        <tr key={assignment.id}>
                          <td>
                            {assignment.html_url ? (
                              <a href={assignment.html_url} target="_blank" rel="noreferrer">
                                {assignment.name}
                              </a>
                            ) : (
                              assignment.name
                            )}
                          </td>
                          <td>
                            {formatDate(assignment.due_at)}
                            {status ? (
                              <span className={`manual-deadline-badge ${status.cls}`}>
                                {status.label}
                              </span>
                            ) : null}
                          </td>
                          <td>{assignment.points_possible ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {gradedAssignments.length ? (
            <div className="manual-card">
              <div className="manual-toolbar">
                <div>
                  <p className="manual-section-kicker">Assignments</p>
                  <h3 className="manual-card-title">Graded work</h3>
                </div>
                <span className="manual-count-pill">{gradedAssignments.length}</span>
              </div>

              <div className="manual-table-wrap" style={{ marginTop: 16 }}>
                <table className="manual-table">
                  <thead>
                    <tr>
                      <th>Assignment</th>
                      <th>Submitted</th>
                      <th>Score</th>
                      <th>Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradedAssignments.map((assignment) => (
                      <tr key={assignment.id}>
                        <td>
                          {assignment.html_url ? (
                            <a href={assignment.html_url} target="_blank" rel="noreferrer">
                              {assignment.name}
                            </a>
                          ) : (
                            assignment.name
                          )}
                        </td>
                        <td>{formatDate(assignment.submitted_at || assignment.due_at)}</td>
                        <td>{formatScore(assignment.score, assignment.points_possible)}</td>
                        <td>{assignment.grade || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {files.length ? (
            <div className="manual-card">
              <div className="manual-toolbar">
                <div>
                  <p className="manual-section-kicker">Course files</p>
                  <h3 className="manual-card-title">All uploaded materials</h3>
                </div>
                <span className="manual-count-pill">{files.length}</span>
              </div>

              <div className="manual-file-list" style={{ marginTop: 18 }}>
                {files.map((file) => (
                  <div key={file.id} className="manual-file-card">
                    <div className="manual-file-header">
                      <div className="manual-file-meta">
                        <div className="manual-file-title-row">
                          <span
                            className={`manual-file-badge ${
                              (file.display_name || "").toLowerCase().endsWith(".pdf") ? "pdf" : "other"
                            }`}
                          >
                            {(file.display_name || "").toLowerCase().endsWith(".pdf") ? "PDF" : "File"}
                          </span>
                          <span className="manual-file-title">{file.display_name}</span>
                        </div>
                        <div className="manual-muted">
                          {file.size ? formatSize(file.size) : ""}
                          {file.size && file.created_at ? " · " : ""}
                          {file.created_at ? formatDate(file.created_at) : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
