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

const physics = new PhysicsSystem();
physics
  .init()
  .then(() => {
    engine.addSystem((delta) => physics.update(delta, world, ComponentType));
    engine.start();
  })
  .catch(() => {
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
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "s" && event.ctrlKey) {
    event.preventDefault();
    const data = serializeScene(engine.world);
    localStorage.setItem("tyronScene", JSON.stringify(data));
  }
});
