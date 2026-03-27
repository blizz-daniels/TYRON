import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { Engine, syncWorldToScene } from "./src/engine/engine.js";
import { World } from "./src/engine/world.js";
import {
  createTransform,
  createMesh,
  createCollider,
  createHitBox,
  createHurtBox,
  createPlayer,
  createCamera,
  createGltf,
  createScript,
  createSpriteCharacter,
  ComponentType,
} from "./src/engine/components.js";
import { serializeScene, deserializeScene } from "./src/engine/scene-io.js";

const canvas = document.getElementById("viewport");
const hierarchyList = document.getElementById("hierarchyList");
const inspectorFields = document.getElementById("inspectorFields");
const status = document.getElementById("viewportStatus");
const addEntityButton = document.getElementById("addEntity");
const importFolderButton = document.getElementById("importFolderBtn");
const importFolderInput = document.getElementById("importFolder");
const importSpriteFolderButton = document.getElementById("importSpriteFolderBtn");
const importSpriteFolderInput = document.getElementById("importSpriteFolder");
const playButton = document.getElementById("playBtn");
const stopButton = document.getElementById("stopBtn");
const createSpriteButton = document.getElementById("createSpriteBtn");
const undoSceneButton = document.getElementById("undoScene");
const redoSceneButton = document.getElementById("redoScene");
const uploadedList = document.getElementById("uploadedList");
const spriteBrowser = document.getElementById("spriteBrowser");
const triggerPresetButtons = document.getElementById("triggerPresetButtons");
const triggerPresetHint = document.getElementById("triggerPresetHint");
const importedAssets = [];
const worldAssets = [];
const uploadedAssets = [];
const spriteCharacters = [];
let renderAssets = () => {};
const SCRIPT_TEMPLATE = `// Attach scripts to entities.
// Try helpers like:
// api.onTriggerEnter((self, other) => { ... })
// api.launchPlayer(8)
// api.setPlayerControlEnabled(false)
function update(entity, dt, world, THREE, engine, api) {
  // TODO: player movement
}
`;

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

const engine = new Engine({ canvas });
let world = new World();
engine.setWorld(world);

const grid = new THREE.GridHelper(20, 20, 0x22304a, 0x121b2b);
engine.scene.add(grid);
engine.scene.add(new THREE.AxesHelper(2));

const ground = world.createEntity("Ground");
world.addComponent(ground, createTransform({ position: [0, -0.5, 0], scale: [10, 0.2, 10] }));
world.addComponent(ground, createMesh({ material: { color: "#1e2a3c" } }));
world.addComponent(
  ground,
  createCollider({ shape: "box", size: [10, 0.2, 10], body: "static" })
);

const player = world.createEntity("Player");
world.addComponent(player, createTransform({ position: [0, 1, 0] }));
world.addComponent(player, createMesh({ material: { color: "#ff6f91" } }));
world.addComponent(
  player,
  createCollider({ shape: "box", size: [1, 1, 1], body: "dynamic" })
);
world.addComponent(player, createPlayer());

const prop = world.createEntity("Tower");
world.addComponent(prop, createTransform({ position: [3, 1.2, -2], scale: [1, 2.4, 1] }));
world.addComponent(prop, createMesh({ geometry: "box", material: { color: "#7fd9ff" } }));

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

const meshCache = engine.cache;
const colliderHelpers = new Map();
const hitBoxHelpers = new Map();
const hurtBoxHelpers = new Map();
let selectedEntityId = null;
let isTransformingSelectedEntity = false;
let selectedSpriteCharacterName = null;
let selectedSpriteAnimationName = null;
let runtimeWindow = null;
let codeEditor = null;
let suppressCodeEditorSync = false;
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
  const hurtHelper = hurtBoxHelpers.get(entityId);
  if (hurtHelper) {
    engine.scene.remove(hurtHelper);
    hurtBoxHelpers.delete(entityId);
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
    const data = serializeScene(world);
    localStorage.setItem("tyronScene", JSON.stringify(data));
  } catch (error) {
    sceneSaved = false;
    console.warn("Failed to persist scene for runtime preview:", error);
  }

  if (runtimeWindow && !runtimeWindow.closed) {
    runtimeWindow.focus();
    runtimeWindow.location.reload();
  } else {
    runtimeWindow = window.open("runtime.html", "_blank");
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

const addHitBoxToEntity = (entity) => {
  if (!entity || entity.components.has(ComponentType.HitBox)) return;
  pushSceneHistory();
  world.addComponent(entity, createHitBox());
  status.textContent = `Added hit box to ${entity.name}.`;
  rebuildInspector();
};

const addHurtBoxToEntity = (entity) => {
  if (!entity || entity.components.has(ComponentType.HurtBox)) return;
  pushSceneHistory();
  world.addComponent(entity, createHurtBox());
  status.textContent = `Added hurt box to ${entity.name}.`;
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

const addCameraToEntity = (entity) => {
  if (!entity || entity.components.has(ComponentType.Camera)) return;
  pushSceneHistory();
  world.addComponent(entity, createCamera());
  status.textContent = `Added camera to ${entity.name}.`;
  rebuildInspector();
};

const makeEntityPlayablePlayer = (entity) => {
  if (!entity) return;
  pushSceneHistory();
  world.getEntities().forEach((otherEntity) => {
    if (otherEntity.id !== entity.id) {
      otherEntity.components.delete(ComponentType.Player);
    }
  });

  if (!entity.components.has(ComponentType.Player)) {
    world.addComponent(entity, createPlayer());
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

const createDefaultSpriteBox = () => ({
  size: [1, 1, 0.2],
  offset: [0, 0, 0],
});

const normalizeKeyBinding = (key) =>
  typeof key === "string" ? key.trim().toLowerCase() : "";

const cloneSpriteBox = (box) => ({
  size: Array.isArray(box?.size) ? [...box.size] : [1, 1, 0.2],
  offset: Array.isArray(box?.offset) ? [...box.offset] : [0, 0, 0],
});

const cloneSpriteAnimation = (animation) => ({
  name: animation?.name ?? "idle",
  clips: Array.isArray(animation?.clips)
    ? animation.clips.map((clip) => ({
        name: clip.name ?? "clip",
        url: clip.url ?? "",
        size: Number.isFinite(clip.size) ? clip.size : 0,
        relativePath: clip.relativePath ?? "",
      }))
    : [],
  collision: cloneSpriteBox(animation?.collision),
  hitBox: cloneSpriteBox(animation?.hitBox),
  hurtBox: cloneSpriteBox(animation?.hurtBox),
  dedicatedKey: normalizeKeyBinding(animation?.dedicatedKey),
});

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
    animation.clips.forEach((clip) => {
      URL.revokeObjectURL(clip.url);
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
    animation.collision = cloneSpriteBox(existingAnimation.collision);
    animation.hitBox = cloneSpriteBox(existingAnimation.hitBox);
    animation.hurtBox = cloneSpriteBox(existingAnimation.hurtBox);
    animation.dedicatedKey = normalizeKeyBinding(existingAnimation.dedicatedKey);
  });

  revokeSpriteCharacterUrls(existingCharacter);
  spriteCharacters.splice(existingIndex, 1, nextCharacter);
  spriteCharacters.sort((a, b) => sortByNaturalName(a.name, b.name));
};

const parseSpriteFolderPath = (rawPath) => {
  const normalizedPath = (rawPath || "").replace(/\\/g, "/");
  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.length < 3) return null;

  return {
    characterName: segments[segments.length - 3],
    animationName: segments[segments.length - 2],
    clipName: segments[segments.length - 1],
    relativePath: normalizedPath,
  };
};

const importSpriteEntries = (entries) => {
  if (!Array.isArray(entries) || !entries.length) return;

  const characters = new Map();
  let importedClipCount = 0;
  const clipPattern = /\.(mp4|webm)$/i;
  entries.forEach((entry) => {
    const file = entry?.file;
    if (!file || !clipPattern.test(file.name)) return;

    const parsed = parseSpriteFolderPath(entry.path || file.webkitRelativePath || file.name);
    if (!parsed) return;

    importedClipCount += 1;
    if (!characters.has(parsed.characterName)) {
      characters.set(parsed.characterName, {
        name: parsed.characterName,
        animations: new Map(),
      });
    }
    const character = characters.get(parsed.characterName);
    if (!character.animations.has(parsed.animationName)) {
      character.animations.set(parsed.animationName, {
        name: parsed.animationName,
        clips: [],
        collision: createDefaultSpriteBox(),
        hitBox: createDefaultSpriteBox(),
        hurtBox: createDefaultSpriteBox(),
        dedicatedKey: "",
      });
    }

    const animation = character.animations.get(parsed.animationName);
    animation.clips.push({
      name: parsed.clipName,
      url: URL.createObjectURL(file),
      size: file.size,
      relativePath: parsed.relativePath,
    });
  });

  if (!importedClipCount) {
    status.textContent =
      "No sprite clips found. Use /sprites/<character>/<animation>/<clip>.mp4 (or .webm).";
    return;
  }

  characters.forEach((character) => {
    const animations = Array.from(character.animations.values())
      .map((animation) => {
        animation.clips.sort((a, b) => sortByNaturalName(a.name, b.name));
        return animation;
      })
      .sort((a, b) => sortByNaturalName(a.name, b.name));

    upsertSpriteCharacter({
      name: character.name,
      animations,
    });
  });

  ensureSpriteSelection();
  renderSpriteBrowser();
  rebuildInspector();
  status.textContent = `Imported ${importedClipCount} sprite clip(s) across ${characters.size} character folder(s).`;
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
    })
  );
  selectedSpriteCharacterName = character.name;
  selectedSpriteAnimationName = idleAnimation;
  selectEntity(entity.id);
  renderSpriteBrowser();
  rebuildInspector();
  status.textContent = `Added sprite character ${character.name} to scene.`;
};

const getSelectedSpriteAnimationData = () => {
  const character = findSpriteCharacter(selectedSpriteCharacterName);
  if (!character) return { character: null, animation: null };
  const animation =
    character.animations.find((item) => item.name === selectedSpriteAnimationName) ?? null;
  return { character, animation };
};

const appendSpriteInspectorSection = () => {
  if (!inspectorFields) return;

  const section = document.createElement("div");
  section.className = "sprite-inspector";
  section.innerHTML = "<label>Sprite Animation Boxes</label>";

  const { character, animation } = getSelectedSpriteAnimationData();
  if (!character || !animation) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Select a sprite character and animation to edit boxes.";
    section.appendChild(empty);
    inspectorFields.appendChild(section);
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

  const clipCount = document.createElement("p");
  clipCount.className = "muted";
  clipCount.textContent = `${animation.clips.length} clip(s)`;
  section.appendChild(clipCount);

  const firstClip = animation.clips[0];
  if (firstClip) {
    const preview = document.createElement("div");
    preview.className = "sprite-preview";
    const video = document.createElement("video");
    video.className = "sprite-preview__video";
    video.src = firstClip.url;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    const clipName = document.createElement("span");
    clipName.textContent = firstClip.name;
    preview.append(video, clipName);
    section.appendChild(preview);
  }

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

  const ensureBoxShape = (box) => {
    if (!Array.isArray(box.size) || box.size.length !== 3) box.size = [1, 1, 0.2];
    if (!Array.isArray(box.offset) || box.offset.length !== 3) box.offset = [0, 0, 0];
  };

  const appendBoxEditor = (title, box) => {
    ensureBoxShape(box);
    const titleElement = document.createElement("label");
    titleElement.textContent = title;
    section.appendChild(titleElement);

    const size = buildVectorField("Size (x/y/z)", box.size, (index, value) => {
      box.size[index] = value;
    });
    const offset = buildVectorField("Offset (x/y/z)", box.offset, (index, value) => {
      box.offset[index] = value;
    });
    section.append(size.wrapper, offset.wrapper);
  };

  appendBoxEditor("Collision Box", animation.collision);
  appendBoxEditor("Hit Box", animation.hitBox);
  appendBoxEditor("Hurt Box", animation.hurtBox);
  inspectorFields.appendChild(section);
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
    meta.textContent = `${character.animations.length} animation(s)`;
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
        animationButton.textContent = `${animation.name} (${animation.clips.length})`;
        animationButton.addEventListener("click", (event) => {
          event.stopPropagation();
          selectedSpriteCharacterName = character.name;
          selectedSpriteAnimationName = animation.name;
          renderSpriteBrowser();
          rebuildInspector();
          status.textContent = `Editing ${character.name}/${animation.name} boxes.`;
        });
        animationList.appendChild(animationButton);
      });
      card.appendChild(animationList);
    }

    spriteBrowser.appendChild(card);
  });
};

const rebuildInspector = () => {
  if (!inspectorFields) return;
  inspectorFields.innerHTML = "";
  const entity = world.getEntities().find((item) => item.id === selectedEntityId);
  if (!entity) {
    inspectorFields.innerHTML = '<p class="muted">Select an entity to edit its components.</p>';
    appendSpriteInspectorSection();
    renderTriggerPresets();
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
  if (!entity.components.has(ComponentType.HitBox)) {
    const addHitBtn = document.createElement("button");
    addHitBtn.className = "btn btn--ghost btn--small";
    addHitBtn.textContent = "Add Hit Box";
    addHitBtn.addEventListener("click", () => addHitBoxToEntity(entity));
    addRow.appendChild(addHitBtn);
    hasAddButtons = true;
  }
  if (!entity.components.has(ComponentType.HurtBox)) {
    const addHurtBtn = document.createElement("button");
    addHurtBtn.className = "btn btn--ghost btn--small";
    addHurtBtn.textContent = "Add Hurt Box";
    addHurtBtn.addEventListener("click", () => addHurtBoxToEntity(entity));
    addRow.appendChild(addHurtBtn);
    hasAddButtons = true;
  }
  if (!entity.components.has(ComponentType.Camera)) {
    const addCameraBtn = document.createElement("button");
    addCameraBtn.className = "btn btn--ghost btn--small";
    addCameraBtn.textContent = "Add Camera";
    addCameraBtn.addEventListener("click", () => addCameraToEntity(entity));
    addRow.appendChild(addCameraBtn);
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
    const size = buildVectorField("Size", hitBox.size, (index, value) => {
      hitBox.size[index] = value;
    });
    const offset = buildVectorField("Offset", hitBox.offset, (index, value) => {
      hitBox.offset[index] = value;
    });
    section.append(header, size.wrapper, offset.wrapper);
    inspectorFields.appendChild(section);
  }

  const hurtBox = entity.components.get(ComponentType.HurtBox);
  if (hurtBox) {
    const section = document.createElement("div");
    const header = document.createElement("div");
    header.className = "row";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    const label = document.createElement("label");
    label.textContent = "Hurt Box";
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--ghost btn--small";
    deleteBtn.textContent = "Delete Hurt Box";
    deleteBtn.addEventListener("click", () =>
      removeComponentFromEntity(
        entity,
        ComponentType.HurtBox,
        `Removed hurt box from ${entity.name}.`
      )
    );
    header.append(label, deleteBtn);
    if (!Array.isArray(hurtBox.offset)) {
      hurtBox.offset = [0, 0, 0];
    }
    const size = buildVectorField("Size", hurtBox.size, (index, value) => {
      hurtBox.size[index] = value;
    });
    const offset = buildVectorField("Offset", hurtBox.offset, (index, value) => {
      hurtBox.offset[index] = value;
    });
    section.append(header, size.wrapper, offset.wrapper);
    inspectorFields.appendChild(section);
  }

  const camera = entity.components.get(ComponentType.Camera);
  if (camera) {
    const section = document.createElement("div");
    section.innerHTML = "<label>Camera</label>";
    const fovField = buildVectorField("Fov / Near / Far", [camera.fov, camera.near, camera.far], (index, value) => {
      if (index === 0) camera.fov = value;
      if (index === 1) camera.near = value;
      if (index === 2) camera.far = value;
    });
    if (!Array.isArray(camera.followOffset)) {
      camera.followOffset = [0, 2, 5];
    }
    const followToggle = document.createElement("label");
    followToggle.style.display = "flex";
    followToggle.style.alignItems = "center";
    followToggle.style.gap = "8px";
    followToggle.style.textTransform = "none";
    followToggle.style.letterSpacing = "0.02em";
    const followInput = document.createElement("input");
    followInput.type = "checkbox";
    followInput.checked = Boolean(camera.lockToPlayer);
    followInput.addEventListener("change", () => {
      camera.lockToPlayer = followInput.checked;
    });
    const followText = document.createElement("span");
    followText.textContent = "Lock camera to player";
    followToggle.append(followInput, followText);

    const offsetField = buildVectorField(
      "Follow Offset",
      camera.followOffset,
      (index, value) => {
        camera.followOffset[index] = value;
      }
    );

    section.append(fovField.wrapper, followToggle, offsetField.wrapper);
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

  const spriteCharacter = entity.components.get(ComponentType.SpriteCharacter);
  if (spriteCharacter) {
    const section = document.createElement("div");
    section.innerHTML = "<label>Sprite Character</label>";

    if (!Array.isArray(spriteCharacter.animations)) {
      spriteCharacter.animations = [];
    }
    if (!spriteCharacter.defaultAnimation) {
      spriteCharacter.defaultAnimation = pickIdleAnimationName(spriteCharacter.animations);
    }
    if (!spriteCharacter.activeAnimation) {
      spriteCharacter.activeAnimation = spriteCharacter.defaultAnimation;
    }

    const nameInfo = document.createElement("p");
    nameInfo.className = "muted";
    nameInfo.textContent = `Character: ${spriteCharacter.characterName || entity.name}`;
    section.appendChild(nameInfo);

    const buildAnimationSelect = (title, selectedValue, onChange) => {
      const row = document.createElement("div");
      row.className = "row";
      const label = document.createElement("label");
      label.textContent = title;
      const select = document.createElement("select");
      spriteCharacter.animations.forEach((animation) => {
        const option = document.createElement("option");
        option.value = animation.name;
        option.textContent = animation.name;
        if (animation.name === selectedValue) {
          option.selected = true;
        }
        select.appendChild(option);
      });
      select.addEventListener("change", () => {
        pushSceneHistory();
        onChange(select.value);
      });
      row.append(label, select);
      return row;
    };

    if (spriteCharacter.animations.length) {
      const defaultSelect = buildAnimationSelect(
        "Default Animation",
        spriteCharacter.defaultAnimation,
        (value) => {
          spriteCharacter.defaultAnimation = value;
        }
      );
      const activeSelect = buildAnimationSelect(
        "Active Animation",
        spriteCharacter.activeAnimation,
        (value) => {
          spriteCharacter.activeAnimation = value;
        }
      );
      section.append(defaultSelect, activeSelect);

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
    }

    inspectorFields.appendChild(section);
  }

  appendSpriteInspectorSection();
  renderTriggerPresets();
};

const selectEntity = (entityId) => {
  if (!sceneHistory.isRestoring && selectedEntityId && selectedEntityId !== entityId) {
    commitSelectedEntityTransform();
  }
  selectedEntityId = entityId;
  rebuildHierarchy();
  rebuildInspector();
  syncCodeEditorToSelection();
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
  hurtBoxHelpers.forEach((helper) => engine.scene.remove(helper));
  hurtBoxHelpers.clear();
  const first = world.getEntities()[0];
  const nextSelection = selectionId ?? (first ? first.id : null);
  selectEntity(nextSelection);
};

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

const saveButton = document.getElementById("saveScene");
const loadButton = document.getElementById("loadScene");

if (saveButton) {
  saveButton.addEventListener("click", () => {
    const data = serializeScene(world);
    localStorage.setItem("tyronScene", JSON.stringify(data));
    status.textContent = "Scene saved to localStorage.";
  });
}

if (loadButton) {
  loadButton.addEventListener("click", () => {
    const raw = localStorage.getItem("tyronScene");
    if (!raw) return;
    pushSceneHistory();
    const data = JSON.parse(raw);
    const loaded = deserializeScene(data);
    setWorld(loaded);
    status.textContent = "Scene loaded.";
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

if (createSpriteButton) {
  createSpriteButton.addEventListener("click", () => {
    window.open("sprite-creator.html", "_blank");
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

  importSpriteFolderInput.addEventListener("change", (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const entries = files.map((file) => ({
      file,
      path: file.webkitRelativePath || file.name,
    }));
    importSpriteEntries(entries);
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
      importSpriteEntries(entries);
      return;
    }

    const collected = await Promise.all(
      rootEntries.map((entry) => collectDroppedSpriteEntries(entry))
    );
    importSpriteEntries(collected.flat());
  });
}

if (addEntityButton) {
  addEntityButton.addEventListener("click", () => {
    createEntity("New Entity");
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

    const hurtBox = entity.components.get(ComponentType.HurtBox);
    if (hurtBox) {
      if (!Array.isArray(hurtBox.offset)) {
        hurtBox.offset = [0, 0, 0];
      }
      const helper = boxHelperFor(entity, hurtBoxHelpers, 0x4dd0ff);
      const size = new THREE.Vector3(...hurtBox.size).multiply(new THREE.Vector3(...transform.scale));
      const center = new THREE.Vector3(
        transform.position[0] + hurtBox.offset[0],
        transform.position[1] + hurtBox.offset[1],
        transform.position[2] + hurtBox.offset[2]
      );
      const min = center.clone().addScaledVector(size, -0.5);
      const max = center.clone().addScaledVector(size, 0.5);
      helper.box.set(min, max);
    }
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
    });
  } catch (error) {
    container.textContent = "Monaco failed to load. Check network or host it locally.";
  }
};

const animate = () => {
  syncWorldToScene(
    engine.scene,
    engine.world,
    engine.cache,
    engine.gltfLoader,
    engine.gltfLoading,
    {
      skipTransformIds:
        isTransformingSelectedEntity && selectedEntityId ? [selectedEntityId] : [],
    }
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
renderSpriteBrowser();
rebuildHierarchy();
rebuildInspector();
selectEntity(player.id);
initMonaco();
pushSceneHistory();
animate();
