import { deserializeScene, serializeScene } from "./scene-io.js";
import { World } from "./world.js";

const cloneData = (value) =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

const nowIso = () => new Date().toISOString();

const makeId = (prefix) => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const normalizeVector3 = (value, fallback = [0, 0, 0]) => {
  const source = Array.isArray(value) && value.length === 3 ? value : fallback;
  return [
    Number.isFinite(source[0]) ? source[0] : fallback[0],
    Number.isFinite(source[1]) ? source[1] : fallback[1],
    Number.isFinite(source[2]) ? source[2] : fallback[2],
  ];
};

const normalizeSpawnPoint = (value = {}) => ({
  position: normalizeVector3(value.position, [0, 1, 0]),
  rotation: normalizeVector3(value.rotation, [0, 0, 0]),
  entityId: Number.isFinite(value.entityId) ? value.entityId : null,
});

const normalizeHudSettings = (value = {}) => ({
  healthBar: {
    visible: value.healthBar?.visible !== false,
    position: value.healthBar?.position === "bottom-left" ? "bottom-left" : "top-left",
  },
  minimap: {
    visible: Boolean(value.minimap?.visible),
    position: value.minimap?.position === "bottom-right" ? "bottom-right" : "top-right",
  },
  objectiveText: {
    visible: value.objectiveText?.visible !== false,
    text: value.objectiveText?.text ?? "Reach the objective.",
  },
  sceneTitle: {
    visible: value.sceneTitle?.visible !== false,
    banner: value.sceneTitle?.banner !== false,
  },
  pauseMenu: {
    enabled: value.pauseMenu?.enabled !== false,
    showQuit: value.pauseMenu?.showQuit !== false,
  },
  mobileHud: {
    enabled: value.mobileHud?.enabled !== false,
    compact: value.mobileHud?.compact !== false,
  },
});

const normalizeRuntimeSettings = (value = {}, fallbackLevelId = null) => ({
  startingLevelId: value.startingLevelId ?? fallbackLevelId,
  allowCameraSelect: value.allowCameraSelect !== false,
  usePublishedOnly: value.usePublishedOnly !== false,
});

const normalizeSceneRecord = (scene = {}, index = 0) => {
  const sceneData =
    scene.sceneData ??
    scene.data ??
    (Array.isArray(scene.entities) ? scene : null);

  return {
    id: scene.id ?? makeId("scene"),
    name: scene.name ?? `Scene ${index + 1}`,
    order: Number.isFinite(scene.order) ? scene.order : index,
    sceneData: sceneData ? cloneData(sceneData) : serializeScene(new World()),
    spawnPoint: normalizeSpawnPoint(scene.spawnPoint),
  };
};

const normalizeLevelRecord = (level = {}, index = 0, sceneFallback = null) => ({
  id: level.id ?? makeId("level"),
  name: level.name ?? `Level ${index + 1}`,
  sceneId: level.sceneId ?? sceneFallback,
  order: Number.isFinite(level.order) ? level.order : index,
  starting: Boolean(level.starting),
  nextLevelId: level.nextLevelId ?? null,
  spawnPoint: normalizeSpawnPoint(level.spawnPoint),
  completionRequirement: level.completionRequirement ?? "",
  completionSignal: level.completionSignal ?? "",
  objectiveText: level.objectiveText ?? "",
});

const normalizeMetadata = (value = {}) => ({
  author: value.author ?? "",
  description: value.description ?? "",
  createdAt: value.createdAt ?? nowIso(),
  updatedAt: value.updatedAt ?? nowIso(),
  publishedAt: value.publishedAt ?? null,
  publishedVersion: Number.isFinite(value.publishedVersion) ? value.publishedVersion : 0,
});

const sortByOrder = (items) =>
  [...items].sort((a, b) => {
    const aOrder = Number.isFinite(a.order) ? a.order : 0;
    const bOrder = Number.isFinite(b.order) ? b.order : 0;
    return aOrder - bOrder;
  });

export const PROJECT_STORAGE_KEYS = Object.freeze({
  draft: "tyronProjectDraft",
  published: "tyronPublishedProject",
  legacyScene: "tyronScene",
});

export const createProjectFromScene = (sceneData, options = {}) => {
  const sceneId = options.sceneId ?? "scene-1";
  const levelId = options.levelId ?? "level-1";
  const scene = normalizeSceneRecord(
    {
      id: sceneId,
      name: options.sceneName ?? "Scene 1",
      sceneData,
      spawnPoint: options.spawnPoint,
    },
    0
  );

  const level = normalizeLevelRecord(
    {
      id: levelId,
      name: options.levelName ?? "Level 1",
      sceneId,
      starting: true,
      spawnPoint: options.spawnPoint,
      completionRequirement: options.completionRequirement ?? "Reach the end of the scene.",
      completionSignal: options.completionSignal ?? "complete",
      objectiveText: options.objectiveText ?? "Reach the goal.",
    },
    0,
    sceneId
  );

  return normalizeProject({
    name: options.name ?? "Tyron Project",
    metadata: options.metadata ?? {},
    runtime: {
      startingLevelId: levelId,
      allowCameraSelect: true,
      usePublishedOnly: true,
    },
    hud: options.hud ?? {},
    scenes: [scene],
    levels: [level],
    activeSceneId: sceneId,
  });
};

export const normalizeProject = (value = {}) => {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const hasProjectShape = Array.isArray(source.scenes) || Array.isArray(source.levels);
  const legacySceneData = source.entities ? cloneData(source) : null;

  const scenes = Array.isArray(source.scenes) && source.scenes.length
    ? source.scenes.map((scene, index) => normalizeSceneRecord(scene, index))
    : [normalizeSceneRecord({ id: "scene-1", name: source.name ?? "Scene 1", sceneData: legacySceneData }, 0)];

  const normalizedScenes = sortByOrder(scenes);
  const sceneFallbackId = normalizedScenes[0]?.id ?? "scene-1";

  const levels = Array.isArray(source.levels) && source.levels.length
    ? source.levels.map((level, index) =>
        normalizeLevelRecord(level, index, sceneFallbackId)
      )
    : normalizedScenes.map((scene, index) =>
        normalizeLevelRecord(
          {
            id: index === 0 ? "level-1" : makeId("level"),
            name: scene.name,
            sceneId: scene.id,
            starting: index === 0,
            spawnPoint: scene.spawnPoint,
            completionRequirement: "Reach the goal.",
            completionSignal: "complete",
            objectiveText: "Reach the goal.",
          },
          index,
          scene.id
        )
      );

  const normalizedLevels = sortByOrder(levels).map((level, index) => ({
    ...level,
    sceneId: normalizedScenes.some((scene) => scene.id === level.sceneId)
      ? level.sceneId
      : sceneFallbackId,
    order: index,
  }));

  const startingLevel =
    normalizedLevels.find((level) => level.starting) ?? normalizedLevels[0] ?? null;

  return {
    version: 1,
    name: source.name ?? "Tyron Project",
    metadata: normalizeMetadata(source.metadata),
    runtime: normalizeRuntimeSettings(source.runtime, startingLevel?.id ?? null),
    hud: normalizeHudSettings(source.hud),
    scenes: normalizedScenes.map((scene) => ({
      ...scene,
      sceneData: cloneData(scene.sceneData),
    })),
    levels: normalizedLevels,
    activeSceneId:
      source.activeSceneId && normalizedScenes.some((scene) => scene.id === source.activeSceneId)
        ? source.activeSceneId
        : startingLevel?.sceneId ?? sceneFallbackId,
    published: {
      source: source.published?.source ?? "draft",
      version: Number.isFinite(source.published?.version) ? source.published.version : 0,
    },
  };
};

export const getSceneById = (project, sceneId) =>
  normalizeProject(project).scenes.find((scene) => scene.id === sceneId) ?? null;

export const getLevelById = (project, levelId) =>
  normalizeProject(project).levels.find((level) => level.id === levelId) ?? null;

export const getActiveScene = (project) => {
  const normalized = normalizeProject(project);
  return (
    normalized.scenes.find((scene) => scene.id === normalized.activeSceneId) ??
    normalized.scenes[0] ??
    null
  );
};

export const getStartingLevel = (project) => {
  const normalized = normalizeProject(project);
  return (
    normalized.levels.find((level) => level.id === normalized.runtime.startingLevelId) ??
    normalized.levels.find((level) => level.starting) ??
    normalized.levels[0] ??
    null
  );
};

export const captureProjectScene = (project, sceneId, world) => {
  const normalized = normalizeProject(project);
  const nextSceneId = sceneId ?? normalized.activeSceneId;
  const nextScenes = normalized.scenes.map((scene) =>
    scene.id === nextSceneId
      ? {
          ...scene,
          sceneData: serializeScene(world),
        }
      : scene
  );

  return {
    ...normalized,
    scenes: nextScenes,
    metadata: {
      ...normalized.metadata,
      updatedAt: nowIso(),
    },
    activeSceneId: nextSceneId,
  };
};

export const replaceProjectScene = (project, sceneId, sceneData) => {
  const normalized = normalizeProject(project);
  return {
    ...normalized,
    scenes: normalized.scenes.map((scene) =>
      scene.id === sceneId
        ? {
            ...scene,
            sceneData: cloneData(sceneData),
          }
        : scene
    ),
    metadata: {
      ...normalized.metadata,
      updatedAt: nowIso(),
    },
  };
};

export const createSceneFromWorld = (name, world, options = {}) => ({
  id: options.id ?? makeId("scene"),
  name: name ?? "Scene",
  order: Number.isFinite(options.order) ? options.order : 0,
  spawnPoint: normalizeSpawnPoint(options.spawnPoint),
  sceneData: serializeScene(world),
});

export const createLevelFromScene = (scene, options = {}) => ({
  id: options.id ?? makeId("level"),
  name: options.name ?? scene.name ?? "Level",
  sceneId: scene.id,
  order: Number.isFinite(options.order) ? options.order : 0,
  starting: Boolean(options.starting),
  nextLevelId: options.nextLevelId ?? null,
  spawnPoint: normalizeSpawnPoint(options.spawnPoint ?? scene.spawnPoint),
  completionRequirement: options.completionRequirement ?? "Reach the goal.",
  completionSignal: options.completionSignal ?? "complete",
  objectiveText: options.objectiveText ?? "Reach the goal.",
});

export const publishProject = (project, options = {}) => {
  const normalized = normalizeProject(project);
  const publishedVersion = normalized.metadata.publishedVersion + 1;
  return {
    ...normalized,
    metadata: {
      ...normalized.metadata,
      publishedAt: nowIso(),
      publishedVersion,
      updatedAt: nowIso(),
    },
    published: {
      source: options.source ?? "published",
      version: publishedVersion,
    },
  };
};

export const loadProjectLike = (raw) => {
  if (!raw) return null;
  try {
    return normalizeProject(JSON.parse(raw));
  } catch (error) {
    console.warn("Failed to parse project data:", error);
    return null;
  }
};

export const loadLegacySceneLike = (raw) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.entities)) return null;
    return createProjectFromScene(parsed);
  } catch (error) {
    console.warn("Failed to parse legacy scene data:", error);
    return null;
  }
};

export const getPublishedScenePayload = (project, sceneId = null) => {
  const normalized = normalizeProject(project);
  const selectedScene =
    normalized.scenes.find((scene) => scene.id === (sceneId ?? normalized.activeSceneId)) ??
    normalized.scenes[0] ??
    null;

  if (!selectedScene) {
    return null;
  }

  const activeLevel = getStartingLevel(normalized);
  const levels = normalized.levels.map((level) => ({
    ...level,
  }));

  return {
    ...normalized,
    activeSceneId: selectedScene.id,
    runtime: {
      ...normalized.runtime,
      startingLevelId: activeLevel?.id ?? normalized.runtime.startingLevelId,
    },
    scenes: normalized.scenes.map((scene) => ({
      ...scene,
      sceneData: cloneData(scene.sceneData),
    })),
    levels,
  };
};
