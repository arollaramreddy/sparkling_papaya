# Agentic Workflow Workspace

This folder is the curated backend workspace for the autonomous product layer.

## Goal

Keep the worker implementation separate from the rest of the app so the team can build agents independently while sharing one runtime contract and one orchestrator.

## Conceptual Agent Model

The product-facing flow should be thought of as seven conceptual agents:

1. State change tracker
   - watches Canvas state changes
   - examples: new message, new material, announcement, discussion, assignment posted, score released
2. Parse + web enrichment
   - parses professor-posted material
   - pulls relevant outside context
3. Summary agent
   - creates a student-tailored summary
4. Quiz agent
   - generates quizzes or checks for understanding
5. Study planner
   - reorganizes the study plan around deadlines and weak topics
6. Video agent
   - prepares interactive learning/video output
7. Score support agent
   - when marks are released, explains what went wrong, what to improve, and what to learn next

## File Mapping

Current file scaffolds are:

- `agent-7-state-change-decider.js`
  - conceptual Agent 1
- `agent-1-parse-and-research.js`
  - conceptual Agent 2
- `agent-2-summarize-by-preference.js`
  - conceptual Agent 3
- `agent-4-create-quizzes.js`
  - conceptual Agent 4
- `agent-6-create-study-plan.js`
  - conceptual Agent 5
- `agent-5-create-video-plan.js`
  - conceptual Agent 6
- `agent-8-grade-intervention.js`
  - conceptual Agent 7
- `agent-6-orchestrator.js`
  - orchestrator that routes the worker flow

Other helper workers:

- `agent-3-create-flashcards.js`
  - optional learning artifact worker

## Orchestrator Behavior

The orchestrator should decide which workers run based on the state change.

### Grade released

When a score is released:

- the orchestrator uses the state-change tracker to detect the trigger
- the score support agent examines the result
- based on the score, it should produce:
  - what the student likely did wrong
  - where the student can improve
  - what they should learn next
  - whether summary support is enough or a video should also be prepared
  - whether the study plan should be automatically adjusted

Expected product behavior:

- low score
  - recovery summary
  - targeted video-learning recommendation
  - study-plan adjustment
- medium score
  - reinforcement summary
  - quick quiz + short review block
- high score
  - lighter reinforcement and reallocation of effort to weaker areas

### New material posted

When a professor posts new material such as a PDF:

1. orchestrator detects the state change
2. parse + web enrichment runs
3. summary agent runs
4. then the workflow fans out:
   - quiz/learning artifact generation
   - video preparation
   - study-plan refresh

Current scaffold graph models this as:

- state tracker
- score support
- parse + web enrichment
- summary
- then parallel fan-out into:
  - flashcards -> quizzes
  - video plan
  - study plan

## Shared Contracts

- `contracts/runtime-state-contract.js`
  - documents the runtime state shape every worker can assume exists
- `contracts/agent-result-contract.js`
  - helper utilities for consistent worker output
- `index.js`
  - registry + scaffold entrypoint

## Expected Runtime Input

Use the existing `buildLangGraphRuntimeState(...)` output from `backend/lib/langgraph-runtime.js`.

## Current Status

- scaffolding is production-structured
- orchestration paths are defined
- individual workers are intentionally lightweight so teammates can implement them in isolation
