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
    color: material.color,
    metalness: material.metalness,
    roughness: material.roughness,
    wireframe: material.wireframe,
  });

const applyTransform = (object, transform) => {
  object.position.set(...transform.position);
  object.rotation.set(...transform.rotation);
  object.scale.set(...transform.scale);
};

export const syncWorldToScene = (
  scene,
  world,
  cache,
  gltfLoader,
  gltfLoading
) => {
  const entities = world.getEntities();
  const liveIds = new Set();

  entities.forEach((entity) => {
    liveIds.add(entity.id);
    const transform = entity.components.get(ComponentType.Transform);
    const mesh = entity.components.get(ComponentType.Mesh);
    const gltf = entity.components.get(ComponentType.Gltf);

    if (!transform) return;

    let meshObject = cache.get(entity.id);
    if (gltf) {
      if (!meshObject) {
        if (!gltfLoader || !gltf.url) return;
        const holder = new THREE.Group();
        holder.userData.entityId = entity.id;
        cache.set(entity.id, holder);
        scene.add(holder);
        if (!gltfLoading.has(entity.id)) {
          gltfLoading.set(entity.id, true);
          gltfLoader.load(
            gltf.url,
            (data) => {
              holder.clear();
              holder.add(data.scene);
              gltfLoading.delete(entity.id);
            },
            undefined,
            () => {
              gltfLoading.delete(entity.id);
            }
          );
        }
        meshObject = holder;
      }
      applyTransform(meshObject, transform);
      return;
    }

    if (!mesh || !transform) return;

    if (!meshObject) {
      const geometry = geometryFactory[mesh.geometry]?.() ?? geometryFactory.box();
      meshObject = new THREE.Mesh(geometry, createMaterial(mesh.material));
      meshObject.userData.entityId = entity.id;
      scene.add(meshObject);
      cache.set(entity.id, meshObject);
    }

    applyTransform(meshObject, transform);
  });

  Array.from(cache.entries()).forEach(([id, object]) => {
    if (!liveIds.has(id)) {
      scene.remove(object);
      cache.delete(id);
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
    this.world = world;
  }

  addSystem(system) {
    this.systems.push(system);
  }

  start() {
    if (this.running) return;
    this.running = true;
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
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
