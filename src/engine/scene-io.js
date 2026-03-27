import { World } from "./world.js";
import {
  ComponentType,
  createTransform,
  createMesh,
  createCollider,
  createHitBox,
  createHurtBox,
  createPlayer,
  createScript,
  createCamera,
  createGltf,
  createSpriteCharacter,
} from "./components.js";

const componentFactories = {
  [ComponentType.Transform]: createTransform,
  [ComponentType.Mesh]: createMesh,
  [ComponentType.Collider]: createCollider,
  [ComponentType.HitBox]: createHitBox,
  [ComponentType.HurtBox]: createHurtBox,
  [ComponentType.Player]: createPlayer,
  [ComponentType.Script]: createScript,
  [ComponentType.Camera]: createCamera,
  [ComponentType.Gltf]: createGltf,
  [ComponentType.SpriteCharacter]: createSpriteCharacter,
};

export const serializeScene = (world) => {
  return {
    version: 1,
    entities: world.getEntities().map((entity) => ({
      id: entity.id,
      name: entity.name,
      components: Array.from(entity.components.values()),
    })),
  };
};

export const deserializeScene = (data) => {
  const world = new World();
  if (!data || !Array.isArray(data.entities)) return world;

  data.entities.forEach((entityData) => {
    const entity = world.createEntity(
      entityData.name ?? "Entity",
      entityData.id ?? null
    );
    if (entityData.components) {
      entityData.components.forEach((component) => {
        const factory = componentFactories[component.type];
        if (factory) {
          world.addComponent(entity, factory(component));
        }
      });
    }
  });

  return world;
};
