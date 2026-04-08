import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  detectLessonVisualScene,
  getSlideVisualLabels,
} from "../lesson/visuals";

const BG = {
  title: "linear-gradient(135deg, #0f172a, #1d4ed8 48%, #06b6d4)",
  concept: "linear-gradient(135deg, #111827, #1e3a8a 52%, #0891b2)",
  definition: "linear-gradient(135deg, #111827, #312e81 50%, #9333ea)",
  example: "linear-gradient(135deg, #111827, #0f766e 45%, #f59e0b)",
  summary: "linear-gradient(135deg, #111827, #7c2d12 40%, #ec4899)",
};

export function getLessonDurationInFrames(lesson, fps = 30) {
  const slides = lesson?.slides || [];
  const totalSeconds = slides.reduce(
    (sum, slide) => sum + Math.max(Number(slide?.duration_seconds) || 12, 6),
    0
  );
  return Math.max(Math.round(totalSeconds * fps), fps * 8);
}

function TitleScene({ slide, lesson }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ fps, frame, config: { damping: 200 } });
  const orbit = frame * 1.2;

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: 64 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: 32,
          alignItems: "center",
        }}
      >
        <div style={{ transform: `translateY(${interpolate(rise, [0, 1], [40, 0])}px)` }}>
          <div style={{ color: "#93c5fd", letterSpacing: "0.18em", fontSize: 18, textTransform: "uppercase" }}>
            {lesson?.subject || "Lesson"}
          </div>
          <h1 style={{ color: "white", fontSize: 64, lineHeight: 1.02, margin: "16px 0" }}>
            {slide?.heading || lesson?.title}
          </h1>
          {slide?.subheading ? (
            <p style={{ color: "#dbeafe", fontSize: 28, lineHeight: 1.35, margin: 0 }}>
              {slide.subheading}
            </p>
          ) : null}
        </div>
        <div style={{ position: "relative", height: 320 }}>
          <div
            style={{
              position: "absolute",
              inset: 40,
              borderRadius: 999,
              border: "2px solid rgba(147,197,253,0.35)",
              transform: `rotate(${orbit}deg)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 90,
              borderRadius: 999,
              border: "2px solid rgba(244,114,182,0.3)",
              transform: `rotate(${-orbit * 1.4}deg)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: "50%",
              width: 110,
              height: 110,
              marginLeft: -55,
              marginTop: -55,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(135deg, #38bdf8, #a855f7)",
              color: "white",
              fontWeight: 800,
              fontSize: 34,
              boxShadow: "0 30px 60px rgba(15,23,42,0.35)",
            }}
          >
            {lesson?.slides?.length || 0}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function DistributedScene({ slide }) {
  const frame = useCurrentFrame();
  const keywords = getSlideVisualLabels(slide);
  const pulse = 1 + Math.sin(frame / 10) * 0.08;

  return (
    <AbsoluteFill style={{ padding: 48, justifyContent: "center" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.9fr", gap: 24, height: "100%" }}>
        <div style={{ position: "relative", borderRadius: 28, background: "rgba(15,23,42,0.45)", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          {[
            { label: "Maps", left: "12%", top: "18%" },
            { label: "Banking", right: "12%", top: "28%" },
            { label: keywords[0] || "Users", left: "32%", bottom: "16%" },
          ].map((node, index) => (
            <div
              key={node.label}
              style={{
                position: "absolute",
                width: 96,
                height: 96,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                textAlign: "center",
                color: "white",
                fontWeight: 700,
                padding: 10,
                background:
                  index === 1
                    ? "linear-gradient(135deg, #a855f7, #ec4899)"
                    : index === 2
                      ? "linear-gradient(135deg, #f59e0b, #22d3ee)"
                      : "linear-gradient(135deg, #06b6d4, #3b82f6)",
                transform: `scale(${1 + Math.sin((frame + index * 7) / 11) * 0.05})`,
                ...node,
              }}
            >
              {node.label}
            </div>
          ))}
        </div>
        <div style={{ position: "relative", borderRadius: 28, background: "rgba(15,23,42,0.45)" }}>
          <div
            style={{
              position: "absolute",
              inset: "50%",
              width: 150,
              height: 150,
              marginLeft: -75,
              marginTop: -75,
              borderRadius: 30,
              background: "linear-gradient(135deg, #2563eb, #06b6d4)",
              display: "grid",
              placeItems: "center",
              textAlign: "center",
              color: "white",
              transform: `scale(${pulse})`,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 28 }}>Distributed DB</div>
              <div style={{ opacity: 0.8 }}>shared state</div>
            </div>
          </div>
          {[
            { label: "Replica A", left: 24, top: 50 },
            { label: "Replica B", right: 24, top: 50 },
            { label: "Replica C", left: "50%", bottom: 36, x: -0.5 },
          ].map((replica) => (
            <div
              key={replica.label}
              style={{
                position: "absolute",
                width: 110,
                height: 60,
                borderRadius: 18,
                display: "grid",
                placeItems: "center",
                background: "rgba(15,23,42,0.86)",
                color: "#e2e8f0",
                fontWeight: 700,
                border: "1px solid rgba(148,163,184,0.18)",
                ...(replica.x ? { transform: `translateX(${replica.x * 100}%)` } : {}),
                ...replica,
              }}
            >
              {replica.label}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gap: 18, alignContent: "center" }}>
          {["Traffic", "Reads", "Writes"].map((label, index) => (
            <div key={label}>
              <div style={{ color: "#cbd5e1", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{label}</div>
              <div style={{ height: 16, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${55 + index * 15}%`,
                    borderRadius: 999,
                    background:
                      index === 1
                        ? "linear-gradient(90deg, #a855f7, #ec4899)"
                        : index === 2
                          ? "linear-gradient(90deg, #f59e0b, #22d3ee)"
                          : "linear-gradient(90deg, #06b6d4, #3b82f6)",
                    transform: `scaleX(${0.78 + Math.sin((frame + index * 9) / 10) * 0.12})`,
                    transformOrigin: "left center",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function WorldMapScene({ slide }) {
  const frame = useCurrentFrame();
  const labels = getSlideVisualLabels(slide);
  const nodes = ["Maps", "Banking", labels[0] || "Users"];

  return (
    <AbsoluteFill style={{ padding: 48, justifyContent: "center" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 24, height: "100%" }}>
        <div style={{ position: "relative", borderRadius: 28, background: "rgba(15,23,42,0.45)", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          {[
            { label: nodes[0], left: "12%", top: "18%" },
            { label: nodes[1], right: "11%", top: "24%" },
            { label: nodes[2], left: "36%", bottom: "15%" },
          ].map((node, index) => (
            <div
              key={node.label}
              style={{
                position: "absolute",
                width: 98,
                height: 98,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                padding: 12,
                textAlign: "center",
                color: "white",
                fontWeight: 700,
                background:
                  index === 1
                    ? "linear-gradient(135deg, #a855f7, #ec4899)"
                    : index === 2
                      ? "linear-gradient(135deg, #f59e0b, #22d3ee)"
                      : "linear-gradient(135deg, #06b6d4, #3b82f6)",
                transform: `scale(${1 + Math.sin((frame + index * 7) / 11) * 0.06})`,
                boxShadow: "0 20px 40px rgba(2,6,23,0.32)",
                ...node,
              }}
            >
              {node.label}
            </div>
          ))}
          {[
            { left: "28%", top: "30%", dx: 156, dy: 52, delay: 0 },
            { right: "28%", top: "34%", dx: -146, dy: 38, delay: 0.8 },
            { left: "38%", bottom: "28%", dx: 52, dy: -128, delay: 1.2 },
          ].map((packet, index) => (
            <div
              key={index}
              style={{
                position: "absolute",
                width: 14,
                height: 14,
                borderRadius: 999,
                background: "#22d3ee",
                boxShadow: "0 0 20px rgba(34,211,238,0.95)",
                opacity: interpolate((frame + packet.delay * 30) % 75, [0, 10, 55, 75], [0, 1, 1, 0]),
                transform: `translate(${interpolate((frame + packet.delay * 30) % 75, [0, 75], [0, packet.dx])}px, ${interpolate((frame + packet.delay * 30) % 75, [0, 75], [0, packet.dy])}px)`,
                ...packet,
              }}
            />
          ))}
        </div>
        <div
          style={{
            borderRadius: 28,
            padding: 24,
            display: "grid",
            alignContent: "center",
            gap: 12,
            background: "rgba(15,23,42,0.45)",
            border: "1px solid rgba(148,163,184,0.14)",
            color: "#e2e8f0",
          }}
        >
          <div style={{ color: "#f8fafc", fontSize: 30, fontWeight: 800 }}>{labels[1] || "Real-time updates"}</div>
          <div style={{ fontSize: 20, lineHeight: 1.5 }}>
            {labels[2] || "Global users need fresh data instantly across locations."}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function ReplicationClusterScene({ slide }) {
  const frame = useCurrentFrame();
  const labels = getSlideVisualLabels(slide);
  return (
    <AbsoluteFill style={{ padding: 48, justifyContent: "center" }}>
      <div style={{ position: "relative", minHeight: 360, borderRadius: 32, background: "rgba(15,23,42,0.45)" }}>
        <div
          style={{
            position: "absolute",
            inset: "50%",
            width: 170,
            height: 170,
            marginLeft: -85,
            marginTop: -85,
            borderRadius: 32,
            background: "linear-gradient(135deg, #2563eb, #06b6d4)",
            display: "grid",
            placeItems: "center",
            color: "white",
            textAlign: "center",
            transform: `scale(${1 + Math.sin(frame / 12) * 0.04})`,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 28 }}>{labels[0] || "Primary DB"}</div>
            <div style={{ opacity: 0.82 }}>{labels[1] || "sync source"}</div>
          </div>
        </div>
        {[
          { label: labels[2] || "Replica A", left: "10%", top: "18%" },
          { label: labels[3] || "Replica B", right: "10%", top: "18%" },
          { label: "Replica C", left: "50%", bottom: "14%", shift: true },
        ].map((replica, index) => (
          <div
            key={replica.label}
            style={{
              position: "absolute",
              width: 126,
              height: 70,
              borderRadius: 20,
              display: "grid",
              placeItems: "center",
              color: "#f8fafc",
              fontWeight: 700,
              background: "rgba(15,23,42,0.86)",
              border: "1px solid rgba(148,163,184,0.16)",
              boxShadow: "0 16px 30px rgba(2,6,23,0.22)",
              ...(replica.shift ? { transform: "translateX(-50%)" } : {}),
              ...replica,
            }}
          >
            {replica.label}
            <div
              style={{
                position: "absolute",
                inset: -14,
                borderRadius: 999,
                border: "2px solid rgba(34,211,238,0.42)",
                opacity: interpolate((frame + index * 18) % 54, [0, 8, 54], [0.7, 0.45, 0]),
                transform: `scale(${interpolate((frame + index * 18) % 54, [0, 54], [0.45, 1.25])})`,
              }}
            />
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function WorkloadBalancingScene({ slide }) {
  const frame = useCurrentFrame();
  const labels = getSlideVisualLabels(slide);
  const serverLabels = [labels[1] || "Shard A", labels[2] || "Shard B", labels[3] || "Shard C"];

  return (
    <AbsoluteFill style={{ padding: 48, justifyContent: "center" }}>
      <div style={{ display: "grid", gridTemplateColumns: "180px 92px 1fr", gap: 20, alignItems: "center" }}>
        <div
          style={{
            minHeight: 220,
            borderRadius: 28,
            display: "grid",
            placeItems: "center",
            textAlign: "center",
            color: "#f8fafc",
            fontWeight: 800,
            fontSize: 28,
            background: "rgba(15,23,42,0.45)",
            border: "1px solid rgba(148,163,184,0.16)",
          }}
        >
          {labels[0] || "Incoming traffic"}
        </div>
        <div style={{ position: "relative", minHeight: 220 }}>
          <div style={{ position: "absolute", left: "50%", top: "12%", bottom: "12%", width: 2, background: "linear-gradient(180deg, #22d3ee, #a855f7)", transform: "translateX(-50%)" }} />
          <div style={{ position: "absolute", left: "20%", top: "50%", right: 0, height: 2, background: "linear-gradient(90deg, #22d3ee, #ec4899)" }} />
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          {serverLabels.map((label, index) => (
            <div
              key={label}
              style={{
                borderRadius: 20,
                padding: 16,
                background: "rgba(15,23,42,0.45)",
                border: "1px solid rgba(148,163,184,0.14)",
              }}
            >
              <div style={{ color: "#f8fafc", fontWeight: 700, marginBottom: 10 }}>{label}</div>
              <div style={{ height: 14, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${58 + index * 12}%`,
                    borderRadius: 999,
                    background:
                      index === 1
                        ? "linear-gradient(90deg, #a855f7, #ec4899)"
                        : index === 2
                          ? "linear-gradient(90deg, #f59e0b, #22d3ee)"
                          : "linear-gradient(90deg, #06b6d4, #3b82f6)",
                    transform: `scaleX(${0.78 + Math.sin((frame + index * 9) / 10) * 0.16})`,
                    transformOrigin: "left center",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function RequestRoutingScene({ slide }) {
  const frame = useCurrentFrame();
  const items = (getSlideVisualLabels(slide).length ? getSlideVisualLabels(slide) : ["Client", "API", "Cache", "Database"]).slice(0, 4);
  const x = interpolate(frame % 120, [0, 120], [0, 980]);
  return (
    <AbsoluteFill style={{ padding: 48, justifyContent: "center" }}>
      <div style={{ borderRadius: 30, padding: 24, background: "rgba(15,23,42,0.45)" }}>
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 16 }}>
          {items.map((item, index) => (
            <React.Fragment key={item}>
              <div style={{ ...processNodeStyle(index), minHeight: 138 }}>{item}</div>
              {index < items.length - 1 ? <div style={processLinkStyle} /> : null}
            </React.Fragment>
          ))}
          <div
            style={{
              position: "absolute",
              top: 38,
              left: x,
              width: 18,
              height: 18,
              borderRadius: 999,
              background: "#22d3ee",
              boxShadow: "0 0 22px rgba(34,211,238,0.95)",
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}

function ComparisonScene({ slide }) {
  const keywords = getSlideVisualLabels(slide);
  const left = keywords.slice(0, 2);
  const right = (keywords.slice(2, 4).length ? keywords.slice(2, 4) : ["Contrast", "Outcome"]);
  return (
    <AbsoluteFill style={{ padding: 48, justifyContent: "center" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 1fr", gap: 18, alignItems: "center" }}>
        <div style={{ display: "grid", gap: 14 }}>
          {left.map((item) => (
            <div key={item} style={compareCardStyle("linear-gradient(135deg, rgba(37,99,235,0.32), rgba(6,182,212,0.24))")}>{item}</div>
          ))}
        </div>
        <div style={{ ...compareAxisStyle }}>VS</div>
        <div style={{ display: "grid", gap: 14 }}>
          {right.map((item) => (
            <div key={item} style={compareCardStyle("linear-gradient(135deg, rgba(168,85,247,0.32), rgba(236,72,153,0.24))")}>{item}</div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function compareCardStyle(background) {
  return {
    minHeight: 92,
    borderRadius: 24,
    display: "grid",
    placeItems: "center",
    padding: 18,
    textAlign: "center",
    color: "#f8fafc",
    fontWeight: 700,
    fontSize: 28,
    border: "1px solid rgba(255,255,255,0.12)",
    background,
  };
}

const compareAxisStyle = {
  width: 110,
  height: 110,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  color: "white",
  fontWeight: 800,
  fontSize: 30,
  background: "linear-gradient(135deg, #f59e0b, #ec4899)",
  boxShadow: "0 24px 50px rgba(15,23,42,0.35)",
  justifySelf: "center",
};

function ProcessScene({ slide }) {
  const frame = useCurrentFrame();
  const keywords = getSlideVisualLabels(slide);
  const items = (keywords.length ? keywords : ["Input", "Process", "Output"]).slice(0, 4);
  const x = interpolate(frame % 120, [0, 120], [0, 1000]);
  return (
    <AbsoluteFill style={{ padding: 48, justifyContent: "center" }}>
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 16 }}>
        {items.map((item, index) => (
          <React.Fragment key={item}>
            <div style={processNodeStyle(index)}>{item}</div>
            {index < items.length - 1 ? <div style={processLinkStyle} /> : null}
          </React.Fragment>
        ))}
        <div
          style={{
            position: "absolute",
            top: 30,
            left: x,
            width: 18,
            height: 18,
            borderRadius: 999,
            background: "#22d3ee",
            boxShadow: "0 0 22px rgba(34,211,238,0.95)",
          }}
        />
      </div>
    </AbsoluteFill>
  );
}

function processNodeStyle(index) {
  const colors = [
    "linear-gradient(135deg, rgba(37,99,235,0.3), rgba(6,182,212,0.24))",
    "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.24))",
    "linear-gradient(135deg, rgba(236,72,153,0.28), rgba(251,191,36,0.22))",
    "linear-gradient(135deg, rgba(34,211,238,0.28), rgba(251,191,36,0.2))",
  ];
  return {
    minHeight: 120,
    borderRadius: 26,
    display: "grid",
    placeItems: "center",
    padding: 18,
    textAlign: "center",
    color: "#f8fafc",
    fontWeight: 700,
    fontSize: 26,
    border: "1px solid rgba(255,255,255,0.12)",
    background: colors[index] || colors[0],
  };
}

const processLinkStyle = {
  alignSelf: "center",
  height: 4,
  borderRadius: 999,
  background: "linear-gradient(90deg, #22d3ee, #a855f7)",
};

function NetworkScene({ slide }) {
  const frame = useCurrentFrame();
  const keywords = (getSlideVisualLabels(slide).length ? getSlideVisualLabels(slide) : ["Client", "Server", "Cache", "API"]).slice(0, 4);
  const pingScale = 1 + Math.sin(frame / 8) * 0.18;
  return (
    <AbsoluteFill style={{ padding: 48, justifyContent: "center" }}>
      <div style={{ position: "relative", height: 360, borderRadius: 32, background: "rgba(15,23,42,0.42)" }}>
        <div style={{ ...networkHubStyle }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{keywords[1] || "Server"}</div>
          <div style={{ opacity: 0.8 }}>central service</div>
        </div>
        {[
          { label: keywords[0] || "Client", left: "10%", top: "18%" },
          { label: keywords[2] || "Cache", right: "10%", top: "18%" },
          { label: keywords[3] || "API", left: "14%", bottom: "14%" },
          { label: "Users", right: "12%", bottom: "14%" },
        ].map((node) => (
          <div key={node.label} style={{ ...networkNodeStyle, ...node }}>
            {node.label}
          </div>
        ))}
        {[{ left: "26%", top: "34%", width: 140, rotate: 24 }, { right: "26%", top: "34%", width: 140, rotate: -24 }, { left: "50%", bottom: "28%", width: 160, rotate: 90, shift: true }].map((line, index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              height: 3,
              borderRadius: 999,
              background: "linear-gradient(90deg, #22d3ee, #a855f7)",
              width: line.width,
              ...(line.shift ? { transform: `translateX(-50%) rotate(${line.rotate}deg)` } : { transform: `rotate(${line.rotate}deg)` }),
              ...line,
            }}
          />
        ))}
        <div style={{ ...pingStyle, left: "34%", top: "38%", transform: `scale(${pingScale})` }} />
        <div style={{ ...pingStyle, right: "34%", top: "38%", transform: `scale(${1.15 - (pingScale - 1)})` }} />
      </div>
    </AbsoluteFill>
  );
}

const networkHubStyle = {
  position: "absolute",
  inset: "50%",
  width: 150,
  height: 150,
  marginLeft: -75,
  marginTop: -75,
  borderRadius: 28,
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  color: "white",
  background: "linear-gradient(135deg, #2563eb, #06b6d4)",
  boxShadow: "0 24px 52px rgba(15,23,42,0.35)",
};

const networkNodeStyle = {
  position: "absolute",
  minWidth: 110,
  minHeight: 60,
  padding: "12px 16px",
  borderRadius: 18,
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  color: "#f8fafc",
  fontWeight: 700,
  background: "rgba(15,23,42,0.86)",
  border: "1px solid rgba(148,163,184,0.16)",
};

const pingStyle = {
  position: "absolute",
  width: 14,
  height: 14,
  borderRadius: 999,
  background: "#22d3ee",
  boxShadow: "0 0 20px rgba(34,211,238,0.9)",
};

function GenericScene({ slide }) {
  const keywords = getSlideVisualLabels(slide);
  return (
    <AbsoluteFill style={{ padding: 56, justifyContent: "center" }}>
      <div style={{ display: "grid", gap: 18 }}>
        <div style={{ color: "#93c5fd", fontSize: 20, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          {slide?.type || "Concept"}
        </div>
        <h2 style={{ color: "white", fontSize: 56, lineHeight: 1.05, margin: 0 }}>
          {slide?.heading || slide?.term || "Key idea"}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 10 }}>
          {(keywords.length ? keywords : (slide?.bullets || []).slice(0, 4)).map((item, index) => (
            <div
              key={`${item}-${index}`}
              style={{
                minHeight: 110,
                borderRadius: 24,
                padding: 18,
                display: "flex",
                alignItems: "flex-end",
                color: "#f8fafc",
                fontWeight: 700,
                background:
                  index % 3 === 0
                    ? "linear-gradient(135deg, rgba(37,99,235,0.32), rgba(6,182,212,0.24))"
                    : index % 3 === 1
                      ? "linear-gradient(135deg, rgba(168,85,247,0.32), rgba(236,72,153,0.24))"
                      : "linear-gradient(135deg, rgba(244,114,182,0.28), rgba(251,191,36,0.22))",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function SlideScene({ slide, lesson }) {
  const scene = detectLessonVisualScene(slide);
  const baseStyle = {
    background: BG[slide?.type] || BG.concept,
  };

  return (
    <AbsoluteFill style={baseStyle}>
      {slide?.type === "title" ? <TitleScene slide={slide} lesson={lesson} /> : null}
      {scene === "world-map" ? <WorldMapScene slide={slide} /> : null}
      {scene === "replication-cluster" ? <ReplicationClusterScene slide={slide} /> : null}
      {scene === "workload-balancing" ? <WorkloadBalancingScene slide={slide} /> : null}
      {scene === "request-routing" ? <RequestRoutingScene slide={slide} /> : null}
      {scene === "distributed-systems" ? <DistributedScene slide={slide} /> : null}
      {scene === "comparison" ? <ComparisonScene slide={slide} /> : null}
      {scene === "process-flow" ? <ProcessScene slide={slide} /> : null}
      {scene === "network" ? <NetworkScene slide={slide} /> : null}
      {!["world-map", "replication-cluster", "workload-balancing", "request-routing", "distributed-systems", "comparison", "process-flow", "network"].includes(scene) && slide?.type !== "title" ? (
        <GenericScene slide={slide} />
      ) : null}
      {slide?.narration ? (
        <div
          style={{
            position: "absolute",
            left: 44,
            right: 44,
            bottom: 36,
            padding: "18px 22px",
            borderRadius: 20,
            background: "rgba(2,6,23,0.48)",
            color: "#e2e8f0",
            fontSize: 24,
            lineHeight: 1.35,
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {slide.narration}
        </div>
      ) : null}
    </AbsoluteFill>
  );
}

export default function LessonVideoComposition({ lesson }) {
  const { fps } = useVideoConfig();
  const slides = lesson?.slides || [];
  let start = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#020617" }}>
      {slides.map((slide) => {
        const durationInFrames = Math.max(Math.round((Number(slide?.duration_seconds) || 12) * fps), fps * 4);
        const sequence = (
          <Sequence key={slide.id ?? start} from={start} durationInFrames={durationInFrames}>
            <SlideScene slide={slide} lesson={lesson} />
          </Sequence>
        );
        start += durationInFrames;
        return sequence;
      })}
    </AbsoluteFill>
  );
}
