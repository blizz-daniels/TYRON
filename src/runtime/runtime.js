import * as THREE from "three";
import { Engine } from "../engine/engine.js";
import { World } from "../engine/world.js";
import {
  createTransform,
  createMesh,
  createCollider,
  createHealth,
  createHitBox,
  createPlayer,
  ComponentType,
} from "../engine/components.js";
import {
  SpriteAnimator,
  normalizeSpriteKey as normalizeSpriteAnimationKey,
  resolveSpriteColliderForFrame,
  resolveSpriteCombatBoxForAnimation,
} from "../engine/sprite-animation.js";
import { deserializeScene, serializeScene } from "../engine/scene-io.js";
import {
  PROJECT_STORAGE_KEYS,
  getActiveScene,
  getLevelById,
  getSceneById,
  getStartingLevel,
  loadLegacySceneLike,
  loadProjectLike,
  normalizeProject,
} from "../engine/project-io.js";
import { PhysicsSystem } from "../engine/physics.js";

const canvas = document.getElementById("runtime");
const runtimeStatus = document.getElementById("runtimeStatus");
const runtimeSceneLabel = document.getElementById("runtimeSceneLabel");
const runtimeSceneBanner = document.getElementById("runtimeSceneBanner");
const runtimeObjectiveText = document.getElementById("runtimeObjectiveText");
const runtimeMinimap = document.getElementById("runtimeMinimap");
const runtimePauseOverlay = document.getElementById("runtimePauseOverlay");
const runtimePauseTitle = document.getElementById("runtimePauseTitle");
const runtimePauseDescription = document.getElementById("runtimePauseDescription");
const runtimeResumeButton = document.getElementById("runtimeResumeButton");
const runtimeRestartButton = document.getElementById("runtimeRestartButton");
const runtimeStartScreen = document.getElementById("runtimeStartScreen");
const runtimeStartButton = document.getElementById("runtimeStartButton");
const runtimeContinueButton = document.getElementById("runtimeContinueButton");
const runtimeMenuBurgerButton = document.getElementById("runtimeMenuBurgerButton");
const runtimeMenuTray = document.getElementById("runtimeMenuTray");
const runtimeMenuHomeButton = document.getElementById("runtimeMenuHomeButton");
const runtimeMenuSettingsButton = document.getElementById("runtimeMenuSettingsButton");
const runtimeMenuCommandsButton = document.getElementById("runtimeMenuCommandsButton");
const runtimeSettingsBackButton = document.getElementById("runtimeSettingsBackButton");
const runtimeCommandsBackButton = document.getElementById("runtimeCommandsBackButton");
const runtimeMenuShell = document.getElementById("runtimeMenuShell");
const runtimeHomePanel = document.getElementById("runtimeHomePanel");
const runtimeMenuTitle = document.getElementById("runtimeMenuTitle");
const runtimeMenuLead = document.getElementById("runtimeMenuLead");
const runtimeMenuSessionText = document.getElementById("runtimeMenuSessionText");
const runtimeSettingsPanel = document.getElementById("runtimeSettingsPanel");
const runtimeCommandsPanel = document.getElementById("runtimeCommandsPanel");
const runtimeCameraSpeed = document.getElementById("runtimeCameraSpeed");
const runtimeSubtitlesToggle = document.getElementById("runtimeSubtitlesToggle");
const runtimeTouchToggle = document.getElementById("runtimeTouchToggle");
const runtimeHealthText = document.getElementById("runtimeHealthText");
const runtimeHealthFill = document.getElementById("runtimeHealthFill");
const loadButton = document.getElementById("loadScene");
const cameraSelect = document.getElementById("cameraSelect");
const controls = document.querySelector(".controls");
const devTools = document.querySelector(".runtime__devtools");
const runtimeMode = new URL(window.location.href).searchParams.get("mode") === "preview"
  ? "preview"
  : "client";
const runtimeEntryMode = new URL(window.location.href).searchParams.get("entry") === "continue"
  ? "continue"
  : "start";
const CAMERA_SELECTION_STORAGE_KEY = "tyronRuntimeCameraId";
const DRAFT_PROJECT_STORAGE_KEY = PROJECT_STORAGE_KEYS.draft;
const PUBLISHED_PROJECT_STORAGE_KEY = PROJECT_STORAGE_KEYS.published;
const PLAYER_PROGRESS_STORAGE_KEY = "tyronPlayerProgress";
const PLAYER_SESSION_STORAGE_KEY = "tyronPlayerSession";
const PLAYER_PREFERENCES_STORAGE_KEY = "tyronPlayerPreferences";
const PLAYER_SESSION_AUTOSAVE_MS = 3000;

document.body.dataset.runtimeMode = runtimeMode;

if (canvas) {
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Tyron runtime viewport");
}

const setRuntimeStatus = (message) => {
  if (runtimeStatus) {
    runtimeStatus.textContent = message;
  }
};

const setRuntimeSceneLabel = (message) => {
  if (runtimeSceneLabel) {
    runtimeSceneLabel.textContent = message;
  }
};

const syncMenuState = () => {
  if (runtimeStartScreen) {
    runtimeStartScreen.classList.toggle("runtime__menu-hidden", !runtimeSessionState.menuVisible);
    runtimeStartScreen.setAttribute("aria-hidden", runtimeSessionState.menuVisible ? "false" : "true");
  }
  if (runtimeMenuShell) {
    runtimeMenuShell.dataset.view = runtimeSessionState.menuVisible ? runtimeSessionState.menuView : "home";
  }
  const isHome = runtimeSessionState.menuVisible && runtimeSessionState.menuView === "home";
  const isSettings = runtimeSessionState.menuVisible && runtimeSessionState.menuView === "settings";
  const isCommands = runtimeSessionState.menuVisible && runtimeSessionState.menuView === "commands";
  const showTray = runtimeSessionState.menuBarOpen;
  if (runtimeMenuTray) {
    runtimeMenuTray.classList.toggle("runtime__menu-hidden", !showTray);
    runtimeMenuTray.setAttribute("aria-hidden", showTray ? "false" : "true");
  }
  if (runtimeMenuBurgerButton) {
    runtimeMenuBurgerButton.setAttribute("aria-expanded", showTray ? "true" : "false");
  }
  if (runtimeHomePanel) {
    runtimeHomePanel.classList.toggle("runtime__menu-hidden", !isHome);
    runtimeHomePanel.setAttribute("aria-hidden", isHome ? "false" : "true");
  }
  if (runtimeSettingsPanel) {
    runtimeSettingsPanel.classList.toggle("runtime__menu-hidden", !isSettings);
    runtimeSettingsPanel.setAttribute("aria-hidden", isSettings ? "false" : "true");
  }
  if (runtimeCommandsPanel) {
    runtimeCommandsPanel.classList.toggle("runtime__menu-hidden", !isCommands);
    runtimeCommandsPanel.setAttribute("aria-hidden", isCommands ? "false" : "true");
  }
};

const setMenuView = (view = "home") => {
  runtimeSessionState.menuView = view;
  syncMenuState();
  updateMenuCopy();
};

const toggleMenuTray = () => {
  runtimeSessionState.menuBarOpen = !runtimeSessionState.menuBarOpen;
  syncMenuState();
};

const loadPlayerPreferences = () => {
  try {
    const raw = localStorage.getItem(PLAYER_PREFERENCES_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Number.isFinite(parsed.cameraSpeed)) {
      runtimePreferences.cameraSpeed = Math.min(Math.max(parsed.cameraSpeed, 0.5), 2.5);
    }
    if (typeof parsed.subtitles === "boolean") {
      runtimePreferences.subtitles = parsed.subtitles;
    }
    if (typeof parsed.touchControls === "boolean") {
      runtimePreferences.touchControls = parsed.touchControls;
    }
  } catch (error) {
    console.warn("Failed to load runtime preferences:", error);
  }
};

const savePlayerPreferences = () => {
  localStorage.setItem(PLAYER_PREFERENCES_STORAGE_KEY, JSON.stringify(runtimePreferences));
};

const loadPlayerSession = () => {
  try {
    const raw = localStorage.getItem(PLAYER_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.warn("Failed to read player session:", error);
    return null;
  }
};

const refreshContinueButtonState = () => {
  if (!runtimeContinueButton) return;
  const raw = localStorage.getItem(PLAYER_PROGRESS_STORAGE_KEY);
  runtimeContinueButton.disabled = !raw;
  runtimeContinueButton.textContent = raw ? "Continue" : "Continue";
};

const updateMenuCopy = () => {
  const project = normalizeProject(runtimeSessionState.project ?? {});
  const scene = getSceneById(project, runtimeSessionState.activeSceneId) ?? getActiveScene(project);
  const level = getLevelById(project, runtimeSessionState.activeLevelId) ?? getStartingLevel(project);
  if (runtimeMenuTitle) {
    runtimeMenuTitle.textContent = scene?.name ? `Enter ${scene.name}` : "Enter the world";
  }
  if (runtimeMenuLead) {
    runtimeMenuLead.textContent =
      runtimeMode === "preview"
        ? "Preview your draft build before publishing. When you are ready, Start Game enters the current campaign."
        : "Load the published build and step into the game. Start Game begins the current campaign, Continue resumes the last session, and the menu bar opens settings or commands.";
  }
  if (runtimeMenuSessionText) {
    runtimeMenuSessionText.textContent = scene
      ? `${project.name || "Tyron"} - ${scene.name || "Scene"}${level?.name ? ` / ${level.name}` : ""}`
      : runtimeMode === "preview"
        ? "No draft build loaded yet."
        : "No published build loaded yet.";
  }
  refreshContinueButtonState();
};

const applyRuntimePreferences = () => {
  ORBIT_SPEED = 1.7 * runtimePreferences.cameraSpeed;
  if (runtimeSubtitlesToggle) {
    runtimeSubtitlesToggle.checked = runtimePreferences.subtitles;
  }
  if (runtimeTouchToggle) {
    runtimeTouchToggle.checked = runtimePreferences.touchControls;
  }
  if (runtimeCameraSpeed) {
    runtimeCameraSpeed.value = String(runtimePreferences.cameraSpeed);
  }
  const touchVisible = runtimePreferences.touchControls && runtimeHudState.mobileHud.enabled;
  if (controls) {
    controls.style.display = touchVisible ? "grid" : "none";
  }
  if (runtimeObjectiveText) {
    runtimeObjectiveText.style.display =
      runtimeHudState.objectiveText.visible && runtimePreferences.subtitles ? "block" : "none";
  }
};

const openStartMenu = (view = "home") => {
  runtimeSessionState.menuVisible = true;
  runtimeSessionState.menuView = view;
  runtimeSessionState.started = false;
  setRuntimePaused(true, view === "home" ? "Press Start Game" : "Menu open");
  syncMenuState();
  updateMenuCopy();
  if (runtimeStartScreen) {
    runtimeStartScreen.classList.remove("runtime__menu-hidden");
  }
};

const closeStartMenu = () => {
  runtimeSessionState.menuVisible = false;
  runtimeSessionState.menuView = "home";
  runtimeSessionState.menuBarOpen = false;
  runtimeSessionState.started = true;
  syncMenuState();
  setRuntimePaused(false);
  if (canvas) {
    canvas.focus({ preventScroll: true });
  }
};

const toggleMenuPanel = (panel) => {
  if (!panel) return;
  const nextView =
    panel === runtimeSettingsPanel
      ? runtimeSessionState.menuView === "settings"
        ? "home"
        : "settings"
      : panel === runtimeCommandsPanel
        ? runtimeSessionState.menuView === "commands"
          ? "home"
          : "commands"
        : "home";
  setMenuView(nextView);
};

const setRuntimePauseOverlay = (visible, title = "Paused", description = "Press Resume to keep playing.") => {
  if (runtimePauseOverlay) {
    runtimePauseOverlay.classList.toggle("active", visible);
    runtimePauseOverlay.setAttribute("aria-hidden", visible ? "false" : "true");
  }
  if (runtimePauseTitle) {
    runtimePauseTitle.textContent = title;
  }
  if (runtimePauseDescription) {
    runtimePauseDescription.textContent = description;
  }
};

const setHudSlotVisibility = (element, visible, display = "block") => {
  if (!element) return;
  element.style.display = visible ? display : "none";
};

const updateHudFromProject = (project = runtimeSessionState.project) => {
  if (!project) {
    runtimeHudState.healthBar = { visible: true, position: "top-left" };
    runtimeHudState.minimap = { visible: false, position: "top-right" };
    runtimeHudState.objectiveText = { visible: false, text: "" };
    runtimeHudState.sceneTitle = { visible: false, banner: false };
    runtimeHudState.pauseMenu = { enabled: true, showQuit: true };
    runtimeHudState.mobileHud = { enabled: true, compact: true };

    setHudSlotVisibility(runtimeHealthText?.parentElement?.parentElement, true);
    if (runtimeObjectiveText) {
      runtimeObjectiveText.textContent = "";
      runtimeObjectiveText.style.display = "none";
    }
    if (runtimeSceneBanner) {
      runtimeSceneBanner.textContent = "";
      runtimeSceneBanner.style.display = "none";
    }
    if (runtimeMinimap) {
      runtimeMinimap.style.display = "none";
    }
    if (controls) {
      controls.style.display = runtimePreferences.touchControls ? "grid" : "none";
    }
    applyRuntimePreferences();
    return;
  }

  const normalized = normalizeProject(project ?? runtimeSessionState.project ?? {});
  const level =
    getLevelById(normalized, runtimeSessionState.activeLevelId) ??
    getStartingLevel(normalized);
  const scene = getSceneById(normalized, runtimeSessionState.activeSceneId) ?? getActiveScene(normalized);

  runtimeHudState.healthBar = {
    ...runtimeHudState.healthBar,
    ...(normalized.hud?.healthBar ?? {}),
  };
  runtimeHudState.minimap = {
    ...runtimeHudState.minimap,
    ...(normalized.hud?.minimap ?? {}),
  };
  runtimeHudState.objectiveText = {
    ...runtimeHudState.objectiveText,
    ...(normalized.hud?.objectiveText ?? {}),
    text:
      normalized.hud?.objectiveText?.text ||
      level?.objectiveText ||
      runtimeHudState.objectiveText.text,
  };
  runtimeHudState.sceneTitle = {
    ...runtimeHudState.sceneTitle,
    ...(normalized.hud?.sceneTitle ?? {}),
  };
  runtimeHudState.pauseMenu = {
    ...runtimeHudState.pauseMenu,
    ...(normalized.hud?.pauseMenu ?? {}),
  };
  runtimeHudState.mobileHud = {
    ...runtimeHudState.mobileHud,
    ...(normalized.hud?.mobileHud ?? {}),
  };

  const healthRow = runtimeHealthText?.parentElement;
  const healthTrack = runtimeHealthFill?.parentElement;
  setHudSlotVisibility(healthRow, runtimeHudState.healthBar.visible, "flex");
  setHudSlotVisibility(healthTrack, runtimeHudState.healthBar.visible, "block");
  if (healthRow) {
    healthRow.dataset.position = runtimeHudState.healthBar.position;
  }

  if (runtimeObjectiveText) {
    runtimeObjectiveText.textContent = runtimeHudState.objectiveText.visible
      ? runtimeHudState.objectiveText.text
      : "";
    runtimeObjectiveText.style.display =
      runtimeHudState.objectiveText.visible && runtimePreferences.subtitles ? "block" : "none";
  }

  if (runtimeSceneBanner) {
    runtimeSceneBanner.textContent = runtimeHudState.sceneTitle.banner
      ? scene?.name ?? level?.name ?? "Scene"
      : "";
    runtimeSceneBanner.style.display = runtimeHudState.sceneTitle.visible && runtimeHudState.sceneTitle.banner
      ? "block"
      : "none";
  }

  if (runtimeMinimap) {
    runtimeMinimap.style.display = runtimeHudState.minimap.visible ? "flex" : "none";
    runtimeMinimap.dataset.position = runtimeHudState.minimap.position;
    runtimeMinimap.style.top = runtimeHudState.minimap.position === "bottom-right" ? "auto" : "16px";
    runtimeMinimap.style.bottom = runtimeHudState.minimap.position === "bottom-right" ? "16px" : "auto";
  }

  if (controls) {
    controls.style.display =
      runtimeHudState.mobileHud.enabled && runtimePreferences.touchControls ? "grid" : "none";
  }
  if (devTools) {
    devTools.style.display = runtimeMode === "preview" ? "flex" : "none";
  }
  applyRuntimePreferences();
};

const refreshMinimapReadout = () => {
  if (!runtimeMinimap) return;
  if (!runtimeSessionState.project) {
    runtimeMinimap.innerHTML = "<strong>Minimap</strong><span>No published project</span>";
    return;
  }
  const level = getCurrentRuntimeLevel();
  const playerTransform = getTransformForEntity(playerEntity);
  const position = playerTransform?.position ?? [0, 0, 0];
  runtimeMinimap.innerHTML = `
    <strong>Minimap</strong>
    <span>${level?.name ?? "Level"}${playerEntity ? ` - ${Math.round(position[0])}, ${Math.round(position[2])}` : ""}</span>
    <span>${runtimeSessionState.paused ? "Paused" : "Live"}</span>
  `;
};

const setRuntimePaused = (paused, reason = "Paused") => {
  runtimeSessionState.paused = Boolean(paused);
  if (controls) {
    controls.style.pointerEvents = paused ? "none" : "auto";
  }
  if (runtimeSessionState.menuVisible) {
    setRuntimePauseOverlay(false);
  } else {
    setRuntimePauseOverlay(
      runtimeSessionState.paused,
      reason,
      runtimeHudState.pauseMenu.enabled
        ? "Press Resume to continue, or restart the current level."
        : "Gameplay is paused."
    );
  }
  if (runtimeSessionState.paused) {
    resetInputState();
  }
};

const restartCurrentLevel = () => {
  const level = getCurrentRuntimeLevel();
  if (level) {
    clearPlayerSession();
    loadProjectLevel(level.id, { announce: false });
  }
};

const engine = new Engine({ canvas });
let world = new World();
engine.setWorld(world);

const grid = new THREE.GridHelper(20, 20, 0x22304a, 0x121b2b);
engine.scene.add(grid);
engine.scene.add(new THREE.AxesHelper(2));

const ground = world.createEntity("Ground");
world.addComponent(
  ground,
  createTransform({ position: [0, -0.5, 0], scale: [10, 0.2, 10] })
);
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
world.addComponent(player, createHealth());

const physics = new PhysicsSystem();
const scriptRunners = new Map();
const inputState = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
};
const orbitState = {
  up: false,
  down: false,
  left: false,
  right: false,
  azimuth: Math.PI * 0.85,
  polar: 1.15,
  radius: 6.5,
  focusHeight: 1.2,
};
let ORBIT_SPEED = 1.7;
const ORBIT_POLAR_MIN = 0.4;
const ORBIT_POLAR_MAX = Math.PI - 0.4;
const ORBIT_RADIUS_MIN = 3;
const ORBIT_RADIUS_MAX = 16;
const JUMP_BUFFER_MS = 160;
const movementState = {
  jumpPrimed: false,
  jumpBufferUntil: 0,
};
const runtimeSessionState = {
  paused: false,
  project: null,
  activeSceneId: null,
  activeLevelId: null,
  completionSignal: null,
  started: runtimeMode !== "client",
  menuVisible: runtimeMode === "client",
  menuBarOpen: false,
  menuView: "home",
};
const runtimeHudState = {
  healthBar: { visible: true, position: "top-left" },
  minimap: { visible: false, position: "top-right" },
  objectiveText: { visible: true, text: "Reach the objective." },
  sceneTitle: { visible: true, banner: true },
  pauseMenu: { enabled: true, showQuit: true },
  mobileHud: { enabled: true, compact: true },
};
const runtimePreferences = {
  cameraSpeed: 1,
  subtitles: true,
  touchControls: true,
};
let lastPlayerSessionSaveAt = 0;

let playerEntity = null;
let activeCameraEntity = null;
let selectedCameraEntityId = null;
let activeCameraOrbitSignature = null;
let playerControlEnabled = true;
let triggerPairs = new Map();
let combatPairs = new Map();
let spriteHitReactionState = new Map();

const isEntityLike = (value) => Boolean(value && value.components instanceof Map);

const getComponentEntity = (target, fallback) =>
  isEntityLike(target) ? target : fallback;

const clampVector3 = (value, fallback = [0, 0, 0]) => {
  const source = Array.isArray(value) && value.length === 3 ? value : fallback;
  return [
    Number.isFinite(source[0]) ? source[0] : fallback[0],
    Number.isFinite(source[1]) ? source[1] : fallback[1],
    Number.isFinite(source[2]) ? source[2] : fallback[2],
  ];
};

const getTransformForEntity = (target) => {
  const entity = getComponentEntity(target, null);
  if (!entity) return null;
  return entity.components.get(ComponentType.Transform) ?? null;
};

const getColliderForEntity = (target) => {
  const entity = getComponentEntity(target, null);
  if (!entity) return null;
  return entity.components.get(ComponentType.Collider) ?? null;
};

const getHealthForEntity = (target) => {
  const entity = getComponentEntity(target, null);
  if (!entity) return null;
  return entity.components.get(ComponentType.Health) ?? null;
};

const normalizeHealthComponent = (target, { createIfMissing = false } = {}) => {
  const entity = getComponentEntity(target, null);
  if (!entity) return null;

  let health = entity.components.get(ComponentType.Health);
  if (!health && createIfMissing) {
    health = createHealth();
    world.addComponent(entity, health);
  }
  if (!health) return null;

  if (!Number.isFinite(health.maxHealth) || health.maxHealth <= 0) {
    health.maxHealth = 100;
  }
  if (!Number.isFinite(health.currentHealth)) {
    health.currentHealth = health.maxHealth;
  }
  health.currentHealth = Math.min(Math.max(health.currentHealth, 0), health.maxHealth);
  health.regenRate = Number.isFinite(health.regenRate) ? health.regenRate : 0;
  health.invulnerable = Boolean(health.invulnerable);
  health.dead = health.currentHealth <= 0;
  return health;
};

const setHealthValue = (target, nextValue, { createIfMissing = false } = {}) => {
  const health = normalizeHealthComponent(target, { createIfMissing });
  if (!health) return false;

  const parsedValue = Number.parseFloat(nextValue);
  const safeValue = Number.isFinite(parsedValue) ? parsedValue : health.currentHealth;
  health.currentHealth = Math.min(Math.max(safeValue, 0), health.maxHealth);
  health.dead = health.currentHealth <= 0;
  return true;
};

const applyDamageToEntity = (
  target,
  amount = 1,
  { createIfMissing = false, attacker = null } = {}
) => {
  const health = normalizeHealthComponent(target, { createIfMissing });
  if (!health || health.invulnerable || health.dead) return false;

  const parsedDamage = Number.parseFloat(amount);
  const damage = Math.max(Number.isFinite(parsedDamage) ? parsedDamage : 0, 0);
  health.currentHealth = Math.max(0, health.currentHealth - damage);
  health.dead = health.currentHealth <= 0;
  const entity = getComponentEntity(target, null);
  if (entity) {
    triggerSpriteHitReaction(entity);
    applyHitPhysicsReaction(entity, attacker);
  }
  return true;
};

const healEntity = (target, amount = 1, { createIfMissing = false } = {}) => {
  const health = normalizeHealthComponent(target, { createIfMissing });
  if (!health) return false;

  const parsedHeal = Number.parseFloat(amount);
  const healAmount = Math.max(Number.isFinite(parsedHeal) ? parsedHeal : 0, 0);
  health.currentHealth = Math.min(health.maxHealth, health.currentHealth + healAmount);
  health.dead = health.currentHealth <= 0;
  return true;
};

const updateHealthHud = () => {
  const health = normalizeHealthComponent(playerEntity, { createIfMissing: false });
  const max = Number.isFinite(health?.maxHealth) && health.maxHealth > 0 ? health.maxHealth : 0;
  const current = Number.isFinite(health?.currentHealth) ? health.currentHealth : 0;
  const ratio = max > 0 ? Math.min(Math.max(current / max, 0), 1) : 0;

  if (runtimeHealthText) {
    runtimeHealthText.textContent = max > 0 ? `${Math.round(current)} / ${Math.round(max)}` : "-- / --";
  }
  if (runtimeHealthFill) {
    runtimeHealthFill.style.width = `${ratio * 100}%`;
  }
};

const getSpriteHitReactionAnimationName = (sprite) => {
  if (!sprite || !Array.isArray(sprite.animations) || !sprite.animations.length) return "";

  const explicit = normalizeSpriteAnimationKey(sprite.hitReactionAnimation);
  if (explicit) {
    const explicitAnimation = sprite.animations.find(
      (animation) => normalizeSpriteAnimationKey(animation.name) === explicit
    );
    if (explicitAnimation) {
      return explicitAnimation.name;
    }
  }

  const priority = ["hit", "hurt", "damaged", "damage", "react"];
  const inferred = sprite.animations.find((animation) =>
    priority.includes((animation.name ?? "").toLowerCase())
  );
  return inferred?.name ?? "";
};

const restoreSpriteAnimationAfterHit = (entity, sprite) => {
  const state = spriteHitReactionState.get(entity.id);
  if (!state || state.reactionAnimation !== sprite.activeAnimation) return false;

  const previousAnimation = sprite.animations.find(
    (animation) => animation.name === state.previousAnimation
  );
  if (!previousAnimation) {
    spriteHitReactionState.delete(entity.id);
    return false;
  }

  sprite.activeAnimation = previousAnimation.name;
  sprite.activeFrameIndex = Math.min(
    Number.isFinite(state.previousFrameIndex) ? state.previousFrameIndex : 0,
    Math.max((previousAnimation.frames?.length ?? 1) - 1, 0)
  );
  sprite.playing = state.previousPlaying !== false;
  spriteHitReactionState.delete(entity.id);
  return true;
};

const triggerSpriteHitReaction = (entity) => {
  const sprite = entity?.components.get(ComponentType.SpriteCharacter);
  if (!sprite || !Array.isArray(sprite.animations) || !sprite.animations.length) return false;

  const reactionAnimationName = getSpriteHitReactionAnimationName(sprite);
  if (!reactionAnimationName) return false;

  const reactionAnimation = sprite.animations.find(
    (animation) => animation.name === reactionAnimationName
  );
  if (!reactionAnimation) return false;

  const currentAnimationName = sprite.activeAnimation || sprite.defaultAnimation || "";
  if (currentAnimationName === reactionAnimation.name) {
    sprite.activeFrameIndex = 0;
    sprite.playing = true;
    return true;
  }

  spriteHitReactionState.set(entity.id, {
    previousAnimation: currentAnimationName,
    previousFrameIndex: Number.isFinite(sprite.activeFrameIndex) ? sprite.activeFrameIndex : 0,
    previousPlaying: sprite.playing !== false,
    reactionAnimation: reactionAnimation.name,
  });

  sprite.activeAnimation = reactionAnimation.name;
  sprite.activeFrameIndex = 0;
  sprite.playing = true;
  return true;
};

const applyHitPhysicsReaction = (entity, attacker = null) => {
  if (!entity) return false;

  const sprite = entity.components.get(ComponentType.SpriteCharacter) ?? null;
  const config = getHitReactionPhysicsConfig(sprite);
  if (!config.enabled) return false;
  if (sprite && config.skipWhenAnimation && getSpriteHitReactionAnimationName(sprite)) {
    return false;
  }

  const collider = entity.components.get(ComponentType.Collider);
  const transform = entity.components.get(ComponentType.Transform);
  if (!collider || !transform) return false;

  const targetCenter = getEntityWorldCenter(entity);
  const attackerCenter = attacker ? getEntityWorldCenter(attacker) : null;
  const away = attackerCenter
    ? targetCenter.clone().sub(attackerCenter)
    : new THREE.Vector3(
        Math.sin(transform.rotation?.[1] ?? 0),
        0,
        Math.cos(transform.rotation?.[1] ?? 0)
      );

  if (away.lengthSq() === 0) {
    away.set(0, 0, 1);
  }
  away.normalize();

  const offset = config.offset;
  const displacement = new THREE.Vector3(
    away.x * offset[0],
    offset[1],
    away.z * offset[2]
  );

  if (collider.body === "dynamic") {
    const applied = physics.applyImpulse(entity.id, {
      x: displacement.x,
      y: displacement.y,
      z: displacement.z,
    });
    if (config.fallOver) {
      physics.applyAngularImpulse(entity.id, {
        x: -away.z * offset[2] * 1.6,
        y: 0,
        z: away.x * offset[0] * 1.6,
      });
    }
    return applied;
  }

  transform.position[0] += displacement.x;
  transform.position[1] += displacement.y;
  transform.position[2] += displacement.z;

  if (config.fallOver) {
    transform.rotation[2] += away.x >= 0 ? 0.8 : -0.8;
  }
  return true;
};

const setTransformVector = (targetOrVector, maybeVector, key, defaultTarget = null) => {
  const entity = isEntityLike(targetOrVector) ? targetOrVector : defaultTarget;
  const vector = isEntityLike(targetOrVector) ? maybeVector : targetOrVector;
  const transform = getTransformForEntity(entity);
  if (!transform) return false;
  transform[key] = clampVector3(vector, transform[key]);
  return true;
};

const createScriptApi = (entity) => {
  const triggerHandlers = {
    enter: [],
    stay: [],
    exit: [],
  };

  const resolveTarget = (target) => getComponentEntity(target, entity);

  const setColliderProperty = (targetOrValue, maybeValue, property) => {
    const target = isEntityLike(targetOrValue) ? targetOrValue : entity;
    const value = isEntityLike(targetOrValue) ? maybeValue : targetOrValue;
    const collider = getColliderForEntity(target);
    if (!collider) return false;
    collider[property] = value;
    return true;
  };

  const api = {
    onTriggerEnter: (handler) => {
      if (typeof handler === "function") triggerHandlers.enter.push(handler);
      return handler;
    },
    onTriggerStay: (handler) => {
      if (typeof handler === "function") triggerHandlers.stay.push(handler);
      return handler;
    },
    onTriggerExit: (handler) => {
      if (typeof handler === "function") triggerHandlers.exit.push(handler);
      return handler;
    },
    getTransform: (target = entity) => getTransformForEntity(resolveTarget(target)),
    getCollider: (target = entity) => getColliderForEntity(resolveTarget(target)),
    getHealth: (target = entity) => getHealthForEntity(resolveTarget(target)),
    setHealth: (targetOrValue, maybeValue) => {
      const target = isEntityLike(targetOrValue) ? targetOrValue : entity;
      const value = isEntityLike(targetOrValue) ? maybeValue : targetOrValue;
      return setHealthValue(target, value, { createIfMissing: true });
    },
    damage: (targetOrAmount, maybeAmount) => {
      const target = isEntityLike(targetOrAmount) ? targetOrAmount : entity;
      const amount = isEntityLike(targetOrAmount) ? maybeAmount : targetOrAmount;
      return applyDamageToEntity(target, amount, { createIfMissing: true });
    },
    heal: (targetOrAmount, maybeAmount) => {
      const target = isEntityLike(targetOrAmount) ? targetOrAmount : entity;
      const amount = isEntityLike(targetOrAmount) ? maybeAmount : targetOrAmount;
      return healEntity(target, amount, { createIfMissing: true });
    },
    setColliderBody: (targetOrBody, maybeBody) =>
      setColliderProperty(targetOrBody, maybeBody, "body"),
    setColliderTrigger: (targetOrTrigger, maybeTrigger) =>
      setColliderProperty(targetOrTrigger, maybeTrigger, "isTrigger"),
    setPosition: (targetOrPosition, maybePosition) =>
      setTransformVector(targetOrPosition, maybePosition, "position", entity),
    setRotation: (targetOrRotation, maybeRotation) =>
      setTransformVector(targetOrRotation, maybeRotation, "rotation", entity),
    setScale: (targetOrScale, maybeScale) =>
      setTransformVector(targetOrScale, maybeScale, "scale", entity),
    setPlayerControlEnabled: (enabled) => {
      playerControlEnabled = Boolean(enabled);
      if (!playerControlEnabled) {
        resetInputState();
        movementState.jumpPrimed = false;
        if (playerEntity) {
          physics.setLinearVelocity(playerEntity.id, { x: 0, y: 0, z: 0 });
        }
      }
      return playerControlEnabled;
    },
    launchPlayer: (jumpSpeed) => {
      if (!playerEntity) preparePlayer();
      if (!playerEntity) return false;
      const playerConfig = playerEntity.components.get(ComponentType.Player);
      const speed = Number.isFinite(jumpSpeed)
        ? jumpSpeed
        : Number.isFinite(playerConfig?.jumpSpeed)
          ? playerConfig.jumpSpeed
          : 5.5;
      const body = physics.getBody(playerEntity.id);
      const currentVelocity = body?.linvel?.() ?? { x: 0, y: 0, z: 0 };
      physics.setLinearVelocity(playerEntity.id, {
        x: currentVelocity.x ?? 0,
        y: Math.max(speed, 0),
        z: currentVelocity.z ?? 0,
      });
      movementState.jumpPrimed = true;
      movementState.jumpBufferUntil = 0;
      return true;
    },
    startCutscene: (label = "Cutscene") => {
      playerControlEnabled = false;
      resetInputState();
      movementState.jumpPrimed = false;
      if (playerEntity) {
        physics.setLinearVelocity(playerEntity.id, { x: 0, y: 0, z: 0 });
      }
      setRuntimeStatus(`Cutscene started: ${label}`);
      return true;
    },
    endCutscene: (label = "Cutscene") => {
      playerControlEnabled = true;
      setRuntimeStatus(`${label} ended.`);
      return true;
    },
    completeScene: (signal = "complete") => {
      runtimeSessionState.completionSignal = signal;
      setRuntimeStatus(`Scene completion requested: ${signal}.`);
      return true;
    },
    setObjectiveText: (text) => {
      if (runtimeHudState.objectiveText) {
        runtimeHudState.objectiveText.text = String(text ?? "");
        if (runtimeObjectiveText) {
          runtimeObjectiveText.textContent = runtimeHudState.objectiveText.text;
          runtimeObjectiveText.style.display = runtimeHudState.objectiveText.visible ? "block" : "none";
        }
      }
      return true;
    },
    setSceneTitle: (text) => {
      if (runtimeHudState.sceneTitle) {
        runtimeHudState.sceneTitle.banner = true;
        if (runtimeSessionState.project?.hud?.sceneTitle) {
          runtimeSessionState.project.hud.sceneTitle.banner = true;
        }
        setRuntimeSceneLabel(String(text ?? ""));
        if (runtimeSceneBanner) {
          runtimeSceneBanner.textContent = String(text ?? "");
          runtimeSceneBanner.style.display = "block";
        }
      }
      return true;
    },
    applyImpulse: (targetOrImpulse, maybeImpulse) => {
      const target = isEntityLike(targetOrImpulse) ? targetOrImpulse : entity;
      const impulse = isEntityLike(targetOrImpulse) ? maybeImpulse : targetOrImpulse;
      return physics.applyImpulse(target.id, impulse);
    },
    log: (...args) => console.log(`[Script:${entity.name}]`, ...args),
  };

  return { api, triggerHandlers };
};

const getColliderBounds = (entity) => {
  const collider = entity.components.get(ComponentType.Collider);
  if (!collider) return null;

  const size = clampVector3(collider.size, [1, 1, 1]);
  const offset = clampVector3(collider.offset, [0, 0, 0]);
  const body = physics.getBody(entity.id);
  const translation = body?.translation?.() ?? null;
  const transform = entity.components.get(ComponentType.Transform);
  const center = new THREE.Vector3(
    (translation?.x ?? transform?.position?.[0] ?? 0) + offset[0],
    (translation?.y ?? transform?.position?.[1] ?? 0) + offset[1],
    (translation?.z ?? transform?.position?.[2] ?? 0) + offset[2]
  );
  const halfExtents = collider.shape === "sphere"
    ? new THREE.Vector3(
        Math.max(size[0], size[1], size[2]) * 0.5,
        Math.max(size[0], size[1], size[2]) * 0.5,
        Math.max(size[0], size[1], size[2]) * 0.5
      )
    : new THREE.Vector3(size[0] * 0.5, size[1] * 0.5, size[2] * 0.5);

  return {
    min: center.clone().sub(halfExtents),
    max: center.clone().add(halfExtents),
  };
};

const getEntityWorldCenter = (entity) => {
  if (!entity) return new THREE.Vector3();
  const collider = entity.components.get(ComponentType.Collider);
  const body = physics.getBody(entity.id);
  const translation = body?.translation?.() ?? null;
  const transform = entity.components.get(ComponentType.Transform);
  const scale = transform ? clampVector3(transform.scale, [1, 1, 1]) : [1, 1, 1];
  const offset = collider ? clampVector3(collider.offset, [0, 0, 0]) : [0, 0, 0];

  return new THREE.Vector3(
    (translation?.x ?? transform?.position?.[0] ?? 0) + offset[0] * scale[0],
    (translation?.y ?? transform?.position?.[1] ?? 0) + offset[1] * scale[1],
    (translation?.z ?? transform?.position?.[2] ?? 0) + offset[2] * scale[2]
  );
};

const getCombatBounds = (entity, componentType) => {
  const box = entity.components.get(componentType);
  if (!box) return null;
  if (box.enabled === false) return null;

  const size = clampVector3(box.size, [1, 1, 1]);
  const offset = clampVector3(box.offset, [0, 0, 0]);
  const body = physics.getBody(entity.id);
  const translation = body?.translation?.() ?? null;
  const transform = entity.components.get(ComponentType.Transform);
  const center = new THREE.Vector3(
    (translation?.x ?? transform?.position?.[0] ?? 0) + offset[0],
    (translation?.y ?? transform?.position?.[1] ?? 0) + offset[1],
    (translation?.z ?? transform?.position?.[2] ?? 0) + offset[2]
  );
  const halfExtents = new THREE.Vector3(size[0] * 0.5, size[1] * 0.5, size[2] * 0.5);

  return {
    min: center.clone().sub(halfExtents),
    max: center.clone().add(halfExtents),
  };
};

const getHitReactionPhysicsConfig = (sprite) => ({
  enabled: sprite?.hitReactionPhysicsEnabled !== false,
  offset: clampVector3(sprite?.hitReactionPhysicsOffset, [0.45, 0.18, 0.45]),
  fallOver: Boolean(sprite?.hitReactionFallOver),
  skipWhenAnimation: sprite?.hitReactionSkipPhysicsWhenAnimation !== false,
});

const boxesOverlap = (a, b) =>
  a.min.x <= b.max.x &&
  a.max.x >= b.min.x &&
  a.min.y <= b.max.y &&
  a.max.y >= b.min.y &&
  a.min.z <= b.max.z &&
  a.max.z >= b.min.z;

const pairKeyFor = (a, b) => (a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`);

const dispatchTriggerEvent = (self, other, type) => {
  const runner = scriptRunners.get(self.id);
  if (!runner) return;

  const handlers = runner.triggerHandlers?.[type];
  if (!Array.isArray(handlers) || !handlers.length) return;

  const event = {
    type,
    self,
    other,
    selfCollider: self.components.get(ComponentType.Collider) ?? null,
    otherCollider: other.components.get(ComponentType.Collider) ?? null,
  };

  handlers.forEach((handler) => {
    try {
      handler(self, other, event, runner.api);
    } catch (error) {
      console.warn(`Trigger handler error on ${self.name}:`, error);
    }
  });
};

const processTriggerEvents = () => {
  const entities = world.getEntities();
  const currentPairs = new Map();

  for (let i = 0; i < entities.length; i += 1) {
    const a = entities[i];
    const colliderA = a.components.get(ComponentType.Collider);
    if (!colliderA) continue;
    const boundsA = getColliderBounds(a);
    if (!boundsA) continue;

    for (let j = i + 1; j < entities.length; j += 1) {
      const b = entities[j];
      const colliderB = b.components.get(ComponentType.Collider);
      if (!colliderB) continue;
      if (!colliderA.isTrigger && !colliderB.isTrigger) continue;

      const boundsB = getColliderBounds(b);
      if (!boundsB) continue;
      if (!boxesOverlap(boundsA, boundsB)) continue;

      const key = pairKeyFor(a, b);
      currentPairs.set(key, { a, b });
      const eventType = triggerPairs.has(key) ? "stay" : "enter";
      dispatchTriggerEvent(a, b, eventType);
      dispatchTriggerEvent(b, a, eventType);
    }
  }

  triggerPairs.forEach((pair, key) => {
    if (currentPairs.has(key)) return;
    dispatchTriggerEvent(pair.a, pair.b, "exit");
    dispatchTriggerEvent(pair.b, pair.a, "exit");
  });

  triggerPairs = currentPairs;
};

const processCombatEvents = () => {
  const attackers = world
    .getEntities()
    .filter((entity) => {
      const hitBox = entity.components.get(ComponentType.HitBox);
      return Boolean(hitBox && hitBox.enabled !== false);
    });
  const targets = world
    .getEntities()
    .filter((entity) => {
      const health = entity.components.get(ComponentType.Health);
      const collider = entity.components.get(ComponentType.Collider);
      return Boolean(health && collider);
    });
  const currentPairs = new Map();

  attackers.forEach((attacker) => {
    const hitBox = attacker.components.get(ComponentType.HitBox);
    const attackerBounds = getCombatBounds(attacker, ComponentType.HitBox);
    if (!hitBox || !attackerBounds) return;

    const damageValue = Number.parseFloat(hitBox.damage);
    const damage = Number.isFinite(damageValue) && damageValue > 0 ? damageValue : 0;
    if (damage <= 0) return;

    targets.forEach((target) => {
      if (target.id === attacker.id) return;
      const targetBounds = getCombatBounds(target, ComponentType.Collider);
      if (!targetBounds) return;
      if (!boxesOverlap(attackerBounds, targetBounds)) return;

      const key = pairKeyFor(attacker, target);
      currentPairs.set(key, { attacker, target });
      if (!combatPairs.has(key)) {
        applyDamageToEntity(target, damage, {
          createIfMissing: false,
          attacker,
        });
      }
    });
  });

  combatPairs = currentPairs;
};

const ensureSpriteDefaults = () => {
  world.getEntities().forEach((entity) => {
    const sprite = entity.components.get(ComponentType.SpriteCharacter);
    if (!sprite || !Array.isArray(sprite.animations) || !sprite.animations.length) return;
    const idleAnimation =
      sprite.animations.find((animation) => animation.name?.toLowerCase() === "idle") ??
      sprite.animations[0];
    if (!sprite.defaultAnimation) {
      sprite.defaultAnimation = idleAnimation.name;
    }
    if (!sprite.activeAnimation) {
      sprite.activeAnimation = sprite.defaultAnimation;
    }
    if (!Number.isFinite(sprite.activeFrameIndex)) {
      sprite.activeFrameIndex = 0;
    }
    if (typeof sprite.playing !== "boolean") {
      sprite.playing = true;
    }
  });
};

const triggerSpriteAnimationByKey = (key) => {
  const normalized = normalizeSpriteAnimationKey(key);
  if (!normalized) return false;

  let triggered = false;
  world.getEntities().forEach((entity) => {
    const sprite = entity.components.get(ComponentType.SpriteCharacter);
    if (!sprite || !Array.isArray(sprite.animations)) return;
    const match = sprite.animations.find(
      (animation) => normalizeSpriteAnimationKey(animation.dedicatedKey) === normalized
    );
    if (!match) return;
    sprite.activeAnimation = match.name;
    sprite.activeFrameIndex = 0;
    sprite.playing = true;
    triggered = true;
  });
  return triggered;
};

const spriteState = new Map();

const spriteAnimationSignature = (sprite) =>
  Array.isArray(sprite?.animations)
  ? sprite.animations
        .map((animation) =>
          [
            animation?.name ?? "",
            animation?.fps ?? 0,
            animation?.loop === false ? 0 : 1,
            animation?.hitBox
              ? `hit:${[
                  animation.hitBox.x ?? 0,
                  animation.hitBox.y ?? 0,
                  animation.hitBox.width ?? 0,
                  animation.hitBox.height ?? 0,
                  animation.hitBox.depth ?? 0,
                  animation.hitBox.damage ?? 0,
                ].join(",")}`
              : "hit:none",
            `react:${normalizeSpriteAnimationKey(sprite?.hitReactionAnimation)}`,
            `knock:${[
              Number.isFinite(sprite?.hitReactionPhysicsOffset?.[0])
                ? sprite.hitReactionPhysicsOffset[0]
                : 0,
              Number.isFinite(sprite?.hitReactionPhysicsOffset?.[1])
                ? sprite.hitReactionPhysicsOffset[1]
                : 0,
              Number.isFinite(sprite?.hitReactionPhysicsOffset?.[2])
                ? sprite.hitReactionPhysicsOffset[2]
                : 0,
            ].join(",")}`,
            `fall:${sprite?.hitReactionFallOver ? 1 : 0}`,
            `phys:${sprite?.hitReactionPhysicsEnabled === false ? 0 : 1}`,
            `skip:${sprite?.hitReactionSkipPhysicsWhenAnimation === false ? 0 : 1}`,
            Array.isArray(animation?.frames)
              ? animation.frames
                  .map((frame) => frame?.source ?? frame?.relativePath ?? frame?.name ?? "")
                  .join("|")
              : "",
          ].join(":")
        )
        .join("||")
    : "";

const ensureSpriteState = (entity, sprite) => {
  const signature = spriteAnimationSignature(sprite);
  let state = spriteState.get(entity.id);
  if (!state || state.signature !== signature) {
    spriteHitReactionState.delete(entity.id);
    state = {
      signature,
      animator: new SpriteAnimator({
        animations: sprite.animations,
        animationName: sprite.activeAnimation || sprite.defaultAnimation,
        playing: sprite.playing !== false,
      }),
    };
    spriteState.set(entity.id, state);
  }
  return state;
};

const updateSpriteRuntime = (dt) => {
  const liveIds = new Set();
  world.getEntities().forEach((entity) => {
    const sprite = entity.components.get(ComponentType.SpriteCharacter);
    if (!sprite || !Array.isArray(sprite.animations) || !sprite.animations.length) return;
    const state = ensureSpriteState(entity, sprite);
    liveIds.add(entity.id);

    state.animator.setAnimation(sprite.activeAnimation || sprite.defaultAnimation, {
      reset: false,
      frameIndex: Number.isFinite(sprite.activeFrameIndex) ? sprite.activeFrameIndex : 0,
      playing: sprite.playing !== false,
    });
    const fallback =
      sprite.animations.find((animation) => animation.name?.toLowerCase() === "idle") ??
      sprite.animations[0];
    const activeAnimation =
      sprite.animations.find((animation) => animation.name === state.animator.activeAnimationName) ??
      sprite.animations.find((animation) => animation.name === sprite.activeAnimation) ??
      sprite.animations.find((animation) => animation.name === sprite.defaultAnimation) ??
      fallback;
    if (!activeAnimation) return;
    state.animator.setFps(activeAnimation.fps);
    const desiredFrameIndex = Number.isFinite(sprite.activeFrameIndex) ? sprite.activeFrameIndex : 0;
    if (state.animator.currentFrameIndex !== desiredFrameIndex) {
      state.animator.scrubTo(desiredFrameIndex);
    }
    const result = state.animator.update(dt);
    sprite.activeAnimation = activeAnimation.name;
    sprite.activeFrameIndex = result.frameIndex;

    const collider = entity.components.get(ComponentType.Collider);
    if (collider) {
      const frameCollider = resolveSpriteColliderForFrame(activeAnimation, result.frameIndex);
      if (frameCollider && frameCollider.type === "box") {
        collider.shape = "box";
        collider.size = [
          Number.isFinite(frameCollider.width) ? frameCollider.width : collider.size?.[0] ?? 1,
          Number.isFinite(frameCollider.height) ? frameCollider.height : collider.size?.[1] ?? 1,
          Number.isFinite(frameCollider.depth) ? frameCollider.depth : collider.size?.[2] ?? 0.2,
        ];
        collider.offset = [
          Number.isFinite(frameCollider.x) ? frameCollider.x : collider.offset?.[0] ?? 0,
          Number.isFinite(frameCollider.y) ? frameCollider.y : collider.offset?.[1] ?? 0,
          collider.offset?.[2] ?? 0,
        ];
      }
    }

    syncSpriteCombatBoxComponent(
      entity,
      ComponentType.HitBox,
      resolveSpriteCombatBoxForAnimation(activeAnimation, "hitBox"),
      activeAnimation.name
    );
    if (animator.finished) {
      restoreSpriteAnimationAfterHit(entity, sprite);
    }
  });

  Array.from(spriteState.keys()).forEach((entityId) => {
    if (!liveIds.has(entityId) || !world.entities?.has?.(entityId)) {
      spriteState.delete(entityId);
    }
  });
};

const syncSpriteCombatBoxComponent = (entity, componentType, box, animationName) => {
  const existing = entity.components.get(componentType);
  if (componentType !== ComponentType.HitBox) return existing ?? null;

  if (box) {
    const nextComponent = existing ?? createHitBox({ sourceAnimation: animationName });
    if (!existing) {
      world.addComponent(entity, nextComponent);
    }

    nextComponent.enabled = true;
    nextComponent.sourceAnimation = animationName ?? null;
    nextComponent.size = [
      Number.isFinite(box.width) && box.width > 0 ? box.width : nextComponent.size?.[0] ?? 1,
      Number.isFinite(box.height) && box.height > 0 ? box.height : nextComponent.size?.[1] ?? 1,
      Number.isFinite(box.depth) && box.depth > 0 ? box.depth : nextComponent.size?.[2] ?? 0.2,
    ];
    nextComponent.offset = [
      Number.isFinite(box.x) ? box.x : nextComponent.offset?.[0] ?? 0,
      Number.isFinite(box.y) ? box.y : nextComponent.offset?.[1] ?? 0,
      nextComponent.offset?.[2] ?? 0,
    ];
    const damage = Number.parseFloat(box.damage);
    nextComponent.damage = Number.isFinite(damage) && damage >= 0 ? damage : 10;
    return nextComponent;
  }

  if (existing && existing.sourceAnimation) {
    existing.enabled = false;
  }
  return existing ?? null;
};

const updateHealthState = (dt) => {
  world.getEntities().forEach((entity) => {
    const health = entity.components.get(ComponentType.Health);
    if (!health) return;

    if (!Number.isFinite(health.maxHealth) || health.maxHealth <= 0) {
      health.maxHealth = 100;
    }
    if (!Number.isFinite(health.currentHealth)) {
      health.currentHealth = health.maxHealth;
    }
    health.currentHealth = Math.min(Math.max(health.currentHealth, 0), health.maxHealth);
    health.regenRate = Number.isFinite(health.regenRate) ? health.regenRate : 0;
    health.invulnerable = Boolean(health.invulnerable);

    if (!health.dead && health.regenRate > 0 && health.currentHealth < health.maxHealth) {
      health.currentHealth = Math.min(
        health.maxHealth,
        health.currentHealth + health.regenRate * Math.max(dt, 0)
      );
    }

    health.dead = health.currentHealth <= 0;
  });

  updateHealthHud();
};

const findPlayerEntity = () => {
  const entities = world.getEntities();
  const isPlayablePlayer = (entity) =>
    entity.components.get(ComponentType.Player)?.enabled !== false;
  const isExplicitlyDisabledPlayer = (entity) =>
    entity.components.get(ComponentType.Player)?.enabled === false;

  for (const entity of entities) {
    if (
      isPlayablePlayer(entity) &&
      entity.components.has(ComponentType.Player) &&
      entity.components.has(ComponentType.Transform)
    ) {
      return entity;
    }
  }

  for (const entity of entities) {
    if (isExplicitlyDisabledPlayer(entity)) {
      continue;
    }
    if (entity.name?.toLowerCase() === "player") {
      return entity;
    }
  }

  for (const entity of entities) {
    if (isExplicitlyDisabledPlayer(entity)) {
      continue;
    }
    const name = entity.name?.toLowerCase() ?? "";
    if (
      name.includes("player") ||
      name.includes("hero") ||
      name.includes("avatar")
    ) {
      return entity;
    }
  }

  for (const entity of entities) {
    if (isExplicitlyDisabledPlayer(entity)) {
      continue;
    }
    const collider = entity.components.get(ComponentType.Collider);
    if (
      collider &&
      collider.body &&
      collider.body !== "static" &&
      entity.components.has(ComponentType.Transform)
    ) {
      return entity;
    }
  }

  return null;
};

const findCameraEntityById = (preferredId = null) => {
  if (!Number.isFinite(preferredId)) return null;
  return (
    world.getEntities().find(
      (entity) =>
        entity.id === preferredId &&
        entity.components.has(ComponentType.Camera) &&
        entity.components.has(ComponentType.Transform)
    ) ?? null
  );
};

const findCameraEntity = () => {
  for (const entity of world.getEntities()) {
    if (
      entity.components.has(ComponentType.Camera) &&
      entity.components.has(ComponentType.Transform)
    ) {
      return entity;
    }
  }

  return null;
};

const findEntityById = (entityId) =>
  world.getEntities().find((entity) => entity.id === entityId) ?? null;

const getCameraEntities = () =>
  world
    .getEntities()
    .filter(
      (entity) =>
        entity.components.has(ComponentType.Camera) &&
        entity.components.has(ComponentType.Transform)
    );

const getStoredCameraSelection = () => {
  const raw = localStorage.getItem(CAMERA_SELECTION_STORAGE_KEY);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const setStoredCameraSelection = (cameraId) => {
  if (Number.isFinite(cameraId)) {
    localStorage.setItem(CAMERA_SELECTION_STORAGE_KEY, String(cameraId));
    return;
  }
  localStorage.removeItem(CAMERA_SELECTION_STORAGE_KEY);
};

const refreshCameraPicker = () => {
  if (!cameraSelect) return;

  const cameras = getCameraEntities();
  cameraSelect.innerHTML = "";

  const autoOption = document.createElement("option");
  autoOption.value = "";
  autoOption.textContent = "Auto";
  cameraSelect.appendChild(autoOption);

  cameras.forEach((entity) => {
    const option = document.createElement("option");
    option.value = String(entity.id);
    option.textContent = entity.name || `Camera ${entity.id}`;
    if (entity.id === selectedCameraEntityId) {
      option.selected = true;
    }
    cameraSelect.appendChild(option);
  });

  if (!selectedCameraEntityId) {
    autoOption.selected = true;
  }
  cameraSelect.disabled = false;
};

const applySelectedCamera = () => {
  const preferredCameraId = getStoredCameraSelection();
  const preferredCamera = findCameraEntityById(preferredCameraId);
  activeCameraEntity = preferredCamera ?? findCameraEntity();

  if (activeCameraEntity) {
    selectedCameraEntityId = preferredCamera ? activeCameraEntity.id : null;
    activeCameraOrbitSignature = null;
    if (Number.isFinite(preferredCameraId) && !preferredCamera) {
      setStoredCameraSelection(activeCameraEntity.id);
    }
    return activeCameraEntity;
  }

  selectedCameraEntityId = null;
  activeCameraOrbitSignature = null;
  if (Number.isFinite(preferredCameraId)) {
    setStoredCameraSelection(null);
  }
  return null;
};

const resolveCameraTargetEntity = (camera) => {
  const targetById = Number.isFinite(camera?.lockTargetId)
    ? findEntityById(camera.lockTargetId)
    : null;
  if (targetById) {
    return targetById;
  }

  if (camera?.lockToPlayer && playerEntity) {
    return playerEntity;
  }

  return null;
};

const getLockedCameraOffset = (camera, cameraTransform, targetEntity) => {
  if (Array.isArray(camera?.followOffset) && camera.followOffset.length === 3) {
    return new THREE.Vector3(
      Number.isFinite(camera.followOffset[0]) ? camera.followOffset[0] : 0,
      Number.isFinite(camera.followOffset[1]) ? camera.followOffset[1] : 0,
      Number.isFinite(camera.followOffset[2]) ? camera.followOffset[2] : 0
    );
  }

  const targetTransform = targetEntity?.components.get(ComponentType.Transform);
  if (targetTransform && cameraTransform?.position) {
    return new THREE.Vector3(
      cameraTransform.position[0] - targetTransform.position[0],
      cameraTransform.position[1] - targetTransform.position[1],
      cameraTransform.position[2] - targetTransform.position[2]
    );
  }

  return new THREE.Vector3(0, 2, 5);
};

const syncOrbitStateToLockedCamera = (camera, cameraTransform, targetEntity) => {
  const offset = getLockedCameraOffset(camera, cameraTransform, targetEntity);
  const spherical = new THREE.Spherical().setFromVector3(offset);

  orbitState.radius = Math.min(
    Math.max(spherical.radius || orbitState.radius || ORBIT_RADIUS_MIN, ORBIT_RADIUS_MIN),
    ORBIT_RADIUS_MAX
  );
  orbitState.polar = Math.min(
    Math.max(spherical.phi || orbitState.polar, ORBIT_POLAR_MIN),
    ORBIT_POLAR_MAX
  );
  orbitState.azimuth = Number.isFinite(spherical.theta) ? spherical.theta : orbitState.azimuth;
  orbitState.focusHeight = 0;
};

const getCameraOrbitSignature = (camera, targetEntity) =>
  `${activeCameraEntity?.id ?? "none"}:${targetEntity?.id ?? "none"}:${
    Array.isArray(camera?.followOffset) ? camera.followOffset.join(",") : "no-offset"
  }`;

const resetMovementState = (transform) => {
  if (!transform) return;
  movementState.jumpPrimed = false;
  movementState.jumpBufferUntil = 0;
};

const preparePlayer = () => {
  playerEntity = findPlayerEntity();
  if (!playerEntity) {
    updateHealthHud();
    movementState.jumpPrimed = false;
    movementState.jumpBufferUntil = 0;
    return;
  }

  const collider = playerEntity.components.get(ComponentType.Collider);
  if (collider && collider.body !== "dynamic") {
    collider.body = "dynamic";
  }

  normalizeHealthComponent(playerEntity, { createIfMissing: true });
  const transform = playerEntity.components.get(ComponentType.Transform);
  resetMovementState(transform);
  updateHealthHud();
};

const prepareCamera = () => {
  applySelectedCamera();
  refreshCameraPicker();
};

const applyCamera = () => {
  if (activeCameraEntity) {
    const camera = activeCameraEntity.components.get(ComponentType.Camera);
    const transform = activeCameraEntity.components.get(ComponentType.Transform);
    if (!camera || !transform) return;

    if (
      engine.camera.fov !== camera.fov ||
      engine.camera.near !== camera.near ||
      engine.camera.far !== camera.far
    ) {
      engine.camera.fov = camera.fov;
      engine.camera.near = camera.near;
      engine.camera.far = camera.far;
      engine.camera.updateProjectionMatrix();
    }

    const targetEntity = resolveCameraTargetEntity(camera);
    if (targetEntity) {
      const targetTransform = targetEntity.components.get(ComponentType.Transform);
      if (targetTransform) {
        if (!Array.isArray(camera.followOffset) || camera.followOffset.length !== 3) {
          camera.followOffset = [
            transform.position[0] - targetTransform.position[0],
            transform.position[1] - targetTransform.position[1],
            transform.position[2] - targetTransform.position[2],
          ];
        }

        const followOffset = new THREE.Vector3(
          camera.followOffset[0] ?? 0,
          camera.followOffset[1] ?? 0,
          camera.followOffset[2] ?? 0
        );
        const desiredPosition = new THREE.Vector3(
          targetTransform.position[0],
          targetTransform.position[1],
          targetTransform.position[2]
        ).add(followOffset);

        activeCameraOrbitSignature = null;
        engine.camera.position.lerp(desiredPosition, 0.18);
        engine.camera.rotation.set(
          transform.rotation[0],
          transform.rotation[1],
          transform.rotation[2]
        );
        return;
      }
    }

    activeCameraOrbitSignature = null;
    engine.camera.position.set(
      transform.position[0],
      transform.position[1],
      transform.position[2]
    );
    engine.camera.rotation.set(
      transform.rotation[0],
      transform.rotation[1],
      transform.rotation[2]
    );
    return;
  }

  let fallbackTarget = playerEntity;
  if (!fallbackTarget) {
    const entities = world.getEntities();
    fallbackTarget =
      entities.find((entity) => {
        const name = entity.name?.toLowerCase() ?? "";
        return (
          entity.components.has(ComponentType.Transform) &&
          !["ground", "terrain", "floor", "world", "scene", "environment"].includes(
            name
          )
        );
      }) ??
      entities.find((entity) => entity.components.has(ComponentType.Transform)) ??
      null;
  }

  if (!fallbackTarget) return;
  applyOrbitCamera(fallbackTarget);
};

const buildScriptRunners = () => {
  scriptRunners.clear();
  triggerPairs.clear();
  world.getEntities().forEach((entity) => {
    const script = entity.components.get(ComponentType.Script);
    if (!script?.source) return;

    try {
      const { api, triggerHandlers } = createScriptApi(entity);
      const factory = new Function(
        "entity",
        "world",
        "THREE",
        "engine",
        "api",
        `"use strict";\n${script.source}\n;return typeof update === "function" ? update : null;`
      );
      const updateFn = factory(entity, world, THREE, engine, api);
      if (typeof updateFn === "function") {
        scriptRunners.set(entity.id, { entity, update: updateFn, api, triggerHandlers });
      }
    } catch (error) {
      console.warn(`Script error in ${entity.name}:`, error);
    }
  });
};

const runScripts = (dt) => {
  if (runtimeSessionState.paused) return;
  scriptRunners.forEach((runner, id) => {
    if (!world.entities?.has?.(id)) return;
    try {
      runner.update(runner.entity, dt, world, THREE, engine, runner.api);
    } catch (error) {
      console.warn(`Script update error on ${runner.entity.name}:`, error);
    }
  });
};

const updateMovement = (dt) => {
  if (runtimeSessionState.paused) return;
  if (!playerControlEnabled) return;
  if (!playerEntity) return;
  const transform = playerEntity.components.get(ComponentType.Transform);
  if (!transform) return;
  const playerConfig = playerEntity.components.get(ComponentType.Player);
  const body = physics.getBody(playerEntity.id);

  let x = 0;
  let z = 0;
  if (inputState.left) x -= 1;
  if (inputState.right) x += 1;
  if (inputState.forward) z -= 1;
  if (inputState.back) z += 1;

  const length = Math.hypot(x, z);
  if (length > 0) {
    x /= length;
    z /= length;
  }

  const speed = Number.isFinite(playerConfig?.moveSpeed)
    ? Math.max(playerConfig.moveSpeed, 0)
    : 3.4;

  if (body && physics.getLinearVelocity(playerEntity.id)) {
    const currentVelocity = physics.getLinearVelocity(playerEntity.id);
    physics.setLinearVelocity(playerEntity.id, {
      x: x * speed,
      y: currentVelocity?.y ?? 0,
      z: z * speed,
    });

    if (length > 0 && transform.rotation) {
      transform.rotation[1] = Math.atan2(x, z);
    }

    const jumpSpeed = Number.isFinite(playerConfig?.jumpSpeed)
      ? Math.max(playerConfig.jumpSpeed, 0)
      : 5.5;
    const position = physics.getTranslation(playerEntity.id);
    const grounded = Number.isFinite(position?.y) ? position.y <= 0.75 : true;
    const jumpBuffered = movementState.jumpBufferUntil > performance.now();
    if ((inputState.jump || jumpBuffered) && !movementState.jumpPrimed && grounded) {
      physics.applyImpulse(playerEntity.id, { x: 0, y: jumpSpeed, z: 0 });
      movementState.jumpPrimed = true;
      movementState.jumpBufferUntil = 0;
    }
    if (!inputState.jump) {
      movementState.jumpPrimed = false;
    }
    return;
  }

  transform.position[0] += x * speed * dt;
  transform.position[2] += z * speed * dt;

  if (length > 0) {
    transform.rotation[1] = Math.atan2(x, z);
  }
};

const clearRuntimeSession = () => {
  activeCameraEntity = null;
  selectedCameraEntityId = null;
  activeCameraOrbitSignature = null;
  runtimeSessionState.activeSceneId = null;
  runtimeSessionState.activeLevelId = null;
  combatPairs.clear();
  triggerPairs.clear();
  spriteHitReactionState.clear();
  runtimeSessionState.paused = false;
  runtimeSessionState.completionSignal = null;
  refreshCameraPicker();
  updateHealthHud();
  setRuntimePaused(false);
  refreshMinimapReadout();
};

const getRuntimeProjectSource = () => {
  const publishedRaw = localStorage.getItem(PUBLISHED_PROJECT_STORAGE_KEY);
  const draftRaw = localStorage.getItem(DRAFT_PROJECT_STORAGE_KEY);
  const legacySceneRaw = localStorage.getItem(PROJECT_STORAGE_KEYS.legacyScene);

  if (runtimeMode === "preview") {
    return loadProjectLike(draftRaw) ?? loadLegacySceneLike(legacySceneRaw);
  }

  return loadProjectLike(publishedRaw);
};

const savePlayerProgress = (level) => {
  if (!level) return;
  localStorage.setItem(
    PLAYER_PROGRESS_STORAGE_KEY,
    JSON.stringify({
      levelId: level.id ?? null,
      sceneId: level.sceneId ?? null,
      updatedAt: Date.now(),
    })
  );
  refreshContinueButtonState();
};

const clearPlayerSession = () => {
  localStorage.removeItem(PLAYER_SESSION_STORAGE_KEY);
  lastPlayerSessionSaveAt = 0;
};

const loadPlayerProgress = () => {
  try {
    const raw = localStorage.getItem(PLAYER_PROGRESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.warn("Failed to read player progress:", error);
    return null;
  }
};

const getProjectSessionVersion = (project = runtimeSessionState.project ?? {}) => {
  const normalized = normalizeProject(project ?? {});
  if (Number.isFinite(normalized.published?.version)) {
    return normalized.published.version;
  }
  if (Number.isFinite(normalized.metadata?.publishedVersion)) {
    return normalized.metadata.publishedVersion;
  }
  return 0;
};

const canResumeSavedSession = (session, project) => {
  if (!session || !project) return false;
  if (!session.sceneData || typeof session.sceneData !== "object") return false;
  const currentVersion = getProjectSessionVersion(project);
  const savedVersion = Number.isFinite(session.projectVersion) ? session.projectVersion : 0;
  if (runtimeMode === "client" && currentVersion !== savedVersion) {
    return false;
  }
  return Boolean(getLevelById(project, session.levelId));
};

const saveRuntimeSession = ({ force = false } = {}) => {
  if (runtimeMode !== "client") return false;
  if (!runtimeSessionState.project || !runtimeSessionState.activeLevelId || !runtimeSessionState.activeSceneId) {
    return false;
  }

  const now = Date.now();
  if (!force && now - lastPlayerSessionSaveAt < PLAYER_SESSION_AUTOSAVE_MS) {
    return false;
  }

  try {
    localStorage.setItem(
      PLAYER_SESSION_STORAGE_KEY,
      JSON.stringify({
        levelId: runtimeSessionState.activeLevelId,
        sceneId: runtimeSessionState.activeSceneId,
        projectVersion: getProjectSessionVersion(runtimeSessionState.project),
        updatedAt: now,
        sceneData: serializeScene(world),
      })
    );
    lastPlayerSessionSaveAt = now;
    return true;
  } catch (error) {
    console.warn("Failed to save runtime session:", error);
    return false;
  }
};

const applySpawnPointToLevel = (level, scene) => {
  const spawn = level?.spawnPoint ?? scene?.spawnPoint ?? null;
  if (!spawn) return;
  const target = playerEntity ?? findPlayerEntity();
  if (!target) return;
  const transform = target.components.get(ComponentType.Transform);
  if (!transform) return;

  transform.position = [...spawn.position];
  transform.rotation = [...spawn.rotation];
};

const loadProjectLevel = (levelId = null, { announce = true, sceneOverride = null, skipSpawn = false } = {}) => {
  const normalizedProject = normalizeProject(runtimeSessionState.project ?? {});
  const level =
    (levelId ? getLevelById(normalizedProject, levelId) : getStartingLevel(normalizedProject)) ??
    normalizedProject.levels[0] ??
    null;
  if (!level) {
    clearRuntimeSession();
    if (announce) {
      setRuntimeStatus("No playable levels were found.");
      setRuntimeSceneLabel("No playable content");
    }
    return null;
  }

  const scene =
    getSceneById(normalizedProject, level.sceneId) ?? normalizedProject.scenes[0] ?? null;
  if (!scene) {
    clearRuntimeSession();
    if (announce) {
      setRuntimeStatus("No scene was linked to the level.");
      setRuntimeSceneLabel(level.name ?? "Level");
    }
    return null;
  }

  const sceneData = sceneOverride ?? scene.sceneData;
  const loaded = deserializeScene(sceneData);
  world = loaded;
  physics.reset();
  engine.setWorld(loaded);
  runtimeSessionState.project = normalizedProject;
  runtimeSessionState.activeSceneId = scene.id;
  runtimeSessionState.activeLevelId = level.id;
  runtimeSessionState.completionSignal = null;
  runtimeSessionState.paused = false;
  buildScriptRunners();
  triggerPairs.clear();
  combatPairs.clear();
  spriteHitReactionState.clear();
  preparePlayer();
  prepareCamera();
  ensureSpriteDefaults();
  if (!skipSpawn) {
    applySpawnPointToLevel(level, scene);
  }
  updateHealthHud();
  updateHudFromProject(normalizedProject);
  refreshMinimapReadout();
  setRuntimePaused(false);
  setRuntimeSceneLabel(`${scene.name || "Scene"} - ${level.name || "Level"}`);
  setRuntimeStatus(
    announce
      ? runtimeMode === "preview"
        ? "Preview loaded from draft project."
        : "Published project loaded."
      : runtimeMode === "preview"
        ? "Preview ready."
        : "Play ready."
  );
  if (cameraSelect) {
    cameraSelect.disabled = runtimeMode !== "preview";
  }
  savePlayerProgress(level);
  saveRuntimeSession({ force: true });
  updateMenuCopy();
  return loaded;
};

const loadRuntimeProject = ({ announce = true } = {}) => {
  const project = getRuntimeProjectSource();
  if (!project) {
    clearRuntimeSession();
    if (announce) {
      setRuntimeStatus(
        runtimeMode === "preview"
          ? "No draft project found. The default sandbox world is active."
          : "No published project found. Publish from the editor to play here."
      );
      setRuntimeSceneLabel("No project loaded");
    }
    runtimeSessionState.project = null;
    return null;
  }

  runtimeSessionState.project = normalizeProject(project);
  runtimeSessionState.activeSceneId = runtimeSessionState.project.activeSceneId;
  runtimeSessionState.activeLevelId = getStartingLevel(runtimeSessionState.project)?.id ?? null;
  updateHudFromProject(runtimeSessionState.project);
  return loadProjectLevel(runtimeSessionState.activeLevelId, { announce });
};

const savePreviewProject = () => {
  if (runtimeMode !== "preview") return;
  const draft = runtimeSessionState.project ? normalizeProject(runtimeSessionState.project) : null;
  if (!draft) return;
  localStorage.setItem(DRAFT_PROJECT_STORAGE_KEY, JSON.stringify(draft));
  localStorage.setItem(PROJECT_STORAGE_KEYS.legacyScene, JSON.stringify(serializeScene(world)));
  setRuntimeStatus("Preview project saved.");
};

const startGameFromMenu = () => {
  runtimeSessionState.menuVisible = false;
  syncMenuState();
  clearPlayerSession();
  const level = getStartingLevel(runtimeSessionState.project ?? {});
  if (level) {
    loadProjectLevel(level.id, { announce: false });
  }
  closeStartMenu();
};

const continueGameFromMenu = () => {
  runtimeSessionState.menuVisible = false;
  syncMenuState();
  const progress = loadPlayerProgress();
  const session = loadPlayerSession();
  const project = normalizeProject(runtimeSessionState.project ?? {});
  const resumableSession = canResumeSavedSession(session, project) ? session : null;
  const preferredLevel = resumableSession?.levelId
    ? getLevelById(project, resumableSession.levelId)
    : progress?.levelId
      ? getLevelById(project, progress.levelId)
      : null;
  const level = preferredLevel ?? getStartingLevel(project) ?? project.levels[0] ?? null;
  if (level) {
    loadProjectLevel(level.id, {
      announce: false,
      sceneOverride: resumableSession?.sceneData ?? null,
      skipSpawn: Boolean(resumableSession?.sceneData),
    });
  }
  closeStartMenu();
};

const getCurrentRuntimeLevel = () => {
  const project = normalizeProject(runtimeSessionState.project ?? {});
  return (
    getLevelById(project, runtimeSessionState.activeLevelId) ??
    getStartingLevel(project) ??
    project.levels[0] ??
    null
  );
};

const getNextRuntimeLevel = () => {
  const project = normalizeProject(runtimeSessionState.project ?? {});
  const current = getCurrentRuntimeLevel();
  if (!current) return null;
  if (current.nextLevelId) {
    const linked = getLevelById(project, current.nextLevelId);
    if (linked) return linked;
  }
  const currentIndex = project.levels.findIndex((level) => level.id === current.id);
  return project.levels[currentIndex + 1] ?? null;
};

const processSceneCompletion = () => {
  if (!runtimeSessionState.completionSignal) return;
  const currentLevel = getCurrentRuntimeLevel();
  if (!currentLevel) {
    runtimeSessionState.completionSignal = null;
    return;
  }

  const requestedSignal = runtimeSessionState.completionSignal;
  const expectedSignal = currentLevel.completionSignal || "complete";
  if (requestedSignal !== expectedSignal && requestedSignal !== "complete") {
    runtimeSessionState.completionSignal = null;
    return;
  }

  runtimeSessionState.completionSignal = null;
  const nextLevel = getNextRuntimeLevel();
  if (nextLevel) {
    loadProjectLevel(nextLevel.id, { announce: true });
    return;
  }

  setRuntimeStatus("You have cleared the final level.");
  setRuntimeSceneLabel(`${currentLevel.name || "Level"} complete`);
  setRuntimePauseOverlay(true, "Campaign Complete", "No next level is defined for this project.");
  setMoveState("forward", false);
  setMoveState("back", false);
  setMoveState("left", false);
  setMoveState("right", false);
};

preparePlayer();
prepareCamera();
ensureSpriteDefaults();

const resetInputState = () => {
  Object.keys(inputState).forEach((key) => {
    inputState[key] = false;
  });
  movementState.jumpPrimed = false;
  movementState.jumpBufferUntil = 0;
};

const shouldIgnoreGameInput = (event) => {
  const target = event.target;
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
};

const setMoveState = (action, isActive) => {
  if (!(action in inputState)) return;
  if (action === "jump" && isActive && !inputState.jump) {
    movementState.jumpBufferUntil = performance.now() + JUMP_BUFFER_MS;
  }
  inputState[action] = isActive;
  if (action === "jump" && !isActive) {
    movementState.jumpPrimed = false;
  }
};

const setOrbitState = (action, isActive) => {
  if (!(action in orbitState)) return;
  orbitState[action] = isActive;
};

const updateCameraOrbit = (dt) => {
  if (runtimeSessionState.paused) return;
  const step = ORBIT_SPEED * dt;
  if (orbitState.left) {
    orbitState.azimuth += step;
  }
  if (orbitState.right) {
    orbitState.azimuth -= step;
  }
  if (orbitState.up) {
    orbitState.polar = Math.max(ORBIT_POLAR_MIN, orbitState.polar - step);
  }
  if (orbitState.down) {
    orbitState.polar = Math.min(ORBIT_POLAR_MAX, orbitState.polar + step);
  }
};

const getOrbitTargetPosition = (targetEntity) => {
  const transform = targetEntity?.components.get(ComponentType.Transform);
  if (!transform) return null;
  return new THREE.Vector3(
    transform.position[0],
    transform.position[1] + orbitState.focusHeight,
    transform.position[2]
  );
};

const applyOrbitCamera = (targetEntity, smoothing = 0.18) => {
  const targetPos = getOrbitTargetPosition(targetEntity);
  if (!targetPos) return false;

  orbitState.radius = Math.min(Math.max(orbitState.radius, ORBIT_RADIUS_MIN), ORBIT_RADIUS_MAX);
  orbitState.polar = Math.min(Math.max(orbitState.polar, ORBIT_POLAR_MIN), ORBIT_POLAR_MAX);

  const offset = new THREE.Vector3().setFromSpherical(
    new THREE.Spherical(orbitState.radius, orbitState.polar, orbitState.azimuth)
  );
  const desiredPosition = targetPos.clone().add(offset);
  if (Number.isFinite(smoothing) && smoothing > 0) {
    engine.camera.position.lerp(desiredPosition, smoothing);
  } else {
    engine.camera.position.copy(desiredPosition);
  }
  engine.camera.lookAt(targetPos);
  return true;
};

const onKeyChange = (event, isActive) => {
  if (shouldIgnoreGameInput(event)) return;
  if (runtimeSessionState.paused) return;

  const key = event.key.toLowerCase();
  const orbitKeys = ["i", "j", "k", "l"];
  if (isActive && !orbitKeys.includes(key)) {
    triggerSpriteAnimationByKey(key);
  }
  const movementKeys = [
    "w",
    "arrowup",
    "s",
    "arrowdown",
    "a",
    "arrowleft",
    "d",
    "arrowright",
    "i",
    "j",
    "k",
    "l",
    " ",
    "spacebar",
  ];

  if (movementKeys.includes(key)) {
    event.preventDefault();
  }

  if (["w", "arrowup"].includes(key)) setMoveState("forward", isActive);
  if (["s", "arrowdown"].includes(key)) setMoveState("back", isActive);
  if (["a", "arrowleft"].includes(key)) setMoveState("left", isActive);
  if (["d", "arrowright"].includes(key)) setMoveState("right", isActive);
  if (key === "i") setOrbitState("up", isActive);
  if (key === "k") setOrbitState("down", isActive);
  if (key === "j") setOrbitState("left", isActive);
  if (key === "l") setOrbitState("right", isActive);

  if (key === " " || key === "spacebar") {
    setMoveState("jump", isActive);
  }
};

window.addEventListener("keydown", (event) => onKeyChange(event, true));
window.addEventListener("keyup", (event) => onKeyChange(event, false));
window.addEventListener("blur", resetInputState);
window.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    saveRuntimeSession({ force: true });
    resetInputState();
  }
});
window.addEventListener("pagehide", () => {
  saveRuntimeSession({ force: true });
});

const autoload = () => {
  const loaded = loadRuntimeProject({ announce: false });
  if (loaded) {
    setRuntimeStatus(runtimeMode === "preview" ? "Loaded draft preview." : "Loaded published project.");
  } else {
    setRuntimeStatus(
      runtimeMode === "preview"
        ? "Using the default sandbox world."
        : "No published project found."
    );
    setRuntimeSceneLabel("Default sandbox world");
    updateHudFromProject(null);
  }
  loadPlayerPreferences();
  applyRuntimePreferences();
  updateMenuCopy();
  if (runtimeMode === "client" && runtimeEntryMode === "continue") {
    continueGameFromMenu();
    return;
  }
  closeStartMenu();
};

autoload();

if (controls) {
  controls.querySelectorAll("[data-move]").forEach((button) => {
    const action = button.dataset.move;
    const activate = (event) => {
      event.preventDefault();
      setMoveState(action, true);
    };
    const deactivate = (event) => {
      event.preventDefault();
      setMoveState(action, false);
    };
    button.addEventListener("pointerdown", activate);
    button.addEventListener("pointerup", deactivate);
    button.addEventListener("pointerleave", deactivate);
    button.addEventListener("pointercancel", deactivate);
    button.addEventListener("touchstart", activate, { passive: false });
    button.addEventListener("touchend", deactivate, { passive: false });
    button.addEventListener("touchcancel", deactivate, { passive: false });
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "s" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    if (runtimeMode !== "preview") return;
    savePreviewProject();
  }
  if (event.key === "Escape" && runtimeHudState.pauseMenu.enabled) {
    event.preventDefault();
    if (runtimeSessionState.menuBarOpen) {
      runtimeSessionState.menuBarOpen = false;
      syncMenuState();
      return;
    }
    if (runtimeSessionState.menuVisible) {
      if (runtimeSessionState.menuView !== "home") {
        setMenuView("home");
        return;
      }
      closeStartMenu();
      return;
    }
    setRuntimePaused(!runtimeSessionState.paused);
  }
});

if (loadButton) {
  loadButton.addEventListener("click", () => {
    const loaded = loadRuntimeProject({ announce: true });
    if (!loaded) {
      setRuntimeSceneLabel(runtimeMode === "preview" ? "Default sandbox world" : "No published project");
    }
  });
}

if (cameraSelect) {
  cameraSelect.addEventListener("change", () => {
    const rawValue = cameraSelect.value;
    const nextCameraId = rawValue ? Number.parseInt(rawValue, 10) : null;
    setStoredCameraSelection(nextCameraId);
    applySelectedCamera();
    activeCameraOrbitSignature = null;
    if (selectedCameraEntityId && activeCameraEntity) {
      setRuntimeStatus(`Camera selected: ${activeCameraEntity.name}.`);
      setRuntimeSceneLabel(`Loaded scene - ${activeCameraEntity.name || "Camera"}`);
    } else {
      setRuntimeStatus("Camera set to Auto.");
      setRuntimeSceneLabel("Loaded scene");
    }
    applyCamera();
  });
}

if (runtimeResumeButton) {
  runtimeResumeButton.addEventListener("click", () => {
    setRuntimePaused(false);
  });
}

if (runtimeRestartButton) {
  runtimeRestartButton.addEventListener("click", () => {
    restartCurrentLevel();
    setRuntimePaused(false);
  });
}

if (runtimeStartButton) {
  runtimeStartButton.addEventListener("click", () => {
    startGameFromMenu();
  });
}

if (runtimeContinueButton) {
  runtimeContinueButton.addEventListener("click", () => {
    continueGameFromMenu();
  });
}

if (runtimeMenuBurgerButton) {
  runtimeMenuBurgerButton.addEventListener("click", () => {
    toggleMenuTray();
  });
}

if (runtimeMenuHomeButton) {
  runtimeMenuHomeButton.addEventListener("click", () => {
    window.location.href = "player.html";
  });
}

if (runtimeMenuSettingsButton) {
  runtimeMenuSettingsButton.addEventListener("click", () => {
    runtimeSessionState.menuBarOpen = false;
    openStartMenu("settings");
  });
}

if (runtimeMenuCommandsButton) {
  runtimeMenuCommandsButton.addEventListener("click", () => {
    runtimeSessionState.menuBarOpen = false;
    openStartMenu("commands");
  });
}

if (runtimeSettingsBackButton) {
  runtimeSettingsBackButton.addEventListener("click", () => {
    setMenuView("home");
  });
}

if (runtimeCommandsBackButton) {
  runtimeCommandsBackButton.addEventListener("click", () => {
    setMenuView("home");
  });
}

if (runtimeCameraSpeed) {
  runtimeCameraSpeed.addEventListener("input", () => {
    const value = Number.parseFloat(runtimeCameraSpeed.value);
    runtimePreferences.cameraSpeed = Number.isFinite(value) ? value : 1;
    applyRuntimePreferences();
    savePlayerPreferences();
  });
}

if (runtimeSubtitlesToggle) {
  runtimeSubtitlesToggle.addEventListener("change", () => {
    runtimePreferences.subtitles = runtimeSubtitlesToggle.checked;
    applyRuntimePreferences();
    savePlayerPreferences();
  });
}

if (runtimeTouchToggle) {
  runtimeTouchToggle.addEventListener("change", () => {
    runtimePreferences.touchControls = runtimeTouchToggle.checked;
    applyRuntimePreferences();
    savePlayerPreferences();
  });
}

engine.addSystem((delta) => {
  if (runtimeSessionState.paused) return;
  updateMovement(delta);
  updateCameraOrbit(delta);
  runScripts(delta);
});
engine.addSystem((delta) => {
  if (runtimeSessionState.paused) return;
  updateSpriteRuntime(delta);
});
engine.addSystem((delta) => {
  if (runtimeSessionState.paused) return;
  physics.update(delta, world, ComponentType);
});
engine.addSystem(() => {
  if (runtimeSessionState.paused) return;
  processTriggerEvents();
});
engine.addSystem(() => {
  if (runtimeSessionState.paused) return;
  processCombatEvents();
});
engine.addSystem((delta) => {
  if (runtimeSessionState.paused) return;
  updateHealthState(delta);
});
engine.addSystem(() => {
  refreshMinimapReadout();
});
engine.addSystem(() => {
  processSceneCompletion();
});
engine.addSystem(() => {
  if (!runtimeSessionState.started || runtimeSessionState.menuVisible) return;
  saveRuntimeSession();
});
engine.addSystem(() => {
  applyCamera();
});
engine.start();
setRuntimeStatus(runtimeStatus?.textContent || "Runtime ready.");

physics
  .init()
  .then(() => {
    setRuntimeStatus("Runtime ready.");
  })
  .catch((error) => {
    console.warn("Physics system failed to initialize:", error);
    setRuntimeStatus("Runtime ready without physics.");
  });
