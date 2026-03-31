import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { Engine, syncWorldToScene } from "./src/engine/engine.js";
import { World } from "./src/engine/world.js";
import {
  createTransform,
  createMesh,
  createCollider,
  createHealth,
  createHitBox,
  createPlayer,
  createCamera,
  createGltf,
  createScript,
  createSpriteCharacter,
  ComponentType,
} from "./src/engine/components.js";
import {
  loadSpriteCharactersFromEntries,
  cloneSpriteCollider,
  cloneSpriteCombatBox,
  createDefaultSpriteCollider,
  resolveSpriteColliderForFrame,
} from "./src/engine/sprite-animation.js";
import { serializeScene, deserializeScene } from "./src/engine/scene-io.js";
import {
  PROJECT_STORAGE_KEYS,
  createLevelFromScene,
  createProjectFromScene,
  createSceneFromWorld,
  getActiveScene,
  getLevelById,
  getSceneById,
  getStartingLevel,
  loadLegacySceneLike,
  loadProjectLike,
  normalizeProject,
  publishProject,
  replaceProjectScene,
  getPublishedScenePayload,
} from "./src/engine/project-io.js";

const canvas = document.getElementById("viewport");
const hierarchyList = document.getElementById("hierarchyList");
const inspectorFields = document.getElementById("inspectorFields");
const colliderFields = document.getElementById("colliderFields");
const playerFields = document.getElementById("playerFields");
const spriteInspectorFields = document.getElementById("spriteInspectorFields");
const status = document.getElementById("viewportStatus");
const addEntityButton = document.getElementById("addEntity");
const addCameraEntityButton = document.getElementById("addCameraEntity");
const importFolderButton = document.getElementById("importFolderBtn");
const importFolderInput = document.getElementById("importFolder");
const importSpriteFolderButton = document.getElementById("importSpriteFolderBtn");
const importSpriteFolderInput = document.getElementById("importSpriteFolder");
const playButton = document.getElementById("playBtn");
const stopButton = document.getElementById("stopBtn");
const publishButton = document.getElementById("publishProject");
const openPlayerButton = document.getElementById("openPlayer");
const undoSceneButton = document.getElementById("undoScene");
const redoSceneButton = document.getElementById("redoScene");
const uploadedList = document.getElementById("uploadedList");
const spriteBrowser = document.getElementById("spriteBrowser");
const triggerPresetButtons = document.getElementById("triggerPresetButtons");
const triggerPresetHint = document.getElementById("triggerPresetHint");
const sceneManagerPanel = document.getElementById("sceneManager");
const levelManagerPanel = document.getElementById("levelManager");
const hudSettingsPanel = document.getElementById("hudSettings");
const publishPanel = document.getElementById("publishPanel");
const addSceneButton = document.getElementById("addSceneButton");
const duplicateSceneButton = document.getElementById("duplicateSceneButton");
const addLevelButton = document.getElementById("addLevelButton");
const editTabButtons = Array.from(document.querySelectorAll("[data-edit-tab]"));
const editPanels = Array.from(document.querySelectorAll("[data-edit-panel]"));
const EDITOR_RETURN_TAB_STORAGE_KEY = "tyronEditorReturnTab";
const DRAFT_PROJECT_STORAGE_KEY = PROJECT_STORAGE_KEYS.draft;
const PUBLISHED_PROJECT_STORAGE_KEY = PROJECT_STORAGE_KEYS.published;
const normalizeEditTabName = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";
const importedAssets = [];
const worldAssets = [];
const uploadedAssets = [];
const spriteCharacters = [];
let renderAssets = () => {};
const getStoredEditTab = () => {
  const fallback = "offset";
  try {
    const stored = normalizeEditTabName(localStorage.getItem(EDITOR_RETURN_TAB_STORAGE_KEY));
    if (stored && editTabButtons.some((button) => button.dataset.editTab === stored)) {
      return stored;
    }
  } catch (error) {
    console.warn("Failed to read editor tab state:", error);
  }
  return fallback;
};
let activeEditTab = getStoredEditTab();
const SCRIPT_TEMPLATE = `// Attach scripts to entities.
// Try helpers like:
// api.onTriggerEnter((self, other) => { ... })
// api.launchPlayer(8)
// api.setPlayerControlEnabled(false)
function update(entity, dt, world, THREE, engine, api) {
  // TODO: player movement
}
`;

const activateEditTab = (tabName, { focus = false } = {}) => {
  const nextTab = normalizeEditTabName(tabName) || "offset";
  activeEditTab = nextTab;
  try {
    localStorage.setItem(EDITOR_RETURN_TAB_STORAGE_KEY, nextTab);
  } catch (error) {
    console.warn("Failed to persist editor tab state:", error);
  }
  editTabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.editTab === nextTab);
  });
  editPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.editPanel === nextTab);
  });

  if (nextTab === "code" && codeEditor) {
    requestAnimationFrame(() => {
      codeEditor.layout();
    });
  }

  if (focus) {
    const activeButton = editTabButtons.find((button) => button.dataset.editTab === nextTab);
    activeButton?.focus?.();
  }
};

const buildTriggerPresetSource = (body) => `let wired = false;

function update(entity, dt, world, THREE, engine, api) {
  if (wired) return;
  wired = true;

${body}
}
`;

const TRIGGER_PRESETS = [
  {
    id: "activate_cutscene",
    label: "Activate Cutscene",
    description: "Start a cutscene when the player enters the trigger.",
    source: buildTriggerPresetSource(`  api.onTriggerEnter((self, other) => {
    const name = other.name?.toLowerCase() ?? "";
    if (name !== "player") return;

    api.startCutscene("Cutscene");
    api.log("Cutscene started.");
  });`),
  },
  {
    id: "jump_pad",
    label: "Jump Pad",
    description: "Launch the player upward when they enter the trigger.",
    source: buildTriggerPresetSource(`  api.onTriggerEnter((self, other) => {
    const name = other.name?.toLowerCase() ?? "";
    if (name !== "player") return;

    api.launchPlayer(10);
  });`),
  },
  {
    id: "open_door",
    label: "Open Door",
    description: "Push a door entity upward when the player enters the trigger.",
    source: buildTriggerPresetSource(`  api.onTriggerEnter((self, other) => {
    const name = other.name?.toLowerCase() ?? "";
    if (name !== "player") return;

    const door = world.getEntities().find((item) =>
      (item.name ?? "").toLowerCase().includes("door")
    );
    if (!door) return;

    const transform = api.getTransform(door);
    if (!transform) return;

    api.setColliderBody(door, "kinematic");
    api.setPosition(door, [transform.position[0], transform.position[1] + 3, transform.position[2]]);
  });`),
  },
  {
    id: "toggle_control",
    label: "Toggle Player Control",
    description: "Disable control on enter and restore it on exit.",
    source: buildTriggerPresetSource(`  api.onTriggerEnter((self, other) => {
    const name = other.name?.toLowerCase() ?? "";
    if (name !== "player") return;

    api.setPlayerControlEnabled(false);
  });

  api.onTriggerExit((self, other) => {
    const name = other.name?.toLowerCase() ?? "";
    if (name !== "player") return;

    api.setPlayerControlEnabled(true);
  });`),
  },
  {
    id: "teleport_player",
    label: "Teleport Player",
    description: "Move the player to a checkpoint entity when they enter.",
    source: buildTriggerPresetSource(`  api.onTriggerEnter((self, other) => {
    const name = other.name?.toLowerCase() ?? "";
    if (name !== "player") return;

    const checkpoint = world.getEntities().find((item) =>
      (item.name ?? "").toLowerCase().includes("checkpoint")
    );
    if (!checkpoint) return;

    const transform = api.getTransform(checkpoint);
    if (!transform) return;

    api.setPosition(other, [transform.position[0], transform.position[1] + 1.2, transform.position[2]]);
  });`),
  },
  {
    id: "custom_trigger",
    label: "Trigger Scaffold",
    description: "Insert a blank trigger script you can customize.",
    source: `let wired = false;

function update(entity, dt, world, THREE, engine, api) {
  if (wired) return;
  wired = true;

  api.onTriggerEnter((self, other) => {
    if ((other.name ?? "").toLowerCase() !== "player") return;
    // Add your trigger action here.
  });
}
`,
  },
];

const engine = new Engine({
  canvas,
  sceneSyncOptions: {
    showCameraRig: true,
    showSpriteOutlines: true,
  },
});
const createDefaultEditorWorld = () => {
  const nextWorld = new World();

  const ground = nextWorld.createEntity("Ground");
  nextWorld.addComponent(
    ground,
    createTransform({ position: [0, -0.5, 0], scale: [10, 0.2, 10] })
  );
  nextWorld.addComponent(ground, createMesh({ material: { color: "#1e2a3c" } }));
  nextWorld.addComponent(
    ground,
    createCollider({ shape: "box", size: [10, 0.2, 10], body: "static" })
  );

  const player = nextWorld.createEntity("Player");
  nextWorld.addComponent(player, createTransform({ position: [0, 1, 0] }));
  nextWorld.addComponent(player, createMesh({ material: { color: "#ff6f91" } }));
  nextWorld.addComponent(
    player,
    createCollider({ shape: "box", size: [1, 1, 1], body: "dynamic" })
  );
  nextWorld.addComponent(player, createPlayer());
  nextWorld.addComponent(player, createHealth());

  const prop = nextWorld.createEntity("Tower");
  nextWorld.addComponent(
    prop,
    createTransform({ position: [3, 1.2, -2], scale: [1, 2.4, 1] })
  );
  nextWorld.addComponent(prop, createMesh({ geometry: "box", material: { color: "#7fd9ff" } }));

  return nextWorld;
};

let world = createDefaultEditorWorld();
engine.setWorld(world);

const grid = new THREE.GridHelper(20, 20, 0x22304a, 0x121b2b);
engine.scene.add(grid);
engine.scene.add(new THREE.AxesHelper(2));

const orbitControls = new OrbitControls(engine.camera, canvas);
orbitControls.enableDamping = true;

const transformControls = new TransformControls(engine.camera, canvas);
transformControls.setMode("translate");
engine.scene.add(transformControls);

const setupViewportResizeSync = () => {
  const resize = () => {
    engine.onResize();
  };

  resize();
  const target = canvas?.parentElement ?? canvas;
  if (!target || !("ResizeObserver" in window)) return;

  const observer = new ResizeObserver(() => {
    resize();
  });
  observer.observe(target);
  window.addEventListener(
    "beforeunload",
    () => {
      observer.disconnect();
    },
    { once: true }
  );
};

const editorClock = new THREE.Clock();
const meshCache = engine.cache;
const colliderHelpers = new Map();
const hitBoxHelpers = new Map();
const spriteColliderHelpers = new Map();
let selectedEntityId = null;
let isTransformingSelectedEntity = false;
let selectedSpriteCharacterName = null;
let selectedSpriteAnimationName = null;
let runtimeWindow = null;
let codeEditor = null;
let suppressCodeEditorSync = false;
let projectState = null;
let activeSceneId = null;
let activeLevelId = null;
let runtimeModeWindow = null;
const sceneHistory = {
  past: [],
  future: [],
  isRestoring: false,
};
const SCENE_HISTORY_LIMIT = 40;

const getSelectedEntity = () =>
  world.getEntities().find((entity) => entity.id === selectedEntityId) ?? null;

const cloneSceneData = (scene) =>
  typeof structuredClone === "function"
    ? structuredClone(scene)
    : JSON.parse(JSON.stringify(scene));

const captureSceneSnapshot = () => ({
  scene: cloneSceneData(serializeScene(world)),
});

const snapshotsMatch = (a, b) =>
  JSON.stringify(a.scene) === JSON.stringify(b.scene);

const updateSceneHistoryButtons = () => {
  const currentSnapshot = captureSceneSnapshot();
  const canUndo =
    sceneHistory.past.length > 1 ||
    (sceneHistory.past.length === 1 && !snapshotsMatch(sceneHistory.past[0], currentSnapshot));
  if (undoSceneButton) {
    undoSceneButton.disabled = !canUndo;
  }
  if (redoSceneButton) {
    redoSceneButton.disabled = sceneHistory.future.length === 0;
  }
};

const pushSceneHistory = () => {
  if (sceneHistory.isRestoring) return;
  const snapshot = captureSceneSnapshot();
  const last = sceneHistory.past[sceneHistory.past.length - 1];
  if (last && snapshotsMatch(last, snapshot)) return;

  sceneHistory.past.push(snapshot);
  if (sceneHistory.past.length > SCENE_HISTORY_LIMIT) {
    sceneHistory.past.shift();
  }
  sceneHistory.future.length = 0;
  updateSceneHistoryButtons();
};

const restoreSceneSnapshot = (snapshot, message) => {
  sceneHistory.isRestoring = true;
  try {
    const currentSelection = selectedEntityId;
    const restoredWorld = deserializeScene(snapshot.scene);
    const preferredSelection = restoredWorld.getEntities().some(
      (entity) => entity.id === currentSelection
    )
      ? currentSelection
      : restoredWorld.getEntities()[0]?.id ?? null;
    setWorld(restoredWorld, { selectionId: preferredSelection });
    if (status && message) {
      status.textContent = message;
    }
  } finally {
    sceneHistory.isRestoring = false;
    updateSceneHistoryButtons();
  }
};

const undoSceneChange = () => {
  if (!sceneHistory.past.length) return;
  const current = captureSceneSnapshot();
  const snapshot = sceneHistory.past.pop();
  sceneHistory.future.push(current);
  restoreSceneSnapshot(snapshot, "Undid last edit.");
};

const redoSceneChange = () => {
  if (!sceneHistory.future.length) return;
  const current = captureSceneSnapshot();
  const snapshot = sceneHistory.future.pop();
  sceneHistory.past.push(current);
  restoreSceneSnapshot(snapshot, "Redid last edit.");
};

const syncTransformComponentFromObject = (entity, object) => {
  const transform = entity?.components.get(ComponentType.Transform);
  if (!transform || !object) return;

  transform.position = [object.position.x, object.position.y, object.position.z];
  transform.rotation = [object.rotation.x, object.rotation.y, object.rotation.z];
  transform.scale = [object.scale.x, object.scale.y, object.scale.z];
};

const commitSelectedEntityTransform = () => {
  if (!selectedEntityId) return;
  const entity = world.getEntities().find((item) => item.id === selectedEntityId);
  const object = meshCache.get(selectedEntityId);
  if (entity && object) {
    syncTransformComponentFromObject(entity, object);
  }
};

const getScriptSource = (entity) =>
  entity?.components.get(ComponentType.Script)?.source ?? SCRIPT_TEMPLATE;

const ensureScriptComponent = (entity) => {
  if (!entity) return null;

  let script = entity.components.get(ComponentType.Script);
  if (!script) {
    script = createScript({ source: SCRIPT_TEMPLATE });
    world.addComponent(entity, script);
  }

  return script;
};

const setCodeEditorSource = (source) => {
  if (!codeEditor) return;

  if (codeEditor.getValue() === source) {
    return;
  }

  suppressCodeEditorSync = true;
  codeEditor.setValue(source);
  suppressCodeEditorSync = false;
  applyCodeEditorChange();
};

const syncCodeEditorToSelection = () => {
  if (!codeEditor) return;

  const entity = getSelectedEntity();
  codeEditor.updateOptions({ readOnly: !entity });

  const nextSource = getScriptSource(entity);
  setCodeEditorSource(nextSource);
};

const applyCodeEditorChange = () => {
  if (!codeEditor || suppressCodeEditorSync) return;

  const entity = getSelectedEntity();
  if (!entity) return;

  const hadScript = Boolean(entity.components.get(ComponentType.Script));
  const nextSource = codeEditor.getValue();
  const script = hadScript ? entity.components.get(ComponentType.Script) : null;
  if (hadScript && script?.source === nextSource) {
    return;
  }

  pushSceneHistory();
  const nextScript = ensureScriptComponent(entity);
  if (!nextScript) return;
  nextScript.source = nextSource;
};

const renderTriggerPresets = () => {
  if (!triggerPresetButtons || !triggerPresetHint) return;

  triggerPresetButtons.innerHTML = "";
  const entity = getSelectedEntity();
  const collider = entity?.components.get(ComponentType.Collider) ?? null;
  const showPresets = Boolean(entity && collider?.isTrigger);

  triggerPresetHint.textContent = showPresets
    ? "Choose a preset to fill the selected entity's script."
    : entity
      ? "Enable Trigger only on the collider to show preset buttons."
      : "Select an entity with a trigger collider to unlock presets.";

  if (!showPresets) return;

  TRIGGER_PRESETS.forEach((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-button";
    button.textContent = `Set Trigger To: ${preset.label}`;
    button.title = preset.description;
    button.addEventListener("click", () => {
      setCodeEditorSource(preset.source);
      if (status) {
        status.textContent = `Applied trigger preset: ${preset.label}.`;
      }
    });
    triggerPresetButtons.appendChild(button);
  });
};

const rebuildHierarchy = () => {
  if (!hierarchyList) return;
  hierarchyList.innerHTML = "";
  world.getEntities().forEach((entity) => {
    const button = document.createElement("button");
    button.textContent = entity.name;
    button.className = entity.id === selectedEntityId ? "active" : "";
    button.addEventListener("click", () => selectEntity(entity.id));
    hierarchyList.appendChild(button);
  });
};

const buildVectorField = (label, values, onChange) => {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const title = document.createElement("label");
  title.textContent = label;
  wrapper.appendChild(title);

  const inputs = values.map((value, index) => {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.1";
    input.value = value.toFixed(2);
    input.addEventListener("change", () => {
      pushSceneHistory();
      const parsed = Number.parseFloat(input.value);
      onChange(index, Number.isFinite(parsed) ? parsed : value);
    });
    wrapper.appendChild(input);
    return input;
  });

  return { wrapper, inputs };
};

const setPanelMessage = (panel, message) => {
  if (!panel) return;
  panel.innerHTML = `<p class="muted">${message}</p>`;
};

const routeInspectorSections = () => {
  if (!inspectorFields) return;

  const colliderTitles = new Set(["Collider", "Hit Box"]);
  const playerTitles = new Set(["Player", "Health"]);

  if (colliderFields) {
    colliderFields.innerHTML = "";
  }
  if (playerFields) {
    playerFields.innerHTML = "";
  }

  const sections = Array.from(inspectorFields.children);
  sections.forEach((section) => {
    const title =
      section.querySelector("label")?.textContent?.trim() ??
      section.querySelector(".panel__header label")?.textContent?.trim() ??
      "";
    if (colliderFields && colliderTitles.has(title)) {
      colliderFields.appendChild(section);
      return;
    }
    if (playerFields && playerTitles.has(title)) {
      playerFields.appendChild(section);
    }
  });

  if (colliderFields && !colliderFields.children.length) {
    setPanelMessage(colliderFields, "Select an entity with a collider or hit box.");
  }
  if (playerFields && !playerFields.children.length) {
    setPanelMessage(playerFields, "Select an entity with player or health components.");
  }
};

const clearElement = (element) => {
  if (!element) return;
  element.innerHTML = "";
};

const createProjectSection = (title, description) => {
  const section = document.createElement("div");
  section.className = "project-manager__section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.appendChild(heading);
  if (description) {
    const meta = document.createElement("p");
    meta.className = "project-manager__meta";
    meta.textContent = description;
    section.appendChild(meta);
  }
  return section;
};

const createProjectRow = () => {
  const row = document.createElement("div");
  row.className = "project-manager__row";
  return row;
};

const createProjectButton = (label, onClick, className = "btn btn--ghost btn--small") => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
};

function deleteEntity(entityId) {
  pushSceneHistory();
  const object = meshCache.get(entityId);
  if (object) {
    engine.scene.remove(object);
    meshCache.delete(entityId);
  }
  const helper = colliderHelpers.get(entityId);
  if (helper) {
    engine.scene.remove(helper);
    colliderHelpers.delete(entityId);
  }
  const hitHelper = hitBoxHelpers.get(entityId);
  if (hitHelper) {
    engine.scene.remove(hitHelper);
    hitBoxHelpers.delete(entityId);
  }
  world.destroyEntity(entityId);
  const next = world.getEntities()[0];
  selectEntity(next ? next.id : null);
}

function createEntity(name = "Entity") {
  pushSceneHistory();
  const entity = world.createEntity(name);
  world.addComponent(entity, createTransform());
  world.addComponent(entity, createMesh());
  world.addComponent(entity, createCollider({ body: "static" }));
  selectEntity(entity.id);
  if (status) {
    status.textContent = `Created ${entity.name}.`;
  }
}

const openRuntimeWindow = () => {
  let sceneSaved = true;
  try {
    localStorage.setItem(EDITOR_RETURN_TAB_STORAGE_KEY, activeEditTab);
    const draft = saveDraftProject({ announce: false });
    localStorage.setItem(PROJECT_STORAGE_KEYS.legacyScene, JSON.stringify(serializeScene(world)));
    localStorage.setItem(DRAFT_PROJECT_STORAGE_KEY, JSON.stringify(draft));
  } catch (error) {
    sceneSaved = false;
    console.warn("Failed to persist scene for runtime preview:", error);
  }

  if (runtimeWindow && !runtimeWindow.closed) {
    runtimeWindow.focus();
    runtimeWindow.location.reload();
  } else {
    runtimeWindow = window.open("runtime.html?mode=preview", "_blank");
  }
  if (status) {
    status.textContent = sceneSaved
      ? "Play mode: running in runtime preview."
      : "Play mode opened, but scene could not be saved. Runtime will show default scene.";
  }
  if (playButton) playButton.disabled = true;
  if (stopButton) stopButton.disabled = false;
};

const closeRuntimeWindow = () => {
  if (runtimeWindow && !runtimeWindow.closed) {
    runtimeWindow.close();
  }
  runtimeWindow = null;
  if (status) status.textContent = "Play mode: stopped.";
  if (playButton) playButton.disabled = false;
  if (stopButton) stopButton.disabled = true;
};

const addCollisionBoxToEntity = (entity) => {
  if (!entity || entity.components.has(ComponentType.Collider)) return;
  pushSceneHistory();
  const transform = entity.components.get(ComponentType.Transform);
  const scale = Array.isArray(transform?.scale) && transform.scale.length === 3
    ? transform.scale
    : [1, 1, 1];
  world.addComponent(entity, createCollider({ body: "static", size: scale }));
  status.textContent = `Added collision box to ${entity.name}.`;
  rebuildInspector();
};

const addHealthToEntity = (entity) => {
  if (!entity || entity.components.has(ComponentType.Health)) return;
  pushSceneHistory();
  world.addComponent(entity, createHealth());
  status.textContent = `Added health to ${entity.name}.`;
  rebuildInspector();
};

const addHitBoxToEntity = (entity) => {
  if (!entity || entity.components.has(ComponentType.HitBox)) return;
  pushSceneHistory();
  world.addComponent(entity, createHitBox());
  status.textContent = `Added hit box to ${entity.name}.`;
  rebuildInspector();
};

const removeComponentFromEntity = (entity, componentType, statusMessage) => {
  if (!entity || !entity.components.has(componentType)) return;
  pushSceneHistory();
  entity.components.delete(componentType);
  if (status) {
    status.textContent = statusMessage ?? `Removed component from ${entity.name}.`;
  }
  rebuildInspector();
};

const makeEntityPlayablePlayer = (entity) => {
  if (!entity) return;
  pushSceneHistory();
  world.getEntities().forEach((otherEntity) => {
    const otherPlayer = otherEntity.components.get(ComponentType.Player);
    if (otherEntity.id !== entity.id && otherPlayer) {
      otherPlayer.enabled = false;
    }
  });

  let playerComponent = entity.components.get(ComponentType.Player);
  if (!playerComponent) {
    playerComponent = createPlayer();
    world.addComponent(entity, playerComponent);
  }
  playerComponent.enabled = true;

  if (!entity.components.has(ComponentType.Health)) {
    world.addComponent(entity, createHealth());
  }

  const collider = entity.components.get(ComponentType.Collider);
  if (!collider) {
    world.addComponent(
      entity,
      createCollider({ shape: "box", size: [1, 1, 1], body: "dynamic" })
    );
  } else if (collider.body === "static") {
    collider.body = "dynamic";
  }

  if (!entity.name || entity.name.trim().length === 0 || entity.name === "Entity") {
    entity.name = "Player";
  }

  status.textContent = `${entity.name} is now the playable character.`;
  rebuildHierarchy();
  rebuildInspector();
};

const removeEntityPlayablePlayer = (entity) => {
  if (!entity) return;
  const playerComponent = entity.components.get(ComponentType.Player);
  if (!playerComponent) return;

  pushSceneHistory();
  playerComponent.enabled = false;

  if (status) {
    status.textContent = `${entity.name} is no longer the playable character.`;
  }
  rebuildInspector();
};

const cameraFollowPreview = new THREE.Object3D();

const getEntityById = (entityId) =>
  world.getEntities().find((item) => item.id === entityId) ?? null;

const findScenePlayerEntity = () =>
  world.getEntities().find((item) => {
    const playerComponent = item.components.get(ComponentType.Player);
    return playerComponent && playerComponent.enabled !== false;
  }) ??
  world
    .getEntities()
    .find(
      (item) =>
        item.name?.toLowerCase() === "player" &&
        item.components.get(ComponentType.Player)?.enabled !== false
    ) ??
  null;

const resolveCameraTargetEntity = (camera, cameraEntity = null) => {
  const targetById = Number.isFinite(camera?.lockTargetId)
    ? getEntityById(camera.lockTargetId)
    : null;
  if (targetById && targetById.id !== cameraEntity?.id) {
    return targetById;
  }

  if (camera?.lockToPlayer) {
    const playerEntity = findScenePlayerEntity();
    if (playerEntity && playerEntity.id !== cameraEntity?.id) {
      return playerEntity;
    }
  }

  return null;
};

const syncCameraEntityToTarget = (entity) => {
  const camera = entity?.components.get(ComponentType.Camera);
  const transform = entity?.components.get(ComponentType.Transform);
  if (!camera || !transform) return false;

  const target = resolveCameraTargetEntity(camera, entity);
  if (!target) return false;

  const targetTransform = target.components.get(ComponentType.Transform);
  if (!targetTransform) return false;

  if (!Array.isArray(camera.followOffset)) {
    camera.followOffset = [0, 2, 5];
  }

  const targetPosition = new THREE.Vector3(
    targetTransform.position[0],
    targetTransform.position[1],
    targetTransform.position[2]
  );
  if (!Array.isArray(camera.followOffset) || camera.followOffset.length !== 3) {
    camera.followOffset = [
      transform.position[0] - targetPosition.x,
      transform.position[1] - targetPosition.y,
      transform.position[2] - targetPosition.z,
    ];
  }

  const followOffset = new THREE.Vector3(
    camera.followOffset[0] ?? 0,
    camera.followOffset[1] ?? 0,
    camera.followOffset[2] ?? 0
  );
  const desiredPosition = targetPosition.clone().add(followOffset);
  transform.position = [desiredPosition.x, desiredPosition.y, desiredPosition.z];
  return true;
};

const updateCameraEntityFollowers = () => {
  world.getEntities().forEach((entity) => {
    if (!entity.components.has(ComponentType.Camera)) return;
    syncCameraEntityToTarget(entity);
  });
};

const createCameraEntity = () => {
  pushSceneHistory();
  const entity = world.createEntity("Camera");
  const cameraPosition = [0, 0.5, 0];

  world.addComponent(
    entity,
    createTransform({ position: cameraPosition, rotation: [0, 0, 0] })
  );
  world.addComponent(entity, createCamera({ lockToPlayer: false, lockTargetId: null }));
  selectEntity(entity.id);
  if (status) {
    status.textContent = "Created camera entity.";
  }
};

const normalizeKeyBinding = (key) =>
  typeof key === "string" ? key.trim().toLowerCase() : "";

const cloneSpriteColliderBox = (collider) =>
  cloneSpriteCollider(collider ?? createDefaultSpriteCollider());

const cloneSpriteFrame = (frame, index = 0) => ({
  index: Number.isFinite(frame?.index) ? frame.index : index,
  name: frame?.name ?? `frame_${String(index + 1).padStart(3, "0")}`,
  source: frame?.source ?? frame?.relativePath ?? "",
  relativePath: frame?.relativePath ?? frame?.source ?? "",
  width: Number.isFinite(frame?.width) ? frame.width : null,
  height: Number.isFinite(frame?.height) ? frame.height : null,
  collider: frame?.collider ? cloneSpriteColliderBox(frame.collider) : null,
  events: Array.isArray(frame?.events)
    ? frame.events.map((event) => ({
        frame: Number.isFinite(event?.frame) ? Math.max(0, Math.floor(event.frame)) : 0,
        type: event?.type ?? "frame",
        data:
          event && typeof event.data === "object" && !Array.isArray(event.data)
            ? { ...event.data }
            : {},
      }))
    : [],
});

const cloneSpriteAnimation = (animation) => ({
  name: animation?.name ?? "idle",
  fps: Number.isFinite(animation?.fps) ? animation.fps : 12,
  loop: animation?.loop !== false,
  frames: Array.isArray(animation?.frames)
    ? animation.frames.map((frame, index) => cloneSpriteFrame(frame, index))
    : [],
  colliders: Array.isArray(animation?.colliders)
    ? animation.colliders.map((entry) => ({
        frame: Number.isFinite(entry?.frame) ? Math.max(0, Math.floor(entry.frame)) : 0,
        collider: cloneSpriteColliderBox(entry?.collider),
      }))
    : [],
  events: Array.isArray(animation?.events)
    ? animation.events.map((event) => ({
        frame: Number.isFinite(event?.frame) ? Math.max(0, Math.floor(event.frame)) : 0,
        type: event?.type ?? "frame",
        data:
          event && typeof event.data === "object" && !Array.isArray(event.data)
            ? { ...event.data }
            : {},
      }))
    : [],
  hitBox:
    animation?.hitBox && typeof animation.hitBox === "object"
      ? cloneSpriteCombatBox(animation.hitBox)
      : null,
  blendMode: animation?.blendMode ?? "replace",
  stateMachine:
    animation?.stateMachine && typeof animation.stateMachine === "object"
      ? { ...animation.stateMachine }
      : null,
  spriteSheet:
    animation?.spriteSheet && typeof animation.spriteSheet === "object"
      ? { ...animation.spriteSheet }
      : null,
  dedicatedKey: normalizeKeyBinding(animation?.dedicatedKey),
});

const buildSpriteAnimationJson = (animation) => {
  const colliders = Array.isArray(animation?.colliders)
    ? animation.colliders.map((entry) => ({
        frame: Number.isFinite(entry?.frame) ? Math.max(0, Math.floor(entry.frame)) : 0,
        collider: cloneSpriteColliderBox(entry?.collider),
      }))
    : [];
  const events = Array.isArray(animation?.events)
    ? animation.events.map((event) => ({
        frame: Number.isFinite(event?.frame) ? Math.max(0, Math.floor(event.frame)) : 0,
        type: event?.type ?? "frame",
        data:
          event && typeof event.data === "object" && !Array.isArray(event.data)
            ? { ...event.data }
            : {},
      }))
    : [];
  const frameEvents = Array.isArray(animation?.frames)
    ? animation.frames.flatMap((frame, index) =>
        Array.isArray(frame?.events)
          ? frame.events.map((event) => ({
              frame: Number.isFinite(event?.frame) ? Math.max(0, Math.floor(event.frame)) : index,
              type: event?.type ?? "frame",
              data:
                event && typeof event.data === "object" && !Array.isArray(event.data)
                  ? { ...event.data }
                  : {},
            }))
          : []
      )
    : [];
  const frames = Array.isArray(animation?.frames)
    ? animation.frames.map((frame, index) => ({
        index: Number.isFinite(frame?.index) ? Math.max(0, Math.floor(frame.index)) : index,
        name: frame?.name ?? `frame_${String(index + 1).padStart(3, "0")}`,
        relativePath:
          typeof frame?.relativePath === "string" && frame.relativePath
            ? frame.relativePath
            : `${frame?.name ?? `frame_${String(index + 1).padStart(3, "0")}`}.png`,
        collider: frame?.collider ? cloneSpriteColliderBox(frame.collider) : null,
        events: Array.isArray(frame?.events)
          ? frame.events.map((event) => ({
              frame: Number.isFinite(event?.frame) ? Math.max(0, Math.floor(event.frame)) : index,
              type: event?.type ?? "frame",
              data:
                event && typeof event.data === "object" && !Array.isArray(event.data)
                  ? { ...event.data }
                  : {},
            }))
          : [],
      }))
    : [];

  return {
    name: animation?.name ?? "idle",
    fps: Number.isFinite(animation?.fps) ? animation.fps : 12,
    loop: animation?.loop !== false,
    blendMode: animation?.blendMode ?? "replace",
  dedicatedKey: normalizeKeyBinding(animation?.dedicatedKey),
  hitBox:
      animation?.hitBox && typeof animation.hitBox === "object"
        ? cloneSpriteCombatBox(animation.hitBox)
        : null,
  stateMachine:
      animation?.stateMachine && typeof animation.stateMachine === "object"
        ? { ...animation.stateMachine }
        : null,
    spriteSheet:
      animation?.spriteSheet && typeof animation.spriteSheet === "object"
        ? { ...animation.spriteSheet }
        : null,
    frames,
    colliders,
    events,
    frameEvents,
  };
};

const downloadJsonFile = (filename, payload) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const pickIdleAnimationName = (animations) => {
  if (!Array.isArray(animations) || !animations.length) return "";
  return (
    animations.find((animation) => animation.name?.toLowerCase() === "idle")?.name ??
    animations[0].name
  );
};

const sortByNaturalName = (a, b) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

const findSpriteCharacter = (name) =>
  spriteCharacters.find((character) => character.name === name) ?? null;

const findSpriteAnimation = (characterName, animationName) => {
  const character = findSpriteCharacter(characterName);
  if (!character) return null;
  return character.animations.find((animation) => animation.name === animationName) ?? null;
};

const ensureSpriteSelection = () => {
  if (!spriteCharacters.length) {
    selectedSpriteCharacterName = null;
    selectedSpriteAnimationName = null;
    return;
  }

  const selectedCharacter =
    findSpriteCharacter(selectedSpriteCharacterName) ?? spriteCharacters[0];
  selectedSpriteCharacterName = selectedCharacter.name;

  const selectedAnimation =
    findSpriteAnimation(selectedSpriteCharacterName, selectedSpriteAnimationName) ??
    selectedCharacter.animations[0] ??
    null;
  selectedSpriteAnimationName = selectedAnimation?.name ?? null;
};

const revokeSpriteCharacterUrls = (character) => {
  character.animations.forEach((animation) => {
    animation.frames.forEach((frame) => {
      if (typeof frame.source === "string" && frame.source.startsWith("blob:")) {
        URL.revokeObjectURL(frame.source);
      }
    });
  });
};

const upsertSpriteCharacter = (nextCharacter) => {
  const existingIndex = spriteCharacters.findIndex(
    (character) => character.name === nextCharacter.name
  );
  if (existingIndex < 0) {
    spriteCharacters.push(nextCharacter);
    spriteCharacters.sort((a, b) => sortByNaturalName(a.name, b.name));
    return;
  }

  const existingCharacter = spriteCharacters[existingIndex];
  nextCharacter.animations.forEach((animation) => {
    const existingAnimation = existingCharacter.animations.find(
      (item) => item.name === animation.name
    );
    if (!existingAnimation) return;
    animation.fps = existingAnimation.fps ?? animation.fps;
    animation.loop = existingAnimation.loop ?? animation.loop;
    animation.dedicatedKey = normalizeKeyBinding(existingAnimation.dedicatedKey);
    if (Array.isArray(existingAnimation.frames) && existingAnimation.frames.length) {
      animation.frames = animation.frames.map((frame, index) => {
        const existingFrame =
          existingAnimation.frames[index] ??
          existingAnimation.frames.find((item) => item.name === frame.name);
        return cloneSpriteFrame(
          {
            ...frame,
            collider: existingFrame?.collider ?? frame.collider,
            events: existingFrame?.events ?? frame.events,
          },
          index
        );
      });
      if (Array.isArray(existingAnimation.colliders) && existingAnimation.colliders.length) {
        animation.colliders = existingAnimation.colliders.map((entry) => ({
          frame: entry.frame,
          collider: cloneSpriteColliderBox(entry.collider),
        }));
      }
    }
  });

  nextCharacter.hitReactionAnimation =
    normalizeKeyBinding(existingCharacter.hitReactionAnimation) ||
    normalizeKeyBinding(nextCharacter.hitReactionAnimation);
  nextCharacter.hitReactionPhysicsEnabled =
    existingCharacter.hitReactionPhysicsEnabled ?? nextCharacter.hitReactionPhysicsEnabled;
  nextCharacter.hitReactionPhysicsOffset = Array.isArray(
    existingCharacter.hitReactionPhysicsOffset
  )
    ? [...existingCharacter.hitReactionPhysicsOffset]
    : nextCharacter.hitReactionPhysicsOffset;
  nextCharacter.hitReactionFallOver =
    existingCharacter.hitReactionFallOver ?? nextCharacter.hitReactionFallOver;
  nextCharacter.hitReactionSkipPhysicsWhenAnimation =
    existingCharacter.hitReactionSkipPhysicsWhenAnimation ??
    nextCharacter.hitReactionSkipPhysicsWhenAnimation;

  revokeSpriteCharacterUrls(existingCharacter);
  spriteCharacters.splice(existingIndex, 1, nextCharacter);
  spriteCharacters.sort((a, b) => sortByNaturalName(a.name, b.name));
};
const importSpriteEntries = async (entries) => {
  if (!Array.isArray(entries) || !entries.length) return;

  try {
    const loadedCharacters = await loadSpriteCharactersFromEntries(entries);
    if (!loadedCharacters.length) {
      status.textContent =
        "No sprite PNG frames found. Use /assets/<character>/<animation>/frame_001.png and animation JSON files.";
      return;
    }

    loadedCharacters.forEach((character) => {
      upsertSpriteCharacter(character);
    });

    const animationCount = loadedCharacters.reduce(
      (count, character) => count + character.animations.length,
      0
    );
    const frameCount = loadedCharacters.reduce(
      (count, character) =>
        count +
        character.animations.reduce(
          (animationCount, animation) => animationCount + animation.frames.length,
          0
        ),
      0
    );
    ensureSpriteSelection();
    renderSpriteBrowser();
    rebuildInspector();
    activateEditTab("sprite");
    status.textContent = `Imported ${loadedCharacters.length} character folder(s), ${animationCount} animation(s), and ${frameCount} frame(s).`;
  } catch (error) {
    console.warn("Sprite import failed:", error);
    status.textContent = "Sprite import failed. Check the folder structure and try again.";
  }
};

const addSpriteCharacterToScene = (character) => {
  if (!character) return;
  pushSceneHistory();
  const animations = Array.isArray(character.animations)
    ? character.animations.map((animation) => cloneSpriteAnimation(animation))
    : [];
  const idleAnimation = pickIdleAnimationName(animations);
  const entity = world.createEntity(character.name || "Sprite Character");
  world.addComponent(entity, createTransform({ position: [0, 0.9, 0] }));
  world.addComponent(
    entity,
    createSpriteCharacter({
      characterName: character.name || "Sprite Character",
      animations,
      defaultAnimation: idleAnimation,
      activeAnimation: idleAnimation,
      activeFrameIndex: 0,
      playing: true,
      colliderEditMode: false,
      hitReactionAnimation: character.hitReactionAnimation,
      hitReactionPhysicsEnabled: character.hitReactionPhysicsEnabled,
      hitReactionPhysicsOffset: character.hitReactionPhysicsOffset,
      hitReactionFallOver: character.hitReactionFallOver,
      hitReactionSkipPhysicsWhenAnimation: character.hitReactionSkipPhysicsWhenAnimation,
    })
  );
  selectedSpriteCharacterName = character.name;
  selectedSpriteAnimationName = idleAnimation;
  selectEntity(entity.id);
  renderSpriteBrowser();
  rebuildInspector();
  activateEditTab("offset");
  status.textContent = `Added sprite character ${character.name} to scene.`;
};

const getSelectedSpriteAnimationData = () => {
  const character = findSpriteCharacter(selectedSpriteCharacterName);
  if (!character) return { character: null, animation: null };
  const animation =
    character.animations.find((item) => item.name === selectedSpriteAnimationName) ?? null;
  return { character, animation };
};

const refreshSpriteCombatFlag = (character) => {
  if (!character) return;
  character.combatBoxes = Boolean(
    Array.isArray(character.animations) &&
      character.animations.some((animation) => Boolean(animation.hitBox))
  );
};

const ensureSpriteCombatBox = (animation, key, defaults = {}) => {
  if (!animation) return null;
  const nextBox = animation[key] ? cloneSpriteCombatBox(animation[key]) : cloneSpriteCombatBox(defaults);
  animation[key] = nextBox;
  return nextBox;
};

const clearSpriteCombatBox = (animation, key) => {
  if (!animation) return;
  animation[key] = null;
};

const appendCombatBoxEditor = (
  section,
  animation,
  key,
  labelText,
  owner = null,
  { withDamage = false } = {}
) => {
  const box = animation?.[key] ?? null;
  const headerRow = document.createElement("div");
  headerRow.className = "row";
  const label = document.createElement("label");
  label.textContent = labelText;
  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = "btn btn--ghost btn--small";
  actionButton.textContent = box ? "Clear" : "Add";
    actionButton.addEventListener("click", () => {
      pushSceneHistory();
      if (animation[key]) {
        clearSpriteCombatBox(animation, key);
    } else {
      ensureSpriteCombatBox(
        animation,
        key,
        key === "hitBox"
          ? { damage: 10, width: 0.8, height: 0.8, depth: 0.2 }
          : { width: 0.8, height: 1.4, depth: 0.2 }
      );
      }
    refreshSpriteCombatFlag(owner);
    rebuildInspector();
    renderSpriteBrowser();
  });
  headerRow.append(label, actionButton);
  section.appendChild(headerRow);

  if (!box) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = `No ${labelText.toLowerCase()} set for this animation.`;
    section.appendChild(empty);
    return;
  }

  const fields = [
    ["x", "X"],
    ["y", "Y"],
    ["width", "Width"],
    ["height", "Height"],
    ["depth", "Depth"],
  ];

  fields.forEach(([keyName, displayName]) => {
    const row = document.createElement("div");
    row.className = "row";
    const fieldLabel = document.createElement("label");
    fieldLabel.textContent = displayName;
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.1";
    input.value = String(Number.isFinite(box[keyName]) ? box[keyName] : 0);
    input.addEventListener("input", () => {
      pushSceneHistory();
      box[keyName] = Number.parseFloat(input.value) || 0;
      ensureSpriteCombatBox(animation, key, box);
      refreshSpriteCombatFlag(owner);
    });
    row.append(fieldLabel, input);
    section.appendChild(row);
  });

  if (withDamage) {
    const damageRow = document.createElement("div");
    damageRow.className = "row";
    const damageLabel = document.createElement("label");
    damageLabel.textContent = "Damage";
    const damageInput = document.createElement("input");
    damageInput.type = "number";
    damageInput.step = "0.1";
    damageInput.min = "0";
    damageInput.value = String(Number.isFinite(box.damage) ? box.damage : 10);
    damageInput.addEventListener("input", () => {
      pushSceneHistory();
      const value = Number.parseFloat(damageInput.value);
      box.damage = Number.isFinite(value) && value >= 0 ? value : 10;
      ensureSpriteCombatBox(animation, key, box);
      refreshSpriteCombatFlag(owner);
    });
    damageRow.append(damageLabel, damageInput);
    section.appendChild(damageRow);
  }
};

const appendSpriteInspectorSection = () => {
  if (!spriteInspectorFields) return;

  const section = document.createElement("div");
  section.className = "sprite-inspector";
  section.innerHTML = "<label>Sprite</label>";

  const entity = world.getEntities().find((item) => item.id === selectedEntityId) ?? null;
  const spriteCharacter = entity?.components.get(ComponentType.SpriteCharacter) ?? null;

  if (spriteCharacter) {
    if (!Array.isArray(spriteCharacter.animations)) {
      spriteCharacter.animations = [];
    }
    if (!spriteCharacter.defaultAnimation) {
      spriteCharacter.defaultAnimation = pickIdleAnimationName(spriteCharacter.animations);
    }
    if (!spriteCharacter.activeAnimation) {
      spriteCharacter.activeAnimation = spriteCharacter.defaultAnimation;
    }
    if (!Number.isFinite(spriteCharacter.activeFrameIndex)) {
      spriteCharacter.activeFrameIndex = 0;
    }

    const activeAnimation =
      spriteCharacter.animations.find((animation) => animation.name === spriteCharacter.activeAnimation) ??
      spriteCharacter.animations[0] ??
      null;
    const activeFrameCount = Math.max(activeAnimation?.frames?.length ?? 0, 0);

    const summary = document.createElement("p");
    summary.className = "sprite-inspector__title";
    summary.textContent = `${spriteCharacter.characterName || entity.name}`;
    section.appendChild(summary);

    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = `${spriteCharacter.animations.length} animation(s) - ${activeFrameCount} frame(s)`;
    section.appendChild(meta);

    const preview = document.createElement("div");
    preview.className = "sprite-preview";
    const previewFrame = activeAnimation?.frames?.[spriteCharacter.activeFrameIndex] ?? activeAnimation?.frames?.[0] ?? null;
    const previewImage = document.createElement("img");
    previewImage.alt = previewFrame ? `${previewFrame.name} preview` : "Sprite preview";
    previewImage.src = previewFrame?.source ?? "";
    const previewLabel = document.createElement("span");
    previewLabel.textContent = `${activeAnimation?.name ?? "No animation"} / frame ${Math.min(
      spriteCharacter.activeFrameIndex + 1,
      Math.max(activeFrameCount, 1)
    )}`;
    preview.append(previewImage, previewLabel);
    section.appendChild(preview);

    if (activeAnimation) {
      const exportButton = document.createElement("button");
      exportButton.type = "button";
      exportButton.className = "btn btn--ghost btn--small";
      exportButton.textContent = "Download Animation JSON";
      exportButton.addEventListener("click", () => {
        const payload = buildSpriteAnimationJson(activeAnimation);
        const fileName = `${activeAnimation.name || "animation"}.json`;
        downloadJsonFile(fileName, payload);
        if (status) {
          status.textContent = `Downloaded ${fileName}.`;
        }
      });
      section.appendChild(exportButton);
    }

    const controlRow = document.createElement("div");
    controlRow.className = "row";
    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.className = "btn btn--ghost btn--small";
    playButton.textContent = spriteCharacter.playing === false ? "Play" : "Pause";
    playButton.addEventListener("click", () => {
      pushSceneHistory();
      spriteCharacter.playing = !spriteCharacter.playing;
      playButton.textContent = spriteCharacter.playing === false ? "Play" : "Pause";
      rebuildInspector();
    });
    const scrubButton = document.createElement("button");
    scrubButton.type = "button";
    scrubButton.className = "btn btn--ghost btn--small";
    scrubButton.textContent = "Reset Frame";
    scrubButton.addEventListener("click", () => {
      pushSceneHistory();
      spriteCharacter.activeFrameIndex = 0;
      spriteCharacter.playing = false;
      rebuildInspector();
    });
    controlRow.append(playButton, scrubButton);
    section.appendChild(controlRow);

    const animationRow = document.createElement("div");
    animationRow.className = "row";
    const animationLabel = document.createElement("label");
    animationLabel.textContent = "Animation";
    const animationSelect = document.createElement("select");
    spriteCharacter.animations.forEach((animation) => {
      const option = document.createElement("option");
      option.value = animation.name;
      option.textContent = `${animation.name} (${animation.frames.length})`;
      if (animation.name === spriteCharacter.activeAnimation) {
        option.selected = true;
      }
      animationSelect.appendChild(option);
    });
    animationSelect.addEventListener("change", () => {
      pushSceneHistory();
      spriteCharacter.activeAnimation = animationSelect.value;
      spriteCharacter.activeFrameIndex = 0;
      spriteCharacter.playing = true;
      rebuildInspector();
    });
    animationRow.append(animationLabel, animationSelect);
    section.appendChild(animationRow);

    const hitReactionField = document.createElement("div");
    hitReactionField.className = "row";
    const hitReactionLabel = document.createElement("label");
    hitReactionLabel.textContent = "Hit Reaction";
    const hitReactionInput = document.createElement("input");
    hitReactionInput.type = "text";
    hitReactionInput.placeholder = "auto";
    hitReactionInput.value = spriteCharacter.hitReactionAnimation ?? "";
    hitReactionInput.addEventListener("input", () => {
      pushSceneHistory();
      spriteCharacter.hitReactionAnimation = normalizeKeyBinding(hitReactionInput.value);
      hitReactionInput.value = spriteCharacter.hitReactionAnimation;
    });
    hitReactionField.append(hitReactionLabel, hitReactionInput);
    section.appendChild(hitReactionField);

    if (!Array.isArray(spriteCharacter.hitReactionPhysicsOffset)) {
      spriteCharacter.hitReactionPhysicsOffset = [0.45, 0.18, 0.45];
    }

    const hitPhysicsSection = document.createElement("div");
    hitPhysicsSection.innerHTML = "<label>Hit Physics</label>";

    const physicsEnabledRow = document.createElement("div");
    physicsEnabledRow.className = "row";
    const physicsEnabledLabel = document.createElement("label");
    physicsEnabledLabel.textContent = "Use Physics";
    const physicsEnabledInput = document.createElement("input");
    physicsEnabledInput.type = "checkbox";
    physicsEnabledInput.checked = spriteCharacter.hitReactionPhysicsEnabled !== false;
    physicsEnabledInput.addEventListener("change", () => {
      pushSceneHistory();
      spriteCharacter.hitReactionPhysicsEnabled = physicsEnabledInput.checked;
    });
    physicsEnabledRow.append(physicsEnabledLabel, physicsEnabledInput);
    hitPhysicsSection.appendChild(physicsEnabledRow);

    const physicsOffset = buildVectorField(
      "Knockback Offset",
      spriteCharacter.hitReactionPhysicsOffset,
      (index, value) => {
        spriteCharacter.hitReactionPhysicsOffset[index] = value;
      }
    );
    hitPhysicsSection.appendChild(physicsOffset.wrapper);

    const fallOverRow = document.createElement("div");
    fallOverRow.className = "row";
    const fallOverLabel = document.createElement("label");
    fallOverLabel.textContent = "Fall Over";
    const fallOverInput = document.createElement("input");
    fallOverInput.type = "checkbox";
    fallOverInput.checked = Boolean(spriteCharacter.hitReactionFallOver);
    fallOverInput.addEventListener("change", () => {
      pushSceneHistory();
      spriteCharacter.hitReactionFallOver = fallOverInput.checked;
    });
    fallOverRow.append(fallOverLabel, fallOverInput);
    hitPhysicsSection.appendChild(fallOverRow);

    const skipPhysicsRow = document.createElement("div");
    skipPhysicsRow.className = "row";
    const skipPhysicsLabel = document.createElement("label");
    skipPhysicsLabel.textContent = "Skip if Hit Anim";
    const skipPhysicsInput = document.createElement("input");
    skipPhysicsInput.type = "checkbox";
    skipPhysicsInput.checked = spriteCharacter.hitReactionSkipPhysicsWhenAnimation !== false;
    skipPhysicsInput.addEventListener("change", () => {
      pushSceneHistory();
      spriteCharacter.hitReactionSkipPhysicsWhenAnimation = skipPhysicsInput.checked;
    });
    skipPhysicsRow.append(skipPhysicsLabel, skipPhysicsInput);
    hitPhysicsSection.appendChild(skipPhysicsRow);

    const hitPhysicsHint = document.createElement("p");
    hitPhysicsHint.className = "muted";
    hitPhysicsHint.textContent =
      "When a hit reaction animation exists, this physics push can be skipped automatically.";
    hitPhysicsSection.appendChild(hitPhysicsHint);

    section.appendChild(hitPhysicsSection);

    if (activeAnimation) {
      const fpsRow = document.createElement("div");
      fpsRow.className = "row";
      const fpsLabel = document.createElement("label");
      fpsLabel.textContent = "FPS";
      const fpsInput = document.createElement("input");
      fpsInput.type = "number";
      fpsInput.min = "1";
      fpsInput.max = "60";
      fpsInput.step = "1";
      fpsInput.value = Number.isFinite(activeAnimation.fps) ? String(activeAnimation.fps) : "12";
      fpsInput.addEventListener("change", () => {
        pushSceneHistory();
        const value = Number.parseInt(fpsInput.value, 10);
        activeAnimation.fps = Number.isFinite(value) && value > 0 ? value : 12;
        fpsInput.value = String(activeAnimation.fps);
      });
      fpsRow.append(fpsLabel, fpsInput);
      section.appendChild(fpsRow);

      const loopRow = document.createElement("div");
      loopRow.className = "row";
      const loopLabel = document.createElement("label");
      loopLabel.textContent = "Loop";
      const loopInput = document.createElement("input");
      loopInput.type = "checkbox";
      loopInput.checked = activeAnimation.loop !== false;
      loopInput.addEventListener("change", () => {
        pushSceneHistory();
        activeAnimation.loop = loopInput.checked;
      });
      loopRow.append(loopLabel, loopInput);
      section.appendChild(loopRow);

      const frameInfo = document.createElement("p");
      frameInfo.className = "muted";
      frameInfo.textContent = `Frame ${Math.min(spriteCharacter.activeFrameIndex + 1, Math.max(activeFrameCount, 1))} / ${Math.max(activeFrameCount, 1)}`;
      section.appendChild(frameInfo);

      const scrubRow = document.createElement("div");
      scrubRow.className = "row";
      const scrubLabel = document.createElement("label");
      scrubLabel.textContent = "Scrub";
      const scrubInput = document.createElement("input");
      scrubInput.type = "range";
      scrubInput.min = "0";
      scrubInput.max = String(Math.max(activeFrameCount - 1, 0));
      scrubInput.step = "1";
      scrubInput.value = String(Math.min(spriteCharacter.activeFrameIndex, Math.max(activeFrameCount - 1, 0)));
      scrubInput.addEventListener("input", () => {
        pushSceneHistory();
        const value = Number.parseInt(scrubInput.value, 10);
        spriteCharacter.activeFrameIndex = Number.isFinite(value) ? value : 0;
        spriteCharacter.playing = false;
        rebuildInspector();
      });
      scrubRow.append(scrubLabel, scrubInput);
      section.appendChild(scrubRow);

      const colliderToggleRow = document.createElement("div");
      colliderToggleRow.className = "row";
      const colliderToggleLabel = document.createElement("label");
      colliderToggleLabel.textContent = "Collider Edit";
      const colliderToggle = document.createElement("input");
      colliderToggle.type = "checkbox";
      colliderToggle.checked = Boolean(spriteCharacter.colliderEditMode);
      colliderToggle.addEventListener("change", () => {
        pushSceneHistory();
        spriteCharacter.colliderEditMode = colliderToggle.checked;
        rebuildInspector();
      });
      colliderToggleRow.append(colliderToggleLabel, colliderToggle);
      section.appendChild(colliderToggleRow);

      if (spriteCharacter.colliderEditMode) {
        const currentFrame = activeAnimation.frames[Math.min(spriteCharacter.activeFrameIndex, activeAnimation.frames.length - 1)] ?? null;
        const collider = currentFrame?.collider ?? createDefaultSpriteCollider();
        const ensureFrameCollider = () => {
          if (!currentFrame) return null;
          if (!Array.isArray(activeAnimation.colliders)) {
            activeAnimation.colliders = [];
          }
          currentFrame.collider = cloneSpriteColliderBox(collider);
          const existingIndex = activeAnimation.colliders.findIndex((entry) => entry.frame === currentFrame.index);
          const nextEntry = {
            frame: currentFrame.index,
            collider: cloneSpriteColliderBox(collider),
          };
          if (existingIndex >= 0) {
            activeAnimation.colliders.splice(existingIndex, 1, nextEntry);
          } else {
            activeAnimation.colliders.push(nextEntry);
          }
          return currentFrame.collider;
        };

        const colliderLabel = document.createElement("p");
        colliderLabel.className = "muted";
        colliderLabel.textContent = `Frame ${currentFrame?.index ?? 0} collider`;
        section.appendChild(colliderLabel);

        const colliderFields = [
          ["x", "X"],
          ["y", "Y"],
          ["width", "Width"],
          ["height", "Height"],
        ];
        colliderFields.forEach(([key, labelText]) => {
          const row = document.createElement("div");
          row.className = "row";
          const label = document.createElement("label");
          label.textContent = labelText;
          const input = document.createElement("input");
          input.type = "number";
          input.step = "0.1";
          input.value = String(Number.isFinite(collider[key]) ? collider[key] : 0);
          input.addEventListener("input", () => {
            pushSceneHistory();
            const value = Number.parseFloat(input.value);
            collider[key] = Number.isFinite(value) ? value : 0;
            ensureFrameCollider();
          });
          row.append(label, input);
          section.appendChild(row);
        });

        const depthRow = document.createElement("div");
        depthRow.className = "row";
        const depthLabel = document.createElement("label");
        depthLabel.textContent = "Depth";
        const depthInput = document.createElement("input");
        depthInput.type = "number";
        depthInput.step = "0.1";
        depthInput.value = String(Number.isFinite(collider.depth) ? collider.depth : 0.1);
        depthInput.addEventListener("input", () => {
          pushSceneHistory();
          const value = Number.parseFloat(depthInput.value);
          collider.depth = Number.isFinite(value) ? value : 0.1;
          ensureFrameCollider();
        });
        depthRow.append(depthLabel, depthInput);
        section.appendChild(depthRow);
      }

      const combatSection = document.createElement("div");
      combatSection.innerHTML = "<label>Combat Boxes</label>";
      const combatHint = document.createElement("p");
      combatHint.className = "muted";
      combatHint.textContent = "This hit box activates only for this animation.";
      combatSection.appendChild(combatHint);
      appendCombatBoxEditor(
        combatSection,
        activeAnimation,
        "hitBox",
        "Hit Box",
        spriteCharacter,
        { withDamage: true }
      );
      section.appendChild(combatSection);
    }

    const keyLegend = document.createElement("p");
    keyLegend.className = "muted";
    keyLegend.textContent = "Runtime key triggers:";
    section.appendChild(keyLegend);

    spriteCharacter.animations.forEach((animation) => {
      const row = document.createElement("div");
      row.className = "row";
      const label = document.createElement("label");
      label.textContent = animation.name;
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "key";
      input.value = normalizeKeyBinding(animation.dedicatedKey);
      input.addEventListener("input", () => {
        pushSceneHistory();
        animation.dedicatedKey = normalizeKeyBinding(input.value);
        input.value = animation.dedicatedKey;
      });
      row.append(label, input);
      section.appendChild(row);
    });
    spriteInspectorFields.appendChild(section);
    return;
  }

  const { character, animation } = getSelectedSpriteAnimationData();
  if (!character || !animation) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Select a sprite character in the browser to inspect its animations.";
    section.appendChild(empty);
    spriteInspectorFields.appendChild(section);
    return;
  }

  const summary = document.createElement("p");
  summary.className = "sprite-inspector__title";
  summary.textContent = `${character.name} / ${animation.name}`;
  section.appendChild(summary);

  const addToSceneButton = document.createElement("button");
  addToSceneButton.className = "btn btn--ghost btn--small";
  addToSceneButton.textContent = "Add Character To Scene";
  addToSceneButton.addEventListener("click", () => {
    addSpriteCharacterToScene(character);
  });
  section.appendChild(addToSceneButton);

  const frameCount = Array.isArray(animation.frames) ? animation.frames.length : 0;
  const firstFrame = animation.frames[0] ?? null;
  const preview = document.createElement("div");
  preview.className = "sprite-preview";
  const previewImage = document.createElement("img");
  previewImage.src = firstFrame?.source ?? "";
  previewImage.alt = firstFrame ? firstFrame.name : "Sprite preview";
  const previewLabel = document.createElement("span");
  previewLabel.textContent = `${frameCount} frame(s)`;
  preview.append(previewImage, previewLabel);
  section.appendChild(preview);

  const clipCount = document.createElement("p");
  clipCount.className = "muted";
  clipCount.textContent = `${frameCount} frame(s), fps ${animation.fps}, loop ${animation.loop ? "on" : "off"}`;
  section.appendChild(clipCount);

  const keyBindingField = document.createElement("div");
  keyBindingField.className = "row";
  const keyBindingLabel = document.createElement("label");
  keyBindingLabel.textContent = "Dedicated Key";
  const keyBindingInput = document.createElement("input");
  keyBindingInput.type = "text";
  keyBindingInput.value = animation.dedicatedKey ?? "";
  keyBindingInput.placeholder = "e.g. i";
  keyBindingInput.addEventListener("input", () => {
    animation.dedicatedKey = normalizeKeyBinding(keyBindingInput.value);
    keyBindingInput.value = animation.dedicatedKey;
  });
  keyBindingField.append(keyBindingLabel, keyBindingInput);
  section.appendChild(keyBindingField);

  const hitReactionField = document.createElement("div");
  hitReactionField.className = "row";
  const hitReactionLabel = document.createElement("label");
  hitReactionLabel.textContent = "Hit Reaction";
  const hitReactionInput = document.createElement("input");
  hitReactionInput.type = "text";
  hitReactionInput.placeholder = "auto";
  hitReactionInput.value = character.hitReactionAnimation ?? "";
  hitReactionInput.addEventListener("input", () => {
    pushSceneHistory();
    character.hitReactionAnimation = normalizeKeyBinding(hitReactionInput.value);
    hitReactionInput.value = character.hitReactionAnimation;
  });
  hitReactionField.append(hitReactionLabel, hitReactionInput);
  section.appendChild(hitReactionField);

  if (!Array.isArray(character.hitReactionPhysicsOffset)) {
    character.hitReactionPhysicsOffset = [0.45, 0.18, 0.45];
  }

  const hitPhysicsSection = document.createElement("div");
  hitPhysicsSection.innerHTML = "<label>Hit Physics</label>";

  const physicsEnabledRow = document.createElement("div");
  physicsEnabledRow.className = "row";
  const physicsEnabledLabel = document.createElement("label");
  physicsEnabledLabel.textContent = "Use Physics";
  const physicsEnabledInput = document.createElement("input");
  physicsEnabledInput.type = "checkbox";
  physicsEnabledInput.checked = character.hitReactionPhysicsEnabled !== false;
  physicsEnabledInput.addEventListener("change", () => {
    pushSceneHistory();
    character.hitReactionPhysicsEnabled = physicsEnabledInput.checked;
  });
  physicsEnabledRow.append(physicsEnabledLabel, physicsEnabledInput);
  hitPhysicsSection.appendChild(physicsEnabledRow);

  const browserPhysicsOffset = buildVectorField(
    "Knockback Offset",
    character.hitReactionPhysicsOffset,
    (index, value) => {
      character.hitReactionPhysicsOffset[index] = value;
    }
  );
  hitPhysicsSection.appendChild(browserPhysicsOffset.wrapper);

  const browserFallOverRow = document.createElement("div");
  browserFallOverRow.className = "row";
  const browserFallOverLabel = document.createElement("label");
  browserFallOverLabel.textContent = "Fall Over";
  const browserFallOverInput = document.createElement("input");
  browserFallOverInput.type = "checkbox";
  browserFallOverInput.checked = Boolean(character.hitReactionFallOver);
  browserFallOverInput.addEventListener("change", () => {
    pushSceneHistory();
    character.hitReactionFallOver = browserFallOverInput.checked;
  });
  browserFallOverRow.append(browserFallOverLabel, browserFallOverInput);
  hitPhysicsSection.appendChild(browserFallOverRow);

  const browserSkipPhysicsRow = document.createElement("div");
  browserSkipPhysicsRow.className = "row";
  const browserSkipPhysicsLabel = document.createElement("label");
  browserSkipPhysicsLabel.textContent = "Skip if Hit Anim";
  const browserSkipPhysicsInput = document.createElement("input");
  browserSkipPhysicsInput.type = "checkbox";
  browserSkipPhysicsInput.checked = character.hitReactionSkipPhysicsWhenAnimation !== false;
  browserSkipPhysicsInput.addEventListener("change", () => {
    pushSceneHistory();
    character.hitReactionSkipPhysicsWhenAnimation = browserSkipPhysicsInput.checked;
  });
  browserSkipPhysicsRow.append(browserSkipPhysicsLabel, browserSkipPhysicsInput);
  hitPhysicsSection.appendChild(browserSkipPhysicsRow);

  const browserHitPhysicsHint = document.createElement("p");
  browserHitPhysicsHint.className = "muted";
  browserHitPhysicsHint.textContent =
    "Knockback and fall-over apply on hit unless a hit animation is playing and skip is enabled.";
  hitPhysicsSection.appendChild(browserHitPhysicsHint);

  section.appendChild(hitPhysicsSection);

  const combatSection = document.createElement("div");
  combatSection.innerHTML = "<label>Combat Boxes</label>";
  const combatHint = document.createElement("p");
  combatHint.className = "muted";
  combatHint.textContent = "This hit box activates only for this animation.";
  combatSection.appendChild(combatHint);
  appendCombatBoxEditor(combatSection, animation, "hitBox", "Hit Box", character, {
    withDamage: true,
  });
  section.appendChild(combatSection);

  const ensureFrameCollider = (frame) => {
    if (!frame) return null;
    if (!Array.isArray(animation.colliders)) {
      animation.colliders = [];
    }
    frame.collider = cloneSpriteColliderBox(frame.collider);
    const existingIndex = animation.colliders.findIndex((entry) => entry.frame === frame.index);
    const nextEntry = {
      frame: frame.index,
      collider: cloneSpriteColliderBox(frame.collider),
    };
    if (existingIndex >= 0) {
      animation.colliders.splice(existingIndex, 1, nextEntry);
    } else {
      animation.colliders.push(nextEntry);
    }
    return frame.collider;
  };

  const currentFrame = animation.frames[0] ?? null;
  if (currentFrame) {
    const frameLabel = document.createElement("p");
    frameLabel.className = "muted";
    frameLabel.textContent = "Frame 1 collider";
    section.appendChild(frameLabel);

    const collider = ensureFrameCollider(currentFrame);
    ["x", "y", "width", "height", "depth"].forEach((field) => {
      const row = document.createElement("div");
      row.className = "row";
      const label = document.createElement("label");
      label.textContent = field.toUpperCase();
      const input = document.createElement("input");
      input.type = "number";
      input.step = "0.1";
      input.value = String(Number.isFinite(collider[field]) ? collider[field] : 0);
      input.addEventListener("input", () => {
        pushSceneHistory();
        collider[field] = Number.parseFloat(input.value) || 0;
        ensureFrameCollider(currentFrame);
      });
      row.append(label, input);
      section.appendChild(row);
    });
  }
  spriteInspectorFields.appendChild(section);
};

const rebuildSpriteInspector = () => {
  if (!spriteInspectorFields) return;
  spriteInspectorFields.innerHTML = "";
  appendSpriteInspectorSection();
};

const renderSpriteBrowser = () => {
  if (!spriteBrowser) return;
  spriteBrowser.innerHTML = "";
  ensureSpriteSelection();

  if (!spriteCharacters.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No sprite folders imported yet.";
    spriteBrowser.appendChild(empty);
    return;
  }

  spriteCharacters.forEach((character) => {
    const isCharacterSelected = character.name === selectedSpriteCharacterName;
    const card = document.createElement("div");
    card.className = "sprite-character";

    const headerRow = document.createElement("div");
    headerRow.className = "sprite-character__row";
    const nameButton = document.createElement("button");
    nameButton.type = "button";
    nameButton.className = "sprite-character__name";
    if (isCharacterSelected) {
      nameButton.classList.add("active");
    }
    nameButton.textContent = character.name;
    nameButton.addEventListener("click", () => {
      selectedSpriteCharacterName = character.name;
      ensureSpriteSelection();
      activateEditTab("sprite");
      renderSpriteBrowser();
      rebuildInspector();
      status.textContent = `Selected sprite character: ${character.name}.`;
    });
    headerRow.appendChild(nameButton);

    const addToSceneButton = document.createElement("button");
    addToSceneButton.type = "button";
    addToSceneButton.className = "sprite-add";
    addToSceneButton.textContent = "Add";
    addToSceneButton.addEventListener("click", (event) => {
      event.stopPropagation();
      addSpriteCharacterToScene(character);
    });
    headerRow.appendChild(addToSceneButton);
    card.appendChild(headerRow);

    const meta = document.createElement("p");
    meta.className = "sprite-character__meta";
    const frameTotal = character.animations.reduce(
      (count, animation) => count + (animation.frames?.length ?? 0),
      0
    );
    meta.textContent = `${character.animations.length} animation(s), ${frameTotal} frame(s)`;
    card.appendChild(meta);

    if (isCharacterSelected) {
      const animationList = document.createElement("div");
      animationList.className = "sprite-animation-list";
      character.animations.forEach((animation) => {
        const animationButton = document.createElement("button");
        animationButton.type = "button";
        animationButton.className = "sprite-animation";
        if (animation.name === selectedSpriteAnimationName) {
          animationButton.classList.add("active");
        }
        animationButton.textContent = `${animation.name} (${animation.frames.length})`;
        animationButton.addEventListener("click", (event) => {
          event.stopPropagation();
          selectedSpriteCharacterName = character.name;
          selectedSpriteAnimationName = animation.name;
          activateEditTab("sprite");
          renderSpriteBrowser();
          rebuildInspector();
          status.textContent = `Editing ${character.name}/${animation.name} boxes.`;
        });
        animationList.appendChild(animationButton);
      });
      card.appendChild(animationList);

      const selectedAnimation =
        character.animations.find((animation) => animation.name === selectedSpriteAnimationName) ??
        character.animations[0] ??
        null;
      if (selectedAnimation) {
        const preview = document.createElement("div");
        preview.className = "sprite-preview";
        const previewImage = document.createElement("img");
        previewImage.alt = `${selectedAnimation.name} preview`;
        previewImage.src = selectedAnimation.frames[0]?.source ?? "";
        const previewLabel = document.createElement("span");
        previewLabel.textContent = `${selectedAnimation.name} - ${selectedAnimation.frames.length} frame(s)`;
        preview.append(previewImage, previewLabel);
        card.appendChild(preview);

        const exportButton = document.createElement("button");
        exportButton.type = "button";
        exportButton.className = "btn btn--ghost btn--small";
        exportButton.textContent = "Download JSON";
        exportButton.addEventListener("click", (event) => {
          event.stopPropagation();
          const payload = buildSpriteAnimationJson(selectedAnimation);
          const fileName = `${selectedAnimation.name || "animation"}.json`;
          downloadJsonFile(fileName, payload);
          if (status) {
            status.textContent = `Downloaded ${fileName}.`;
          }
        });
        card.appendChild(exportButton);
      }
    }

    spriteBrowser.appendChild(card);
  });
};

const rebuildInspector = () => {
  if (!inspectorFields) return;
  inspectorFields.innerHTML = "";
  if (colliderFields) colliderFields.innerHTML = "";
  if (playerFields) playerFields.innerHTML = "";
  const entity = world.getEntities().find((item) => item.id === selectedEntityId);
  if (!entity) {
    setPanelMessage(inspectorFields, "Select an entity to edit its components.");
    setPanelMessage(colliderFields, "Select an entity with a collider or hit box.");
    setPanelMessage(playerFields, "Select an entity with player or health components.");
    renderTriggerPresets();
    rebuildSpriteInspector();
    return;
  }

  const entitySection = document.createElement("div");
  entitySection.innerHTML = "<label>Entity</label>";
  const nameRow = document.createElement("div");
  nameRow.className = "row";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = entity.name;
  nameInput.addEventListener("input", () => {
    pushSceneHistory();
    entity.name = nameInput.value || "Entity";
    rebuildHierarchy();
  });
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn--ghost btn--small";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    deleteEntity(entity.id);
  });
  nameRow.append(nameInput, deleteBtn);
  entitySection.appendChild(nameRow);
  inspectorFields.appendChild(entitySection);

  const addSection = document.createElement("div");
  addSection.innerHTML = "<label>Add Components</label>";
  const addRow = document.createElement("div");
  addRow.className = "row";
  let hasAddButtons = false;
  if (!entity.components.has(ComponentType.Collider)) {
    const addColliderBtn = document.createElement("button");
    addColliderBtn.className = "btn btn--ghost btn--small";
    addColliderBtn.textContent = "Add Collision Box";
    addColliderBtn.addEventListener("click", () => addCollisionBoxToEntity(entity));
    addRow.appendChild(addColliderBtn);
    const addTriggerBtn = document.createElement("button");
    addTriggerBtn.className = "btn btn--ghost btn--small";
    addTriggerBtn.textContent = "Add Trigger Volume";
    addTriggerBtn.addEventListener("click", () => {
      pushSceneHistory();
      const transform = entity.components.get(ComponentType.Transform);
      const scale = Array.isArray(transform?.scale) && transform.scale.length === 3
        ? transform.scale
        : [1, 1, 1];
      world.addComponent(
        entity,
        createCollider({ body: "static", isTrigger: true, size: scale })
      );
      status.textContent = `Added trigger volume to ${entity.name}.`;
      rebuildInspector();
    });
    addRow.appendChild(addTriggerBtn);
    hasAddButtons = true;
  }
  if (!entity.components.has(ComponentType.Health)) {
    const addHealthBtn = document.createElement("button");
    addHealthBtn.className = "btn btn--ghost btn--small";
    addHealthBtn.textContent = "Add Health";
    addHealthBtn.addEventListener("click", () => addHealthToEntity(entity));
    addRow.appendChild(addHealthBtn);
    hasAddButtons = true;
  }
  if (!entity.components.has(ComponentType.HitBox)) {
    const addHitBtn = document.createElement("button");
    addHitBtn.className = "btn btn--ghost btn--small";
    addHitBtn.textContent = "Add Hit Box";
    addHitBtn.addEventListener("click", () => addHitBoxToEntity(entity));
    addRow.appendChild(addHitBtn);
    hasAddButtons = true;
  }
  if (!entity.components.has(ComponentType.Player)) {
    const makePlayerBtn = document.createElement("button");
    makePlayerBtn.className = "btn btn--ghost btn--small";
    makePlayerBtn.textContent = "Make Playable Player";
    makePlayerBtn.addEventListener("click", () => makeEntityPlayablePlayer(entity));
    addRow.appendChild(makePlayerBtn);
    hasAddButtons = true;
  }
  if (hasAddButtons) {
    addSection.appendChild(addRow);
    inspectorFields.appendChild(addSection);
  }

  const transform = entity.components.get(ComponentType.Transform);
  if (transform) {
    const section = document.createElement("div");
    section.innerHTML = "<label>Transform</label>";
    const position = buildVectorField("Position", transform.position, (index, value) => {
      transform.position[index] = value;
    });
    const rotation = buildVectorField("Rotation", transform.rotation, (index, value) => {
      transform.rotation[index] = value;
    });
    const scale = buildVectorField("Scale", transform.scale, (index, value) => {
      transform.scale[index] = value;
    });
    section.append(position.wrapper, rotation.wrapper, scale.wrapper);
    inspectorFields.appendChild(section);
  }

  const collider = entity.components.get(ComponentType.Collider);
  if (collider) {
    const section = document.createElement("div");
    const header = document.createElement("div");
    header.className = "row";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    const label = document.createElement("label");
    label.textContent = "Collider";
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--ghost btn--small";
    deleteBtn.textContent = "Delete Collision Box";
    deleteBtn.addEventListener("click", () =>
      removeComponentFromEntity(
        entity,
        ComponentType.Collider,
        `Removed collision box from ${entity.name}.`
      )
    );
    header.append(label, deleteBtn);
    if (!Array.isArray(collider.offset)) {
      collider.offset = [0, 0, 0];
    }
    const typeRow = document.createElement("div");
    typeRow.className = "row";
    const shapeLabel = document.createElement("label");
    shapeLabel.textContent = "Shape";
    const shapeSelect = document.createElement("select");
    ["box", "sphere"].forEach((shape) => {
      const option = document.createElement("option");
      option.value = shape;
      option.textContent = shape.charAt(0).toUpperCase() + shape.slice(1);
      if (collider.shape === shape) {
        option.selected = true;
      }
      shapeSelect.appendChild(option);
    });
    shapeSelect.addEventListener("change", () => {
      pushSceneHistory();
      collider.shape = shapeSelect.value;
    });
    typeRow.append(shapeLabel, shapeSelect);

    const bodyRow = document.createElement("div");
    bodyRow.className = "row";
    const bodyLabel = document.createElement("label");
    bodyLabel.textContent = "Body";
    const bodySelect = document.createElement("select");
    ["static", "dynamic", "kinematic"].forEach((bodyType) => {
      const option = document.createElement("option");
      option.value = bodyType;
      option.textContent = bodyType;
      if (collider.body === bodyType) {
        option.selected = true;
      }
      bodySelect.appendChild(option);
    });
    bodySelect.addEventListener("change", () => {
      pushSceneHistory();
      collider.body = bodySelect.value;
    });
    bodyRow.append(bodyLabel, bodySelect);

    const triggerToggle = document.createElement("label");
    triggerToggle.style.display = "flex";
    triggerToggle.style.alignItems = "center";
    triggerToggle.style.gap = "8px";
    triggerToggle.style.textTransform = "none";
    triggerToggle.style.letterSpacing = "0.02em";
    const triggerInput = document.createElement("input");
    triggerInput.type = "checkbox";
    triggerInput.checked = Boolean(collider.isTrigger);
    triggerInput.addEventListener("change", () => {
      pushSceneHistory();
      collider.isTrigger = triggerInput.checked;
      rebuildInspector();
    });
    const triggerText = document.createElement("span");
    triggerText.textContent = "Trigger only";
    triggerToggle.append(triggerInput, triggerText);

    const matchScaleBtn = document.createElement("button");
    matchScaleBtn.className = "btn btn--ghost btn--small";
    matchScaleBtn.textContent = "Match Transform Scale";
    matchScaleBtn.addEventListener("click", () => {
      pushSceneHistory();
      const transform = entity.components.get(ComponentType.Transform);
      if (!transform || !Array.isArray(transform.scale)) return;
      collider.size = [...transform.scale];
      rebuildInspector();
    });

    const size = buildVectorField("Size", collider.size, (index, value) => {
      collider.size[index] = value;
    });
    const offset = buildVectorField("Offset", collider.offset, (index, value) => {
      collider.offset[index] = value;
    });
    section.append(header, typeRow, bodyRow, triggerToggle, matchScaleBtn, size.wrapper, offset.wrapper);
    inspectorFields.appendChild(section);
  }

  const hitBox = entity.components.get(ComponentType.HitBox);
  if (hitBox) {
    const section = document.createElement("div");
    const header = document.createElement("div");
    header.className = "row";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    const label = document.createElement("label");
    label.textContent = "Hit Box";
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--ghost btn--small";
    deleteBtn.textContent = "Delete Hit Box";
    deleteBtn.addEventListener("click", () =>
      removeComponentFromEntity(
        entity,
        ComponentType.HitBox,
        `Removed hit box from ${entity.name}.`
      )
    );
    header.append(label, deleteBtn);
    if (!Array.isArray(hitBox.offset)) {
      hitBox.offset = [0, 0, 0];
    }
    if (hitBox.sourceAnimation) {
      const info = document.createElement("p");
      info.className = "muted";
      info.textContent = `Driven by animation: ${hitBox.sourceAnimation}${
        hitBox.enabled === false ? " (inactive right now)" : ""
      }`;
      section.appendChild(info);
    }
    const size = buildVectorField("Size", hitBox.size, (index, value) => {
      hitBox.size[index] = value;
    });
    const offset = buildVectorField("Offset", hitBox.offset, (index, value) => {
      hitBox.offset[index] = value;
    });
    const damageRow = document.createElement("div");
    damageRow.className = "row";
    const damageLabel = document.createElement("label");
    damageLabel.textContent = "Damage";
    const damageInput = document.createElement("input");
    damageInput.type = "number";
    damageInput.step = "0.1";
    damageInput.min = "0";
    damageInput.value = String(Number.isFinite(hitBox.damage) ? hitBox.damage : 10);
    damageInput.addEventListener("change", () => {
      pushSceneHistory();
      const value = Number.parseFloat(damageInput.value);
      hitBox.damage = Number.isFinite(value) && value >= 0 ? value : 10;
      damageInput.value = String(hitBox.damage);
    });
    damageRow.append(damageLabel, damageInput);
    section.append(header, damageRow, size.wrapper, offset.wrapper);
    inspectorFields.appendChild(section);
  }

  const camera = entity.components.get(ComponentType.Camera);
  if (camera) {
    const section = document.createElement("div");
    section.innerHTML = "<label>Camera</label>";
    const fovField = buildVectorField(
      "Fov / Near / Far",
      [camera.fov, camera.near, camera.far],
      (index, value) => {
        if (index === 0) camera.fov = value;
        if (index === 1) camera.near = value;
        if (index === 2) camera.far = value;
      }
    );
    if (!Array.isArray(camera.followOffset)) {
      camera.followOffset = [0, 2, 5];
    }
    const targetRow = document.createElement("div");
    targetRow.className = "row";
    const targetLabel = document.createElement("label");
    targetLabel.textContent = "Lock To";
    const targetSelect = document.createElement("select");
    const freeOption = document.createElement("option");
    freeOption.value = "";
    freeOption.textContent = "Free Camera";
    targetSelect.appendChild(freeOption);
    const currentTarget = resolveCameraTargetEntity(camera, entity);

    const targetEntities = world
      .getEntities()
      .filter(
        (item) => item.id !== entity.id && item.components.has(ComponentType.Transform)
      );

    targetEntities.forEach((target) => {
      const option = document.createElement("option");
      option.value = String(target.id);
      option.textContent = target.name;
      if (currentTarget && currentTarget.id === target.id) {
        option.selected = true;
      }
      targetSelect.appendChild(option);
    });

    if (!currentTarget) {
      freeOption.selected = true;
    }

    targetSelect.addEventListener("change", () => {
      pushSceneHistory();
      const selectedValue = targetSelect.value;
      const target = selectedValue ? getEntityById(Number.parseInt(selectedValue, 10)) : null;
      const cameraTransform = entity.components.get(ComponentType.Transform);
      const targetTransform = target?.components.get(ComponentType.Transform) ?? null;
      camera.lockTargetId = target?.id ?? null;
      camera.lockToPlayer = Boolean(target);
      if (target) {
        if (cameraTransform && targetTransform) {
          camera.followOffset = [
            cameraTransform.position[0] - targetTransform.position[0],
            cameraTransform.position[1] - targetTransform.position[1],
            cameraTransform.position[2] - targetTransform.position[2],
          ];
        }
        syncCameraEntityToTarget(entity);
        if (status) {
          status.textContent = `Camera locked to ${target.name}.`;
        }
      } else if (status) {
        status.textContent = "Camera set to free mode.";
      }
      rebuildInspector();
    });
    targetRow.append(targetLabel, targetSelect);

    const offsetField = buildVectorField(
      "Follow Offset",
      camera.followOffset,
      (index, value) => {
        camera.followOffset[index] = value;
      }
    );

    section.append(fovField.wrapper, targetRow, offsetField.wrapper);
    inspectorFields.appendChild(section);
  }

  const playerConfig = entity.components.get(ComponentType.Player);
  if (playerConfig) {
    const section = document.createElement("div");
    section.innerHTML = "<label>Player</label>";

    const makePlayerButton = document.createElement("button");
    makePlayerButton.className = "btn btn--ghost btn--small";
    makePlayerButton.textContent = "Set As Playable Player";
    makePlayerButton.addEventListener("click", () => makeEntityPlayablePlayer(entity));
    section.appendChild(makePlayerButton);

    const removePlayerButton = document.createElement("button");
    removePlayerButton.className = "btn btn--ghost btn--small";
    removePlayerButton.textContent = "Remove as Playable Character";
    removePlayerButton.addEventListener("click", () => removeEntityPlayablePlayer(entity));
    section.appendChild(removePlayerButton);

    if (playerConfig.enabled === false) {
      const inactive = document.createElement("p");
      inactive.className = "muted";
      inactive.textContent = "This entity is not currently set as the playable character.";
      section.appendChild(inactive);
    }

    const speedRow = document.createElement("div");
    speedRow.className = "row";
    const speedLabel = document.createElement("label");
    speedLabel.textContent = "Move Speed";
    const speedInput = document.createElement("input");
    speedInput.type = "number";
    speedInput.step = "0.1";
    speedInput.min = "0";
    speedInput.value = Number.isFinite(playerConfig.moveSpeed)
      ? playerConfig.moveSpeed.toFixed(2)
      : "3.40";
    speedInput.addEventListener("change", () => {
      const value = Number.parseFloat(speedInput.value);
      playerConfig.moveSpeed = Number.isFinite(value) ? Math.max(value, 0) : 3.4;
      speedInput.value = playerConfig.moveSpeed.toFixed(2);
    });
    speedRow.append(speedLabel, speedInput);
    section.appendChild(speedRow);

    const jumpRow = document.createElement("div");
    jumpRow.className = "row";
    const jumpLabel = document.createElement("label");
    jumpLabel.textContent = "Jump Speed";
    const jumpInput = document.createElement("input");
    jumpInput.type = "number";
    jumpInput.step = "0.1";
    jumpInput.min = "0";
    jumpInput.value = Number.isFinite(playerConfig.jumpSpeed)
      ? playerConfig.jumpSpeed.toFixed(2)
      : "5.50";
    jumpInput.addEventListener("change", () => {
      const value = Number.parseFloat(jumpInput.value);
      playerConfig.jumpSpeed = Number.isFinite(value) ? Math.max(value, 0) : 5.5;
      jumpInput.value = playerConfig.jumpSpeed.toFixed(2);
    });
    jumpRow.append(jumpLabel, jumpInput);
    section.appendChild(jumpRow);

    inspectorFields.appendChild(section);
  }

  const health = entity.components.get(ComponentType.Health);
  if (health) {
    const section = document.createElement("div");
    section.innerHTML = "<label>Health</label>";

    const summary = document.createElement("p");
    summary.className = "muted";
    const meter = document.createElement("div");
    meter.className = "health-meter";
    const meterFill = document.createElement("div");
    meterFill.className = "health-meter__fill";
    meter.appendChild(meterFill);

    const syncHealthView = () => {
      const max = Number.isFinite(health.maxHealth) && health.maxHealth > 0 ? health.maxHealth : 100;
      const current = Number.isFinite(health.currentHealth)
        ? Math.min(Math.max(health.currentHealth, 0), max)
        : max;
      summary.textContent = `${Math.round(current)} / ${Math.round(max)} HP`;
      meterFill.style.width = `${Math.max(Math.min((current / max) * 100, 100), 0)}%`;
    };

    const currentRow = document.createElement("div");
    currentRow.className = "row";
    const currentLabel = document.createElement("label");
    currentLabel.textContent = "Current";
    const currentInput = document.createElement("input");
    currentInput.type = "number";
    currentInput.step = "1";
    currentInput.min = "0";
    currentInput.value = String(Number.isFinite(health.currentHealth) ? health.currentHealth : 0);
    currentInput.addEventListener("change", () => {
      pushSceneHistory();
      const value = Number.parseFloat(currentInput.value);
      const max = Number.isFinite(health.maxHealth) && health.maxHealth > 0 ? health.maxHealth : 100;
      health.currentHealth = Number.isFinite(value) ? Math.min(Math.max(value, 0), max) : max;
      syncHealthView();
      currentInput.value = String(health.currentHealth);
    });
    currentRow.append(currentLabel, currentInput);

    const maxRow = document.createElement("div");
    maxRow.className = "row";
    const maxLabel = document.createElement("label");
    maxLabel.textContent = "Max";
    const maxInput = document.createElement("input");
    maxInput.type = "number";
    maxInput.step = "1";
    maxInput.min = "1";
    maxInput.value = String(Number.isFinite(health.maxHealth) ? health.maxHealth : 100);
    maxInput.addEventListener("change", () => {
      pushSceneHistory();
      const value = Number.parseFloat(maxInput.value);
      health.maxHealth = Number.isFinite(value) && value > 0 ? value : 100;
      if (!Number.isFinite(health.currentHealth) || health.currentHealth > health.maxHealth) {
        health.currentHealth = health.maxHealth;
      }
      syncHealthView();
      maxInput.value = String(health.maxHealth);
      currentInput.value = String(health.currentHealth);
    });
    maxRow.append(maxLabel, maxInput);

    const regenRow = document.createElement("div");
    regenRow.className = "row";
    const regenLabel = document.createElement("label");
    regenLabel.textContent = "Regen";
    const regenInput = document.createElement("input");
    regenInput.type = "number";
    regenInput.step = "0.1";
    regenInput.value = String(Number.isFinite(health.regenRate) ? health.regenRate : 0);
    regenInput.addEventListener("change", () => {
      pushSceneHistory();
      const value = Number.parseFloat(regenInput.value);
      health.regenRate = Number.isFinite(value) ? value : 0;
      regenInput.value = String(health.regenRate);
    });
    regenRow.append(regenLabel, regenInput);

    const invulnerableRow = document.createElement("div");
    invulnerableRow.className = "row";
    const invulnerableLabel = document.createElement("label");
    invulnerableLabel.textContent = "Invulnerable";
    const invulnerableInput = document.createElement("input");
    invulnerableInput.type = "checkbox";
    invulnerableInput.checked = Boolean(health.invulnerable);
    invulnerableInput.addEventListener("change", () => {
      pushSceneHistory();
      health.invulnerable = invulnerableInput.checked;
    });
    invulnerableRow.append(invulnerableLabel, invulnerableInput);

    syncHealthView();
    section.append(summary, meter, currentRow, maxRow, regenRow, invulnerableRow);
    inspectorFields.appendChild(section);
  }

  routeInspectorSections();
  renderTriggerPresets();
  rebuildSpriteInspector();
};

const ensureProjectState = () => {
  if (!projectState) {
    projectState = createProjectFromScene(serializeScene(world));
    activeSceneId = projectState.activeSceneId;
    activeLevelId = projectState.runtime.startingLevelId;
  }
  projectState = normalizeProject(projectState);
  activeSceneId = projectState.activeSceneId ?? projectState.scenes[0]?.id ?? activeSceneId;
  activeLevelId = projectState.runtime.startingLevelId ?? activeLevelId;
  return projectState;
};

const getActiveProjectScene = () => {
  const normalized = ensureProjectState();
  return (
    normalized.scenes.find((scene) => scene.id === (activeSceneId ?? normalized.activeSceneId)) ??
    normalized.scenes[0] ??
    null
  );
};

const getActiveProjectLevel = () => {
  const normalized = ensureProjectState();
  return (
    normalized.levels.find((level) => level.id === (activeLevelId ?? normalized.runtime.startingLevelId)) ??
    normalized.levels.find((level) => level.starting) ??
    normalized.levels[0] ??
    null
  );
};

const syncCurrentSceneIntoProject = () => {
  const normalized = ensureProjectState();
  const sceneId = activeSceneId ?? normalized.activeSceneId ?? normalized.scenes[0]?.id ?? null;
  if (!sceneId) return normalized;

  projectState = replaceProjectScene(normalized, sceneId, serializeScene(world));
  projectState.activeSceneId = sceneId;
  activeSceneId = sceneId;
  activeLevelId = projectState.runtime.startingLevelId ?? activeLevelId;
  return projectState;
};

const saveDraftProject = ({ announce = true } = {}) => {
  const draft = normalizeProject(syncCurrentSceneIntoProject());
  projectState = draft;
  activeSceneId = draft.activeSceneId;
  activeLevelId = draft.runtime.startingLevelId;
  localStorage.setItem(DRAFT_PROJECT_STORAGE_KEY, JSON.stringify(draft));
  localStorage.setItem(PROJECT_STORAGE_KEYS.legacyScene, JSON.stringify(serializeScene(world)));
  if (announce && status) {
    status.textContent = "Draft project saved.";
  }
  return draft;
};

const loadProjectIntoEditor = (project) => {
  const normalized = normalizeProject(project);
  projectState = normalized;
  activeSceneId = normalized.activeSceneId ?? normalized.scenes[0]?.id ?? null;
  activeLevelId = normalized.runtime.startingLevelId ?? normalized.levels[0]?.id ?? null;
  const scene = getActiveScene(normalized);
  if (scene?.sceneData) {
    setWorld(deserializeScene(scene.sceneData), { resetHistory: true });
  }
  rebuildProjectPanels();
  updateProjectStatus();
  return normalized;
};

const updateProjectStatus = () => {
  if (!status) return;
  const scene = getActiveProjectScene();
  const level = getActiveProjectLevel();
  status.textContent = `${scene?.name ?? "Scene"} / ${level?.name ?? "Level"}`;
};

const reorderProjectItem = (items, itemId, direction) => {
  const currentIndex = items.findIndex((item) => item.id === itemId);
  const targetIndex = currentIndex + direction;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next.map((item, index) => ({ ...item, order: index }));
};

const syncSceneRecord = (sceneId, patch = {}) => {
  const normalized = ensureProjectState();
  const scenes = normalized.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    return {
      ...scene,
      ...patch,
      sceneData:
        patch.sceneData ??
        (sceneId === activeSceneId ? serializeScene(world) : scene.sceneData),
      spawnPoint: patch.spawnPoint ?? scene.spawnPoint,
    };
  });
  projectState = normalizeProject({
    ...normalized,
    scenes,
    activeSceneId: activeSceneId ?? normalized.activeSceneId,
  });
  activeSceneId = projectState.activeSceneId;
  activeLevelId = projectState.runtime.startingLevelId ?? activeLevelId;
  return projectState;
};

const syncLevelRecord = (levelId, patch = {}) => {
  const normalized = ensureProjectState();
  const levels = normalized.levels.map((level) =>
    level.id === levelId
      ? {
          ...level,
          ...patch,
          spawnPoint: patch.spawnPoint ?? level.spawnPoint,
        }
      : level
  );
  projectState = normalizeProject({
    ...normalized,
    levels,
  });
  activeSceneId = projectState.activeSceneId;
  activeLevelId = projectState.runtime.startingLevelId ?? activeLevelId;
  return projectState;
};

const switchProjectScene = (sceneId) => {
  const normalized = ensureProjectState();
  const nextScene = getSceneById(normalized, sceneId);
  if (!nextScene) return false;

  syncCurrentSceneIntoProject();
  activeSceneId = nextScene.id;
  projectState = normalizeProject({
    ...projectState,
    activeSceneId: nextScene.id,
  });
  setWorld(deserializeScene(nextScene.sceneData), { resetHistory: true });
  rebuildProjectPanels();
  updateProjectStatus();
  saveDraftProject({ announce: false });
  return true;
};

const switchProjectLevel = (levelId) => {
  const normalized = ensureProjectState();
  const nextLevel = getLevelById(normalized, levelId);
  if (!nextLevel) return false;

  syncCurrentSceneIntoProject();
  activeLevelId = nextLevel.id;
  activeSceneId = nextLevel.sceneId;
  projectState = normalizeProject({
    ...projectState,
    activeSceneId: nextLevel.sceneId,
  });
  const nextScene = getSceneById(projectState, nextLevel.sceneId);
  if (nextScene) {
    setWorld(deserializeScene(nextScene.sceneData), { resetHistory: true });
  }
  rebuildProjectPanels();
  updateProjectStatus();
  saveDraftProject({ announce: false });
  return true;
};

const setStartingLevel = (levelId) => {
  const normalized = ensureProjectState();
  projectState = normalizeProject({
    ...normalized,
    levels: normalized.levels.map((level) => ({
      ...level,
      starting: level.id === levelId,
    })),
    runtime: {
      ...normalized.runtime,
      startingLevelId: levelId,
    },
  });
  activeLevelId = levelId;
  rebuildProjectPanels();
  updateProjectStatus();
  saveDraftProject({ announce: false });
};

const createSceneAndLevel = (baseName = "Scene") => {
  const normalized = normalizeProject(syncCurrentSceneIntoProject());
  const nextWorld = createDefaultEditorWorld();
  const scene = createSceneFromWorld(`${baseName} ${normalized.scenes.length + 1}`, nextWorld, {
    order: normalized.scenes.length,
  });
  const level = createLevelFromScene(scene, {
    name: scene.name,
    order: normalized.levels.length,
    starting: normalized.levels.length === 0,
  });
  projectState = normalizeProject({
    ...normalized,
    scenes: [...normalized.scenes, scene],
    levels: [...normalized.levels, level],
    activeSceneId: scene.id,
    runtime: {
      ...normalized.runtime,
      startingLevelId: normalized.runtime.startingLevelId ?? level.id,
    },
  });
  activeSceneId = scene.id;
  activeLevelId = projectState.runtime.startingLevelId;
  setWorld(nextWorld, { resetHistory: true });
  rebuildProjectPanels();
  updateProjectStatus();
  saveDraftProject({ announce: false });
  return scene;
};

const duplicateCurrentScene = (sceneId = null) => {
  const normalized = ensureProjectState();
  const sourceScene =
    (sceneId ? getSceneById(normalized, sceneId) : getActiveProjectScene()) ?? null;
  if (!sourceScene) return null;

  const duplicateScene = {
    ...createSceneFromWorld(`${sourceScene.name} Copy`, world, {
      order: normalized.scenes.length,
      spawnPoint: sourceScene.spawnPoint,
    }),
    sceneData: cloneSceneData(sourceScene.sceneData),
  };
  const duplicateLevel = createLevelFromScene(duplicateScene, {
    name: `${sourceScene.name} Copy`,
    order: normalized.levels.length,
  });
  projectState = normalizeProject({
    ...normalized,
    scenes: [...normalized.scenes, duplicateScene],
    levels: [...normalized.levels, duplicateLevel],
    activeSceneId: duplicateScene.id,
  });
  activeSceneId = duplicateScene.id;
  activeLevelId = projectState.runtime.startingLevelId;
  setWorld(deserializeScene(duplicateScene.sceneData), { resetHistory: true });
  rebuildProjectPanels();
  updateProjectStatus();
  saveDraftProject({ announce: false });
  return duplicateScene;
};

const deleteSceneRecord = (sceneId) => {
  const normalized = ensureProjectState();
  if (normalized.scenes.length <= 1) return false;
  const remainingScenes = normalized.scenes.filter((scene) => scene.id !== sceneId);
  const fallbackScene = remainingScenes[0];
  const remainingLevels = normalized.levels
    .filter((level) => level.sceneId !== sceneId)
    .map((level, index) => ({
      ...level,
      order: index,
      sceneId: remainingScenes.some((scene) => scene.id === level.sceneId)
        ? level.sceneId
        : fallbackScene.id,
    }));

  projectState = normalizeProject({
    ...normalized,
    scenes: remainingScenes,
    levels:
      remainingLevels.length > 0
        ? remainingLevels
        : [
            createLevelFromScene(fallbackScene, {
              name: fallbackScene.name,
              starting: true,
              order: 0,
            }),
          ],
    activeSceneId: normalized.activeSceneId === sceneId ? fallbackScene.id : normalized.activeSceneId,
    runtime: {
      ...normalized.runtime,
      startingLevelId:
        remainingLevels.find((level) => level.starting)?.id ??
        normalized.runtime.startingLevelId ??
        remainingLevels[0]?.id ??
        null,
    },
  });
  activeSceneId = projectState.activeSceneId;
  activeLevelId = projectState.runtime.startingLevelId;
  if (activeSceneId !== sceneId) {
    const nextScene = getSceneById(projectState, activeSceneId);
    if (nextScene) {
      setWorld(deserializeScene(nextScene.sceneData), { resetHistory: true });
    }
  }
  rebuildProjectPanels();
  updateProjectStatus();
  saveDraftProject({ announce: false });
  return true;
};

const deleteLevelRecord = (levelId) => {
  const normalized = ensureProjectState();
  if (normalized.levels.length <= 1) return false;
  const remainingLevels = normalized.levels.filter((level) => level.id !== levelId);
  const nextStarting = remainingLevels.find((level) => level.starting) ?? remainingLevels[0];
  projectState = normalizeProject({
    ...normalized,
    levels: remainingLevels.map((level, index) => ({
      ...level,
      order: index,
      starting: nextStarting ? level.id === nextStarting.id : index === 0,
    })),
    runtime: {
      ...normalized.runtime,
      startingLevelId: nextStarting?.id ?? null,
    },
  });
  activeLevelId = projectState.runtime.startingLevelId;
  rebuildProjectPanels();
  updateProjectStatus();
  saveDraftProject({ announce: false });
  return true;
};

const renderSceneManager = () => {
  if (!sceneManagerPanel) return;
  const normalized = ensureProjectState();
  clearElement(sceneManagerPanel);

  const section = createProjectSection(
    "Scenes",
    "Each scene stores a serialized world snapshot that can be placed into levels."
  );
  const list = document.createElement("div");
  list.className = "project-manager__list";
  const activeScene = getActiveProjectScene();

  normalized.scenes.forEach((scene, index) => {
    const card = document.createElement("div");
    card.className = "project-manager__card";
    if (scene.id === activeScene?.id) {
      card.classList.add("active");
    }

    const row = createProjectRow();
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = scene.name;
    nameInput.placeholder = "Scene name";
    nameInput.addEventListener("change", () => {
      syncSceneRecord(scene.id, { name: nameInput.value.trim() || "Scene" });
      rebuildProjectPanels();
      saveDraftProject({ announce: false });
    });
    row.appendChild(nameInput);
    row.appendChild(
      createProjectButton("Open", () => {
        switchProjectScene(scene.id);
      })
    );
    row.appendChild(
      createProjectButton("Capture", () => {
        syncSceneRecord(scene.id, { sceneData: serializeScene(world) });
        saveDraftProject({ announce: false });
        rebuildProjectPanels();
      })
    );
    card.appendChild(row);

    const meta = document.createElement("p");
    meta.className = "project-manager__meta";
    const entityCount = Array.isArray(scene.sceneData?.entities) ? scene.sceneData.entities.length : 0;
    meta.textContent = `Scene ${index + 1} - ${entityCount} entities`;
    card.appendChild(meta);

    const controls = createProjectRow();
    controls.appendChild(
      createProjectButton("Up", () => {
        projectState = normalizeProject({
          ...ensureProjectState(),
          scenes: reorderProjectItem(ensureProjectState().scenes, scene.id, -1),
        });
        saveDraftProject({ announce: false });
        rebuildProjectPanels();
      })
    );
    controls.appendChild(
      createProjectButton("Down", () => {
        projectState = normalizeProject({
          ...ensureProjectState(),
          scenes: reorderProjectItem(ensureProjectState().scenes, scene.id, 1),
        });
        saveDraftProject({ announce: false });
        rebuildProjectPanels();
      })
    );
    controls.appendChild(
      createProjectButton("Duplicate", () => duplicateCurrentScene(scene.id))
    );
    controls.appendChild(
      createProjectButton("Delete", () => deleteSceneRecord(scene.id), "btn btn--ghost btn--small danger")
    );
    card.appendChild(controls);

    const spawnLabel = document.createElement("p");
    spawnLabel.className = "project-manager__meta";
    spawnLabel.textContent = `Spawn: ${scene.spawnPoint.position.map((value) => value.toFixed(2)).join(", ")}`;
    card.appendChild(spawnLabel);

    list.appendChild(card);
  });

  section.appendChild(list);
  sceneManagerPanel.appendChild(section);
};

const renderLevelManager = () => {
  if (!levelManagerPanel) return;
  const normalized = ensureProjectState();
  clearElement(levelManagerPanel);

  const section = createProjectSection(
    "Level Order",
    "Levels define progression, the starting scene, and per-level spawn data."
  );

  const summaryRow = createProjectRow();
  const startLabel = document.createElement("span");
  startLabel.className = "project-manager__meta";
  startLabel.textContent = `Starting level: ${getStartingLevel(normalized)?.name ?? "None"}`;
  summaryRow.appendChild(startLabel);
  section.appendChild(summaryRow);

  const list = document.createElement("div");
  list.className = "project-manager__list";

  normalized.levels.forEach((level) => {
    const card = document.createElement("div");
    card.className = "project-manager__card";
    if (level.id === activeLevelId) {
      card.classList.add("active");
    }

    const row = createProjectRow();
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = level.name;
    nameInput.placeholder = "Level name";
    nameInput.addEventListener("change", () => {
      syncLevelRecord(level.id, { name: nameInput.value.trim() || "Level" });
      saveDraftProject({ announce: false });
      rebuildProjectPanels();
    });
    row.appendChild(nameInput);

    const sceneSelect = document.createElement("select");
    normalized.scenes.forEach((scene) => {
      const option = document.createElement("option");
      option.value = scene.id;
      option.textContent = scene.name;
      if (scene.id === level.sceneId) {
        option.selected = true;
      }
      sceneSelect.appendChild(option);
    });
    sceneSelect.addEventListener("change", () => {
      syncLevelRecord(level.id, { sceneId: sceneSelect.value });
      saveDraftProject({ announce: false });
      rebuildProjectPanels();
    });
    row.appendChild(sceneSelect);
    row.appendChild(
      createProjectButton("Open", () => {
        switchProjectLevel(level.id);
      })
    );
    card.appendChild(row);

    const detailRow = createProjectRow();
    const startToggle = document.createElement("label");
    startToggle.className = "project-manager__toggle";
    const startRadio = document.createElement("input");
    startRadio.type = "radio";
    startRadio.name = "startingLevel";
    startRadio.checked = level.id === normalized.runtime.startingLevelId;
    startRadio.addEventListener("change", () => {
      if (startRadio.checked) {
        setStartingLevel(level.id);
      }
    });
    startToggle.append(startRadio, document.createTextNode("Starting"));
    detailRow.appendChild(startToggle);

    const nextSelect = document.createElement("select");
    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.textContent = "No next level";
    nextSelect.appendChild(noneOption);
    normalized.levels.forEach((candidate) => {
      if (candidate.id === level.id) return;
      const option = document.createElement("option");
      option.value = candidate.id;
      option.textContent = candidate.name;
      if (candidate.id === level.nextLevelId) {
        option.selected = true;
      }
      nextSelect.appendChild(option);
    });
    nextSelect.addEventListener("change", () => {
      syncLevelRecord(level.id, { nextLevelId: nextSelect.value || null });
      saveDraftProject({ announce: false });
    });
    detailRow.appendChild(nextSelect);
    detailRow.appendChild(
      createProjectButton("Delete", () => deleteLevelRecord(level.id), "btn btn--ghost btn--small danger")
    );
    card.appendChild(detailRow);

    const spawnSplit = document.createElement("div");
    spawnSplit.className = "project-manager__split";
    const spawnPosition = buildVectorField("Spawn Position", level.spawnPoint.position, (index, value) => {
      syncLevelRecord(level.id, {
        spawnPoint: {
          ...level.spawnPoint,
          position: level.spawnPoint.position.map((component, componentIndex) =>
            componentIndex === index ? value : component
          ),
        },
      });
      saveDraftProject({ announce: false });
    });
    const spawnRotation = buildVectorField("Spawn Rotation", level.spawnPoint.rotation, (index, value) => {
      syncLevelRecord(level.id, {
        spawnPoint: {
          ...level.spawnPoint,
          rotation: level.spawnPoint.rotation.map((component, componentIndex) =>
            componentIndex === index ? value : component
          ),
        },
      });
      saveDraftProject({ announce: false });
    });
    spawnSplit.append(spawnPosition.wrapper, spawnRotation.wrapper);
    card.appendChild(spawnSplit);

    const requirement = document.createElement("textarea");
    requirement.value = level.completionRequirement;
    requirement.placeholder = "Completion requirement";
    requirement.addEventListener("change", () => {
      syncLevelRecord(level.id, { completionRequirement: requirement.value });
      saveDraftProject({ announce: false });
    });
    card.appendChild(requirement);

    const objectiveRow = createProjectRow();
    const signalInput = document.createElement("input");
    signalInput.type = "text";
    signalInput.value = level.completionSignal;
    signalInput.placeholder = "Completion signal";
    signalInput.addEventListener("change", () => {
      syncLevelRecord(level.id, { completionSignal: signalInput.value.trim() });
      saveDraftProject({ announce: false });
    });
    const objectiveInput = document.createElement("input");
    objectiveInput.type = "text";
    objectiveInput.value = level.objectiveText;
    objectiveInput.placeholder = "Objective text";
    objectiveInput.addEventListener("change", () => {
      syncLevelRecord(level.id, { objectiveText: objectiveInput.value.trim() });
      saveDraftProject({ announce: false });
    });
    objectiveRow.append(signalInput, objectiveInput);
    card.appendChild(objectiveRow);

    const orderRow = createProjectRow();
    orderRow.appendChild(
      createProjectButton("Up", () => {
        projectState = normalizeProject({
          ...ensureProjectState(),
          levels: reorderProjectItem(ensureProjectState().levels, level.id, -1),
        });
        saveDraftProject({ announce: false });
        rebuildProjectPanels();
      })
    );
    orderRow.appendChild(
      createProjectButton("Down", () => {
        projectState = normalizeProject({
          ...ensureProjectState(),
          levels: reorderProjectItem(ensureProjectState().levels, level.id, 1),
        });
        saveDraftProject({ announce: false });
        rebuildProjectPanels();
      })
    );
    card.appendChild(orderRow);

    list.appendChild(card);
  });

  section.appendChild(list);
  levelManagerPanel.appendChild(section);
};

const renderHudSettings = () => {
  if (!hudSettingsPanel) return;
  const normalized = ensureProjectState();
  clearElement(hudSettingsPanel);

  const section = createProjectSection(
    "HUD Settings",
    "Configure what the player sees without exposing any editor controls."
  );

  const makeToggle = (label, checked, onChange) => {
    const row = createProjectRow();
    const wrapper = document.createElement("label");
    wrapper.className = "project-manager__toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    wrapper.append(input, document.createTextNode(label));
    row.appendChild(wrapper);
    return row;
  };

  section.appendChild(
    makeToggle("Health bar visible", normalized.hud.healthBar.visible, (checked) => {
      projectState = normalizeProject({
        ...ensureProjectState(),
        hud: {
          ...ensureProjectState().hud,
          healthBar: {
            ...ensureProjectState().hud.healthBar,
            visible: checked,
          },
        },
      });
      saveDraftProject({ announce: false });
    })
  );

  const healthRow = createProjectRow();
  const healthSelect = document.createElement("select");
  ["top-left", "bottom-left"].forEach((position) => {
    const option = document.createElement("option");
    option.value = position;
    option.textContent = position;
    if (position === normalized.hud.healthBar.position) option.selected = true;
    healthSelect.appendChild(option);
  });
  healthSelect.addEventListener("change", () => {
    projectState = normalizeProject({
      ...ensureProjectState(),
      hud: {
        ...ensureProjectState().hud,
        healthBar: {
          ...ensureProjectState().hud.healthBar,
          position: healthSelect.value,
        },
      },
    });
    saveDraftProject({ announce: false });
  });
  healthRow.appendChild(healthSelect);
  section.appendChild(healthRow);

  section.appendChild(
    makeToggle("Minimap visible", normalized.hud.minimap.visible, (checked) => {
      projectState = normalizeProject({
        ...ensureProjectState(),
        hud: {
          ...ensureProjectState().hud,
          minimap: {
            ...ensureProjectState().hud.minimap,
            visible: checked,
          },
        },
      });
      saveDraftProject({ announce: false });
    })
  );

  const minimapRow = createProjectRow();
  const minimapSelect = document.createElement("select");
  ["top-right", "bottom-right"].forEach((position) => {
    const option = document.createElement("option");
    option.value = position;
    option.textContent = position;
    if (position === normalized.hud.minimap.position) option.selected = true;
    minimapSelect.appendChild(option);
  });
  minimapSelect.addEventListener("change", () => {
    projectState = normalizeProject({
      ...ensureProjectState(),
      hud: {
        ...ensureProjectState().hud,
        minimap: {
          ...ensureProjectState().hud.minimap,
          position: minimapSelect.value,
        },
      },
    });
    saveDraftProject({ announce: false });
  });
  minimapRow.appendChild(minimapSelect);
  section.appendChild(minimapRow);

  const objectiveRow = createProjectRow();
  const objectiveInput = document.createElement("input");
  objectiveInput.type = "text";
  objectiveInput.value = normalized.hud.objectiveText.text;
  objectiveInput.placeholder = "Objective text";
  objectiveInput.addEventListener("change", () => {
    projectState = normalizeProject({
      ...ensureProjectState(),
      hud: {
        ...ensureProjectState().hud,
        objectiveText: {
          ...ensureProjectState().hud.objectiveText,
          text: objectiveInput.value.trim(),
        },
      },
    });
    saveDraftProject({ announce: false });
  });
  objectiveRow.appendChild(objectiveInput);
  section.appendChild(objectiveRow);

  section.appendChild(
    makeToggle("Objective text visible", normalized.hud.objectiveText.visible, (checked) => {
      projectState = normalizeProject({
        ...ensureProjectState(),
        hud: {
          ...ensureProjectState().hud,
          objectiveText: {
            ...ensureProjectState().hud.objectiveText,
            visible: checked,
          },
        },
      });
      saveDraftProject({ announce: false });
    })
  );

  section.appendChild(
    makeToggle("Scene title banner", normalized.hud.sceneTitle.banner, (checked) => {
      projectState = normalizeProject({
        ...ensureProjectState(),
        hud: {
          ...ensureProjectState().hud,
          sceneTitle: {
            ...ensureProjectState().hud.sceneTitle,
            banner: checked,
          },
        },
      });
      saveDraftProject({ announce: false });
    })
  );

  section.appendChild(
    makeToggle("Pause menu enabled", normalized.hud.pauseMenu.enabled, (checked) => {
      projectState = normalizeProject({
        ...ensureProjectState(),
        hud: {
          ...ensureProjectState().hud,
          pauseMenu: {
            ...ensureProjectState().hud.pauseMenu,
            enabled: checked,
          },
        },
      });
      saveDraftProject({ announce: false });
    })
  );

  section.appendChild(
    makeToggle("Mobile HUD enabled", normalized.hud.mobileHud.enabled, (checked) => {
      projectState = normalizeProject({
        ...ensureProjectState(),
        hud: {
          ...ensureProjectState().hud,
          mobileHud: {
            ...ensureProjectState().hud.mobileHud,
            enabled: checked,
          },
        },
      });
      saveDraftProject({ announce: false });
    })
  );

  section.appendChild(
    makeToggle("Compact mobile layout", normalized.hud.mobileHud.compact, (checked) => {
      projectState = normalizeProject({
        ...ensureProjectState(),
        hud: {
          ...ensureProjectState().hud,
          mobileHud: {
            ...ensureProjectState().hud.mobileHud,
            compact: checked,
          },
        },
      });
      saveDraftProject({ announce: false });
    })
  );

  hudSettingsPanel.appendChild(section);
};

const renderPublishPanel = () => {
  if (!publishPanel) return;
  const normalized = ensureProjectState();
  clearElement(publishPanel);

  const section = createProjectSection(
    "Publish Flow",
    "Publish generates the client-ready build that the player page loads."
  );

  const draftMeta = document.createElement("p");
  draftMeta.className = "project-manager__meta";
  draftMeta.textContent = `Draft scenes: ${normalized.scenes.length}, levels: ${normalized.levels.length}`;
  section.appendChild(draftMeta);

  const statusBlock = document.createElement("div");
  statusBlock.className = "project-manager__card";
  const publishedLine = document.createElement("p");
  publishedLine.className = "project-manager__meta";
  publishedLine.textContent = normalized.metadata.publishedAt
    ? `Last published: ${normalized.metadata.publishedAt}`
    : "Not published yet.";
  const versionLine = document.createElement("p");
  versionLine.className = "project-manager__meta";
  versionLine.textContent = `Published version: ${normalized.metadata.publishedVersion || 0}`;
  statusBlock.append(publishedLine, versionLine);
  section.appendChild(statusBlock);

  const actionRow = createProjectRow();
  actionRow.appendChild(createProjectButton("Save Draft", () => saveDraftProject({ announce: true })));
  actionRow.appendChild(
    createProjectButton("Publish", () => {
      syncCurrentSceneIntoProject();
      const published = publishProject(projectState, { source: "published" });
      const payload = getPublishedScenePayload(published);
      projectState = published;
      localStorage.setItem(PUBLISHED_PROJECT_STORAGE_KEY, JSON.stringify(payload));
      localStorage.setItem(DRAFT_PROJECT_STORAGE_KEY, JSON.stringify(normalizeProject(projectState)));
      localStorage.setItem(PROJECT_STORAGE_KEYS.legacyScene, JSON.stringify(serializeScene(world)));
      rebuildProjectPanels();
      updateProjectStatus();
      if (status) {
        status.textContent = "Project published for client playback.";
      }
      const fileName = `${published.name || "tyron-project"}.json`;
      downloadJsonFile(fileName, payload);
    })
  );
  actionRow.appendChild(
    createProjectButton("Open Player", () => {
      saveDraftProject({ announce: false });
      window.open("runtime.html", "_blank");
    })
  );
  actionRow.appendChild(
    createProjectButton("Open Preview", () => {
      openRuntimeWindow();
    })
  );
  section.appendChild(actionRow);

  const note = document.createElement("p");
  note.className = "project-manager__meta";
  note.textContent =
    "Drafts stay in tyronProjectDraft. The client page only reads tyronPublishedProject.";
  section.appendChild(note);

  publishPanel.appendChild(section);
};

const rebuildProjectPanels = () => {
  renderSceneManager();
  renderLevelManager();
  renderHudSettings();
  renderPublishPanel();
};

const selectEntity = (entityId) => {
  if (!sceneHistory.isRestoring && selectedEntityId && selectedEntityId !== entityId) {
    commitSelectedEntityTransform();
  }
  selectedEntityId = entityId;
  rebuildHierarchy();
  rebuildInspector();
  syncCodeEditorToSelection();
  if (entityId) {
    activateEditTab("offset");
  }
  const object = meshCache.get(entityId);
  if (object) {
    transformControls.attach(object);
  } else {
    transformControls.detach();
  }
};

 

const setWorld = (newWorld, options = {}) => {
  const selectionId = options.selectionId ?? null;
  world = newWorld;
  engine.setWorld(newWorld);
  meshCache.clear();
  colliderHelpers.forEach((helper) => engine.scene.remove(helper));
  colliderHelpers.clear();
  hitBoxHelpers.forEach((helper) => engine.scene.remove(helper));
  hitBoxHelpers.clear();
  if (options.resetHistory !== false) {
    sceneHistory.past.length = 0;
    sceneHistory.future.length = 0;
    updateSceneHistoryButtons();
  }
  const first = world.getEntities()[0];
  const nextSelection = selectionId ?? (first ? first.id : null);
  selectEntity(nextSelection);
};

if (false) {

const ensureProjectState = () => {
  if (projectState) {
    return normalizeProject(projectState);
  }

  projectState = createProjectFromScene(serializeScene(world));
  activeSceneId = projectState.activeSceneId;
  activeLevelId = projectState.runtime.startingLevelId;
  return projectState;
};

const syncCurrentSceneIntoProject = () => {
  const normalized = ensureProjectState();
  const sceneId = activeSceneId ?? normalized.activeSceneId ?? normalized.scenes[0]?.id ?? null;
  if (!sceneId) return normalized;

  projectState = replaceProjectScene(normalized, sceneId, serializeScene(world));
  projectState.activeSceneId = sceneId;
  activeSceneId = sceneId;
  return projectState;
};

const saveDraftProject = ({ announce = true } = {}) => {
  const draft = normalizeProject(syncCurrentSceneIntoProject());
  projectState = draft;
  activeSceneId = draft.activeSceneId;
  activeLevelId = draft.runtime.startingLevelId;
  localStorage.setItem(DRAFT_PROJECT_STORAGE_KEY, JSON.stringify(draft));
  localStorage.setItem(PROJECT_STORAGE_KEYS.legacyScene, JSON.stringify(serializeScene(world)));
  if (announce && status) {
    status.textContent = "Draft project saved.";
  }
  return draft;
};

const captureSceneAsDraft = (sceneRecord, levelRecord = null) => {
  const nextProject = ensureProjectState();
  const capturedScene = createSceneFromWorld(sceneRecord?.name ?? "Scene", world, {
    id: sceneRecord?.id,
    order: sceneRecord?.order ?? nextProject.scenes.length,
    spawnPoint: sceneRecord?.spawnPoint,
  });
  let scenes = nextProject.scenes.filter((scene) => scene.id !== capturedScene.id);
  scenes.push(capturedScene);
  scenes = scenes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  let levels = nextProject.levels;
  if (levelRecord) {
    const capturedLevel = createLevelFromScene(capturedScene, {
      id: levelRecord.id,
      name: levelRecord.name,
      order: levelRecord.order ?? nextProject.levels.length,
      starting: levelRecord.starting,
      nextLevelId: levelRecord.nextLevelId,
      spawnPoint: levelRecord.spawnPoint ?? capturedScene.spawnPoint,
      completionRequirement: levelRecord.completionRequirement,
      completionSignal: levelRecord.completionSignal,
      objectiveText: levelRecord.objectiveText,
    });
    levels = nextProject.levels.filter((level) => level.id !== capturedLevel.id);
    levels.push(capturedLevel);
    levels = levels.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  projectState = normalizeProject({
    ...nextProject,
    scenes,
    levels,
    activeSceneId: capturedScene.id,
    runtime: {
      ...nextProject.runtime,
      startingLevelId:
        nextProject.runtime.startingLevelId ??
        levels.find((level) => level.starting)?.id ??
        levels[0]?.id ??
        null,
    },
  });
  activeSceneId = projectState.activeSceneId;
  activeLevelId = projectState.runtime.startingLevelId;
  return projectState;
};

const loadProjectIntoEditor = (project) => {
  const normalized = normalizeProject(project);
  projectState = normalized;
  activeSceneId = normalized.activeSceneId ?? normalized.scenes[0]?.id ?? null;
  activeLevelId = normalized.runtime.startingLevelId ?? normalized.levels[0]?.id ?? null;
  const activeScene = getActiveScene(normalized);
  if (activeScene?.sceneData) {
    setWorld(deserializeScene(activeScene.sceneData), { resetHistory: true });
  }
  rebuildProjectPanels();
  updateProjectStatus();
  return normalized;
};

const getActiveProjectScene = () => {
  const normalized = ensureProjectState();
  return (
    normalized.scenes.find((scene) => scene.id === (activeSceneId ?? normalized.activeSceneId)) ??
    normalized.scenes[0] ??
    null
  );
};

const getActiveProjectLevel = () => {
  const normalized = ensureProjectState();
  return (
    normalized.levels.find((level) => level.id === (activeLevelId ?? normalized.runtime.startingLevelId)) ??
    normalized.levels.find((level) => level.starting) ??
    normalized.levels[0] ??
    null
  );
};

const switchProjectScene = (sceneId) => {
  const normalized = ensureProjectState();
  const nextScene = getSceneById(normalized, sceneId);
  if (!nextScene) return false;

  captureSceneAsDraft(
    getActiveProjectScene() ?? normalized.scenes[0] ?? null,
    getActiveProjectLevel()
  );
  activeSceneId = nextScene.id;
  projectState = normalizeProject({
    ...projectState,
    activeSceneId: nextScene.id,
  });
  setWorld(deserializeScene(nextScene.sceneData), { resetHistory: true });
  rebuildProjectPanels();
  updateProjectStatus();
  return true;
};

const switchProjectLevel = (levelId) => {
  const normalized = ensureProjectState();
  const nextLevel = getLevelById(normalized, levelId);
  if (!nextLevel) return false;
  activeLevelId = nextLevel.id;
  activeSceneId = nextLevel.sceneId;
  const nextScene = getSceneById(normalized, nextLevel.sceneId);
  if (nextScene) {
    setWorld(deserializeScene(nextScene.sceneData), { resetHistory: true });
  }
  rebuildProjectPanels();
  updateProjectStatus();
  return true;
};

const updateProjectStatus = () => {
  if (!status) return;
  const scene = getActiveProjectScene();
  const level = getActiveProjectLevel();
  const sceneLabel = scene?.name ?? "Scene";
  const levelLabel = level?.name ?? "Level";
  status.textContent = `${sceneLabel} / ${levelLabel}`;
};

}

const loadWorldFromGltf = (asset) => {
  pushSceneHistory();
  const newWorld = new World();
  const worldEntity = newWorld.createEntity(asset.name || "World");
  newWorld.addComponent(worldEntity, createTransform());
  newWorld.addComponent(worldEntity, createGltf({ url: asset.url, name: asset.name }));
  setWorld(newWorld);
  status.textContent = `Loaded world: ${asset.name}`;
};

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const selectionPaddingPx = 16;
const selectionMaxCoverageRatio = 0.35;
const selectionDragThresholdPx = 6;
let selectionPointerDown = null;

const isPointerInsideSelectedEntityBuffer = (event) => {
  if (!selectedEntityId) return false;
  const object = meshCache.get(selectedEntityId);
  if (!object) return false;

  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return false;

  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let projected = 0;

  corners.forEach((corner) => {
    const screen = corner.project(engine.camera);
    if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return;
    const x = ((screen.x + 1) * 0.5) * canvas.clientWidth;
    const y = ((1 - screen.y) * 0.5) * canvas.clientHeight;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    projected += 1;
  });

  if (!projected) return false;

  const rect = canvas.getBoundingClientRect();
  const projectedWidth = maxX - minX;
  const projectedHeight = maxY - minY;
  if (
    projectedWidth > rect.width * selectionMaxCoverageRatio ||
    projectedHeight > rect.height * selectionMaxCoverageRatio
  ) {
    return false;
  }

  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  return (
    x >= minX - selectionPaddingPx &&
    x <= maxX + selectionPaddingPx &&
    y >= minY - selectionPaddingPx &&
    y <= maxY + selectionPaddingPx
  );
};

const selectEntityAtPointer = (event) => {
  if (isTransformingSelectedEntity) return;
  if (isPointerInsideSelectedEntityBuffer(event)) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, engine.camera);
  const objects = Array.from(meshCache.values());
  const hits = raycaster.intersectObjects(objects, true);
  if (hits.length > 0) {
    let hit = hits[0].object;
    while (hit && !Number.isFinite(hit.userData?.entityId)) {
      hit = hit.parent;
    }
    if (Number.isFinite(hit?.userData?.entityId)) {
      selectEntity(hit.userData.entityId);
    }
  }
};

const onPointerDown = (event) => {
  if (event.button !== 0) return;
  selectionPointerDown = {
    x: event.clientX,
    y: event.clientY,
    pointerId: event.pointerId,
  };
};

const onPointerUp = (event) => {
  if (!selectionPointerDown || selectionPointerDown.pointerId !== event.pointerId) return;

  const deltaX = event.clientX - selectionPointerDown.x;
  const deltaY = event.clientY - selectionPointerDown.y;
  selectionPointerDown = null;

  if (Math.hypot(deltaX, deltaY) > selectionDragThresholdPx) {
    return;
  }

  selectEntityAtPointer(event);
};

const clearSelectionPointerState = () => {
  selectionPointerDown = null;
};

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", clearSelectionPointerState);
canvas.addEventListener("pointerleave", clearSelectionPointerState);

const getDropPosition = (event) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, engine.camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, hit);
  return [hit.x, 0.5, hit.z];
};

transformControls.addEventListener("dragging-changed", (event) => {
  orbitControls.enabled = !event.value;
  isTransformingSelectedEntity = event.value;
  if (event.value && !sceneHistory.isRestoring) {
    pushSceneHistory();
  }
  if (!selectedEntityId) return;
  const entity = world.getEntities().find((item) => item.id === selectedEntityId);
  const object = meshCache.get(selectedEntityId);
  if (entity && object) {
    syncTransformComponentFromObject(entity, object);
    if (!event.value) {
      rebuildInspector();
    }
  }
});

transformControls.addEventListener("objectChange", () => {
  if (!isTransformingSelectedEntity || !selectedEntityId) return;
  const entity = world.getEntities().find((item) => item.id === selectedEntityId);
  const object = meshCache.get(selectedEntityId);
  if (entity && object) {
    syncTransformComponentFromObject(entity, object);
  }
});

const gizmoButtons = document.querySelectorAll("[data-gizmo]");
gizmoButtons.forEach((button) => {
  button.addEventListener("click", () => {
    transformControls.setMode(button.dataset.gizmo);
    gizmoButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  });
});
const activeGizmo = document.querySelector('[data-gizmo="translate"]');
if (activeGizmo) {
  activeGizmo.classList.add("active");
}

editTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activateEditTab(button.dataset.editTab);
  });
});
activateEditTab(activeEditTab);

const saveButton = document.getElementById("saveScene");
const loadButton = document.getElementById("loadScene");

if (saveButton) {
  saveButton.addEventListener("click", () => {
    saveDraftProject({ announce: true });
  });
}

if (loadButton) {
  loadButton.addEventListener("click", () => {
    const rawDraft = localStorage.getItem(DRAFT_PROJECT_STORAGE_KEY);
    const rawLegacy = localStorage.getItem(PROJECT_STORAGE_KEYS.legacyScene);
    const loaded = loadProjectLike(rawDraft) ?? loadLegacySceneLike(rawLegacy);
    if (!loaded) return;
    loadProjectIntoEditor(loaded);
    status.textContent = "Draft project loaded.";
  });
}

if (publishButton) {
  publishButton.addEventListener("click", () => {
    syncCurrentSceneIntoProject();
    const published = publishProject(projectState, { source: "published" });
    const payload = getPublishedScenePayload(published);
    projectState = published;
    localStorage.setItem(PUBLISHED_PROJECT_STORAGE_KEY, JSON.stringify(payload));
    saveDraftProject({ announce: false });
    rebuildProjectPanels();
    updateProjectStatus();
    if (status) {
      status.textContent = "Project published for client playback.";
    }
    const fileName = `${published.name || "tyron-project"}.json`;
    downloadJsonFile(fileName, payload);
  });
}

if (openPlayerButton) {
  openPlayerButton.addEventListener("click", () => {
    saveDraftProject({ announce: false });
    window.open("runtime.html", "_blank");
  });
}

if (playButton) {
  playButton.addEventListener("click", () => {
    openRuntimeWindow();
  });
}

if (stopButton) {
  stopButton.disabled = true;
  stopButton.addEventListener("click", () => {
    closeRuntimeWindow();
  });
}

if (undoSceneButton) {
  undoSceneButton.addEventListener("click", () => {
    undoSceneChange();
  });
}

if (redoSceneButton) {
  redoSceneButton.addEventListener("click", () => {
    redoSceneChange();
  });
}

document.addEventListener(
  "keydown",
  (event) => {
  const key = event.key.toLowerCase();
  const isUndo = (event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey;
  const isRedo =
    (event.ctrlKey || event.metaKey) &&
    (key === "y" || (key === "z" && event.shiftKey));

  if (!isUndo && !isRedo) return;

  event.stopPropagation();
  event.preventDefault();
  if (isUndo) {
    undoSceneChange();
  } else {
    redoSceneChange();
  }
  },
  { capture: true }
);

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "s" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    saveDraftProject({ announce: true });
  }
});

if (addSceneButton) {
  addSceneButton.addEventListener("click", () => {
    createSceneAndLevel("Scene");
  });
}

if (duplicateSceneButton) {
  duplicateSceneButton.addEventListener("click", () => {
    duplicateCurrentScene();
  });
}

if (addLevelButton) {
  addLevelButton.addEventListener("click", () => {
    const normalized = ensureProjectState();
    const scene = getActiveProjectScene() ?? normalized.scenes[0] ?? null;
    if (!scene) return;
    const level = createLevelFromScene(scene, {
      name: `${scene.name} ${normalized.levels.length + 1}`,
      order: normalized.levels.length,
      starting: normalized.levels.length === 0,
    });
    projectState = normalizeProject({
      ...normalized,
      levels: [...normalized.levels, level],
      runtime: {
        ...normalized.runtime,
        startingLevelId: normalized.runtime.startingLevelId ?? level.id,
      },
    });
    activeLevelId = projectState.runtime.startingLevelId;
    rebuildProjectPanels();
    updateProjectStatus();
    saveDraftProject({ announce: false });
  });
}

const assetGrid = document.getElementById("assetGrid");
const worldGrid = document.getElementById("worldGrid");
if (assetGrid) {
  const baseAssets = [
    { name: "Box", type: "mesh", geometry: "box" },
    { name: "Sphere", type: "mesh", geometry: "sphere" },
    { name: "Plane", type: "mesh", geometry: "plane" },
  ];

  const renderUploads = () => {
    if (!uploadedList) return;
    uploadedList.innerHTML = "";
    if (!uploadedAssets.length) {
      const empty = document.createElement("li");
      empty.textContent = "No files imported yet.";
      uploadedList.appendChild(empty);
      return;
    }
    uploadedAssets.forEach((asset) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = asset.name;
      const button = document.createElement("button");
      button.textContent = "Add to scene";
      button.addEventListener("click", () => {
        pushSceneHistory();
        const entity = world.createEntity(asset.name);
        world.addComponent(entity, createTransform({ position: [0, 0.5, 0] }));
        world.addComponent(entity, createGltf({ url: asset.url, name: asset.name }));
        selectEntity(entity.id);
        status.textContent = `Added ${asset.name} to scene.`;
      });
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.className = "danger";
      deleteBtn.addEventListener("click", () => {
        const index = uploadedAssets.findIndex((item) => item.url === asset.url);
        if (index >= 0) {
          URL.revokeObjectURL(uploadedAssets[index].url);
          uploadedAssets.splice(index, 1);
        }
        const worldIndex = worldAssets.findIndex((item) => item.url === asset.url);
        if (worldIndex >= 0) {
          worldAssets.splice(worldIndex, 1);
        }
        renderAssets();
      });
      li.append(name, button, deleteBtn);
      uploadedList.appendChild(li);
    });
  };

  renderAssets = () => {
    assetGrid.innerHTML = "";
    [...baseAssets, ...importedAssets].forEach((asset) => {
      const card = document.createElement("div");
      card.className = "asset-card";
      card.textContent = asset.name;
      card.addEventListener("click", () => {
        pushSceneHistory();
        if (asset.type === "mesh") {
          const entity = world.createEntity(asset.name);
          world.addComponent(entity, createTransform());
          world.addComponent(
            entity,
            createMesh({ geometry: asset.geometry, material: { color: "#7fd9ff" } })
          );
          selectEntity(entity.id);
        }
        if (asset.type === "gltf") {
          const entity = world.createEntity(asset.name);
          world.addComponent(entity, createTransform({ position: [0, 0.5, 0] }));
          world.addComponent(entity, createGltf({ url: asset.url, name: asset.name }));
          selectEntity(entity.id);
        }
      });
      assetGrid.appendChild(card);
    });

    if (worldGrid) {
      worldGrid.innerHTML = "";
      worldAssets.forEach((asset) => {
        const card = document.createElement("div");
        card.className = "asset-card";
        card.textContent = asset.name;
        card.addEventListener("click", () => {
          loadWorldFromGltf(asset);
        });
        worldGrid.appendChild(card);
      });
    }
    renderSpriteBrowser();
    renderUploads();
  };

  renderAssets();

  const handleFiles = (files, dropEvent) => {
    if (Array.from(files).some((file) => {
      const lower = file.name.toLowerCase();
      return lower.endsWith(".gltf") || lower.endsWith(".glb");
    })) {
      pushSceneHistory();
    }
    Array.from(files).forEach((file) => {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".gltf") && !lower.endsWith(".glb")) return;
      const url = URL.createObjectURL(file);
      const name = file.name.replace(/\.(gltf|glb)$/i, "");
      const asset = { name, type: "gltf", url };
      importedAssets.push(asset);
      const position = dropEvent ? getDropPosition(dropEvent) : [0, 0.5, 0];
      const entity = world.createEntity(name);
      world.addComponent(entity, createTransform({ position }));
      world.addComponent(entity, createGltf({ url, name }));
      selectEntity(entity.id);
      status.textContent = `Imported ${file.name}.`;
    });
    renderAssets();
  };

  const onDragOver = (event) => {
    event.preventDefault();
  };

  const onDrop = (event) => {
    event.preventDefault();
    if (event.dataTransfer?.files?.length) {
      handleFiles(event.dataTransfer.files, event);
    }
  };

  canvas.addEventListener("dragover", onDragOver);
  canvas.addEventListener("drop", onDrop);
  assetGrid.addEventListener("dragover", onDragOver);
  assetGrid.addEventListener("drop", onDrop);
}

if (importFolderButton && importFolderInput) {
  importFolderButton.addEventListener("click", () => {
    importFolderInput.click();
  });

  importFolderInput.addEventListener("change", (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    uploadedAssets.length = 0;
    worldAssets.length = 0;
    let importedWorldCount = 0;
    files.forEach((file) => {
      if (!file.name.toLowerCase().endsWith(".glb")) return;
      const url = URL.createObjectURL(file);
      const name = file.name.replace(/\.glb$/i, "");
      uploadedAssets.push({ name, url, size: file.size });
      worldAssets.push({ name, type: "world", url });
      importedWorldCount += 1;
    });
    renderAssets();
    status.textContent = importedWorldCount
      ? `Imported ${importedWorldCount} world file(s).`
      : "No .glb world files were found in this selection.";
    importFolderInput.value = "";
  });
}

if (importSpriteFolderButton && importSpriteFolderInput) {
  importSpriteFolderButton.addEventListener("click", () => {
    importSpriteFolderInput.click();
  });

  importSpriteFolderInput.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const entries = files.map((file) => ({
      file,
      path: file.webkitRelativePath || file.name,
    }));
    await importSpriteEntries(entries);
    importSpriteFolderInput.value = "";
  });
}

const readDirectoryBatch = (reader) =>
  new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });

const readAllDirectoryEntries = async (reader) => {
  const entries = [];
  while (true) {
    const batch = await readDirectoryBatch(reader);
    if (!batch.length) break;
    entries.push(...batch);
  }
  return entries;
};

const collectDroppedSpriteEntries = async (entry, parentPath = "") => {
  if (!entry) return [];
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file(
        (file) => {
          resolve([
            {
              file,
              path: `${parentPath}${file.name}`,
            },
          ]);
        },
        () => resolve([])
      );
    });
  }

  if (!entry.isDirectory) return [];
  const reader = entry.createReader();
  const children = await readAllDirectoryEntries(reader);
  const nested = await Promise.all(
    children.map((child) =>
      collectDroppedSpriteEntries(child, `${parentPath}${entry.name}/`)
    )
  );
  return nested.flat();
};

if (spriteBrowser) {
  spriteBrowser.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  spriteBrowser.addEventListener("drop", async (event) => {
    event.preventDefault();
    const items = Array.from(event.dataTransfer?.items || []);
    if (!items.length) return;

    const rootEntries = items
      .map((item) =>
        typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null
      )
      .filter(Boolean);

    if (!rootEntries.length) {
      const fallbackFiles = Array.from(event.dataTransfer?.files || []);
      const entries = fallbackFiles.map((file) => ({
        file,
        path: file.webkitRelativePath || file.name,
      }));
      await importSpriteEntries(entries);
      return;
    }

    const collected = await Promise.all(
      rootEntries.map((entry) => collectDroppedSpriteEntries(entry))
    );
    await importSpriteEntries(collected.flat());
  });
}

if (addEntityButton) {
  addEntityButton.addEventListener("click", () => {
    createEntity("New Entity");
  });
}

if (addCameraEntityButton) {
  addCameraEntityButton.addEventListener("click", () => {
    createCameraEntity();
  });
}

const boxHelperFor = (entity, map, color) => {
  let helper = map.get(entity.id);
  if (!helper) {
    helper = new THREE.Box3Helper(new THREE.Box3(), color);
    map.set(entity.id, helper);
    engine.scene.add(helper);
  }
  return helper;
};

const updateBoxHelpers = () => {
  world.getEntities().forEach((entity) => {
    const transform = entity.components.get(ComponentType.Transform);
    if (!transform) return;

    const collider = entity.components.get(ComponentType.Collider);
    if (collider) {
      if (!Array.isArray(collider.offset)) {
        collider.offset = [0, 0, 0];
      }
      const helper = boxHelperFor(entity, colliderHelpers, 0xffb357);
      const size = new THREE.Vector3(...collider.size).multiply(new THREE.Vector3(...transform.scale));
      const center = new THREE.Vector3(
        transform.position[0] + collider.offset[0],
        transform.position[1] + collider.offset[1],
        transform.position[2] + collider.offset[2]
      );
      const min = center.clone().addScaledVector(size, -0.5);
      const max = center.clone().addScaledVector(size, 0.5);
      helper.box.set(min, max);
    }

    const hitBox = entity.components.get(ComponentType.HitBox);
    if (hitBox) {
      if (!Array.isArray(hitBox.offset)) {
        hitBox.offset = [0, 0, 0];
      }
      const helper = boxHelperFor(entity, hitBoxHelpers, 0xff4d4d);
      const size = new THREE.Vector3(...hitBox.size).multiply(new THREE.Vector3(...transform.scale));
      const center = new THREE.Vector3(
        transform.position[0] + hitBox.offset[0],
        transform.position[1] + hitBox.offset[1],
        transform.position[2] + hitBox.offset[2]
      );
      const min = center.clone().addScaledVector(size, -0.5);
      const max = center.clone().addScaledVector(size, 0.5);
      helper.box.set(min, max);
    }

    const sprite = entity.components.get(ComponentType.SpriteCharacter);
    const spriteObject = meshCache.get(entity.id);
    if (spriteObject?.userData?.spriteMeshOutline) {
      spriteObject.userData.spriteMeshOutline.visible = true;
      spriteObject.userData.spriteMeshOutline.material.color.set(
        entity.id === selectedEntityId ? 0xffd166 : 0x4ad4a8
      );
      spriteObject.userData.spriteMeshOutline.update();
    }

    if (!sprite || !Array.isArray(sprite.animations) || !sprite.animations.length) {
      const helper = spriteColliderHelpers.get(entity.id);
      if (helper) {
        helper.visible = false;
      }
      return;
    }

    const activeAnimation =
      sprite.animations.find((animation) => animation.name === sprite.activeAnimation) ??
      sprite.animations[0];
    const frameIndex = Math.min(
      Number.isFinite(sprite.activeFrameIndex) ? sprite.activeFrameIndex : 0,
      Math.max((activeAnimation?.frames?.length ?? 1) - 1, 0)
    );
    const frame = activeAnimation?.frames?.[frameIndex] ?? null;
    const frameCollider =
      sprite.colliderEditMode && activeAnimation
        ? resolveSpriteColliderForFrame(activeAnimation, frameIndex)
        : null;

    const helper = spriteColliderHelpers.get(entity.id) ?? null;
    if (!frameCollider || frameCollider.type !== "box") {
      if (helper) {
        helper.visible = false;
      }
      return;
    }

    const spriteHelper = boxHelperFor(entity, spriteColliderHelpers, 0xffd166);
    spriteHelper.visible = true;
    const size = new THREE.Vector3(
      Number.isFinite(frameCollider.width) ? frameCollider.width : 1,
      Number.isFinite(frameCollider.height) ? frameCollider.height : 1,
      Number.isFinite(frameCollider.depth) ? frameCollider.depth : 0.2
    ).multiply(new THREE.Vector3(...transform.scale));
    const center = new THREE.Vector3(
      transform.position[0] + (Number.isFinite(frameCollider.x) ? frameCollider.x : 0),
      transform.position[1] + (Number.isFinite(frameCollider.y) ? frameCollider.y : 0),
      transform.position[2]
    );
    const min = center.clone().addScaledVector(size, -0.5);
    const max = center.clone().addScaledVector(size, 0.5);
    spriteHelper.box.set(min, max);
  });
};

const initMonaco = async () => {
  const container = document.getElementById("codeEditor");
  if (!container) return;

  const loadScript = (url) =>
    new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });

  try {
    await loadScript("https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js");
    window.require.config({
      paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" },
    });

    window.require(["vs/editor/editor.main"], () => {
      codeEditor = window.monaco.editor.create(container, {
        value: SCRIPT_TEMPLATE,
        language: "javascript",
        theme: "vs-dark",
        minimap: { enabled: false },
        automaticLayout: true,
      });
      codeEditor.onDidChangeModelContent(() => {
        applyCodeEditorChange();
      });
      syncCodeEditorToSelection();
      renderTriggerPresets();
      if (activeEditTab === "code") {
        requestAnimationFrame(() => {
          codeEditor?.layout?.();
        });
      }
    });
  } catch (error) {
    container.textContent = "Monaco failed to load. Check network or host it locally.";
  }
};

const animate = () => {
  const delta = editorClock.getDelta();
  updateCameraEntityFollowers();
  syncWorldToScene(
    engine.scene,
    engine.world,
    engine.cache,
    engine.gltfLoader,
    engine.gltfLoading,
    {
      showCameraRig: true,
      showSpriteOutlines: true,
      skipTransformIds:
        isTransformingSelectedEntity && selectedEntityId ? [selectedEntityId] : [],
    },
    engine.camera,
    delta
  );
  orbitControls.update();
  updateBoxHelpers();
  engine.renderer.render(engine.scene, engine.camera);
  requestAnimationFrame(animate);
};

window.addEventListener("beforeunload", () => {
  spriteCharacters.forEach((character) => {
    revokeSpriteCharacterUrls(character);
  });
});

setupViewportResizeSync();
const storedDraftProject =
  loadProjectLike(localStorage.getItem(DRAFT_PROJECT_STORAGE_KEY)) ??
  loadLegacySceneLike(localStorage.getItem(PROJECT_STORAGE_KEYS.legacyScene));

if (storedDraftProject) {
  loadProjectIntoEditor(storedDraftProject);
} else {
  ensureProjectState();
  rebuildProjectPanels();
  updateProjectStatus();
}

renderSpriteBrowser();
rebuildHierarchy();
rebuildInspector();
selectEntity(world.getEntities()[0]?.id ?? null);
initMonaco();
pushSceneHistory();
animate();
