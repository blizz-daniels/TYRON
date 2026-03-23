const startButtons = [
  document.getElementById("startGame"),
  document.getElementById("startGameAlt"),
];

const previewSection = document.querySelector(".preview");
const previewStage = document.querySelector(".preview__stage");
const heroSection = document.querySelector(".hero");
const featuresSection = document.querySelector(".features");
const ctaSection = document.querySelector(".cta");
const canvas = document.getElementById("scene");

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

  startGame();
};

startButtons.forEach((button) => {
  if (!button) return;
  button.addEventListener("click", () => {
    button.textContent = "Starting...";
    button.disabled = true;
    setTimeout(() => {
      button.textContent = "Start Game";
      button.disabled = false;
      enterGameMode();
    }, 400);
  });
});

if (canvas && window.THREE) {
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

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const resize = () => {
    const stage = previewStage || canvas.parentElement;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  const keyLight = new THREE.DirectionalLight(0x7cf5e6, 1);
  keyLight.position.set(6, 9, 5);
  const fillLight = new THREE.PointLight(0xff9f6e, 0.9);
  fillLight.position.set(-5, 4, -4);
  scene.add(ambient, keyLight, fillLight);

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

  const player = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.2, 0.7),
    new THREE.MeshStandardMaterial({
      color: 0xfb5f86,
      emissive: 0x3d1624,
      metalness: 0.4,
      roughness: 0.4,
    })
  );
  player.position.set(-2, 0.6, 0);
  scene.add(player);

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
      player.position.addScaledVector(direction, moveSpeed * delta);
      platform.position.x = player.position.x;
      platform.position.z = player.position.z;
      player.rotation.y = Math.atan2(direction.x, direction.z);
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
      player.position.x + x,
      player.position.y + y + 1,
      player.position.z + z
    );
    camera.lookAt(
      player.position.x,
      player.position.y + 0.8,
      player.position.z
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
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };
  animate();

  window.addEventListener("resize", resize);
} else if (previewStage) {
  const message = document.createElement("p");
  message.textContent = "3D preview unavailable (Three.js failed to load).";
  message.style.padding = "24px";
  message.style.color = "rgba(238, 242, 247, 0.7)";
  previewStage.appendChild(message);
}
