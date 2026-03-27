import * as THREE from "three";
import { Engine } from "../engine/engine.js";
import { World } from "../engine/world.js";
import {
  createTransform,
  createMesh,
  createCollider,
  createPlayer,
  ComponentType,
} from "../engine/components.js";
import { deserializeScene, serializeScene } from "../engine/scene-io.js";
import { PhysicsSystem } from "../engine/physics.js";

const canvas = document.getElementById("runtime");
const runtimeStatus = document.getElementById("runtimeStatus");
const runtimeSceneLabel = document.getElementById("runtimeSceneLabel");
const loadButton = document.getElementById("loadScene");
const controls = document.querySelector(".controls");

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

const physics = new PhysicsSystem();
const scriptRunners = new Map();
const inputState = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
};
const movementState = {
  jumpPrimed: false,
};

let playerEntity = null;
let activeCameraEntity = null;
let playerControlEnabled = true;
let triggerPairs = new Map();

const normalizeSpriteKey = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

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
  });
};

const triggerSpriteAnimationByKey = (key) => {
  const normalized = normalizeSpriteKey(key);
  if (!normalized) return false;

  let triggered = false;
  world.getEntities().forEach((entity) => {
    const sprite = entity.components.get(ComponentType.SpriteCharacter);
    if (!sprite || !Array.isArray(sprite.animations)) return;
    const match = sprite.animations.find(
      (animation) => normalizeSpriteKey(animation.dedicatedKey) === normalized
    );
    if (!match) return;
    sprite.activeAnimation = match.name;
    triggered = true;
  });
  return triggered;
};

const findPlayerEntity = () => {
  const entities = world.getEntities();

  for (const entity of entities) {
    if (
      entity.components.has(ComponentType.Player) &&
      entity.components.has(ComponentType.Transform)
    ) {
      return entity;
    }
  }

  for (const entity of entities) {
    if (entity.name?.toLowerCase() === "player") {
      return entity;
    }
  }

  for (const entity of entities) {
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

const resetMovementState = (transform) => {
  if (!transform) return;
  movementState.jumpPrimed = false;
};

const preparePlayer = () => {
  playerEntity = findPlayerEntity();
  if (!playerEntity) {
    movementState.jumpPrimed = false;
    return;
  }

  const collider = playerEntity.components.get(ComponentType.Collider);
  if (collider && collider.body !== "dynamic") {
    collider.body = "dynamic";
  }

  const transform = playerEntity.components.get(ComponentType.Transform);
  resetMovementState(transform);
};

const prepareCamera = () => {
  activeCameraEntity = findCameraEntity();
};

const applyCamera = () => {
  const fallbackOffset = new THREE.Vector3(0, 2.3, 6.5);

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

    if (camera.lockToPlayer && playerEntity) {
      const playerTransform = playerEntity.components.get(ComponentType.Transform);
      if (playerTransform) {
        if (!Array.isArray(camera.followOffset)) {
          camera.followOffset = [0, 2, 5];
        }

        const offset = new THREE.Vector3(
          camera.followOffset[0],
          camera.followOffset[1],
          camera.followOffset[2]
        );
        const playerPos = new THREE.Vector3(
          playerTransform.position[0],
          playerTransform.position[1],
          playerTransform.position[2]
        );
        const cameraPos = playerPos.clone().add(offset);
        engine.camera.position.copy(cameraPos);
        engine.camera.lookAt(playerPos);
        return;
      }
    }

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
  const playerTransform = fallbackTarget.components.get(ComponentType.Transform);
  if (!playerTransform) return;

  const playerPos = new THREE.Vector3(
    playerTransform.position[0],
    playerTransform.position[1],
    playerTransform.position[2]
  );
  const cameraPos = playerPos.clone().add(fallbackOffset);
  engine.camera.position.lerp(cameraPos, 0.18);
  engine.camera.lookAt(playerPos);
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
    if (inputState.jump && !movementState.jumpPrimed && grounded) {
      physics.applyImpulse(playerEntity.id, { x: 0, y: jumpSpeed, z: 0 });
      movementState.jumpPrimed = true;
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

const loadSceneFromStorage = ({ announce = true } = {}) => {
  const raw = localStorage.getItem("tyronScene");
  if (!raw) {
    if (announce) {
      setRuntimeStatus("No saved scene found.");
    }
    return null;
  }

  try {
    const data = JSON.parse(raw);
    const loaded = deserializeScene(data);
    world = loaded;
    physics.reset();
    engine.setWorld(loaded);
    buildScriptRunners();
    triggerPairs.clear();
    preparePlayer();
    prepareCamera();
    ensureSpriteDefaults();
    setRuntimeSceneLabel("Loaded scene");
    if (announce) {
      setRuntimeStatus("Loaded scene from local storage.");
    }
    return loaded;
  } catch (error) {
    console.warn("Failed to load saved scene:", error);
    if (announce) {
      setRuntimeStatus("Failed to load saved scene.");
    }
    return null;
  }
};

preparePlayer();
prepareCamera();
ensureSpriteDefaults();

const resetInputState = () => {
  Object.keys(inputState).forEach((key) => {
    inputState[key] = false;
  });
  movementState.jumpPrimed = false;
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
  inputState[action] = isActive;
};

const onKeyChange = (event, isActive) => {
  if (shouldIgnoreGameInput(event)) return;

  const key = event.key.toLowerCase();
  if (isActive) {
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

  if (key === " " || key === "spacebar") {
    setMoveState("jump", isActive);
  }
};

window.addEventListener("keydown", (event) => onKeyChange(event, true));
window.addEventListener("keyup", (event) => onKeyChange(event, false));
window.addEventListener("blur", resetInputState);
window.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    resetInputState();
  }
});

const autoload = () => {
  const loaded = loadSceneFromStorage({ announce: false });
  if (loaded) {
    setRuntimeStatus("Loaded saved scene.");
  } else {
    setRuntimeStatus("Using the default sandbox world.");
  }
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
    const data = serializeScene(engine.world);
    localStorage.setItem("tyronScene", JSON.stringify(data));
    setRuntimeStatus("Scene saved to local storage.");
  }
});

if (loadButton) {
  loadButton.addEventListener("click", () => {
    const loaded = loadSceneFromStorage({ announce: true });
    if (!loaded) {
      setRuntimeSceneLabel("Default sandbox world");
    }
  });
}

engine.addSystem((delta) => {
  updateMovement(delta);
  runScripts(delta);
});
engine.addSystem((delta) => {
  physics.update(delta, world, ComponentType);
});
engine.addSystem(() => {
  processTriggerEvents();
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
