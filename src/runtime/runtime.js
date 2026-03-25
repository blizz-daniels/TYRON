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
const engine = new Engine({ canvas });

let world = new World();
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

engine.setWorld(world);

const scriptRunners = new Map();
const inputState = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
};
let playerEntity = null;
let activeCameraEntity = null;

const findPlayerEntity = () => {
  return (
    world
      .getEntities()
      .find((entity) => entity.name?.toLowerCase() === "player") ??
    world.getEntities()[0] ??
    null
  );
};

const preparePlayer = () => {
  playerEntity = findPlayerEntity();
  if (!playerEntity) return;
  const collider = playerEntity.components.get(ComponentType.Collider);
  if (collider && collider.body === "dynamic") {
    collider.body = "kinematic";
  }
};

const findCameraEntity = () => {
  return (
    world
      .getEntities()
      .find(
        (entity) =>
          entity.components.has(ComponentType.Camera) &&
          entity.components.has(ComponentType.Transform)
      ) ?? null
  );
};

const prepareCamera = () => {
  activeCameraEntity = findCameraEntity();
};

const applyCamera = () => {
  if (!activeCameraEntity) return;
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

  const speed = 3;
  transform.position[0] += x * speed * dt;
  transform.position[2] += z * speed * dt;

  if (inputState.jump) {
    transform.position[1] += 3 * dt;
  }
};

const physics = new PhysicsSystem();
physics
  .init()
  .then(() => {
    engine.addSystem((delta) => {
      updateMovement(delta);
    });
    engine.addSystem((delta) => {
      physics.update(delta, world, ComponentType);
      runScripts(delta);
      applyCamera();
    });
    engine.start();
  })
  .catch(() => {
    engine.addSystem((delta) => {
      updateMovement(delta);
      runScripts(delta);
      applyCamera();
    });
    engine.start();
  });

const loadButton = document.getElementById("loadScene");
if (loadButton) {
  loadButton.addEventListener("click", () => {
    const raw = localStorage.getItem("tyronScene");
    if (!raw) return;
    const data = JSON.parse(raw);
    const loaded = deserializeScene(data);
    world = loaded;
    engine.setWorld(loaded);
    buildScriptRunners();
    preparePlayer();
    prepareCamera();
  });
}

const autoload = () => {
  const raw = localStorage.getItem("tyronScene");
  if (!raw) return;
  const data = JSON.parse(raw);
  const loaded = deserializeScene(data);
  world = loaded;
  engine.setWorld(loaded);
  buildScriptRunners();
  preparePlayer();
  prepareCamera();
};

preparePlayer();
prepareCamera();
autoload();

const setMoveState = (action, isActive) => {
  if (!(action in inputState)) return;
  inputState[action] = isActive;
};

const onKeyChange = (event, isActive) => {
  const key = event.key.toLowerCase();
  if (["w", "arrowup"].includes(key)) setMoveState("forward", isActive);
  if (["s", "arrowdown"].includes(key)) setMoveState("back", isActive);
  if (["a", "arrowleft"].includes(key)) setMoveState("left", isActive);
  if (["d", "arrowright"].includes(key)) setMoveState("right", isActive);
  if (key === " ") setMoveState("jump", isActive);
};

window.addEventListener("keydown", (event) => onKeyChange(event, true));
window.addEventListener("keyup", (event) => onKeyChange(event, false));

const controls = document.querySelector(".controls");
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
    button.addEventListener("touchstart", activate, { passive: false });
    button.addEventListener("touchend", deactivate, { passive: false });
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "s" && event.ctrlKey) {
    event.preventDefault();
    const data = serializeScene(engine.world);
    localStorage.setItem("tyronScene", JSON.stringify(data));
  }
});
