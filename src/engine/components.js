import {
  normalizeSpriteCharacter,
} from "./sprite-animation.js";

export const ComponentType = Object.freeze({
  Transform: "transform",
  Mesh: "mesh",
  Collider: "collider",
  Health: "health",
  HitBox: "hitBox",
  Player: "player",
  Script: "script",
  Camera: "camera",
  Gltf: "gltf",
  SpriteCharacter: "spriteCharacter",
});

export const createTransform = (overrides = {}) => ({
  type: ComponentType.Transform,
  position: overrides.position ?? [0, 0, 0],
  rotation: overrides.rotation ?? [0, 0, 0],
  scale: overrides.scale ?? [1, 1, 1],
});

export const createMesh = (overrides = {}) => ({
  type: ComponentType.Mesh,
  geometry: overrides.geometry ?? "box",
  material: {
    color: overrides.material?.color ?? "#7fd9ff",
    metalness: overrides.material?.metalness ?? 0.2,
    roughness: overrides.material?.roughness ?? 0.7,
    wireframe: overrides.material?.wireframe ?? false,
  },
});

export const createCollider = (overrides = {}) => ({
  type: ComponentType.Collider,
  shape: overrides.shape ?? "box",
  size: overrides.size ?? [1, 1, 1],
  offset: overrides.offset ?? [0, 0, 0],
  isTrigger: overrides.isTrigger ?? false,
  body: overrides.body ?? "static",
});

export const createHealth = (overrides = {}) => {
  const maxHealth =
    Number.isFinite(overrides.maxHealth) && overrides.maxHealth > 0
      ? overrides.maxHealth
      : 100;
  const currentHealth =
    Number.isFinite(overrides.currentHealth)
      ? Math.min(Math.max(overrides.currentHealth, 0), maxHealth)
      : maxHealth;

  return {
    type: ComponentType.Health,
    maxHealth,
    currentHealth,
    regenRate: Number.isFinite(overrides.regenRate) ? overrides.regenRate : 0,
    invulnerable: Boolean(overrides.invulnerable),
    dead: Boolean(overrides.dead) || currentHealth <= 0,
  };
};

export const createHitBox = (overrides = {}) => ({
  type: ComponentType.HitBox,
  size: overrides.size ?? [1, 1, 1],
  offset: overrides.offset ?? [0, 0, 0],
  damage: Number.isFinite(Number.parseFloat(overrides.damage))
    ? Number.parseFloat(overrides.damage)
    : 10,
  enabled: overrides.enabled !== false,
  sourceAnimation: overrides.sourceAnimation ?? null,
});

export const createPlayer = (overrides = {}) => ({
  type: ComponentType.Player,
  moveSpeed: overrides.moveSpeed ?? 3.4,
  jumpSpeed: overrides.jumpSpeed ?? 5.5,
  enabled: overrides.enabled ?? true,
});

export const createScript = (overrides = {}) => ({
  type: ComponentType.Script,
  source: overrides.source ?? "// write behavior here\n",
});

export const createCamera = (overrides = {}) => ({
  type: ComponentType.Camera,
  fov: overrides.fov ?? 60,
  near: overrides.near ?? 0.1,
  far: overrides.far ?? 200,
  lockToPlayer: overrides.lockToPlayer ?? false,
  lockTargetId: overrides.lockTargetId ?? null,
  followOffset: overrides.followOffset ?? [0, 2, 5],
});

export const createGltf = (overrides = {}) => ({
  type: ComponentType.Gltf,
  url: overrides.url ?? "",
  name: overrides.name ?? "Model",
  castShadow: overrides.castShadow ?? false,
  receiveShadow: overrides.receiveShadow ?? false,
});

export const createSpriteCharacter = (overrides = {}) => {
  const normalized = normalizeSpriteCharacter(overrides);
  return {
    type: ComponentType.SpriteCharacter,
    ...normalized,
  };
};
