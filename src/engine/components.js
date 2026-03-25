export const ComponentType = Object.freeze({
  Transform: "transform",
  Mesh: "mesh",
  Collider: "collider",
  HitBox: "hitBox",
  HurtBox: "hurtBox",
  Script: "script",
  Camera: "camera",
  Gltf: "gltf",
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
  followOffset: overrides.followOffset ?? [0, 2, 5],
});

export const createGltf = (overrides = {}) => ({
  type: ComponentType.Gltf,
  url: overrides.url ?? "",
  name: overrides.name ?? "Model",
  castShadow: overrides.castShadow ?? false,
  receiveShadow: overrides.receiveShadow ?? false,
});
