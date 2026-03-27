import * as THREE from "three";
import { GLTFLoader } from "three/addons/GLTFLoader.js";
import { ComponentType } from "./components.js";

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
    if (texture?.dispose) texture.dispose();
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
  const spriteVideo = object?.userData?.spriteVideo;
  if (!spriteVideo) return;
  try {
    spriteVideo.pause();
  } catch (_) {}
  if (spriteVideo.removeAttribute) {
    spriteVideo.removeAttribute("src");
  }
  if (spriteVideo.load) {
    spriteVideo.load();
  }
  object.userData.spriteVideo = null;
  object.userData.spriteTexture = null;
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
  options = {}
) => {
  const entities = world.getEntities();
  const liveIds = new Set();
  const skipTransformIds = new Set(options.skipTransformIds ?? []);

  const normalizeDisplaySize = (displaySize) => {
    if (!Array.isArray(displaySize) || displaySize.length !== 2) return [1, 1.6];
    const width = Number.isFinite(displaySize[0]) ? displaySize[0] : 1;
    const height = Number.isFinite(displaySize[1]) ? displaySize[1] : 1.6;
    return [Math.max(width, 0.01), Math.max(height, 0.01)];
  };

  const getSpriteAnimation = (sprite) => {
    const animations = Array.isArray(sprite?.animations) ? sprite.animations : [];
    if (!animations.length) return { animation: null, clip: null };

    const fallback =
      animations.find((item) => item.name?.toLowerCase() === "idle") ?? animations[0];
    const targetName = sprite.activeAnimation || sprite.defaultAnimation || fallback.name;
    const animation =
      animations.find((item) => item.name === targetName) ??
      animations.find((item) => item.name === sprite.defaultAnimation) ??
      fallback;
    if (!animation) return { animation: null, clip: null };

    const clip = Array.isArray(animation.clips) ? animation.clips[0] ?? null : null;
    return { animation, clip };
  };

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
      holder.userData.spriteMesh = plane;
      holder.userData.spriteClipUrl = "";
      holder.add(plane);
      scene.add(holder);
      cache.set(entity.id, holder);
    }

    return holder;
  };

  const syncSpriteMaterial = (holder, sprite) => {
    const spriteMesh = holder.userData.spriteMesh;
    if (!spriteMesh) return;
    const [width, height] = normalizeDisplaySize(sprite.displaySize);
    if (
      spriteMesh.geometry?.parameters?.width !== width ||
      spriteMesh.geometry?.parameters?.height !== height
    ) {
      spriteMesh.geometry?.dispose?.();
      spriteMesh.geometry = new THREE.PlaneGeometry(width, height);
    }

    const { animation, clip } = getSpriteAnimation(sprite);
    if (!animation) return;
    if (!sprite.activeAnimation || sprite.activeAnimation !== animation.name) {
      sprite.activeAnimation = animation.name;
    }
    if (!sprite.defaultAnimation) {
      sprite.defaultAnimation = animation.name;
    }

    const nextUrl = clip?.url ?? "";
    const material = spriteMesh.material;
    if (!nextUrl) {
      stopSpriteRuntime(holder);
      if (material?.map) {
        material.map.dispose();
        material.map = null;
      }
      holder.userData.spriteClipUrl = "";
      if (material) {
        material.needsUpdate = true;
      }
      return;
    }
    if (holder.userData.spriteClipUrl === nextUrl) {
      const currentVideo = holder.userData.spriteVideo;
      if (currentVideo && currentVideo.paused) {
        currentVideo.play().catch(() => {});
      }
      return;
    }

    stopSpriteRuntime(holder);
    if (material?.map) {
      material.map.dispose();
      material.map = null;
    }

    const video = document.createElement("video");
    video.src = nextUrl;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    if (material) {
      material.map = texture;
      material.needsUpdate = true;
    }
    holder.userData.spriteVideo = video;
    holder.userData.spriteTexture = texture;
    holder.userData.spriteClipUrl = nextUrl;
    video.play().catch(() => {});
  };

  entities.forEach((entity) => {
    liveIds.add(entity.id);
    const transform = entity.components.get(ComponentType.Transform);
    const mesh = entity.components.get(ComponentType.Mesh);
    const gltf = entity.components.get(ComponentType.Gltf);
    const sprite = entity.components.get(ComponentType.SpriteCharacter);

    if (!transform) return;

    if (sprite) {
      const holder = ensureSprite(entity, sprite);
      syncSpriteMaterial(holder, sprite);
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
  constructor({ canvas }) {
    this.canvas = canvas;
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
        this.gltfLoading
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
