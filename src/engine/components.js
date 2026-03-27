export const ComponentType = Object.freeze({
  Transform: "transform",
  Mesh: "mesh",
  Collider: "collider",
  HitBox: "hitBox",
  HurtBox: "hurtBox",
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

export const createHitBox = (overrides = {}) => ({
  type: ComponentType.HitBox,
  size: overrides.size ?? [1, 1, 1],
  offset: overrides.offset ?? [0, 0, 0],
});

export const createHurtBox = (overrides = {}) => ({
  type: ComponentType.HurtBox,
  size: overrides.size ?? [1, 1, 1],
  offset: overrides.offset ?? [0, 0, 0],
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

const normalizeSpriteBox = (box) => ({
  size: Array.isArray(box?.size) && box.size.length === 3 ? [...box.size] : [1, 1, 0.2],
  offset:
    Array.isArray(box?.offset) && box.offset.length === 3 ? [...box.offset] : [0, 0, 0],
});

const normalizeSpriteClip = (clip) => ({
  name: clip?.name ?? "clip",
  url: clip?.url ?? "",
  size: Number.isFinite(clip?.size) ? clip.size : 0,
  relativePath: clip?.relativePath ?? "",
});

const normalizeSpriteAnimation = (animation) => ({
  name: animation?.name ?? "idle",
  clips: Array.isArray(animation?.clips)
    ? animation.clips.map((clip) => normalizeSpriteClip(clip))
    : [],
  collision: normalizeSpriteBox(animation?.collision),
  hitBox: normalizeSpriteBox(animation?.hitBox),
  hurtBox: normalizeSpriteBox(animation?.hurtBox),
  dedicatedKey:
    typeof animation?.dedicatedKey === "string"
      ? animation.dedicatedKey.trim().toLowerCase()
      : "",
});

export const createSpriteCharacter = (overrides = {}) => {
  const animations = Array.isArray(overrides.animations)
    ? overrides.animations.map((animation) => normalizeSpriteAnimation(animation))
    : [];

  const idleAnimation =
    animations.find((animation) => animation.name?.toLowerCase() === "idle")?.name ??
    animations[0]?.name ??
    "";
  const defaultAnimation = overrides.defaultAnimation ?? idleAnimation;
  const activeAnimation = overrides.activeAnimation ?? defaultAnimation;

  return {
    type: ComponentType.SpriteCharacter,
    characterName: overrides.characterName ?? "Sprite Character",
    defaultAnimation,
    activeAnimation,
    displaySize:
      Array.isArray(overrides.displaySize) && overrides.displaySize.length === 2
        ? [...overrides.displaySize]
        : [1, 1.6],
    animations,
  };
};
