import * as THREE from "three";
import { Engine } from "../engine/engine.js";
import { World } from "../engine/world.js";
import {
  createTransform,
  createMesh,
  createCollider,
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
  groundY: 1,
  verticalSpeed: 0,
  jumpPrimed: false,
};

let playerEntity = null;
let activeCameraEntity = null;

const findPlayerEntity = () => {
  const entities = world.getEntities();

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
  movementState.groundY = transform.position[1];
  movementState.verticalSpeed = 0;
  movementState.jumpPrimed = false;
};

const preparePlayer = () => {
  playerEntity = findPlayerEntity();
  if (!playerEntity) {
    movementState.verticalSpeed = 0;
    movementState.jumpPrimed = false;
    return;
  }

  const collider = playerEntity.components.get(ComponentType.Collider);
  if (collider && collider.body !== "kinematic") {
    collider.body = "kinematic";
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
  world.getEntities().forEach((entity) => {
    const script = entity.components.get(ComponentType.Script);
    if (!script?.source) return;

    try {
      const factory = new Function(
        "entity",
        "world",
        "THREE",
        "engine",
        `"use strict";\n${script.source}\n;return typeof update === "function" ? update : null;`
      );
      const updateFn = factory(entity, world, THREE, engine);
      if (typeof updateFn === "function") {
        scriptRunners.set(entity.id, { entity, update: updateFn });
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
      runner.update(runner.entity, dt, world, THREE, engine);
    } catch (error) {
      console.warn(`Script update error on ${runner.entity.name}:`, error);
    }
  });
};

const updateMovement = (dt) => {
  if (!playerEntity) return;
  const transform = playerEntity.components.get(ComponentType.Transform);
  if (!transform) return;

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

  const speed = 3.4;
  transform.position[0] += x * speed * dt;
  transform.position[2] += z * speed * dt;

  if (length > 0) {
    transform.rotation[1] = Math.atan2(x, z);
  }

  if (inputState.jump && !movementState.jumpPrimed) {
    movementState.verticalSpeed = 5.5;
    movementState.jumpPrimed = true;
  }
  if (!inputState.jump) {
    movementState.jumpPrimed = false;
  }

  movementState.verticalSpeed -= 12 * dt;
  transform.position[1] += movementState.verticalSpeed * dt;

  if (transform.position[1] <= movementState.groundY) {
    transform.position[1] = movementState.groundY;
    movementState.verticalSpeed = 0;
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
    preparePlayer();
    prepareCamera();
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

physics
  .init()
  .then(() => {
    engine.addSystem((delta) => {
      updateMovement(delta);
      runScripts(delta);
    });
    engine.addSystem((delta) => {
      physics.update(delta, world, ComponentType);
      applyCamera();
    });
    engine.start();
    setRuntimeStatus(runtimeStatus?.textContent || "Runtime ready.");
  })
  .catch((error) => {
    console.warn("Physics system failed to initialize:", error);
    engine.addSystem((delta) => {
      updateMovement(delta);
      runScripts(delta);
      applyCamera();
    });
    engine.start();
    setRuntimeStatus("Runtime ready without physics.");
  });
