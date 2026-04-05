# Canvas Co-Pilot

Canvas Co-Pilot turns Canvas from a passive course portal into an active learning assistant.

Traditional Canvas workflows make students do the orchestration themselves: check for changes, read long PDFs, interpret grades, decide what to study, and figure out which resources matter most. Canvas Co-Pilot changes that by continuously monitoring course state, understanding what changed, and coordinating AI agents to take helpful actions automatically.

Instead of only showing assignments, grades, and materials, the system can:

- detect newly posted course content
- summarize and explain materials
- generate flashcards, quizzes, and study plans
- create lesson/video plans
- react to low scores with targeted recovery support
- let students switch between autonomous and manual workflows

In short, it turns Canvas into an active academic support layer.

## What Problem It Solves

Students usually lose time on course management before they even start learning:

- searching for what changed in a course
- reading dense slides and PDFs end to end
- figuring out why a score dropped
- deciding what to study next
- turning raw content into practice material

Canvas Co-Pilot reduces that overhead.

When new material appears, it can read, summarize, and prepare follow-up learning assets.

When grades are released, it can inspect performance signals, identify weak areas, and generate recovery artifacts such as:

- focused summaries
- targeted videos or lesson plans
- quizzes and flashcards
- structured study plans

This gives students a clearer path from “something changed” to “here is what to do next.”

## Core Product Model

Canvas Co-Pilot supports two operating modes.

### Autonomous Mode

The system runs in the background like a monitoring and intervention layer:

1. watch Canvas state
2. detect meaningful changes
3. decide which workflow should run
4. coordinate multiple agents
5. return support artifacts to the student UI

This is the mode for continuous support.

### Manual Mode

The student can explicitly open courses, modules, files, and workflows and request outputs directly, such as:

- flashcards
- quizzes
- study plans
- lesson/video generation

This is the mode for direct control.

## Architecture

The project is a full-stack monorepo with a React frontend and a Node/Express backend.

```text
frontend/   React + Vite application
backend/    Express API, Canvas integration, LangGraph orchestration, storage
```

### Frontend

The frontend provides the student-facing workspace.

Main areas include:

- autonomous workflow dashboard
- study plan workspace
- quiz workspace
- manual student interaction workspace

Important files:

- [App.jsx](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/frontend/src/App.jsx)
- [ManualStudentInteractionView.jsx](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/frontend/src/manual/ManualStudentInteractionView.jsx)
- [StudyPlanWorkspace.jsx](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/frontend/src/study-plan/StudyPlanWorkspace.jsx)
- [QuizWorkspace.jsx](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/frontend/src/quiz/QuizWorkspace.jsx)

### Backend

The backend is the coordination layer between Canvas, AI services, workflow state, and the frontend.

Main responsibilities:

- authenticate students with a Canvas Personal Access Token
- fetch and normalize Canvas courses, modules, files, assignments, and messages
- store runtime data and user preferences
- run AI-powered workflows
- coordinate LangGraph-based agent execution
- generate lesson audio and video artifacts

Important files:

- [server.js](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/server.js)
- [db.js](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/lib/db.js)
- [langgraph-runtime.js](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/lib/langgraph-runtime.js)

## Agentic Workflow

The agent system is built around a central orchestrator and a shared runtime state.

High-level flow:

1. Canvas state is collected and normalized.
2. A change-detection layer determines whether something meaningful happened.
3. The orchestrator selects which agents should run.
4. Agents exchange outputs through shared workflow state.
5. The frontend receives a coherent result instead of many disconnected tool calls.

The main orchestrator and agent registry live in:

- [agent-6-orchestrator.js](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/agents/agentic-workflow/agent-6-orchestrator.js)
- [index.js](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/agents/agentic-workflow/index.js)
- [runtime-state-contract.js](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/agents/agentic-workflow/contracts/runtime-state-contract.js)

### Agent Roles

The system is organized as specialized agents with bounded responsibilities.

#### Agent 1: Parse and Research

- reads selected topic/module content
- grounds the workflow in source material
- prepares the content package for downstream agents

File:
- [agent-1-parse-and-research.js](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/agents/agentic-workflow/agent-1-parse-and-research.js)

#### Agent 2: Summarize by Preference

- adapts explanations to student preferences
- converts raw source material into a more learnable form

File:
- [agent-2-summarize-by-preference.js](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/agents/agentic-workflow/agent-2-summarize-by-preference.js)

#### Agent 3: Create Flashcards

- transforms summary content into recall-oriented study cards

File:
- [agent-3-create-flashcards.js](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/agents/agentic-workflow/agent-3-create-flashcards.js)

#### Agent 4: Create Quizzes

- generates checks-for-understanding from the learning package

File:
- [agent-4-create-quizzes.js](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/agents/agentic-workflow/agent-4-create-quizzes.js)

#### Agent 5: Create Video Plan

- prepares a lesson/video-oriented explanation structure
- organizes examples, scenarios, and teaching cues

File:
- [agent-5-create-video-plan.js](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/agents/agentic-workflow/agent-5-create-video-plan.js)

#### Agent 6: Create Study Plan

- turns deadlines, scope, and learning needs into study sessions and milestones

File:
- [agent-6-create-study-plan.js](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/agents/agentic-workflow/agent-6-create-study-plan.js)

#### Agent 7: State Change Decider

- detects important Canvas events
- decides what workflow should run next
- acts like the policy layer for autonomous behavior

Examples of handled events:

- new material posted
- grade released
- missing assignment detected
- new message received

File:
- [agent-7-state-change-decider.js](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/agents/agentic-workflow/agent-7-state-change-decider.js)

#### Agent 8: Grade Intervention

- reasons about poor performance
- identifies recovery direction
- triggers reinforcement and study-plan support

File:
- [agent-8-grade-intervention.js](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/agents/agentic-workflow/agent-8-grade-intervention.js)

## How The Agents Communicate

The agents do not operate as isolated scripts. They communicate through shared runtime state and orchestrated handoffs.

At a high level:

- Canvas data is normalized into `runtimeState`
- student memory and preferences are attached to that state
- each agent reads the parts of state it needs
- each agent writes a structured result
- later agents consume prior results
- the orchestrator decides ordering, dependencies, and fan-out/fan-in

This gives the system three important properties:

- stateful reasoning across the workflow
- specialization by agent role
- coordinated output instead of fragmented responses

For a deeper technical breakdown, see:

- [backend/agents/agentic-workflow/README.md](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/agents/agentic-workflow/README.md)

## Authentication

The project currently uses a Canvas Personal Access Token for authentication.

That means:

- a student logs in with a Canvas token through the UI
- the backend uses that token to fetch Canvas data

This approach is used because full institutional SSO/OAuth approval typically requires admin access and configuration.

## Storage

The backend currently uses a mix of:

- SQLite for runtime and preference data
- JSON files for some saved study-plan and quiz state
- generated asset directories for lesson audio/video outputs

Important files:

- [copilot.db](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/data/copilot.db)
- [study-plans.json](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/data/study-plans.json)
- [quizzes.json](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/data/quizzes.json)

## Local Setup

### 1. Install dependencies

From the repo root:

```bash
npm run install:backend
npm run install:frontend
```

### 2. Configure environment variables

Create [backend/.env](/Users/ramreddy/Documents/github/hackathons/innovationHacks3April2026/sparkling_papaya/backend/.env) with values like:

```env
CANVAS_BASE_URL=https://canvas.asu.edu/api/v1
OPENAI_API_KEY=your_openai_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3001
```

Optional variables can include:

- `ELEVENLABS_VOICE_ID`
- `ELEVENLABS_MODEL_ID`
- `HOST`
- `PORT`

You do not need to hardcode a Canvas token into `.env`. The student provides it during login.

## How To Run

Use two terminals from the repo root.

### Terminal 1: backend

```bash
npm run dev:backend
```

### Terminal 2: frontend

```bash
npm run dev:frontend
```

App URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`

## Production Build Commands

From the repo root:

```bash
npm run build
npm run lint
```

## Summary

Canvas Co-Pilot is not just a Canvas dashboard.

It is a multi-agent student support system that:

- watches course activity
- understands changes
- decides what action is needed
- generates learning support automatically
- still allows manual control when students want it

The result is a system that reduces course-management overhead and helps students spend more time actually learning.
