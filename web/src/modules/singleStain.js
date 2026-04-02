const UNSTAINED_PATTERNS = ["unstain", "unstained", "blank", "control", "ns"];

const FAMILY_ALIASES = [
  { pattern: "fitc", aliases: ["fitc", "gfp"] },
  { pattern: "pe", aliases: ["pe", "phycoerythrin"] },
  { pattern: "pc55", aliases: ["pc55", "pc5.5", "percpcy55", "percp-cy5-5"] },
  { pattern: "pc7", aliases: ["pc7", "pecy7", "pe-cy7"] },
  { pattern: "apc", aliases: ["apc"] },
  { pattern: "apca700", aliases: ["apca700", "apc-a700", "apcr700"] },
  { pattern: "apca750", aliases: ["apca750", "apc-a750", "apccy7", "apc-cy7", "apccy8", "apc-cy8"] },
  { pattern: "pb450", aliases: ["pb450", "pacificblue", "pacific-blue", "bv421", "dapi"] },
  { pattern: "ko525", aliases: ["ko525", "kromeorange", "krome-orange"] },
];

export function getCompRelevantParamIndices(params) {
  const candidates = [];

  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    const compact = normalizeCompact(`${param.name ?? ""} ${param.label ?? ""}`);
    if (!compact || isScatterLike(compact) || isTimeLike(compact)) continue;
    candidates.push(i);
  }

  const areaOnly = candidates.filter((index) => isAreaChannel(params[index]));
  return areaOnly.length > 0 ? areaOnly : candidates;
}

export function inferStainedChannelFromFileName(fileName, params, candidateIndices = getCompRelevantParamIndices(params)) {
  const normalized = buildStringForms(fileName);
  if ([...normalized.tokens].some((token) => UNSTAINED_PATTERNS.includes(token))) {
    return { index: null, confidence: "none", reason: "unstained-file" };
  }

  let best = null;
  let second = null;

  for (const index of candidateIndices) {
    const aliases = getParamAliases(params[index]);
    let score = 0;

    for (const alias of aliases) {
      const aliasForms = buildStringForms(alias);
      if (!aliasForms.compact) continue;

      if (normalized.compact === aliasForms.compact) {
        score = Math.max(score, 160 + aliasForms.compact.length);
        continue;
      }
      if (normalized.tokens.has(aliasForms.compact)) {
        score = Math.max(score, 130 + aliasForms.compact.length);
        continue;
      }
      if ([...normalized.tokens].some((token) => token.startsWith(aliasForms.compact) && aliasForms.compact.length >= 3)) {
        score = Math.max(score, 115 + aliasForms.compact.length);
        continue;
      }
      if (normalized.compact.includes(aliasForms.compact) && aliasForms.compact.length >= 3) {
        score = Math.max(score, 90 + aliasForms.compact.length);
        continue;
      }
      if (aliasForms.tokens.size > 1 && isSubset(aliasForms.tokens, normalized.tokens)) {
        score = Math.max(score, 80 + aliasForms.tokens.size);
      }
    }

    if (score <= 0) continue;
    const entry = { index, score };
    if (!best || score > best.score) {
      second = best;
      best = entry;
    } else if (!second || score > second.score) {
      second = entry;
    }
  }

  if (!best) return { index: null, confidence: "none", reason: "no-match" };
  if (second && best.score - second.score < 10) {
    return { index: best.index, confidence: "low", reason: "ambiguous-match" };
  }
  if (best.score < 100) {
    return { index: best.index, confidence: "low", reason: "weak-match" };
  }
  return { index: best.index, confidence: "high", reason: "filename-match" };
}

export function mapReferenceParamsToSample(referenceParams, sampleParams) {
  const usedSampleIndices = new Set();
  const map = new Map();

  for (let refIndex = 0; refIndex < referenceParams.length; refIndex++) {
    const refAliases = getParamAliases(referenceParams[refIndex]);
    let best = null;

    for (let sampleIndex = 0; sampleIndex < sampleParams.length; sampleIndex++) {
      if (usedSampleIndices.has(sampleIndex)) continue;
      const sampleAliases = getParamAliases(sampleParams[sampleIndex]);
      const score = scoreAliasOverlap(refAliases, sampleAliases);
      if (!best || score > best.score) best = { sampleIndex, score };
    }

    if (best && best.score > 0) {
      map.set(refIndex, best.sampleIndex);
      usedSampleIndices.add(best.sampleIndex);
    }
  }

  return map;
}

export function createSingleStainRecord(fileName, parsed, referenceParams, meta = {}) {
  const effectiveParams = referenceParams?.length ? referenceParams : parsed.params;
  const compParamIndices = getCompRelevantParamIndices(effectiveParams);
  const inferred = inferStainedChannelFromFileName(fileName, effectiveParams, compParamIndices);
  const referenceToSample = mapReferenceParamsToSample(effectiveParams, parsed.params);

  return {
    id: makeRecordId(fileName),
    fileName,
    sha256: meta.sha256 ?? "",
    parsed,
    compParamIndices,
    referenceParams: effectiveParams,
    referenceToSample,
    stainedReferenceIndex: inferred.index,
    inferenceConfidence: inferred.confidence,
    inferenceReason: inferred.reason,
  };
}

export function getParamAliases(param) {
  const aliases = new Set();
  const rawValues = [param?.name ?? "", param?.label ?? ""];

  for (const raw of rawValues) {
    if (!raw) continue;
    aliases.add(raw);
    const compact = normalizeCompact(raw);
    if (!compact) continue;
    aliases.add(compact);

    const stripped = compact.replace(/(a|h|w)$/i, "");
    if (stripped && stripped !== compact) aliases.add(stripped);

    if (compact.startsWith("fl") && compact.length >= 3) {
      aliases.add(compact.replace(/(a|h|w)$/i, ""));
    }

    for (const family of FAMILY_ALIASES) {
      if (family.pattern === "apc" && (compact.includes("apca700") || compact.includes("apca750"))) continue;
      if (compact.includes(family.pattern)) {
        for (const alias of family.aliases) aliases.add(alias);
      }
    }
  }

  return [...aliases];
}

function scoreAliasOverlap(refAliases, sampleAliases) {
  let best = 0;
  const sampleSet = new Set(sampleAliases.map((alias) => normalizeCompact(alias)));

  for (const alias of refAliases) {
    const compact = normalizeCompact(alias);
    if (!compact) continue;
    if (sampleSet.has(compact)) {
      best = Math.max(best, 100 + compact.length);
      continue;
    }
    const stripped = compact.replace(/(a|h|w)$/i, "");
    if (stripped && sampleSet.has(stripped)) {
      best = Math.max(best, 70 + stripped.length);
    }
  }

  return best;
}

function buildStringForms(value) {
  const lower = String(value ?? "")
    .replace(/\.fcs$/i, "")
    .toLowerCase();
  const spaced = lower.replace(/[^a-z0-9]+/g, " ").trim();
  const tokens = spaced ? spaced.split(/\s+/).filter(Boolean) : [];
  return {
    compact: tokens.join(""),
    tokens: new Set(tokens.concat(tokens.map((token) => token.replace(/[^a-z0-9]/g, "")))),
  };
}

function normalizeCompact(value) {
  return buildStringForms(value).compact;
}

function isSubset(needles, haystack) {
  for (const token of needles) {
    if (!haystack.has(token)) return false;
  }
  return true;
}

function isScatterLike(compact) {
  return compact.includes("fsc") || compact.includes("ssc");
}

function isTimeLike(compact) {
  return compact.includes("time") || compact.includes("width") || compact.includes("event");
}

function isAreaChannel(param) {
  const raw = `${param?.name ?? ""} ${param?.label ?? ""}`;
  return /(^|[^a-z0-9])a($|[^a-z0-9])/i.test(raw) || /-a$/i.test(String(param?.name ?? "")) || /-a$/i.test(String(param?.label ?? ""));
}

function makeRecordId(fileName) {
  return `single-${Date.now().toString(36)}-${normalizeCompact(fileName).slice(0, 24)}`;
}
