import * as THREE from "three";
import { GLTFLoader } from "three/addons/GLTFLoader.js";
import { ComponentType, createHitBox } from "./components.js";
import {
  SpriteAnimator,
  getSpriteFrameSize,
  normalizeSpriteKey as normalizeSpriteAnimationKey,
  resolveSpriteCombatBoxForAnimation,
} from "./sprite-animation.js";

const geometryFactory = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.6, 24, 24),
  plane: () => new THREE.PlaneGeometry(4, 4),
};

const createMaterial = (material) =>
  new THREE.MeshStandardMaterial({
    color: material?.color,
    metalness: material?.metalness,
    roughness: material?.roughness,
    wireframe: material?.wireframe,
  });

const applyTransform = (object, transform) => {
  object.position.set(...transform.position);
  object.rotation.set(...transform.rotation);
  object.scale.set(...transform.scale);
};

const disposeMaterial = (material) => {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }

  const textureProps = [
    "map",
    "alphaMap",
    "aoMap",
    "bumpMap",
    "displacementMap",
    "emissiveMap",
    "envMap",
    "lightMap",
    "metalnessMap",
    "normalMap",
    "roughnessMap",
    "specularMap",
  ];

  textureProps.forEach((prop) => {
    const texture = material[prop];
    if (!texture?.dispose) return;
    if (texture.userData?.sharedSpriteTexture) return;
    texture.dispose();
  });

  if (material.dispose) {
    material.dispose();
  }
};

const disposeObject3D = (object) => {
  if (!object) return;

  object.traverse((child) => {
    if (child.geometry?.dispose) {
      child.geometry.dispose();
    }
    if (child.material) {
      disposeMaterial(child.material);
    }
  });
};

const stopSpriteRuntime = (object) => {
  const spriteMesh = object?.userData?.spriteMesh;
  if (spriteMesh?.material) {
    spriteMesh.material.map = null;
    spriteMesh.material.needsUpdate = true;
  }
  object.userData.spriteAnimator = null;
  object.userData.spriteTexture = null;
  object.userData.spriteTextureSource = "";
  object.userData.spriteFrameIndex = 0;
};

const clearSceneCache = (scene, cache, gltfLoading) => {
  cache.forEach((object) => {
    scene.remove(object);
    stopSpriteRuntime(object);
    disposeObject3D(object);
    if (object.clear) {
      object.clear();
    }
  });
  cache.clear();
  gltfLoading.clear();
};

export const syncWorldToScene = (
  scene,
  world,
  cache,
  gltfLoader,
  gltfLoading,
  options = {},
  camera = null,
  delta = 0
) => {
  const entities = world.getEntities();
  const liveIds = new Set();
  const skipTransformIds = new Set(options.skipTransformIds ?? []);
  const showCameraRig = Boolean(options.showCameraRig);

  const normalizeDisplaySize = (displaySize) => {
    if (!Array.isArray(displaySize) || displaySize.length !== 2) return [1, 1.6];
    const width = Number.isFinite(displaySize[0]) ? displaySize[0] : 1;
    const height = Number.isFinite(displaySize[1]) ? displaySize[1] : 1.6;
    return [Math.max(width, 0.01), Math.max(height, 0.01)];
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

  const ensureHolder = (entity) => {
    let holder = cache.get(entity.id);
    if (holder && holder.userData.renderKind !== "gltf") {
      scene.remove(holder);
      stopSpriteRuntime(holder);
      disposeObject3D(holder);
      cache.delete(entity.id);
      holder = null;
    }

    if (!holder) {
      holder = new THREE.Group();
      holder.userData.entityId = entity.id;
      holder.userData.renderKind = "gltf";
      holder.userData.gltfLoaded = false;
      holder.userData.gltfFailed = false;
      scene.add(holder);
      cache.set(entity.id, holder);
    }

    return holder;
  };

  const ensureMesh = (entity, mesh) => {
    let meshObject = cache.get(entity.id);
    if (meshObject && meshObject.userData.renderKind !== "mesh") {
      scene.remove(meshObject);
      stopSpriteRuntime(meshObject);
      disposeObject3D(meshObject);
      cache.delete(entity.id);
      meshObject = null;
    }

    if (!meshObject) {
      const geometry = geometryFactory[mesh.geometry]?.() ?? geometryFactory.box();
      meshObject = new THREE.Mesh(geometry, createMaterial(mesh.material));
      meshObject.userData.entityId = entity.id;
      meshObject.userData.renderKind = "mesh";
      scene.add(meshObject);
      cache.set(entity.id, meshObject);
    }

    return meshObject;
  };

  const ensureSprite = (entity, sprite) => {
    let holder = cache.get(entity.id);
    if (holder && holder.userData.renderKind !== "sprite") {
      scene.remove(holder);
      stopSpriteRuntime(holder);
      disposeObject3D(holder);
      cache.delete(entity.id);
      holder = null;
    }

    if (!holder) {
      holder = new THREE.Group();
      holder.userData.entityId = entity.id;
      holder.userData.renderKind = "sprite";
      const [width, height] = normalizeDisplaySize(sprite.displaySize);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide })
      );
      plane.userData.entityId = entity.id;
      const pivotHelper = new THREE.AxesHelper(0.25);
      pivotHelper.userData.entityId = entity.id;
      holder.userData.spriteMesh = plane;
      holder.userData.spritePivot = pivotHelper;
      holder.userData.spriteTextureSource = "";
      holder.userData.spriteFrameIndex = 0;
      holder.userData.spriteAnimator = null;
      holder.userData.spriteSignature = "";
      holder.userData.spriteMeshOutline = new THREE.BoxHelper(plane, 0x4ad4a8);
      holder.userData.spriteMeshOutline.material.depthTest = false;
      holder.userData.spriteMeshOutline.visible = false;
      holder.add(holder.userData.spriteMeshOutline);
      holder.add(pivotHelper);
      holder.add(plane);
      scene.add(holder);
      cache.set(entity.id, holder);
    }

    return holder;
  };

  const ensureCameraRig = (entity, camera) => {
    let holder = cache.get(entity.id);
    if (holder && holder.userData.renderKind !== "camera") {
      scene.remove(holder);
      stopSpriteRuntime(holder);
      disposeObject3D(holder);
      cache.delete(entity.id);
      holder = null;
    }

    if (!holder) {
      holder = new THREE.Group();
      holder.userData.entityId = entity.id;
      holder.userData.renderKind = "camera";

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.2, 0.22),
        new THREE.MeshBasicMaterial({ color: 0x8ecbff, wireframe: false })
      );
      body.position.set(0, 0, 0);
      body.userData.entityId = entity.id;

      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.11, 0.2, 12),
        new THREE.MeshBasicMaterial({ color: 0x8ecbff, wireframe: false })
      );
      lens.rotation.z = Math.PI / 2;
      lens.position.set(0, 0, -0.24);
      lens.userData.entityId = entity.id;

      const previewCamera = new THREE.PerspectiveCamera(
        camera.fov ?? 60,
        1,
        camera.near ?? 0.1,
        camera.far ?? 200
      );
      previewCamera.position.set(0, 0, 0);
      previewCamera.rotation.set(0, 0, 0);

      const helper = new THREE.CameraHelper(previewCamera);
      helper.userData.entityId = entity.id;
      helper.material.transparent = true;
      helper.material.opacity = 0.95;

      holder.userData.previewCamera = previewCamera;
      holder.userData.cameraHelper = helper;
      holder.add(body, lens, helper);
      scene.add(holder);
      cache.set(entity.id, holder);
    }

    const previewCamera = holder.userData.previewCamera;
    if (previewCamera) {
      previewCamera.fov = camera.fov ?? 60;
      previewCamera.near = camera.near ?? 0.1;
      previewCamera.far = camera.far ?? 200;
      previewCamera.updateProjectionMatrix();
      holder.userData.cameraHelper?.update?.();
    }

    return holder;
  };

  const syncSpriteMaterial = (holder, sprite, deltaTime) => {
    const spriteMesh = holder.userData.spriteMesh;
    if (!spriteMesh) return;
    const signature = spriteAnimationSignature(sprite);
    if (holder.userData.spriteSignature !== signature) {
      holder.userData.spriteAnimator = new SpriteAnimator({
        animations: sprite.animations,
        animationName: sprite.activeAnimation || sprite.defaultAnimation,
        playing: sprite.playing !== false,
      });
      holder.userData.spriteSignature = signature;
    }

    const animator = holder.userData.spriteAnimator;
    const animations = Array.isArray(sprite?.animations) ? sprite.animations : [];
    if (!animator || !animations.length) return;

    const fallback =
      animations.find((item) => item.name?.toLowerCase() === "idle") ?? animations[0];
    const targetName = sprite.activeAnimation || sprite.defaultAnimation || fallback.name;
    const animation =
      animations.find((item) => item.name === targetName) ??
      animations.find((item) => item.name === sprite.defaultAnimation) ??
      fallback;
    if (!animation) return;

    animator.setAnimation(animation.name, {
      reset: false,
      frameIndex: Number.isFinite(sprite.activeFrameIndex) ? sprite.activeFrameIndex : 0,
      playing: sprite.playing !== false,
    });
    animator.setFps(animation.fps);
    const desiredFrameIndex = Number.isFinite(sprite.activeFrameIndex) ? sprite.activeFrameIndex : 0;
    if (animator.currentFrameIndex !== desiredFrameIndex) {
      animator.scrubTo(desiredFrameIndex);
    }
    animator.update(deltaTime);

    if (!animation) return;
    if (!sprite.activeAnimation || sprite.activeAnimation !== animation.name) {
      sprite.activeAnimation = animation.name;
    }
    if (!sprite.defaultAnimation) {
      sprite.defaultAnimation = animation.name;
    }

    const resolvedTexture = animator.getCurrentFrameTexture() ?? null;
    const material = spriteMesh.material;
    if (resolvedTexture && material.map !== resolvedTexture) {
      material.map = resolvedTexture;
      material.needsUpdate = true;
    } else if (!resolvedTexture && material.map) {
      material.map = null;
      material.needsUpdate = true;
    }

    const frameTexture = resolvedTexture;
    const frameIndex = animator.currentFrameIndex;
    sprite.activeFrameIndex = frameIndex;
    syncSpriteCombatBoxComponent(
      entity,
      ComponentType.HitBox,
      resolveSpriteCombatBoxForAnimation(animation, "hitBox"),
      animation.name
    );
    const [width, height] = frameTexture
      ? getSpriteFrameSize(frameTexture, normalizeDisplaySize(sprite.displaySize))
      : normalizeDisplaySize(sprite.displaySize);
    if (
      spriteMesh.geometry?.parameters?.width !== width ||
      spriteMesh.geometry?.parameters?.height !== height
    ) {
      spriteMesh.geometry?.dispose?.();
      spriteMesh.geometry = new THREE.PlaneGeometry(width, height);
    }
    spriteMesh.material.transparent = true;
    spriteMesh.material.side = THREE.DoubleSide;
    holder.userData.spriteTexture = frameTexture;
    holder.userData.spriteTextureSource = frameTexture?.userData?.source ?? "";
    holder.userData.spriteFrameIndex = frameIndex;
    if (holder.userData.spriteMeshOutline) {
      holder.userData.spriteMeshOutline.visible = Boolean(options.showSpriteOutlines);
      holder.userData.spriteMeshOutline.update();
    }
  };

  entities.forEach((entity) => {
    liveIds.add(entity.id);
    const transform = entity.components.get(ComponentType.Transform);
    const mesh = entity.components.get(ComponentType.Mesh);
    const gltf = entity.components.get(ComponentType.Gltf);
    const sprite = entity.components.get(ComponentType.SpriteCharacter);
    const cameraComponent = entity.components.get(ComponentType.Camera);

    if (!transform) return;

    if (sprite) {
      const holder = ensureSprite(entity, sprite);
      syncSpriteMaterial(holder, sprite, delta);
      if (skipTransformIds.has(entity.id)) return;
      applyTransform(holder, transform);
      if (camera) {
        holder.lookAt(camera.position);
      }
      return;
    }

    if (cameraComponent) {
      if (!showCameraRig) {
        const cached = cache.get(entity.id);
        if (cached?.userData?.renderKind === "camera") {
          scene.remove(cached);
          stopSpriteRuntime(cached);
          disposeObject3D(cached);
          cache.delete(entity.id);
        }
        if (skipTransformIds.has(entity.id)) return;
        return;
      }

      const holder = ensureCameraRig(entity, cameraComponent);
      if (skipTransformIds.has(entity.id)) return;
      applyTransform(holder, transform);
      return;
    }

    if (gltf) {
      const holder = ensureHolder(entity);
      if (!gltf.url) {
        holder.clear();
        holder.userData.gltfUrl = "";
        holder.userData.gltfLoaded = false;
        applyTransform(holder, transform);
        return;
      }

      const urlChanged = holder.userData.gltfUrl !== gltf.url;
      if (urlChanged) {
        disposeObject3D(holder);
        holder.clear();
        holder.userData.gltfUrl = gltf.url;
        holder.userData.gltfLoaded = false;
        holder.userData.gltfFailed = false;
      }

      if (
        gltfLoader &&
        gltf.url &&
        !gltfLoading.has(entity.id) &&
        !holder.userData.gltfLoaded &&
        !holder.userData.gltfFailed
      ) {
        gltfLoading.set(entity.id, true);
        gltfLoader.load(
          gltf.url,
          (data) => {
            const currentHolder = cache.get(entity.id);
            if (currentHolder !== holder) {
              disposeObject3D(data.scene);
              gltfLoading.delete(entity.id);
              return;
            }

            holder.clear();
            holder.add(data.scene);
            holder.userData.gltfLoaded = true;
            holder.userData.gltfFailed = false;
            gltfLoading.delete(entity.id);
          },
          undefined,
          () => {
            if (cache.get(entity.id) === holder) {
              holder.userData.gltfLoaded = false;
              holder.userData.gltfFailed = true;
            }
            gltfLoading.delete(entity.id);
          }
        );
      }

      if (skipTransformIds.has(entity.id)) return;
      applyTransform(holder, transform);
      return;
    }

    if (!mesh || !transform) return;

    const meshObject = ensureMesh(entity, mesh);

    if (skipTransformIds.has(entity.id)) return;
    applyTransform(meshObject, transform);
  });

  Array.from(cache.entries()).forEach(([id, object]) => {
    if (!liveIds.has(id)) {
      scene.remove(object);
      stopSpriteRuntime(object);
      disposeObject3D(object);
      if (object.clear) {
        object.clear();
      }
      cache.delete(id);
      gltfLoading.delete(id);
    }
  });
};

export class Engine {
  constructor({ canvas, sceneSyncOptions = {} }) {
    this.canvas = canvas;
    this.sceneSyncOptions = sceneSyncOptions;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#090c15");
    this.clock = new THREE.Clock();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(
      60,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      200
    );
    this.camera.position.set(6, 5, 7);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(4, 8, 6);
    this.scene.add(key);

    this.world = null;
    this.cache = new Map();
    this.gltfLoader = new GLTFLoader();
    this.gltfLoading = new Map();
    this.running = false;
    this.systems = [];

    this.onResize = this.onResize.bind(this);
    window.addEventListener("resize", this.onResize);
  }

  setWorld(world) {
    if (this.world && this.world !== world) {
      clearSceneCache(this.scene, this.cache, this.gltfLoading);
    }
    this.world = world;
  }

  addSystem(system) {
    this.systems.push(system);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.onResize();
    this.tick();
  }

  stop() {
    this.running = false;
  }

  tick() {
    if (!this.running) return;
    const delta = this.clock.getDelta();
    this.systems.forEach((system) => system(delta, this));
    if (this.world) {
      syncWorldToScene(
        this.scene,
        this.world,
        this.cache,
        this.gltfLoader,
        this.gltfLoading,
        this.sceneSyncOptions,
        this.camera,
        delta
      );
    }
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.tick());
  }

  onResize() {
    const width = Math.max(this.canvas.clientWidth, 1);
    const height = Math.max(this.canvas.clientHeight, 1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.stop();
    window.removeEventListener("resize", this.onResize);
    clearSceneCache(this.scene, this.cache, this.gltfLoading);
    this.renderer.dispose();
  }
}
