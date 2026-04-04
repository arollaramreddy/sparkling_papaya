import { useState } from "react";
import "./App.css";

const API = "http://localhost:3001/api";

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

  // ── Existing handlers ──────────────────────────────

  async function handleLogin() {
    setLoading(true);
    setError("");
    setUser(null);
    setCourses([]);
    setAssignments([]);
    setFiles([]);
    setModules([]);
    setSelectedModule(null);
    setModuleFiles([]);
    setSummaries({});
    setModuleSummary(null);

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
    setModules([]);
    setSelectedModule(null);
    setModuleFiles([]);
    setSummaries({});
    setModuleSummary(null);
    setSearchQuery("");

    // Fetch assignments/files and modules in parallel
    setLoading(true);
    setLoadingModules(true);

    const [, modulesResult] = await Promise.allSettled([
      fetchCourseData(course.id),
      fetchModules(course.id),
    ]);

    setLoading(false);
    setLoadingModules(false);
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
