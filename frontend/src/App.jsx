import { useState } from "react";
import "./App.css";

const API = "http://localhost:3001/api";
const DEFAULT_PLAN_PREFERENCES = {
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  hoursPerWeek: 8,
  sessionMinutes: 60,
  focusDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  priorities: [],
  selectedModuleIds: [],
  includeAssignments: true,
  objective: "General study plan",
  pace: "balanced",
};
const DAY_OPTIONS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PRIORITY_OPTIONS = ["assignments", "exams", "reading", "projects", "revision"];

function App() {
  // Existing state
  const [user, setUser] = useState(null);
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);

  // New state for modules & AI
  const [modules, setModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [moduleFiles, setModuleFiles] = useState([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [summaries, setSummaries] = useState({}); // fileId -> summary
  const [moduleSummary, setModuleSummary] = useState(null);
  const [summarizing, setSummarizing] = useState({}); // fileId -> bool
  const [summarizingModule, setSummarizingModule] = useState(false);
  const [extractedTexts, setExtractedTexts] = useState({}); // fileId -> {text, warning}
  const [searchQuery, setSearchQuery] = useState("");
  const [syllabus, setSyllabus] = useState(null);
  const [loadingSyllabus, setLoadingSyllabus] = useState(false);
  const [studyPlan, setStudyPlan] = useState(null);
  const [loadingStudyPlan, setLoadingStudyPlan] = useState(false);
  const [studyPlanError, setStudyPlanError] = useState("");
  const [planPreferences, setPlanPreferences] = useState(DEFAULT_PLAN_PREFERENCES);

  function resetCourseExtras() {
    setModules([]);
    setSelectedModule(null);
    setModuleFiles([]);
    setSummaries({});
    setModuleSummary(null);
    setSummarizing({});
    setSummarizingModule(false);
    setExtractedTexts({});
    setSearchQuery("");
    setSyllabus(null);
    setLoadingSyllabus(false);
    setStudyPlan(null);
    setLoadingStudyPlan(false);
    setStudyPlanError("");
    setPlanPreferences(DEFAULT_PLAN_PREFERENCES);
  }

  // ── Existing handlers ──────────────────────────────

  async function handleLogin() {
    setLoading(true);
    setError("");
    setUser(null);
    setCourses([]);
    setAssignments([]);
    setFiles([]);
    setSelectedCourse(null);
    resetCourseExtras();

    try {
      const res = await fetch(`${API}/test-login`);
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      setUser(data.user);

      const coursesRes = await fetch(`${API}/courses`);
      const coursesData = await coursesRes.json();

      if (Array.isArray(coursesData)) {
        setCourses(coursesData);
      }
    } catch (err) {
      setError("Network error - is the backend running on port 3001?");
    } finally {
      setLoading(false);
    }
  }

  async function handleCourseSelect(course) {
    setSelectedCourse(course);
    setAssignments([]);
    setFiles([]);
    resetCourseExtras();

    // Fetch assignments/files and modules in parallel
    setLoading(true);
    setLoadingModules(true);
    setLoadingSyllabus(true);

    await Promise.allSettled([
      fetchCourseData(course.id),
      fetchModules(course.id),
      fetchSyllabus(course.id),
    ]);

    setLoading(false);
    setLoadingModules(false);
    setLoadingSyllabus(false);
  }

  async function fetchCourseData(courseId) {
    try {
      const [assignRes, filesRes] = await Promise.allSettled([
        fetch(`${API}/courses/${courseId}/assignments`),
        fetch(`${API}/courses/${courseId}/files`),
      ]);

      if (assignRes.status === "fulfilled") {
        const data = await assignRes.value.json();
        setAssignments(Array.isArray(data) ? data : []);
      }

      if (filesRes.status === "fulfilled") {
        const data = await filesRes.value.json();
        setFiles(Array.isArray(data) ? data : []);
      }
    } catch {
      // Non-critical
    }
  }

  // ── New handlers: Modules & AI ─────────────────────

  async function fetchModules(courseId) {
    try {
      const res = await fetch(`${API}/modules?courseId=${courseId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setModules(data);
      } else {
        setModules([]);
      }
    } catch {
      setModules([]);
    }
  }

  async function fetchSyllabus(courseId) {
    try {
      const res = await fetch(`${API}/courses/${courseId}/syllabus`);
      const data = await res.json();
      if (!data.error) {
        setSyllabus(data);
      }
    } catch {
      setSyllabus(null);
    }
  }

  async function handleGenerateStudyPlan() {
    if (!selectedCourse) return;
    setLoadingStudyPlan(true);
    setStudyPlanError("");

    try {
      const res = await fetch(`${API}/study-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: selectedCourse.id,
          preferences: planPreferences,
        }),
      });
      const data = await res.json();

      if (data.error) {
        setStudyPlan(null);
        setStudyPlanError(data.error);
      } else {
        setStudyPlan(data.plan);
        if (data.preferences) {
          setPlanPreferences(data.preferences);
        }
      }
    } catch {
      setStudyPlan(null);
      setStudyPlanError("Failed to build study plan.");
    } finally {
      setLoadingStudyPlan(false);
    }
  }

  function updatePlanPreference(key, value) {
    setPlanPreferences((prev) => ({ ...prev, [key]: value }));
  }

  function toggleFocusDay(day) {
    setPlanPreferences((prev) => {
      const nextFocusDays = prev.focusDays.includes(day)
        ? prev.focusDays.filter((item) => item !== day)
        : [...prev.focusDays, day];
      return {
        ...prev,
        focusDays: nextFocusDays.length > 0 ? nextFocusDays : prev.focusDays,
      };
    });
  }

  function togglePriority(priority) {
    setPlanPreferences((prev) => ({
      ...prev,
      priorities: prev.priorities.includes(priority)
        ? prev.priorities.filter((item) => item !== priority)
        : [...prev.priorities, priority],
    }));
  }

  function togglePlanModule(moduleId) {
    setPlanPreferences((prev) => {
      const id = String(moduleId);
      const selectedModuleIds = prev.selectedModuleIds.includes(id)
        ? prev.selectedModuleIds.filter((item) => item !== id)
        : [...prev.selectedModuleIds, id];
      return { ...prev, selectedModuleIds };
    });
  }

  function updateStudyPlanField(section, index, key, value) {
    setStudyPlan((prev) => {
      if (!prev) return prev;
      const nextSection = [...(prev[section] || [])];
      nextSection[index] = { ...nextSection[index], [key]: value };
      return { ...prev, [section]: nextSection };
    });
  }

  function updateStudyPlanTask(weekIndex, taskIndex, value) {
    setStudyPlan((prev) => {
      if (!prev) return prev;
      const nextWeeklyPlan = [...(prev.weeklyPlan || [])];
      const selectedWeek = { ...nextWeeklyPlan[weekIndex] };
      const nextTasks = [...(selectedWeek.tasks || [])];
      nextTasks[taskIndex] = value;
      selectedWeek.tasks = nextTasks;
      nextWeeklyPlan[weekIndex] = selectedWeek;
      return { ...prev, weeklyPlan: nextWeeklyPlan };
    });
  }

  function addStudyPlanTask(weekIndex) {
    setStudyPlan((prev) => {
      if (!prev) return prev;
      const nextWeeklyPlan = [...(prev.weeklyPlan || [])];
      const selectedWeek = { ...nextWeeklyPlan[weekIndex] };
      selectedWeek.tasks = [...(selectedWeek.tasks || []), "New task"];
      nextWeeklyPlan[weekIndex] = selectedWeek;
      return { ...prev, weeklyPlan: nextWeeklyPlan };
    });
  }

  function removeStudyPlanTask(weekIndex, taskIndex) {
    setStudyPlan((prev) => {
      if (!prev) return prev;
      const nextWeeklyPlan = [...(prev.weeklyPlan || [])];
      const selectedWeek = { ...nextWeeklyPlan[weekIndex] };
      selectedWeek.tasks = (selectedWeek.tasks || []).filter(
        (_, index) => index !== taskIndex
      );
      nextWeeklyPlan[weekIndex] = selectedWeek;
      return { ...prev, weeklyPlan: nextWeeklyPlan };
    });
  }

  async function handleModuleSelect(mod) {
    setSelectedModule(mod);
    setModuleFiles([]);
    setSummaries({});
    setModuleSummary(null);
    setLoadingFiles(true);

    try {
      const res = await fetch(
        `${API}/module-files?courseId=${selectedCourse.id}&moduleId=${mod.id}`
      );
      const data = await res.json();
      if (Array.isArray(data)) {
        setModuleFiles(data);
      }
    } catch {
      setModuleFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }

  async function handleExtractText(file) {
    setExtractedTexts((prev) => ({
      ...prev,
      [file.id]: { loading: true },
    }));

    try {
      const res = await fetch(
        `${API}/file-text?fileId=${file.id}&courseId=${selectedCourse.id}`
      );
      const data = await res.json();
      setExtractedTexts((prev) => ({
        ...prev,
        [file.id]: {
          text: data.text || "",
          warning: data.warning || null,
          pages: data.pages,
          chars: data.chars,
          loading: false,
        },
      }));
    } catch (err) {
      setExtractedTexts((prev) => ({
        ...prev,
        [file.id]: { error: "Failed to extract text", loading: false },
      }));
    }
  }

  async function handleSummarizeFile(file) {
    setSummarizing((prev) => ({ ...prev, [file.id]: true }));

    try {
      const res = await fetch(`${API}/summarize-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: file.id,
          courseId: selectedCourse.id,
          fileName: file.display_name,
        }),
      });
      const data = await res.json();

      if (data.error) {
        setSummaries((prev) => ({
          ...prev,
          [file.id]: `Error: ${data.error}`,
        }));
      } else {
        setSummaries((prev) => ({ ...prev, [file.id]: data.summary }));
      }
    } catch (err) {
      setSummaries((prev) => ({
        ...prev,
        [file.id]: "Failed to generate summary.",
      }));
    } finally {
      setSummarizing((prev) => ({ ...prev, [file.id]: false }));
    }
  }

  async function handleSummarizeModule() {
    if (!selectedModule || !selectedCourse) return;
    setSummarizingModule(true);
    setModuleSummary(null);

    try {
      const res = await fetch(`${API}/summarize-module`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: selectedCourse.id,
          moduleId: selectedModule.id,
          moduleName: selectedModule.name,
        }),
      });
      const data = await res.json();

      if (data.error) {
        setModuleSummary(`Error: ${data.error}`);
      } else {
        setModuleSummary(data.summary);
      }
    } catch {
      setModuleSummary("Failed to generate module summary.");
    } finally {
      setSummarizingModule(false);
    }
  }

  async function handleSummarizeAllPDFs() {
    const pdfs = moduleFiles.filter((f) => f.is_pdf && f.type === "File");
    if (pdfs.length === 0) return;

    for (const file of pdfs) {
      if (!summaries[file.id]) {
        await handleSummarizeFile(file);
      }
    }
  }

  // ── Helpers ────────────────────────────────────────

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

  function formatSize(bytes) {
    if (!bytes) return "";
    const kb = bytes / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
  }

  // Simple markdown-ish rendering (bold, bullets, headers)
  function renderMarkdown(text) {
    if (!text) return null;
    return text.split("\n").map((line, i) => {
      // Headers
      if (line.startsWith("### "))
        return (
          <h4 key={i} className="md-h4">
            {renderInline(line.slice(4))}
          </h4>
        );
      if (line.startsWith("## "))
        return (
          <h3 key={i} className="md-h3">
            {renderInline(line.slice(3))}
          </h3>
        );
      // Bullets
      if (line.startsWith("- ") || line.startsWith("* "))
        return (
          <li key={i} className="md-li">
            {renderInline(line.slice(2))}
          </li>
        );
      // Numbered
      if (/^\d+\.\s/.test(line))
        return (
          <li key={i} className="md-li md-ol">
            {renderInline(line.replace(/^\d+\.\s/, ""))}
          </li>
        );
      // Empty line
      if (!line.trim()) return <br key={i} />;
      // Normal paragraph
      return (
        <p key={i} className="md-p">
          {renderInline(line)}
        </p>
      );
    });
  }

  function renderInline(text) {
    // Bold
    return text.split(/\*\*(.*?)\*\*/g).map((part, i) =>
      i % 2 === 1 ? (
        <strong key={i}>{part}</strong>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  }

  // Search filter for extracted texts
  const filteredFiles = searchQuery
    ? moduleFiles.filter((f) => {
        const text = extractedTexts[f.id]?.text || "";
        const name = f.display_name || "";
        const q = searchQuery.toLowerCase();
        return (
          name.toLowerCase().includes(q) || text.toLowerCase().includes(q)
        );
      })
    : moduleFiles;

  const pdfCount = moduleFiles.filter(
    (f) => f.is_pdf && f.type === "File"
  ).length;

  // ── Render ─────────────────────────────────────────

  return (
    <div className="app">
      <header>
        <h1>Canvas Study Assistant</h1>
        <p className="subtitle">
          AI-powered course material summarizer
        </p>
      </header>

      {/* Login */}
      <section className="login-section">
        <button onClick={handleLogin} disabled={loading} className="login-btn">
          {loading && <span className="spinner" />}
          {loading ? "Connecting..." : user ? "Refresh" : "Login with Canvas"}
        </button>
        {error && <div className="status error">{error}</div>}
        {user && <div className="status success">Connected as {user.name}</div>}
      </section>

      {/* User Info */}
      {user && (
        <section className="card">
          <h2>User Info</h2>
          <div className="user-info">
            {user.avatar_url && (
              <img src={user.avatar_url} alt="avatar" className="avatar" />
            )}
            <div>
              <p>
                <strong>Name:</strong> {user.name}
              </p>
              <p>
                <strong>Email:</strong> {user.email}
              </p>
              <p>
                <strong>ID:</strong> {user.id}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Course Selector */}
      {courses.length > 0 && (
        <section className="card">
          <h2>Select a Course ({courses.length})</h2>
          <div className="course-dropdown-wrap">
            <select
              className="course-dropdown"
              value={selectedCourse?.id || ""}
              onChange={(e) => {
                const course = courses.find(
                  (c) => c.id === Number(e.target.value)
                );
                if (course) handleCourseSelect(course);
              }}
            >
              <option value="">-- Choose a course --</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          {/* Also keep the clickable list */}
          <ul className="course-list">
            {courses.map((c) => (
              <li
                key={c.id}
                className={`course-item ${selectedCourse?.id === c.id ? "active" : ""}`}
                onClick={() => handleCourseSelect(c)}
              >
                <strong>{c.name}</strong>
                <span className="course-code">{c.code}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Modules Section ───────────────────────── */}
      {selectedCourse && (
        <section className="card">
          <div className="card-header-row">
            <h2>Syllabus - {selectedCourse.name}</h2>
            {loadingSyllabus && <span className="muted">Loading syllabus...</span>}
          </div>

          {!loadingSyllabus && !syllabus?.hasSyllabus && (
            <p className="muted">No syllabus body was found for this course.</p>
          )}

          {syllabus?.hasSyllabus && (
            <div className="syllabus-panel">
              <div className="syllabus-meta">
                <span>{syllabus.courseCode || "No course code"}</span>
                {syllabus.termName && <span>{syllabus.termName}</span>}
                {syllabus.source && syllabus.source !== "course.syllabus_body" && (
                  <span>Source: {syllabus.source}</span>
                )}
              </div>
              <div className="syllabus-preview">
                {syllabus.syllabusText.slice(0, 1800)}
                {syllabus.syllabusText.length > 1800 && "..."}
              </div>
            </div>
          )}
        </section>
      )}

      {selectedCourse && (
        <section className="card">
          <div className="card-header-row">
            <h2>Study Plan Builder</h2>
            <button
              className="action-btn primary"
              onClick={handleGenerateStudyPlan}
              disabled={loadingStudyPlan}
            >
              {loadingStudyPlan ? (
                <>
                  <span className="spinner-sm" /> Building...
                </>
              ) : studyPlan ? (
                "Regenerate Plan"
              ) : (
                "Build Study Plan"
              )}
            </button>
          </div>

          <div className="plan-form-grid">
            <label className="plan-field">
              Start date
              <input
                type="date"
                value={planPreferences.startDate}
                onChange={(e) => updatePlanPreference("startDate", e.target.value)}
              />
            </label>
            <label className="plan-field">
              End date
              <input
                type="date"
                value={planPreferences.endDate}
                onChange={(e) => updatePlanPreference("endDate", e.target.value)}
              />
            </label>
            <label className="plan-field">
              Hours per week
              <input
                type="number"
                min="1"
                max="40"
                value={planPreferences.hoursPerWeek}
                onChange={(e) => updatePlanPreference("hoursPerWeek", Number(e.target.value))}
              />
            </label>
            <label className="plan-field">
              Session minutes
              <input
                type="number"
                min="20"
                max="240"
                step="10"
                value={planPreferences.sessionMinutes}
                onChange={(e) => updatePlanPreference("sessionMinutes", Number(e.target.value))}
              />
            </label>
            <label className="plan-field">
              Pace
              <select
                value={planPreferences.pace}
                onChange={(e) => updatePlanPreference("pace", e.target.value)}
              >
                <option value="light">Light</option>
                <option value="balanced">Balanced</option>
                <option value="intensive">Intensive</option>
              </select>
            </label>
          </div>

          <label className="plan-field plan-field-wide">
            Study goal
            <input
              type="text"
              placeholder="Example: Midterm 2 prep"
              value={planPreferences.objective}
              onChange={(e) => updatePlanPreference("objective", e.target.value)}
            />
          </label>

          <div className="plan-chip-group">
            <span className="plan-chip-label">Focus days</span>
            {DAY_OPTIONS.map((day) => (
              <button
                key={day}
                type="button"
                className={`plan-chip ${planPreferences.focusDays.includes(day) ? "active" : ""}`}
                onClick={() => toggleFocusDay(day)}
              >
                {day}
              </button>
            ))}
          </div>

          <div className="plan-chip-group">
            <span className="plan-chip-label">Priorities</span>
            {PRIORITY_OPTIONS.map((priority) => (
              <button
                key={priority}
                type="button"
                className={`plan-chip ${planPreferences.priorities.includes(priority) ? "active" : ""}`}
                onClick={() => togglePriority(priority)}
              >
                {priority}
              </button>
            ))}
          </div>

          <div className="plan-chip-group plan-chip-group-modules">
            <span className="plan-chip-label">Module scope</span>
            <button
              type="button"
              className={`plan-chip ${planPreferences.selectedModuleIds.length === 0 ? "active" : ""}`}
              onClick={() => updatePlanPreference("selectedModuleIds", [])}
            >
              All modules
            </button>
            {modules.map((module) => {
              const isActive = planPreferences.selectedModuleIds.includes(String(module.id));
              return (
                <button
                  key={module.id}
                  type="button"
                  className={`plan-chip ${isActive ? "active" : ""}`}
                  onClick={() => togglePlanModule(module.id)}
                >
                  {module.name}
                </button>
              );
            })}
          </div>

          <label className="plan-checkbox">
            <input
              type="checkbox"
              checked={planPreferences.includeAssignments}
              onChange={(e) => updatePlanPreference("includeAssignments", e.target.checked)}
            />
            Include assignment deadlines in the plan
          </label>

          {studyPlanError && <p className="warning">{studyPlanError}</p>}

          {studyPlan && (
            <div className="study-plan-layout">
              <div className="study-plan-card">
                <h3>Overview</h3>
                <p className="muted plan-scope-note">
                  Scope: {planPreferences.selectedModuleIds.length > 0
                    ? `${planPreferences.selectedModuleIds.length} selected module(s)`
                    : "Entire course"} • {planPreferences.startDate} to {planPreferences.endDate}
                </p>
                <textarea
                  className="plan-textarea"
                  value={studyPlan.overview || ""}
                  onChange={(e) =>
                    setStudyPlan((prev) => ({ ...prev, overview: e.target.value }))
                  }
                />

                <h3>Recommendations</h3>
                <ul className="editable-list">
                  {(studyPlan.recommendations || []).map((item, index) => (
                    <li key={`${item}-${index}`}>
                      <input
                        value={item}
                        onChange={(e) =>
                          setStudyPlan((prev) => {
                            const recommendations = [...(prev.recommendations || [])];
                            recommendations[index] = e.target.value;
                            return { ...prev, recommendations };
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
              </div>

              <div className="study-plan-card">
                <h3>Weekly Plan</h3>
                {(studyPlan.weeklyPlan || []).map((week, weekIndex) => (
                  <div key={`${week.day}-${weekIndex}`} className="weekly-plan-item">
                    <input
                      className="plan-input strong"
                      value={week.day}
                      onChange={(e) =>
                        updateStudyPlanField("weeklyPlan", weekIndex, "day", e.target.value)
                      }
                    />
                    <input
                      className="plan-input"
                      value={week.focus}
                      onChange={(e) =>
                        updateStudyPlanField("weeklyPlan", weekIndex, "focus", e.target.value)
                      }
                    />
                    <div className="weekly-task-list">
                      {(week.tasks || []).map((task, taskIndex) => (
                        <div key={`${weekIndex}-${taskIndex}`} className="weekly-task-row">
                          <input
                            className="plan-input"
                            value={task}
                            onChange={(e) =>
                              updateStudyPlanTask(weekIndex, taskIndex, e.target.value)
                            }
                          />
                          <button
                            type="button"
                            className="action-btn sm"
                            onClick={() => removeStudyPlanTask(weekIndex, taskIndex)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="action-btn sm secondary"
                      onClick={() => addStudyPlanTask(weekIndex)}
                    >
                      Add Task
                    </button>
                  </div>
                ))}
              </div>

              <div className="study-plan-card">
                <h3>Milestones</h3>
                {(studyPlan.milestones || []).length === 0 && (
                  <p className="muted">No milestones generated yet.</p>
                )}
                {(studyPlan.milestones || []).map((item, index) => (
                  <div key={`${item.title}-${index}`} className="milestone-item">
                    <input
                      className="plan-input strong"
                      value={item.title}
                      onChange={(e) =>
                        updateStudyPlanField("milestones", index, "title", e.target.value)
                      }
                    />
                    <input
                      className="plan-input"
                      type="date"
                      value={item.dueDate ? item.dueDate.slice(0, 10) : ""}
                      onChange={(e) =>
                        updateStudyPlanField("milestones", index, "dueDate", e.target.value)
                      }
                    />
                    <textarea
                      className="plan-textarea compact"
                      value={item.reason}
                      onChange={(e) =>
                        updateStudyPlanField("milestones", index, "reason", e.target.value)
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {selectedCourse && (
        <section className="card">
          <h2>
            Modules - {selectedCourse.name}
            {modules.length > 0 && ` (${modules.length})`}
          </h2>

          {loadingModules && <p className="muted">Loading modules...</p>}

          {!loadingModules && modules.length === 0 && (
            <p className="muted">
              No modules found for this course (may require permissions).
            </p>
          )}

          {modules.length > 0 && (
            <ul className="module-list">
              {modules.map((m) => (
                <li
                  key={m.id}
                  className={`module-item ${selectedModule?.id === m.id ? "active" : ""}`}
                  onClick={() => handleModuleSelect(m)}
                >
                  <strong>{m.name}</strong>
                  <span className="module-meta">
                    {m.items_count != null && `${m.items_count} items`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Module Files ──────────────────────────── */}
      {selectedModule && (
        <section className="card">
          <div className="card-header-row">
            <h2>
              Files - {selectedModule.name}
              {moduleFiles.length > 0 && ` (${moduleFiles.length})`}
            </h2>
            <div className="card-actions">
              {pdfCount > 0 && (
                <>
                  <button
                    className="action-btn"
                    onClick={handleSummarizeModule}
                    disabled={summarizingModule}
                  >
                    {summarizingModule ? (
                      <>
                        <span className="spinner-sm" /> Summarizing...
                      </>
                    ) : (
                      "Summarize Module"
                    )}
                  </button>
                  <button
                    className="action-btn secondary"
                    onClick={handleSummarizeAllPDFs}
                  >
                    Summarize All PDFs
                  </button>
                </>
              )}
            </div>
          </div>

          {loadingFiles && <p className="muted">Loading files...</p>}

          {!loadingFiles && moduleFiles.length === 0 && (
            <p className="muted">No professor-uploaded files in this module.</p>
          )}

          {/* Search */}
          {moduleFiles.length > 0 && (
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search files and extracted text..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              {searchQuery && (
                <button
                  className="search-clear"
                  onClick={() => setSearchQuery("")}
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* File List */}
          {filteredFiles.map((f) => (
            <div key={f.id} className="file-card">
              <div className="file-header">
                <div className="file-info">
                  <span className={`file-badge ${f.is_pdf ? "pdf" : "other"}`}>
                    {f.is_pdf ? "PDF" : f.type === "ExternalUrl" ? "Link" : "File"}
                  </span>
                  <strong className="file-name">{f.display_name}</strong>
                  {f.size && (
                    <span className="file-size">{formatSize(f.size)}</span>
                  )}
                </div>
                {f.is_pdf && f.type === "File" && (
                  <div className="file-actions">
                    <button
                      className="action-btn sm"
                      onClick={() => handleExtractText(f)}
                      disabled={extractedTexts[f.id]?.loading}
                    >
                      {extractedTexts[f.id]?.loading
                        ? "Extracting..."
                        : extractedTexts[f.id]?.text
                          ? "Re-extract"
                          : "Extract Text"}
                    </button>
                    <button
                      className="action-btn sm primary"
                      onClick={() => handleSummarizeFile(f)}
                      disabled={summarizing[f.id]}
                    >
                      {summarizing[f.id]
                        ? <>
                            <span className="spinner-sm" /> Summarizing...
                          </>
                        : summaries[f.id]
                          ? "Re-summarize"
                          : "Summarize"}
                    </button>
                  </div>
                )}
                {f.type === "ExternalUrl" && f.external_url && (
                  <a
                    href={f.external_url}
                    target="_blank"
                    rel="noreferrer"
                    className="action-btn sm"
                  >
                    Open Link
                  </a>
                )}
              </div>

              {/* Extracted text preview */}
              {extractedTexts[f.id] && !extractedTexts[f.id].loading && (
                <div className="extract-panel">
                  {extractedTexts[f.id].warning && (
                    <p className="warning">{extractedTexts[f.id].warning}</p>
                  )}
                  {extractedTexts[f.id].error && (
                    <p className="warning">{extractedTexts[f.id].error}</p>
                  )}
                  {extractedTexts[f.id].text && (
                    <>
                      <p className="extract-meta">
                        {extractedTexts[f.id].chars?.toLocaleString()} chars
                        {extractedTexts[f.id].pages && `, ~${extractedTexts[f.id].pages} pages`}
                      </p>
                      <pre className="extract-text">
                        {extractedTexts[f.id].text.slice(0, 2000)}
                        {extractedTexts[f.id].text.length > 2000 && "\n\n... (truncated in preview)"}
                      </pre>
                    </>
                  )}
                </div>
              )}

              {/* Summary */}
              {summaries[f.id] && (
                <div className="summary-panel">
                  <h4>AI Summary</h4>
                  <div className="summary-content">
                    {renderMarkdown(summaries[f.id])}
                  </div>
                </div>
              )}

              {f.error && <p className="muted">{f.error}</p>}
            </div>
          ))}
        </section>
      )}

      {/* ── Module Summary ────────────────────────── */}
      {moduleSummary && (
        <section className="card summary-card">
          <h2>Module Summary - {selectedModule?.name}</h2>
          <div className="summary-content">
            {renderMarkdown(moduleSummary)}
          </div>
        </section>
      )}

      {/* ── Assignments (existing) ────────────────── */}
      {selectedCourse && assignments.length > 0 && (
        <section className="card">
          <h2>
            Assignments - {selectedCourse.name} ({assignments.length})
          </h2>
          <table>
            <thead>
              <tr>
                <th>Assignment</th>
                <th>Due Date</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.html_url ? (
                      <a href={a.html_url} target="_blank" rel="noreferrer">
                        {a.name}
                      </a>
                    ) : (
                      a.name
                    )}
                  </td>
                  <td>{formatDate(a.due_at)}</td>
                  <td>{a.points_possible ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ── Course Files (interactive) ─────────────── */}
      {selectedCourse && files.length > 0 && (
        <section className="card">
          <h2>
            All Course Files - {selectedCourse.name} ({files.length})
          </h2>

          {files.map((f) => {
            const isPdf = (f.display_name || "").toLowerCase().endsWith(".pdf");
            return (
              <div key={f.id} className="file-card">
                <div className="file-header">
                  <div className="file-info">
                    <span className={`file-badge ${isPdf ? "pdf" : "other"}`}>
                      {isPdf ? "PDF" : "File"}
                    </span>
                    <strong className="file-name">{f.display_name}</strong>
                    {f.size && (
                      <span className="file-size">{formatSize(f.size)}</span>
                    )}
                    <span className="file-date">{formatDate(f.created_at)}</span>
                  </div>
                  {isPdf && (
                    <div className="file-actions">
                      <button
                        className="action-btn sm"
                        onClick={() => handleExtractText({ id: f.id, display_name: f.display_name })}
                        disabled={extractedTexts[f.id]?.loading}
                      >
                        {extractedTexts[f.id]?.loading
                          ? "Extracting..."
                          : extractedTexts[f.id]?.text
                            ? "Re-extract"
                            : "Extract Text"}
                      </button>
                      <button
                        className="action-btn sm primary"
                        onClick={() => handleSummarizeFile({ id: f.id, display_name: f.display_name })}
                        disabled={summarizing[f.id]}
                      >
                        {summarizing[f.id]
                          ? <>
                              <span className="spinner-sm" /> Summarizing...
                            </>
                          : summaries[f.id]
                            ? "Re-summarize"
                            : "Summarize"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Extracted text preview */}
                {extractedTexts[f.id] && !extractedTexts[f.id].loading && (
                  <div className="extract-panel">
                    {extractedTexts[f.id].warning && (
                      <p className="warning">{extractedTexts[f.id].warning}</p>
                    )}
                    {extractedTexts[f.id].error && (
                      <p className="warning">{extractedTexts[f.id].error}</p>
                    )}
                    {extractedTexts[f.id].text && (
                      <>
                        <p className="extract-meta">
                          {extractedTexts[f.id].chars?.toLocaleString()} chars
                          {extractedTexts[f.id].pages && `, ~${extractedTexts[f.id].pages} pages`}
                        </p>
                        <pre className="extract-text">
                          {extractedTexts[f.id].text.slice(0, 2000)}
                          {extractedTexts[f.id].text.length > 2000 && "\n\n... (truncated in preview)"}
                        </pre>
                      </>
                    )}
                  </div>
                )}

                {/* Summary */}
                {summaries[f.id] && (
                  <div className="summary-panel">
                    <h4>AI Summary</h4>
                    <div className="summary-content">
                      {renderMarkdown(summaries[f.id])}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      <footer>
        <p>
          Canvas Study Assistant - Uses personal access token, not OAuth.
          AI summaries powered by Claude.
        </p>
      </footer>
    </div>
  );
}

export default App;
