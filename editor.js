import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { Engine, syncWorldToScene } from "./src/engine/engine.js";
import { World } from "./src/engine/world.js";
import {
  createTransform,
  createMesh,
  createCollider,
  createHitBox,
  createHurtBox,
  createCamera,
  createGltf,
  ComponentType,
} from "./src/engine/components.js";
import { serializeScene, deserializeScene } from "./src/engine/scene-io.js";

const canvas = document.getElementById("viewport");
const hierarchyList = document.getElementById("hierarchyList");
const inspectorFields = document.getElementById("inspectorFields");
const status = document.getElementById("viewportStatus");
const addEntityButton = document.getElementById("addEntity");
const importFolderButton = document.getElementById("importFolderBtn");
const importFolderInput = document.getElementById("importFolder");
const playButton = document.getElementById("playBtn");
const stopButton = document.getElementById("stopBtn");
const uploadedList = document.getElementById("uploadedList");
const importedAssets = [];
const worldAssets = [];
const uploadedAssets = [];
let renderAssets = () => {};

const engine = new Engine({ canvas });
let world = new World();
engine.setWorld(world);

const grid = new THREE.GridHelper(20, 20, 0x22304a, 0x121b2b);
engine.scene.add(grid);
engine.scene.add(new THREE.AxesHelper(2));

const ground = world.createEntity("Ground");
world.addComponent(ground, createTransform({ position: [0, -0.5, 0], scale: [10, 0.2, 10] }));
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

const prop = world.createEntity("Tower");
world.addComponent(prop, createTransform({ position: [3, 1.2, -2], scale: [1, 2.4, 1] }));
world.addComponent(prop, createMesh({ geometry: "box", material: { color: "#7fd9ff" } }));

const orbitControls = new OrbitControls(engine.camera, canvas);
orbitControls.enableDamping = true;

const transformControls = new TransformControls(engine.camera, canvas);
transformControls.setMode("translate");
engine.scene.add(transformControls);

const meshCache = engine.cache;
const colliderHelpers = new Map();
const hitBoxHelpers = new Map();
const hurtBoxHelpers = new Map();
let selectedEntityId = null;
let runtimeWindow = null;

const rebuildHierarchy = () => {
  if (!hierarchyList) return;
  hierarchyList.innerHTML = "";
  world.getEntities().forEach((entity) => {
    const button = document.createElement("button");
    button.textContent = entity.name;
    button.className = entity.id === selectedEntityId ? "active" : "";
    button.addEventListener("click", () => selectEntity(entity.id));
    hierarchyList.appendChild(button);
  });
};

const buildVectorField = (label, values, onChange) => {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const title = document.createElement("label");
  title.textContent = label;
  wrapper.appendChild(title);

  const inputs = values.map((value, index) => {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.1";
    input.value = value.toFixed(2);
    input.addEventListener("change", () => {
      const parsed = Number.parseFloat(input.value);
      onChange(index, Number.isFinite(parsed) ? parsed : value);
    });
    wrapper.appendChild(input);
    return input;
  });

  return { wrapper, inputs };
};

function deleteEntity(entityId) {
  const object = meshCache.get(entityId);
  if (object) {
    engine.scene.remove(object);
    meshCache.delete(entityId);
  }
  const helper = colliderHelpers.get(entityId);
  if (helper) {
    engine.scene.remove(helper);
    colliderHelpers.delete(entityId);
  }
  const hitHelper = hitBoxHelpers.get(entityId);
  if (hitHelper) {
    engine.scene.remove(hitHelper);
    hitBoxHelpers.delete(entityId);
  }
  const hurtHelper = hurtBoxHelpers.get(entityId);
  if (hurtHelper) {
    engine.scene.remove(hurtHelper);
    hurtBoxHelpers.delete(entityId);
  }
  world.destroyEntity(entityId);
  const next = world.getEntities()[0];
  selectEntity(next ? next.id : null);
}

function createEntity(name = "Entity") {
  const entity = world.createEntity(name);
  world.addComponent(entity, createTransform());
  world.addComponent(entity, createMesh());
  world.addComponent(entity, createCollider({ body: "static" }));
  selectEntity(entity.id);
  if (status) {
    status.textContent = `Created ${entity.name}.`;
  }
}

const openRuntimeWindow = () => {
  const data = serializeScene(world);
  localStorage.setItem("tyronScene", JSON.stringify(data));
  if (runtimeWindow && !runtimeWindow.closed) {
    runtimeWindow.focus();
    runtimeWindow.location.reload();
  } else {
    runtimeWindow = window.open("runtime.html", "_blank");
  }
  if (status) status.textContent = "Play mode: running in runtime preview.";
  if (playButton) playButton.disabled = true;
  if (stopButton) stopButton.disabled = false;
};

const closeRuntimeWindow = () => {
  if (runtimeWindow && !runtimeWindow.closed) {
    runtimeWindow.close();
  }
  runtimeWindow = null;
  if (status) status.textContent = "Play mode: stopped.";
  if (playButton) playButton.disabled = false;
  if (stopButton) stopButton.disabled = true;
};

const addCollisionBoxToEntity = (entity) => {
  if (!entity || entity.components.has(ComponentType.Collider)) return;
  world.addComponent(entity, createCollider({ body: "static" }));
  status.textContent = `Added collision box to ${entity.name}.`;
  rebuildInspector();
};

const addHitBoxToEntity = (entity) => {
  if (!entity || entity.components.has(ComponentType.HitBox)) return;
  world.addComponent(entity, createHitBox());
  status.textContent = `Added hit box to ${entity.name}.`;
  rebuildInspector();
};

const addHurtBoxToEntity = (entity) => {
  if (!entity || entity.components.has(ComponentType.HurtBox)) return;
  world.addComponent(entity, createHurtBox());
  status.textContent = `Added hurt box to ${entity.name}.`;
  rebuildInspector();
};

const addCameraToEntity = (entity) => {
  if (!entity || entity.components.has(ComponentType.Camera)) return;
  world.addComponent(entity, createCamera());
  status.textContent = `Added camera to ${entity.name}.`;
  rebuildInspector();
};

const rebuildInspector = () => {
  if (!inspectorFields) return;
  inspectorFields.innerHTML = "";
  const entity = world.getEntities().find((item) => item.id === selectedEntityId);
  if (!entity) {
    inspectorFields.innerHTML = '<p class="muted">Select an entity to edit its components.</p>';
    return;
  }

  const entitySection = document.createElement("div");
  entitySection.innerHTML = "<label>Entity</label>";
  const nameRow = document.createElement("div");
  nameRow.className = "row";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = entity.name;
  nameInput.addEventListener("input", () => {
    entity.name = nameInput.value || "Entity";
    rebuildHierarchy();
  });
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn--ghost btn--small";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    deleteEntity(entity.id);
  });
  nameRow.append(nameInput, deleteBtn);
  entitySection.appendChild(nameRow);
  inspectorFields.appendChild(entitySection);

  const addSection = document.createElement("div");
  addSection.innerHTML = "<label>Add Components</label>";
  const addRow = document.createElement("div");
  addRow.className = "row";
  let hasAddButtons = false;
  if (!entity.components.has(ComponentType.Collider)) {
    const addColliderBtn = document.createElement("button");
    addColliderBtn.className = "btn btn--ghost btn--small";
    addColliderBtn.textContent = "Add Collision Box";
    addColliderBtn.addEventListener("click", () => addCollisionBoxToEntity(entity));
    addRow.appendChild(addColliderBtn);
    hasAddButtons = true;
  }
  if (!entity.components.has(ComponentType.HitBox)) {
    const addHitBtn = document.createElement("button");
    addHitBtn.className = "btn btn--ghost btn--small";
    addHitBtn.textContent = "Add Hit Box";
    addHitBtn.addEventListener("click", () => addHitBoxToEntity(entity));
    addRow.appendChild(addHitBtn);
    hasAddButtons = true;
  }
  if (!entity.components.has(ComponentType.HurtBox)) {
    const addHurtBtn = document.createElement("button");
    addHurtBtn.className = "btn btn--ghost btn--small";
    addHurtBtn.textContent = "Add Hurt Box";
    addHurtBtn.addEventListener("click", () => addHurtBoxToEntity(entity));
    addRow.appendChild(addHurtBtn);
    hasAddButtons = true;
  }
  if (!entity.components.has(ComponentType.Camera)) {
    const addCameraBtn = document.createElement("button");
    addCameraBtn.className = "btn btn--ghost btn--small";
    addCameraBtn.textContent = "Add Camera";
    addCameraBtn.addEventListener("click", () => addCameraToEntity(entity));
    addRow.appendChild(addCameraBtn);
    hasAddButtons = true;
  }
  if (hasAddButtons) {
    addSection.appendChild(addRow);
    inspectorFields.appendChild(addSection);
  }

  const transform = entity.components.get(ComponentType.Transform);
  if (transform) {
    const section = document.createElement("div");
    section.innerHTML = "<label>Transform</label>";
    const position = buildVectorField("Position", transform.position, (index, value) => {
      transform.position[index] = value;
    });
    const rotation = buildVectorField("Rotation", transform.rotation, (index, value) => {
      transform.rotation[index] = value;
    });
    const scale = buildVectorField("Scale", transform.scale, (index, value) => {
      transform.scale[index] = value;
    });
    section.append(position.wrapper, rotation.wrapper, scale.wrapper);
    inspectorFields.appendChild(section);
  }

  const collider = entity.components.get(ComponentType.Collider);
  if (collider) {
    const section = document.createElement("div");
    section.innerHTML = "<label>Collider</label>";
    if (!Array.isArray(collider.offset)) {
      collider.offset = [0, 0, 0];
    }
    const size = buildVectorField("Size", collider.size, (index, value) => {
      collider.size[index] = value;
    });
    const offset = buildVectorField("Offset", collider.offset, (index, value) => {
      collider.offset[index] = value;
    });
    section.append(size.wrapper, offset.wrapper);
    inspectorFields.appendChild(section);
  }

  const hitBox = entity.components.get(ComponentType.HitBox);
  if (hitBox) {
    const section = document.createElement("div");
    section.innerHTML = "<label>Hit Box</label>";
    if (!Array.isArray(hitBox.offset)) {
      hitBox.offset = [0, 0, 0];
    }
    const size = buildVectorField("Size", hitBox.size, (index, value) => {
      hitBox.size[index] = value;
    });
    const offset = buildVectorField("Offset", hitBox.offset, (index, value) => {
      hitBox.offset[index] = value;
    });
    section.append(size.wrapper, offset.wrapper);
    inspectorFields.appendChild(section);
  }

  const hurtBox = entity.components.get(ComponentType.HurtBox);
  if (hurtBox) {
    const section = document.createElement("div");
    section.innerHTML = "<label>Hurt Box</label>";
    if (!Array.isArray(hurtBox.offset)) {
      hurtBox.offset = [0, 0, 0];
    }
    const size = buildVectorField("Size", hurtBox.size, (index, value) => {
      hurtBox.size[index] = value;
    });
    const offset = buildVectorField("Offset", hurtBox.offset, (index, value) => {
      hurtBox.offset[index] = value;
    });
    section.append(size.wrapper, offset.wrapper);
    inspectorFields.appendChild(section);
  }

  const camera = entity.components.get(ComponentType.Camera);
  if (camera) {
    const section = document.createElement("div");
    section.innerHTML = "<label>Camera</label>";
    const fovField = buildVectorField("Fov / Near / Far", [camera.fov, camera.near, camera.far], (index, value) => {
      if (index === 0) camera.fov = value;
      if (index === 1) camera.near = value;
      if (index === 2) camera.far = value;
    });
    if (!Array.isArray(camera.followOffset)) {
      camera.followOffset = [0, 2, 5];
    }
    const followToggle = document.createElement("label");
    followToggle.style.display = "flex";
    followToggle.style.alignItems = "center";
    followToggle.style.gap = "8px";
    followToggle.style.textTransform = "none";
    followToggle.style.letterSpacing = "0.02em";
    const followInput = document.createElement("input");
    followInput.type = "checkbox";
    followInput.checked = Boolean(camera.lockToPlayer);
    followInput.addEventListener("change", () => {
      camera.lockToPlayer = followInput.checked;
    });
    const followText = document.createElement("span");
    followText.textContent = "Lock camera to player";
    followToggle.append(followInput, followText);

    const offsetField = buildVectorField(
      "Follow Offset",
      camera.followOffset,
      (index, value) => {
        camera.followOffset[index] = value;
      }
    );

    section.append(fovField.wrapper, followToggle, offsetField.wrapper);
    inspectorFields.appendChild(section);
  }
};

const selectEntity = (entityId) => {
  selectedEntityId = entityId;
  rebuildHierarchy();
  rebuildInspector();
  const object = meshCache.get(entityId);
  if (object) {
    transformControls.attach(object);
  } else {
    transformControls.detach();
  }
};

 

const setWorld = (newWorld) => {
  world = newWorld;
  engine.setWorld(newWorld);
  meshCache.clear();
  colliderHelpers.forEach((helper) => engine.scene.remove(helper));
  colliderHelpers.clear();
  hitBoxHelpers.forEach((helper) => engine.scene.remove(helper));
  hitBoxHelpers.clear();
  hurtBoxHelpers.forEach((helper) => engine.scene.remove(helper));
  hurtBoxHelpers.clear();
  const first = world.getEntities()[0];
  selectEntity(first ? first.id : null);
};

const loadWorldFromGltf = (asset) => {
  const newWorld = new World();
  const worldEntity = newWorld.createEntity(asset.name || "World");
  newWorld.addComponent(worldEntity, createTransform());
  newWorld.addComponent(worldEntity, createGltf({ url: asset.url, name: asset.name }));
  setWorld(newWorld);
  status.textContent = `Loaded world: ${asset.name}`;
};

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const onPointerDown = (event) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, engine.camera);
  const objects = Array.from(meshCache.values());
  const hits = raycaster.intersectObjects(objects, false);
  if (hits.length > 0) {
    const hit = hits[0].object;
    selectEntity(hit.userData.entityId);
  }
};

canvas.addEventListener("pointerdown", onPointerDown);

const getDropPosition = (event) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, engine.camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, hit);
  return [hit.x, 0.5, hit.z];
};

transformControls.addEventListener("dragging-changed", (event) => {
  orbitControls.enabled = !event.value;
  if (!selectedEntityId) return;
  const entity = world.getEntities().find((item) => item.id === selectedEntityId);
  const transform = entity?.components.get(ComponentType.Transform);
  const object = meshCache.get(selectedEntityId);
  if (transform && object) {
    transform.position = [object.position.x, object.position.y, object.position.z];
    transform.rotation = [object.rotation.x, object.rotation.y, object.rotation.z];
    transform.scale = [object.scale.x, object.scale.y, object.scale.z];
    rebuildInspector();
  }
});

const gizmoButtons = document.querySelectorAll("[data-gizmo]");
gizmoButtons.forEach((button) => {
  button.addEventListener("click", () => {
    transformControls.setMode(button.dataset.gizmo);
    gizmoButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  });
});
const activeGizmo = document.querySelector('[data-gizmo="translate"]');
if (activeGizmo) {
  activeGizmo.classList.add("active");
}

const saveButton = document.getElementById("saveScene");
const loadButton = document.getElementById("loadScene");

if (saveButton) {
  saveButton.addEventListener("click", () => {
    const data = serializeScene(world);
    localStorage.setItem("tyronScene", JSON.stringify(data));
    status.textContent = "Scene saved to localStorage.";
  });
}

if (loadButton) {
  loadButton.addEventListener("click", () => {
    const raw = localStorage.getItem("tyronScene");
    if (!raw) return;
    const data = JSON.parse(raw);
    const loaded = deserializeScene(data);
    setWorld(loaded);
    status.textContent = "Scene loaded.";
  });
}

if (playButton) {
  playButton.addEventListener("click", () => {
    openRuntimeWindow();
  });
}

if (stopButton) {
  stopButton.disabled = true;
  stopButton.addEventListener("click", () => {
    closeRuntimeWindow();
  });
}

const assetGrid = document.getElementById("assetGrid");
const worldGrid = document.getElementById("worldGrid");
if (assetGrid) {
  const baseAssets = [
    { name: "Box", type: "mesh", geometry: "box" },
    { name: "Sphere", type: "mesh", geometry: "sphere" },
    { name: "Plane", type: "mesh", geometry: "plane" },
  ];

  const renderUploads = () => {
    if (!uploadedList) return;
    uploadedList.innerHTML = "";
    if (!uploadedAssets.length) {
      const empty = document.createElement("li");
      empty.textContent = "No files imported yet.";
      uploadedList.appendChild(empty);
      return;
    }
    uploadedAssets.forEach((asset) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = asset.name;
      const button = document.createElement("button");
      button.textContent = "Add to scene";
      button.addEventListener("click", () => {
        const entity = world.createEntity(asset.name);
        world.addComponent(entity, createTransform({ position: [0, 0.5, 0] }));
        world.addComponent(entity, createGltf({ url: asset.url, name: asset.name }));
        selectEntity(entity.id);
        status.textContent = `Added ${asset.name} to scene.`;
      });
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.className = "danger";
      deleteBtn.addEventListener("click", () => {
        const index = uploadedAssets.findIndex((item) => item.url === asset.url);
        if (index >= 0) {
          URL.revokeObjectURL(uploadedAssets[index].url);
          uploadedAssets.splice(index, 1);
        }
        const worldIndex = worldAssets.findIndex((item) => item.url === asset.url);
        if (worldIndex >= 0) {
          worldAssets.splice(worldIndex, 1);
        }
        renderAssets();
      });
      li.append(name, button, deleteBtn);
      uploadedList.appendChild(li);
    });
  };

  renderAssets = () => {
    assetGrid.innerHTML = "";
    [...baseAssets, ...importedAssets].forEach((asset) => {
      const card = document.createElement("div");
      card.className = "asset-card";
      card.textContent = asset.name;
      card.addEventListener("click", () => {
        if (asset.type === "mesh") {
          const entity = world.createEntity(asset.name);
          world.addComponent(entity, createTransform());
          world.addComponent(
            entity,
            createMesh({ geometry: asset.geometry, material: { color: "#7fd9ff" } })
          );
          selectEntity(entity.id);
        }
        if (asset.type === "gltf") {
          const entity = world.createEntity(asset.name);
          world.addComponent(entity, createTransform({ position: [0, 0.5, 0] }));
          world.addComponent(entity, createGltf({ url: asset.url, name: asset.name }));
          selectEntity(entity.id);
        }
      });
      assetGrid.appendChild(card);
    });

    if (worldGrid) {
      worldGrid.innerHTML = "";
      worldAssets.forEach((asset) => {
        const card = document.createElement("div");
        card.className = "asset-card";
        card.textContent = asset.name;
        card.addEventListener("click", () => {
          loadWorldFromGltf(asset);
        });
        worldGrid.appendChild(card);
      });
    }
    renderUploads();
  };

  renderAssets();

  const handleFiles = (files, dropEvent) => {
    Array.from(files).forEach((file) => {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".gltf") && !lower.endsWith(".glb")) return;
      const url = URL.createObjectURL(file);
      const name = file.name.replace(/\\.(gltf|glb)$/i, "");
      const asset = { name, type: "gltf", url };
      importedAssets.push(asset);
      const position = dropEvent ? getDropPosition(dropEvent) : [0, 0.5, 0];
      const entity = world.createEntity(name);
      world.addComponent(entity, createTransform({ position }));
      world.addComponent(entity, createGltf({ url, name }));
      selectEntity(entity.id);
      status.textContent = `Imported ${file.name}.`;
    });
    renderAssets();
  };

  const onDragOver = (event) => {
    event.preventDefault();
  };

  const onDrop = (event) => {
    event.preventDefault();
    if (event.dataTransfer?.files?.length) {
      handleFiles(event.dataTransfer.files, event);
    }
  };

  canvas.addEventListener("dragover", onDragOver);
  canvas.addEventListener("drop", onDrop);
  assetGrid.addEventListener("dragover", onDragOver);
  assetGrid.addEventListener("drop", onDrop);
}

if (importFolderButton && importFolderInput) {
  importFolderButton.addEventListener("click", () => {
    importFolderInput.click();
  });

  importFolderInput.addEventListener("change", (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    uploadedAssets.length = 0;
    files.forEach((file) => {
      if (!file.name.toLowerCase().endsWith(".glb")) return;
      const url = URL.createObjectURL(file);
      const name = file.name.replace(/\\.glb$/i, "");
      uploadedAssets.push({ name, url, size: file.size });
      worldAssets.push({ name, type: "world", url });
    });
    renderAssets();
    status.textContent = `Imported ${files.length} file(s).`;
    importFolderInput.value = "";
  });
}

if (addEntityButton) {
  addEntityButton.addEventListener("click", () => {
    createEntity("New Entity");
  });
}

const boxHelperFor = (entity, map, color) => {
  let helper = map.get(entity.id);
  if (!helper) {
    helper = new THREE.Box3Helper(new THREE.Box3(), color);
    map.set(entity.id, helper);
    engine.scene.add(helper);
  }
  return helper;
};

const updateBoxHelpers = () => {
  world.getEntities().forEach((entity) => {
    const transform = entity.components.get(ComponentType.Transform);
    if (!transform) return;

    const collider = entity.components.get(ComponentType.Collider);
    if (collider) {
      if (!Array.isArray(collider.offset)) {
        collider.offset = [0, 0, 0];
      }
      const helper = boxHelperFor(entity, colliderHelpers, 0xffb357);
      const size = new THREE.Vector3(...collider.size).multiply(new THREE.Vector3(...transform.scale));
      const center = new THREE.Vector3(
        transform.position[0] + collider.offset[0],
        transform.position[1] + collider.offset[1],
        transform.position[2] + collider.offset[2]
      );
      const min = center.clone().addScaledVector(size, -0.5);
      const max = center.clone().addScaledVector(size, 0.5);
      helper.box.set(min, max);
    }

    const hitBox = entity.components.get(ComponentType.HitBox);
    if (hitBox) {
      if (!Array.isArray(hitBox.offset)) {
        hitBox.offset = [0, 0, 0];
      }
      const helper = boxHelperFor(entity, hitBoxHelpers, 0xff4d4d);
      const size = new THREE.Vector3(...hitBox.size).multiply(new THREE.Vector3(...transform.scale));
      const center = new THREE.Vector3(
        transform.position[0] + hitBox.offset[0],
        transform.position[1] + hitBox.offset[1],
        transform.position[2] + hitBox.offset[2]
      );
      const min = center.clone().addScaledVector(size, -0.5);
      const max = center.clone().addScaledVector(size, 0.5);
      helper.box.set(min, max);
    }

    const hurtBox = entity.components.get(ComponentType.HurtBox);
    if (hurtBox) {
      if (!Array.isArray(hurtBox.offset)) {
        hurtBox.offset = [0, 0, 0];
      }
      const helper = boxHelperFor(entity, hurtBoxHelpers, 0x4dd0ff);
      const size = new THREE.Vector3(...hurtBox.size).multiply(new THREE.Vector3(...transform.scale));
      const center = new THREE.Vector3(
        transform.position[0] + hurtBox.offset[0],
        transform.position[1] + hurtBox.offset[1],
        transform.position[2] + hurtBox.offset[2]
      );
      const min = center.clone().addScaledVector(size, -0.5);
      const max = center.clone().addScaledVector(size, 0.5);
      helper.box.set(min, max);
    }
  });
};

const initMonaco = async () => {
  const container = document.getElementById("codeEditor");
  if (!container) return;

  const loadScript = (url) =>
    new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });

  try {
    await loadScript("https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js");
    window.require.config({
      paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" },
    });

    window.require(["vs/editor/editor.main"], () => {
      window.monaco.editor.create(container, {
        value: "// Attach scripts to entities.\nfunction update(entity, dt) {\n  // TODO: player movement\n}\n",
        language: "javascript",
        theme: "vs-dark",
        minimap: { enabled: false },
        automaticLayout: true,
      });
    });
  } catch (error) {
    container.textContent = "Monaco failed to load. Check network or host it locally.";
  }
};

const animate = () => {
  syncWorldToScene(
    engine.scene,
    engine.world,
    engine.cache,
    engine.gltfLoader,
    engine.gltfLoading
  );
  orbitControls.update();
  updateBoxHelpers();
  engine.renderer.render(engine.scene, engine.camera);
  requestAnimationFrame(animate);
};

rebuildHierarchy();
rebuildInspector();
selectEntity(player.id);
initMonaco();
animate();
