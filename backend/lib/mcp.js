const crypto = require("crypto");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { isInitializeRequest } = require("@modelcontextprotocol/sdk/types.js");
const { z } = require("zod");
const { FEATURE_CATALOG } = require("./db");

function registerProductTools({
  server,
  db,
  canvasRequest,
  canvasRequestAll,
  buildWorkspaceState,
  computeInterventionScore,
  listRecentEvents,
  listWorkflowJobs,
}) {
  server.registerTool(
    "get_student_intelligence",
    {
      description: "Read persisted knowledge gaps, review sessions, and autonomous actions for the current product database.",
      inputSchema: {
        userId: z.string().optional(),
      },
    },
    async ({ userId }) => {
      const userFilter =
        userId || db.prepare("SELECT user_id FROM sessions ORDER BY login_at DESC LIMIT 1").get()?.user_id;
      if (!userFilter) {
        return { content: [{ type: "text", text: "No user activity found in the product database yet." }] };
      }

      const payload = {
        knowledgeGaps: db
          .prepare("SELECT gap_title, severity, evidence, recommendation, created_at FROM learning_gaps WHERE user_id = ? ORDER BY id DESC LIMIT 10")
          .all(String(userFilter)),
        reviewSessions: db
          .prepare("SELECT title, scheduled_for, duration_minutes, goal, status, created_at FROM review_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 10")
          .all(String(userFilter)),
        autonomousActions: db
          .prepare("SELECT action_type, title, detail, status, created_at FROM autonomous_actions WHERE user_id = ? ORDER BY id DESC LIMIT 10")
          .all(String(userFilter)),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_recent_workflows",
    {
      description: "Read recent workflow runs and summaries from the product database.",
      inputSchema: {
        limit: z.number().int().min(1).max(20).optional(),
      },
    },
    async ({ limit = 8 }) => {
      const runs = db
        .prepare(`
          SELECT id, workflow_type, status, summary, created_at
          FROM workflow_runs
          ORDER BY created_at DESC
          LIMIT ?
        `)
        .all(limit);

      return {
        content: [{ type: "text", text: JSON.stringify(runs, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_course_snapshot",
    {
      description: "Fetch a live Canvas course snapshot including modules and assignments using the configured Canvas token.",
      inputSchema: {
        courseId: z.string(),
      },
    },
    async ({ courseId }) => {
      const [course, assignments, modules] = await Promise.all([
        canvasRequest(`/courses/${courseId}`),
        canvasRequestAll(`/courses/${courseId}/assignments?per_page=50&order_by=due_at`),
        canvasRequestAll(`/courses/${courseId}/modules?per_page=50&include[]=items_count`),
      ]);

      const snapshot = {
        course: {
          id: course.id,
          name: course.name,
          code: course.course_code,
        },
        assignments: assignments.slice(0, 10).map((assignment) => ({
          id: assignment.id,
          name: assignment.name,
          due_at: assignment.due_at,
        })),
        modules: modules.map((module) => ({
          id: module.id,
          name: module.name,
          items_count: module.items_count,
        })),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(snapshot, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_intervention_score",
    {
      description: "Compute the current intervention score and risk factors for a course using clickstream, gaps, workflow history, and Canvas deadlines.",
      inputSchema: {
        userId: z.string(),
        courseId: z.string(),
      },
    },
    async ({ userId, courseId }) => {
      const canvasState = await buildWorkspaceState(courseId);
      const payload = computeInterventionScore({
        db,
        userId,
        courseId,
        canvasState,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_autonomous_support_system",
    {
      description: "Build the autonomous support network for a course, including active agents and recommended workflows.",
      inputSchema: {
        userId: z.string(),
        courseId: z.string(),
      },
    },
    async ({ userId, courseId }) => {
      const canvasState = await buildWorkspaceState(courseId);
      const intervention = computeInterventionScore({
        db,
        userId,
        courseId,
        canvasState,
      });

      const recommendedWorkflowTypes = [];
      if (intervention.performance?.lowScores?.length) {
        recommendedWorkflowTypes.push("grade_recovery", "support_handoff");
      }
      if (intervention.performance?.missingAssignments?.length) {
        recommendedWorkflowTypes.push("assignment_rescue");
      }
      if (!recommendedWorkflowTypes.length) {
        recommendedWorkflowTypes.push("course_brief", "exam_sprint");
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                intervention,
                supportNetwork: intervention.autonomousSupportNetwork,
                recommendedWorkflowTypes,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_state_events",
    {
      description: "Read the recent Canvas state changes detected for a user/course.",
      inputSchema: {
        userId: z.string(),
        courseId: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ userId, courseId, limit = 20 }) => {
      const payload = listRecentEvents(db, userId, courseId || null, limit);
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_workflow_jobs",
    {
      description: "Read the autonomous workflow job queue for a user/course.",
      inputSchema: {
        userId: z.string(),
        courseId: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ userId, courseId, limit = 20 }) => {
      const payload = listWorkflowJobs(db, userId, courseId || null, limit);
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  server.registerTool(
    "list_product_features",
    {
      description: "List the product capability catalog stored in the backend database layer.",
    },
    async () => {
      return {
        content: [{ type: "text", text: JSON.stringify(FEATURE_CATALOG, null, 2) }],
      };
    }
  );
}

function createProductMcpServer(deps) {
  const server = new McpServer(
    {
      name: "canvas-copilot-product",
      version: "1.1.0",
    },
    {
      capabilities: {
        logging: {},
      },
    }
  );

  registerProductTools({ server, ...deps });
  return server;
}

function attachMcpHttpRoutes(app, deps, basePath = "/mcp") {
  const transports = {};

  app.get(`${basePath}/health`, (_req, res) => {
    res.json({
      ok: true,
      name: "canvas-copilot-product",
      transport: "streamable-http",
    });
  });

  app.post(basePath, async (req, res) => {
    try {
      const sessionId = req.headers["mcp-session-id"];
      let transport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const server = createProductMcpServer(deps);
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (newSessionId) => {
            transports[newSessionId] = transport;
          },
        });
        transport.onclose = () => {
          if (transport.sessionId && transports[transport.sessionId]) {
            delete transports[transport.sessionId];
          }
        };
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: error.message || "Internal server error",
          },
          id: null,
        });
      }
    }
  });
}

module.exports = {
  attachMcpHttpRoutes,
  createProductMcpServer,
};
