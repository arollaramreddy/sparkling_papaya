function getSlideVisualSource(slide = {}) {
  return [
    slide.heading,
    slide.term,
    slide.subheading,
    slide.definition,
    slide.example,
    slide.narration,
    ...(slide.bullets || []),
  ]
    .filter(Boolean)
    .join(" ");
}

export function getLessonVisualKeywords(slide = {}) {
  const source = getSlideVisualSource(slide);

  return Array.from(
    new Set(
      source
        .split(/[^A-Za-z0-9]+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 4)
    )
  ).slice(0, 6);
}

export function getSlideVisualLabels(slide = {}) {
  if (Array.isArray(slide.visual_labels) && slide.visual_labels.length) {
    return slide.visual_labels.filter(Boolean).slice(0, 6);
  }

  return getLessonVisualKeywords(slide).slice(0, 6);
}

export function detectLessonVisualScene(slide = {}) {
  if (slide.visual_scene) {
    return slide.visual_scene;
  }

  const source = getSlideVisualSource(slide).toLowerCase();

  if (/(google maps|maps|world|global|country|city|location|traffic|banking balance|banking)/.test(source)) {
    return "world-map";
  }

  if (/(replica|replicas|replication|copy|copies|synchroniz|consisten|sync)/.test(source)) {
    return "replication-cluster";
  }

  if (/(workload|load balancing|balance the load|reads|writes|throughput|hotspot|scale out)/.test(source)) {
    return "workload-balancing";
  }

  if (/(request|response|route|routing|query|api call|client request|serve)/.test(source)) {
    return "request-routing";
  }

  if (
    /(distributed|database|replica|replication|workload|traffic|banking|google maps|maps|real[- ]?time|global)/.test(
      source
    )
  ) {
    return "distributed-systems";
  }

  if (/(compare|comparison|versus|vs\\.?|difference|tradeoff|instead of|rather than)/.test(source)) {
    return "comparison";
  }

  if (/(request|response|workflow|pipeline|process|step|sequence|flow|lifecycle|how it works)/.test(source)) {
    return "process-flow";
  }

  if (/(client|server|network|node|packet|api|service|browser|cache)/.test(source)) {
    return "network";
  }

  return slide.type || null;
}
