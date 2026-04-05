import { useCallback, useEffect, useState } from "react";
import "./App.css";
import {
  ChangeCard,
  MaterialCard,
  MaterialWorkflowPanel,
  SettingsPanel,
} from "./curated/AutonomousAgentsWorkingView";
import { getApiBase } from "./apiBase";
import useAutonomousInboxFeed from "./curated/useAutonomousInboxFeed";
import StudyPlanWorkspace from "./study-plan/StudyPlanWorkspace";
import studyPlanConfig from "./study-plan/study-plan.config.json";
import QuizWorkspace from "./quiz/QuizWorkspace";
import quizConfig from "./quiz/quiz.config.json";
import ManualStudentInteractionView from "./manual/ManualStudentInteractionView";

const API = getApiBase();

const TABS = [
  { id: "autonomous", label: "Autonomous agents working" },
  { id: studyPlanConfig.id, label: studyPlanConfig.label },
  { id: quizConfig.id, label: quizConfig.label },
  { id: "manual", label: "Manual student interaction" },
];

const AUTONOMOUS_ROUTES = [
  { id: "overview", label: "Overview", path: "/" },
  { id: "inbox", label: "Inbox", path: "/inbox" },
  { id: "materials", label: "Materials", path: "/materials" },
  { id: "scores", label: "Scores", path: "/scores" },
  { id: "practice", label: "Quizzes & flashcards", path: "/practice" },
  { id: "studyPlanner", label: "Study planner", path: "/study-planner" },
  { id: "settings", label: "Settings", path: "/settings" },
];

function getLocationPath() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

function resolveRouteFromPath(path = "/") {
  if (path === "/manual") {
    return { tab: "manual", pathname: path, autonomousRoute: "overview" };
  }

  if (path === "/study-plan" || path.startsWith("/study-plan/")) {
    return {
      tab: studyPlanConfig.id,
      pathname: path,
      autonomousRoute: "overview",
    };
  }

  if (path === "/quiz" || path.startsWith("/quiz/")) {
    return {
      tab: quizConfig.id,
      pathname: path,
      autonomousRoute: "overview",
    };
  }

  const matchedRoute = AUTONOMOUS_ROUTES.find((route) => route.path === path)?.id || "overview";
  return { tab: "autonomous", pathname: path, autonomousRoute: matchedRoute };
}

function parsePathRoute() {
  return resolveRouteFromPath(getLocationPath());
}

function setPathRoute(tab, detail = null, autonomousRoute = "overview") {
  if (typeof window === "undefined") return;

  let nextPath = "/";
  if (tab === "manual") {
    nextPath = "/manual";
  } else if (tab === studyPlanConfig.id) {
    nextPath = detail || "/study-plan";
  } else if (tab === quizConfig.id) {
    nextPath = detail || "/quiz";
  } else {
    nextPath = AUTONOMOUS_ROUTES.find((route) => route.id === autonomousRoute)?.path || "/";
  }

  if (window.location.pathname !== nextPath) {
    window.history.pushState({}, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

function formatTime(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatScore(score, pointsPossible) {
  if (score === null || score === undefined) return "-";
  if (pointsPossible === null || pointsPossible === undefined) return `${score}`;
  return `${score} / ${pointsPossible}`;
}

function percentFromAssignment(assignment) {
  if (
    assignment?.score === null ||
    assignment?.score === undefined ||
    !assignment?.points_possible
  ) {
    return null;
  }

  return Math.round((Number(assignment.score) / Number(assignment.points_possible)) * 100);
}

function scoreAdvice(percent) {
  if (percent === null) {
    return {
      title: "Waiting for grade detail",
      description: "Once score detail is available, the agents can explain what needs work.",
      tone: "neutral",
    };
  }

  if (percent < 70) {
    return {
      title: "Recovery workflow",
      description: "Agents focus on likely mistakes, a simpler summary, a video lesson, and a study-plan reset.",
      tone: "critical",
    };
  }

  if (percent < 85) {
    return {
      title: "Reinforcement workflow",
      description: "Agents tighten weak spots with a short summary, quiz practice, and a focused review block.",
      tone: "watch",
    };
  }

  return {
    title: "Keep momentum",
    description: "Agents keep review light here and shift attention toward weaker topics.",
    tone: "good",
  };
}

function RouteSidebar({ activeRoute, onNavigate }) {
  return (
    <aside className="workspace-sidebar">
      <div className="sidebar-block">
        <span className="panel-badge">Agentic AI workflow</span>
        <h3>Autonomous workspace</h3>
      </div>

      <div className="sidebar-nav">
        {AUTONOMOUS_ROUTES.map((route) => (
          <button
            key={route.id}
            type="button"
            className={`sidebar-link ${activeRoute === route.id ? "active" : ""}`}
            onClick={() => onNavigate(route.id)}
          >
            {route.label}
          </button>
        ))}
      </div>

      <div className="sidebar-block">
        <span className="panel-badge">What it does</span>
        <p>Messages, new materials, grades, quizzes, flashcards, videos, and study planning all live here.</p>
      </div>
    </aside>
  );
}

function OverviewPage({ feed, materialCards, runtimeState, onNavigate }) {
  const messages = feed.filter((item) => item.type === "message");
  const gradedAssignments = runtimeState?.canvas?.courseState?.assignments?.filter(
    (assignment) => assignment.score !== null && assignment.score !== undefined
  ) || [];
  const lowScoreCount = runtimeState?.intelligence?.performance?.lowScores?.length || 0;

  return (
    <div className="route-page">
      <section className="route-hero">
        <div>
          <span className="panel-badge">Autonomous agents working</span>
          <h2>Agentic AI workflow for student support</h2>
          <p>
            Your agents communicate with each other to handle inbox messages, new professor materials,
            released scores, quizzes, flashcards, video generation, and study planning.
          </p>
        </div>

        <div className="hero-metric-grid">
          <div className="hero-metric-card">
            <strong>{messages.length}</strong>
            <span>Inbox actions</span>
          </div>
          <div className="hero-metric-card">
            <strong>{materialCards.length}</strong>
            <span>Materials found</span>
          </div>
          <div className="hero-metric-card">
            <strong>{gradedAssignments.length}</strong>
            <span>Graded work</span>
          </div>
          <div className="hero-metric-card">
            <strong>{lowScoreCount}</strong>
            <span>Needs improvement</span>
          </div>
        </div>
      </section>

      <section className="route-section">
        <div className="section-header-inline">
          <div>
            <span className="panel-badge">Flow</span>
            <h3>How the autonomous tab helps</h3>
          </div>
        </div>

        <div className="trigger-grid">
          <article className="trigger-card">
            <strong>Inbox messages</strong>
            <span>When a message arrives, you can open it here, draft a reply, and send it.</span>
          </article>
          <article className="trigger-card">
            <strong>Materials</strong>
            <span>When a professor posts PDFs or materials, agents parse, fetch, summarize, and prepare video help.</span>
          </article>
          <article className="trigger-card">
            <strong>Scores</strong>
            <span>When marks are released, agents explain mistakes, suggest improvements, and trigger support.</span>
          </article>
          <article className="trigger-card">
            <strong>Quizzes and flashcards</strong>
            <span>Practice content is generated from the selected material workflow.</span>
          </article>
          <article className="trigger-card">
            <strong>Study planner</strong>
            <span>The planner agent turns deadlines and weak topics into focused study sessions.</span>
          </article>
          <article className="trigger-card">
            <strong>Manual tab</strong>
            <span>Students can still manually open courses, materials, discussions, videos, quizzes, and summaries.</span>
          </article>
        </div>
      </section>

      <section className="route-section">
        <div className="section-header-inline">
          <div>
            <span className="panel-badge">Quick open</span>
            <h3>Go to the right section</h3>
          </div>
        </div>

        <div className="trigger-grid">
          {AUTONOMOUS_ROUTES.filter((route) => route.id !== "overview" && route.id !== "settings").map((route) => (
            <article key={route.id} className="trigger-card">
              <strong>{route.label}</strong>
              <span>
                <button type="button" className="secondary-button" onClick={() => onNavigate(route.id)}>
                  Open
                </button>
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function InboxPage({
  clarificationInputs,
  drafts,
  feed,
  draftingMessageId,
  onClarificationChange,
  onDraftReply,
  onSendReply,
  sendingMessageId,
}) {
  const messageCards = feed
    .filter((item) => item.type === "message" && item.status === "draft_ready")
    .map((item) => ({
      ...item,
      clarificationInput: clarificationInputs[item.id] || "",
      draftState: drafts[item.id] || null,
      isDrafting: String(draftingMessageId) === String(item.id),
      isSending: String(sendingMessageId) === String(item.id),
    }));

  return (
    <div className="route-page route-two-column">
      <section className="route-section">
        <div className="section-header-inline">
          <div>
            <span className="panel-badge">Inbox</span>
            <h3>Reply-ready message workflow</h3>
          </div>
        </div>

        <div className="card-stack">
          {messageCards.length ? (
            messageCards.map((item) => (
              <ChangeCard
                key={item.id}
                item={item}
                onClarificationChange={onClarificationChange}
                onDraft={onDraftReply}
                onSend={onSendReply}
              />
            ))
          ) : (
            <div className="empty-card">
              <h3>No inbox actions</h3>
              <p>When someone sends a message, it will appear here with draft and send actions.</p>
            </div>
          )}
        </div>
      </section>

      <aside className="route-aside">
        <div className="login-card route-panel-card">
          <span className="panel-badge">Draft preview</span>
          {Object.keys(drafts).length ? (
            Object.entries(drafts).map(([messageId, draftState]) => (
              <div key={messageId} className="draft-entry">
                <strong>Message {messageId}</strong>
                <p>
                  {draftState?.requiresClarification
                    ? draftState.clarificationQuestion || "The agent needs more context."
                    : draftState?.draft || ""}
                </p>
              </div>
            ))
          ) : (
            <p>No draft yet. Click `Draft` on a message and the agents will prepare a reply.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function MaterialsPage({
  materialCards,
  materialLoading,
  materialWorkflow,
  onOpenMaterial,
  selectedMaterial,
}) {
  return (
    <div className="route-page route-two-column">
      <section className="route-section">
        <div className="section-header-inline">
          <div>
            <span className="panel-badge">Materials</span>
            <h3>Professor-posted PDFs and course materials</h3>
          </div>
        </div>

        <div className="card-stack">
          {materialCards.length ? (
            materialCards.map((item) => (
              <MaterialCard
                key={`${item.eventId}-${item.entityId || item.fileName}`}
                item={item}
                isActive={String(selectedMaterial?.eventId) === String(item.eventId)}
                onOpen={onOpenMaterial}
              />
            ))
          ) : (
            <div className="empty-card">
              <h3>No material events</h3>
              <p>When a professor adds a PDF or new material, it will show up here.</p>
            </div>
          )}
        </div>
      </section>

      <aside className="route-aside">
        <MaterialWorkflowPanel
          selectedMaterial={selectedMaterial}
          materialWorkflow={materialWorkflow}
          materialLoading={materialLoading}
        />
      </aside>
    </div>
  );
}

function ScoresPage({ runtimeState }) {
  const assignments = runtimeState?.canvas?.courseState?.assignments || [];
  const gradedAssignments = assignments
    .filter((assignment) => assignment.score !== null && assignment.score !== undefined)
    .sort((a, b) => new Date(b.submitted_at || b.due_at || 0) - new Date(a.submitted_at || a.due_at || 0));

  return (
    <div className="route-page">
      <section className="route-section">
        <div className="section-header-inline">
          <div>
            <span className="panel-badge">Scores</span>
            <h3>Graded assignments and improvement support</h3>
          </div>
        </div>

        <div className="score-grid">
          {gradedAssignments.length ? (
            gradedAssignments.map((assignment) => {
              const percent = percentFromAssignment(assignment);
              const advice = scoreAdvice(percent);
              return (
                <article key={assignment.id} className={`score-card score-card-${advice.tone}`}>
                  <div className="score-card-top">
                    <div>
                      <span className="score-kicker">{advice.title}</span>
                      <h4>{assignment.name}</h4>
                    </div>
                    <div className="score-badge">
                      {percent !== null ? `${percent}%` : "No %"}
                    </div>
                  </div>
                  <div className="score-meta">
                    <span>Score: {formatScore(assignment.score, assignment.points_possible)}</span>
                    <span>Submitted: {formatTime(assignment.submitted_at || assignment.due_at)}</span>
                  </div>
                  <p>{advice.description}</p>
                  <div className="score-action-list">
                    <span>Mistake summary</span>
                    <span>Video support</span>
                    <span>Study-plan update</span>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty-card">
              <h3>No graded work yet</h3>
              <p>When a score is released, agents will surface improvement guidance here.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PracticePage({
  materialCards,
  materialLoading,
  materialWorkflow,
  onOpenMaterial,
  selectedMaterial,
}) {
  const quizzes = materialWorkflow?.workflow?.assets?.quiz_questions || [];
  const flashcards = materialWorkflow?.workflow?.assets?.flashcards || [];

  return (
    <div className="route-page route-two-column">
      <section className="route-section">
        <div className="section-header-inline">
          <div>
            <span className="panel-badge">Practice</span>
            <h3>Quizzes and flashcards from material workflows</h3>
          </div>
        </div>

        {materialLoading ? (
          <div className="empty-card">
            <h3>Agents are building practice material</h3>
            <p>The selected material is being turned into quizzes, flashcards, summary support, and video help.</p>
          </div>
        ) : (
          <div className="route-page">
            <div className="route-section">
              <div className="section-header-inline">
                <div>
                  <span className="panel-badge">Quiz set</span>
                  <h3>{selectedMaterial ? selectedMaterial.fileName : "Select material first"}</h3>
                </div>
              </div>

              <div className="score-grid">
                {quizzes.length ? (
                  quizzes.map((question, index) => (
                    <article key={`${question.question}-${index}`} className="score-card score-card-neutral">
                      <div className="score-card-top">
                        <div>
                          <span className="score-kicker">{question.difficulty || "practice"}</span>
                          <h4>{question.question}</h4>
                        </div>
                      </div>
                      <p>{question.answer}</p>
                    </article>
                  ))
                ) : (
                  <div className="empty-card">
                    <h3>No quiz yet</h3>
                    <p>Select a material in the right panel and the agents will generate quiz questions.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="route-section">
              <div className="section-header-inline">
                <div>
                  <span className="panel-badge">Flashcards</span>
                  <h3>Recall cards</h3>
                </div>
              </div>

              <div className="score-grid">
                {flashcards.length ? (
                  flashcards.map((card, index) => (
                    <article key={`${card.front}-${index}`} className="score-card score-card-neutral">
                      <div className="score-card-top">
                        <div>
                          <span className="score-kicker">Card {index + 1}</span>
                          <h4>{card.front}</h4>
                        </div>
                      </div>
                      <p>{card.back}</p>
                    </article>
                  ))
                ) : (
                  <div className="empty-card">
                    <h3>No flashcards yet</h3>
                    <p>Select a material in the right panel and the agents will generate flashcards.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <aside className="route-aside">
        <section className="route-section">
          <div className="section-header-inline">
            <div>
              <span className="panel-badge">Materials</span>
              <h3>Pick a material</h3>
            </div>
          </div>

          <div className="card-stack">
            {materialCards.length ? (
              materialCards.map((item) => (
                <MaterialCard
                  key={`${item.eventId}-${item.entityId || item.fileName}`}
                  item={item}
                  isActive={String(selectedMaterial?.eventId) === String(item.eventId)}
                  onOpen={onOpenMaterial}
                />
              ))
            ) : (
              <div className="empty-card">
                <h3>No material events</h3>
                <p>Once the professor posts content, you can generate practice here.</p>
              </div>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function StudyPlannerPage({ runtimeState, materialWorkflow }) {
  const upcomingAssignments = (runtimeState?.canvas?.courseState?.assignments || [])
    .filter((assignment) => assignment.due_at && !assignment.is_completed)
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
    .slice(0, 6);
  const plan = materialWorkflow?.workflow?.assets?.study_plan || null;
  const sessions = plan?.sessions || [];

  return (
    <div className="route-page">
      <section className="route-section">
        <div className="section-header-inline">
          <div>
            <span className="panel-badge">Study planner</span>
            <h3>Agent-generated study sessions</h3>
          </div>
        </div>

        <div className="score-grid">
          {sessions.length ? (
            sessions.map((session, index) => (
              <article key={`${session.title}-${index}`} className="score-card score-card-watch">
                <div className="score-card-top">
                  <div>
                    <span className="score-kicker">{plan?.horizon || "study plan"}</span>
                    <h4>{session.title}</h4>
                  </div>
                  <div className="score-badge">{session.duration_minutes || 0} min</div>
                </div>
                <p>{session.goal}</p>
              </article>
            ))
          ) : (
            <div className="empty-card">
              <h3>No generated study plan yet</h3>
              <p>Open a material in the Materials section and the study planner agent will populate this area.</p>
            </div>
          )}
        </div>
      </section>

      <section className="route-section">
        <div className="section-header-inline">
          <div>
            <span className="panel-badge">Upcoming work</span>
            <h3>Assignments and deadlines</h3>
          </div>
        </div>

        <div className="trigger-grid">
          {upcomingAssignments.length ? (
            upcomingAssignments.map((assignment) => (
              <article key={assignment.id} className="trigger-card">
                <strong>{assignment.name}</strong>
                <span>Due {formatTime(assignment.due_at)}</span>
              </article>
            ))
          ) : (
            <div className="empty-card">
              <h3>No upcoming assignments</h3>
              <p>The study planner will prioritize future work here when deadlines are available.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function AutonomousWorkspace({
  autonomousError,
  autonomousLoading,
  autonomousRoute,
  clarificationInputs,
  drafts,
  feed,
  materialCards,
  materialLoading,
  materialWorkflow,
  draftingMessageId,
  onNavigate,
  onClarificationChange,
  onOpenMaterial,
  onDraftReply,
  onPreferenceChange,
  onSendReply,
  preferences,
  runtimeState,
  selectedMaterial,
  sendingMessageId,
  syncNow,
  syncing,
}) {
  const routeLabel = AUTONOMOUS_ROUTES.find((route) => route.id === autonomousRoute)?.label || "Overview";

  return (
    <div className="autonomous-shell">
      <RouteSidebar activeRoute={autonomousRoute} onNavigate={onNavigate} />

      <main className="autonomous-main">
        <div className="autonomous-topbar">
          <div>
            <span className="panel-badge">Autonomous agents working</span>
            <h2>{routeLabel}</h2>
          </div>
          <button className="secondary-button" onClick={() => syncNow()} disabled={syncing}>
            {syncing ? "Syncing..." : "Sync state"}
          </button>
        </div>

        {autonomousError ? <div className="error-banner">{autonomousError}</div> : null}

        {autonomousLoading ? (
          <div className="empty-card">
            <h3>Loading autonomous workspace</h3>
            <p>Pulling messages, materials, scores, quizzes, flashcards, and study planning signals.</p>
          </div>
        ) : null}

        {!autonomousLoading && autonomousRoute === "overview" ? (
          <OverviewPage
            feed={feed}
            materialCards={materialCards}
            runtimeState={runtimeState}
            onNavigate={onNavigate}
          />
        ) : null}

        {!autonomousLoading && autonomousRoute === "inbox" ? (
          <InboxPage
            clarificationInputs={clarificationInputs}
            drafts={drafts}
            feed={feed}
            draftingMessageId={draftingMessageId}
            onClarificationChange={onClarificationChange}
            onDraftReply={onDraftReply}
            onSendReply={onSendReply}
            sendingMessageId={sendingMessageId}
          />
        ) : null}

        {!autonomousLoading && autonomousRoute === "materials" ? (
          <MaterialsPage
            materialCards={materialCards}
            materialLoading={materialLoading}
            materialWorkflow={materialWorkflow}
            onOpenMaterial={onOpenMaterial}
            selectedMaterial={selectedMaterial}
          />
        ) : null}

        {!autonomousLoading && autonomousRoute === "scores" ? (
          <ScoresPage runtimeState={runtimeState} />
        ) : null}

        {!autonomousLoading && autonomousRoute === "practice" ? (
          <PracticePage
            materialCards={materialCards}
            materialLoading={materialLoading}
            materialWorkflow={materialWorkflow}
            onOpenMaterial={onOpenMaterial}
            selectedMaterial={selectedMaterial}
          />
        ) : null}

        {!autonomousLoading && autonomousRoute === "studyPlanner" ? (
          <StudyPlannerPage
            runtimeState={runtimeState}
            materialWorkflow={materialWorkflow}
          />
        ) : null}

        {!autonomousLoading && autonomousRoute === "settings" ? (
          <div className="route-page route-single-column">
            <SettingsPanel preferences={preferences} onPreferenceChange={onPreferenceChange} />
          </div>
        ) : null}
      </main>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const initialRoute = parsePathRoute();
  const [activeTab, setActiveTab] = useState(initialRoute.tab);
  const [autonomousRoute, setAutonomousRoute] = useState(initialRoute.autonomousRoute);
  const [pathname, setPathname] = useState(initialRoute.pathname);
  const [courses, setCourses] = useState([]);

  const {
    clarificationInputs,
    drafts,
    error: autonomousError,
    feed,
    loading: autonomousLoading,
    materialCards,
    materialLoading,
    materialWorkflow,
    draftingMessageId,
    onClarificationChange,
    onOpenMaterial,
    onDraftReply,
    onPreferenceChange,
    onSendReply,
    preferences,
    runtimeState,
    selectedMaterial,
    sendingMessageId,
    syncNow,
    syncing,
  } = useAutonomousInboxFeed(undefined, user?.name || "");

  const apiFetchJson = useCallback(async (url, options = {}) => {
    const response = await fetch(url, {
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
  }, []);

  const navigateToPath = useCallback((nextPath) => {
    if (typeof window !== "undefined" && window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    const next = resolveRouteFromPath(nextPath);
    setPathname(next.pathname);
    setActiveTab(next.tab);
    setAutonomousRoute(next.autonomousRoute);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const next = parsePathRoute();
      setPathname(next.pathname);
      setActiveTab(next.tab);
      setAutonomousRoute(next.autonomousRoute);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const bootstrapSession = useCallback(async () => {
    setAuthLoading(true);
    setError("");
    try {
      const auth = await apiFetchJson(`${API}/auth/me`, { headers: {} }).catch(() => ({ authenticated: false }));
      if (auth.authenticated && auth.user) {
        setUser(auth.user);
        const loadedCourses = await apiFetchJson(`${API}/courses`, { headers: {} }).catch(() => []);
        setCourses(Array.isArray(loadedCourses) ? loadedCourses : []);
        const next = parsePathRoute();
        setPathname(next.pathname);
        setActiveTab(next.tab);
        setAutonomousRoute(next.autonomousRoute);
      } else {
        setUser(null);
        setCourses([]);
      }
    } catch (err) {
      setError(err.message || "Failed to load session");
    } finally {
      setAuthLoading(false);
    }
  }, [apiFetchJson]);

  useEffect(() => {
    bootstrapSession();
  }, [bootstrapSession]);

  async function handleLogin() {
    if (!tokenInput.trim() || submitting) return;

    setSubmitting(true);
    setError("");
    try {
      const auth = await apiFetchJson(`${API}/auth/token-login`, {
        method: "POST",
        body: JSON.stringify({ accessToken: tokenInput.trim() }),
      });
      setUser(auth.user || null);
      const loadedCourses = await apiFetchJson(`${API}/courses`, { headers: {} }).catch(() => []);
      setCourses(Array.isArray(loadedCourses) ? loadedCourses : []);
      setTokenInput("");
      navigateToPath("/");
    } catch (err) {
      setError(err.message || "Failed to sign in");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    setError("");
    try {
      await apiFetchJson(`${API}/auth/logout`, {
        method: "POST",
        headers: {},
      });
      setUser(null);
      setCourses([]);
      setTokenInput("");
      navigateToPath("/");
    } catch (err) {
      setError(err.message || "Failed to log out");
    } finally {
      setLoggingOut(false);
    }
  }

  function handleTabSelect(tabId) {
    setActiveTab(tabId);
    if (tabId === "manual") {
      setPathRoute("manual");
      return;
    }
    if (tabId === studyPlanConfig.id) {
      setPathRoute(studyPlanConfig.id, "/study-plan");
      return;
    }
    if (tabId === quizConfig.id) {
      setPathRoute(quizConfig.id, "/quiz");
      return;
    }
    setPathRoute("autonomous", null, autonomousRoute);
  }

  function handleAutonomousRoute(routeId) {
    setAutonomousRoute(routeId);
    setPathRoute("autonomous", null, routeId);
  }

  if (authLoading) {
    return (
      <div className="app-shell app-shell-loading">
        <div className="status-card">
          <div className="status-dot" />
          <h1>Loading workspace</h1>
          <p>Checking your Canvas session.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell app-shell-login">
        <div className="login-layout">
          <div className="brand-block">
            <span className="brand-tag">Canvas Copilot</span>
            <h1>Login with your Canvas personal access token</h1>
            <p>Paste your token to enter the workspace. The token field is hidden as you type.</p>
          </div>

          <div className="login-card">
            <label className="field-label" htmlFor="canvas-token">
              Canvas Personal Access Token
            </label>
            <input
              id="canvas-token"
              className="token-input"
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="Enter your Canvas token"
              autoComplete="off"
              spellCheck="false"
            />

            {error ? <div className="error-banner">{error}</div> : null}

            <button className="primary-button" onClick={handleLogin} disabled={submitting || !tokenInput.trim()}>
              {submitting ? "Signing in..." : "Login"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell app-shell-workspace">
      <div className="workspace-frame workspace-frame-wide">
        <header className="workspace-header">
          <div>
            <span className="brand-tag">Canvas Copilot</span>
            <h1>Welcome, {user.name}</h1>
          </div>
          <button className="secondary-button" onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? "Logging out..." : "Logout"}
          </button>
        </header>

        <section className="workspace-card workspace-card-wide">
          <div className="tab-row" role="tablist" aria-label="Workspace tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => handleTabSelect(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="tab-panel tab-panel-wide" role="tabpanel">
            {activeTab === "autonomous" ? (
              <AutonomousWorkspace
                autonomousError={autonomousError}
                autonomousLoading={autonomousLoading}
                autonomousRoute={autonomousRoute}
                clarificationInputs={clarificationInputs}
                drafts={drafts}
                feed={feed}
                materialCards={materialCards}
                materialLoading={materialLoading}
                materialWorkflow={materialWorkflow}
                draftingMessageId={draftingMessageId}
                onNavigate={handleAutonomousRoute}
                onClarificationChange={onClarificationChange}
                onOpenMaterial={onOpenMaterial}
                onDraftReply={onDraftReply}
                onPreferenceChange={onPreferenceChange}
                onSendReply={onSendReply}
                preferences={preferences}
                runtimeState={runtimeState}
                selectedMaterial={selectedMaterial}
                sendingMessageId={sendingMessageId}
                syncNow={syncNow}
                syncing={syncing}
              />
            ) : (
              <div className="panel-copy">
                {activeTab === studyPlanConfig.id ? (
                  <StudyPlanWorkspace
                    apiBase={API}
                    apiFetchJson={apiFetchJson}
                    user={user}
                    courses={courses}
                    routePath={pathname}
                    onNavigateList={() => navigateToPath("/study-plan")}
                    onNavigateDraft={() => navigateToPath("/study-plan/draft")}
                    onNavigateSavedPlan={(planId) => navigateToPath(`/study-plan/${encodeURIComponent(planId)}`)}
                  />
                ) : activeTab === quizConfig.id ? (
                  <QuizWorkspace
                    apiBase={API}
                    apiFetchJson={apiFetchJson}
                    user={user}
                    courses={courses}
                    routePath={pathname}
                    onNavigateList={() => navigateToPath("/quiz")}
                    onNavigateDraft={() => navigateToPath("/quiz/draft")}
                    onNavigateSavedQuiz={(quizId) => navigateToPath(`/quiz/${encodeURIComponent(quizId)}`)}
                  />
                ) : (
                  <ManualStudentInteractionView apiBase={API} active={activeTab === "manual"} />
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {error ? <div className="error-floating">{error}</div> : null}
    </div>
  );
}

export default App;
