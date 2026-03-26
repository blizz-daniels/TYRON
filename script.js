import * as THREE from "three";
import { GLTFLoader } from "three/addons/GLTFLoader.js";

const startButtons = [
  document.getElementById("startGame"),
  document.getElementById("startGameAlt"),
];

const previewSection = document.querySelector(".preview");
const previewStage = document.querySelector(".preview__stage");
const previewStatus = document.getElementById("previewStatus");
const canvas = document.getElementById("scene");
let resizePreview = () => {};

if (canvas) {
  canvas.tabIndex = 0;
  canvas.setAttribute(
    "aria-label",
    "Live 3D preview of the Tyronian mythic world"
  );
}

const setPreviewStatus = (message) => {
  if (previewStatus) {
    previewStatus.textContent = message;
  }
};

let isGameActive = false;
let startGame = () => {
  // Placeholder hook for future game bootstrapping.
  console.info("Game start hook invoked.");
};

const enterGameMode = () => {
  if (isGameActive) return;
  isGameActive = true;
  document.body.classList.add("game-active");

  if (previewSection) {
    previewSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (canvas) {
    canvas.focus({ preventScroll: true });
  }

  setPreviewStatus("Preview focus active. WASD move, IJKL orbit.");
  requestAnimationFrame(() => resizePreview());
  startGame();
};

startButtons.forEach((button) => {
  if (!button) return;
  button.dataset.defaultLabel = button.textContent.trim();
  button.addEventListener("click", () => {
    button.textContent = "Starting...";
    button.disabled = true;
    setTimeout(() => {
      button.textContent = button.dataset.defaultLabel || "Start Game";
      button.disabled = false;
      enterGameMode();
    }, 400);
  });
});

if (canvas) {
  setPreviewStatus("Loading mythic preview...");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#090c15");
  scene.fog = new THREE.Fog("#090c15", 12, 30);

  const camera = new THREE.PerspectiveCamera(
    45,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    100
  );
  camera.position.set(6, 4, 7);
  camera.lookAt(0, 0.8, 0);

  let renderer;
  let rendererReady = true;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    });
  } catch (error) {
    setPreviewStatus("WebGL unavailable. Check browser settings.");
    console.error("WebGL renderer failed to initialize:", error);
    rendererReady = false;
  }
  if (rendererReady) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const resize = () => {
      const stage = previewStage || canvas.parentElement;
      if (!stage) return;
      const width = Math.max(stage.clientWidth, 1);
      const height = Math.max(stage.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resizePreview = resize;
    resize();

    if ("ResizeObserver" in window && previewStage) {
      const observer = new ResizeObserver(() => resize());
      observer.observe(previewStage);
      window.addEventListener("beforeunload", () => observer.disconnect(), {
        once: true,
      });
    } else {
      window.addEventListener("resize", resize);
    }

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const keyLight = new THREE.DirectionalLight(0x7cf5e6, 1);
    keyLight.position.set(6, 9, 5);
    const fillLight = new THREE.PointLight(0xff9f6e, 0.9);
    fillLight.position.set(-5, 4, -4);
    const skyLight = new THREE.HemisphereLight(0xffead1, 0x08111f, 0.7);
    scene.add(ambient, keyLight, fillLight, skyLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30, 30, 30),
    new THREE.MeshStandardMaterial({
      color: 0x101827,
      metalness: 0.1,
      roughness: 0.85,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const grid = new THREE.GridHelper(30, 30, 0x22304a, 0x121b2b);
  grid.position.y = 0.01;
  scene.add(grid);

  const worldCore = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1.1, 0.35, 120, 16),
    new THREE.MeshStandardMaterial({
      color: 0x3ad4c7,
      emissive: 0x0f3d3b,
      metalness: 0.6,
      roughness: 0.35,
    })
  );
  worldCore.position.y = 1.7;
  scene.add(worldCore);

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.6, 2.2, 24),
    new THREE.MeshStandardMaterial({
      color: 0xffb357,
      emissive: 0x3d2a10,
      metalness: 0.3,
      roughness: 0.4,
    })
  );
  beacon.position.set(3.6, 1.1, -2.2);
  scene.add(beacon);

  let playerMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.2, 0.7),
    new THREE.MeshStandardMaterial({
      color: 0xfb5f86,
      emissive: 0x3d1624,
      metalness: 0.4,
      roughness: 0.4,
    })
  );
  playerMesh.position.set(-2, 0.6, 0);
  scene.add(playerMesh);

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.6, 0.28, 32),
    new THREE.MeshStandardMaterial({
      color: 0x1f2a45,
      metalness: 0.5,
      roughness: 0.6,
    })
  );
  platform.position.set(-2, 0.14, 0);
  scene.add(platform);

  const obstacles = new THREE.Group();
  for (let i = 0; i < 10; i += 1) {
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 1.6 + Math.random() * 1.8, 0.6),
      new THREE.MeshStandardMaterial({
        color: 0x27314d,
        metalness: 0.25,
        roughness: 0.75,
      })
    );
    pillar.position.set(
      (Math.random() - 0.5) * 16,
      pillar.geometry.parameters.height / 2,
      (Math.random() - 0.5) * 16
    );
    obstacles.add(pillar);
  }
  scene.add(obstacles);

  const worldModelPath = "assets/world/village.glb";
  const spriteCandidates = [
    "assets/player/hero.png",
    "assets/player/character.png",
    "assets/player/player.png",
    "assets/player/sprite.png",
    "assets/player/hero.webp",
    "assets/player/hero.jpg",
  ];
  let worldLoaded = false;
  let portraitLoaded = false;

  const gltfLoader = new GLTFLoader();
  gltfLoader.load(
    worldModelPath,
    (gltf) => {
      const world = gltf.scene;
      const spawnMarker = world.getObjectByName("player");
      world.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
      world.position.set(0, 0, 0);
      world.scale.set(1.2, 1.2, 1.2);
      scene.add(world);
      worldLoaded = true;

      scene.remove(worldCore);
      scene.remove(beacon);
      scene.remove(obstacles);
      if (spawnMarker) {
        const spawnPosition = new THREE.Vector3();
        spawnMarker.getWorldPosition(spawnPosition);
        playerMesh.position.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);
        platform.position.set(spawnPosition.x, spawnPosition.y - 0.46, spawnPosition.z);
      }
      setPreviewStatus(
        portraitLoaded
          ? "Mythic world loaded. Preview ready."
          : "Mythic world loaded. Loading portrait..."
      );
    },
    undefined,
    (error) => {
      setPreviewStatus(
        portraitLoaded
          ? "Fallback arena active. Preview ready."
          : "World failed to load. Using the fallback arena."
      );
      console.warn("Failed to load world model:", error);
    }
  );

  const textureLoader = new THREE.TextureLoader();
  const tryLoadSprite = (index = 0) => {
    if (index >= spriteCandidates.length) {
      setPreviewStatus("Preview ready. No player portrait found.");
      console.warn("No player sprite found in assets/player.");
      return;
    }

    textureLoader.load(
      spriteCandidates[index],
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        const spriteMaterial = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
        });
        const spritePlane = new THREE.Mesh(
          new THREE.PlaneGeometry(1.2, 1.8),
          spriteMaterial
        );
        spritePlane.position.copy(playerMesh.position);
        spritePlane.position.y = 0.9;
        scene.remove(playerMesh);
        playerMesh = spritePlane;
        scene.add(playerMesh);
        portraitLoaded = true;
        setPreviewStatus(
          worldLoaded
            ? "Mythic world loaded. Preview ready."
            : "Fallback arena active. Portrait loaded."
        );
      },
      undefined,
      () => {
        tryLoadSprite(index + 1);
      }
    );
  };
  tryLoadSprite();

  const keys = new Set();
  const orbit = {
    radius: 8,
    azimuth: Math.PI * 0.3,
    polar: Math.PI * 0.32,
  };

  const onKeyDown = (event) => {
    keys.add(event.key.toLowerCase());
  };

  const onKeyUp = (event) => {
    keys.delete(event.key.toLowerCase());
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => keys.clear());

  const moveSpeed = 4.2;
  const orbitSpeed = 1.6;
  const clock = new THREE.Clock();

  const updatePlayer = (delta) => {
    const direction = new THREE.Vector3();
    if (keys.has("w")) direction.z -= 1;
    if (keys.has("s")) direction.z += 1;
    if (keys.has("a")) direction.x -= 1;
    if (keys.has("d")) direction.x += 1;

    if (direction.lengthSq() > 0) {
      direction.normalize();
      playerMesh.position.addScaledVector(direction, moveSpeed * delta);
      platform.position.x = playerMesh.position.x;
      platform.position.z = playerMesh.position.z;
      playerMesh.rotation.y = Math.atan2(direction.x, direction.z);
    }
  };

  const updateOrbit = (delta) => {
    if (keys.has("j")) orbit.azimuth += orbitSpeed * delta;
    if (keys.has("l")) orbit.azimuth -= orbitSpeed * delta;
    if (keys.has("i")) orbit.polar -= orbitSpeed * delta;
    if (keys.has("k")) orbit.polar += orbitSpeed * delta;

    orbit.polar = Math.min(Math.max(orbit.polar, 0.2), Math.PI * 0.48);

    const x = orbit.radius * Math.sin(orbit.polar) * Math.cos(orbit.azimuth);
    const z = orbit.radius * Math.sin(orbit.polar) * Math.sin(orbit.azimuth);
    const y = orbit.radius * Math.cos(orbit.polar);

    camera.position.set(
      playerMesh.position.x + x,
      playerMesh.position.y + y + 1,
      playerMesh.position.z + z
    );
    camera.lookAt(
      playerMesh.position.x,
      playerMesh.position.y + 0.8,
      playerMesh.position.z
    );
  };

  const animate = () => {
    const delta = clock.getDelta();
    worldCore.rotation.y += 0.6 * delta;
    worldCore.rotation.x += 0.2 * delta;
    updatePlayer(delta);
    if (isGameActive) {
      updateOrbit(delta);
    }

    if (playerMesh.geometry.type === "PlaneGeometry") {
      playerMesh.lookAt(
        camera.position.x,
        playerMesh.position.y,
        camera.position.z
      );
    }

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };
  animate();
  }
}
