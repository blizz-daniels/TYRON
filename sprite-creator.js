const createCharacterButton = document.getElementById("createCharacterBtn");
const characterNameInput = document.getElementById("characterNameInput");
const spriteImageInput = document.getElementById("spriteImageInput");
const photoList = document.getElementById("photoList");
const animationList = document.getElementById("animationList");
const animationFramesBoard = document.getElementById("animationFramesBoard");
const saveExportButton = document.getElementById("saveExportBtn");
const createAnimationButton = document.getElementById("createAnimationBtn");
const updateAnimationButton = document.getElementById("updateAnimationBtn");
const deleteAnimationButton = document.getElementById("deleteAnimationBtn");
const animationNameInput = document.getElementById("animationNameInput");
const clipNameInput = document.getElementById("clipNameInput");
const fpsInput = document.getElementById("fpsInput");
const frameDurationInput = document.getElementById("frameDurationInput");
const alignCanvas = document.getElementById("alignCanvas");
const canvasWidthInput = document.getElementById("canvasWidthInput");
const canvasHeightInput = document.getElementById("canvasHeightInput");
const applyCanvasSizeButton = document.getElementById("applyCanvasSizeBtn");
const fitImageButton = document.getElementById("fitImageBtn");
const undoSpriteButton = document.getElementById("undoSpriteBtn");
const redoSpriteButton = document.getElementById("redoSpriteBtn");
const posXInput = document.getElementById("posXInput");
const posYInput = document.getElementById("posYInput");
const scaleInput = document.getElementById("scaleInput");
const rotationInput = document.getElementById("rotationInput");
const statusText = document.getElementById("statusText");

const state = {
  characterName: "",
  photos: [],
  animations: [],
  selectedPhotoId: null,
  selectedAnimationId: null,
  frameSelection: new Set(),
  canvasSize: {
    width: 512,
    height: 512,
  },
};

const dragState = {
  active: false,
  pointerId: null,
  offsetX: 0,
  offsetY: 0,
};

const spriteHistory = {
  past: [],
  future: [],
  isRestoring: false,
};
const SPRITE_HISTORY_LIMIT = 40;

const alignContext = alignCanvas.getContext("2d");

const createId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(16).slice(2)}`;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const sanitizeSegment = (value, fallback = "item") => {
  const normalized = (value || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "");
  return normalized || fallback;
};

const toNumber = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sortByNaturalName = (a, b) =>
  a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });

const setStatus = (message) => {
  if (statusText) {
    statusText.textContent = message;
  }
};

const getSelectedPhoto = () =>
  state.photos.find((photo) => photo.id === state.selectedPhotoId) || null;

const getPhotoById = (photoId) =>
  state.photos.find((photo) => photo.id === photoId) || null;

const getSelectedAnimation = () =>
  state.animations.find((animation) => animation.id === state.selectedAnimationId) || null;

const cloneSpriteAnimation = (animation) => ({
  id: animation.id,
  name: animation.name,
  clipName: animation.clipName,
  fps: animation.fps,
  frameDurationMs: animation.frameDurationMs,
  frames: [...animation.frames],
  collision: {
    size: Array.isArray(animation.collision?.size) ? [...animation.collision.size] : [1, 1, 0.2],
    offset: Array.isArray(animation.collision?.offset) ? [...animation.collision.offset] : [0, 0, 0],
  },
  hitBox: {
    size: Array.isArray(animation.hitBox?.size) ? [...animation.hitBox.size] : [1, 1, 0.2],
    offset: Array.isArray(animation.hitBox?.offset) ? [...animation.hitBox.offset] : [0, 0, 0],
  },
  hurtBox: {
    size: Array.isArray(animation.hurtBox?.size) ? [...animation.hurtBox.size] : [1, 1, 0.2],
    offset: Array.isArray(animation.hurtBox?.offset) ? [...animation.hurtBox.offset] : [0, 0, 0],
  },
  dedicatedKey: animation.dedicatedKey ?? "",
});

const captureSpriteSnapshot = () => ({
  characterName: state.characterName,
  photos: state.photos.map((photo) => ({
    id: photo.id,
    name: photo.name,
    file: photo.file,
    url: photo.url,
    image: photo.image,
      transform: { ...photo.transform },
    })),
  animations: state.animations.map((animation) => cloneSpriteAnimation(animation)),
  frameSelection: [...state.frameSelection],
  canvasSize: { ...state.canvasSize },
});

const snapshotComparable = (snapshot) => ({
  characterName: snapshot.characterName,
  photos: snapshot.photos.map((photo) => ({
    id: photo.id,
    name: photo.name,
    url: photo.url,
    transform: photo.transform,
  })),
  animations: snapshot.animations,
  frameSelection: snapshot.frameSelection,
  canvasSize: snapshot.canvasSize,
});

const snapshotsMatch = (a, b) =>
  JSON.stringify(snapshotComparable(a)) === JSON.stringify(snapshotComparable(b));

const updateSpriteHistoryButtons = () => {
  const currentSnapshot = captureSpriteSnapshot();
  const canUndo =
    spriteHistory.past.length > 1 ||
    (spriteHistory.past.length === 1 && !snapshotsMatch(spriteHistory.past[0], currentSnapshot));
  if (undoSpriteButton) {
    undoSpriteButton.disabled = !canUndo;
  }
  if (redoSpriteButton) {
    redoSpriteButton.disabled = spriteHistory.future.length === 0;
  }
};

const pushSpriteHistory = () => {
  if (spriteHistory.isRestoring) return;
  const snapshot = captureSpriteSnapshot();
  const last = spriteHistory.past[spriteHistory.past.length - 1];
  if (last && snapshotsMatch(last, snapshot)) return;

  spriteHistory.past.push(snapshot);
  if (spriteHistory.past.length > SPRITE_HISTORY_LIMIT) {
    spriteHistory.past.shift();
  }
  spriteHistory.future.length = 0;
  updateSpriteHistoryButtons();
};

const restoreSpriteSnapshot = (snapshot, message) => {
  spriteHistory.isRestoring = true;
  try {
    const currentPhotoSelection = state.selectedPhotoId;
    const currentAnimationSelection = state.selectedAnimationId;

    state.characterName = snapshot.characterName;
    if (characterNameInput) {
      characterNameInput.value = snapshot.characterName;
    }

    state.photos = snapshot.photos.map((photo) => ({
      ...photo,
      transform: { ...photo.transform },
    }));
    state.animations = snapshot.animations.map((animation) =>
      cloneSpriteAnimation(animation)
    );

    state.selectedPhotoId = state.photos.some((photo) => photo.id === currentPhotoSelection)
      ? currentPhotoSelection
      : state.photos[0]?.id ?? null;
    state.selectedAnimationId = state.animations.some(
      (animation) => animation.id === currentAnimationSelection
    )
      ? currentAnimationSelection
      : state.animations[0]?.id ?? null;
    state.frameSelection = new Set(
      snapshot.frameSelection.filter((photoId) =>
        state.photos.some((photo) => photo.id === photoId)
      )
    );
    state.canvasSize = { ...snapshot.canvasSize };

    syncCanvasElementSize();
    renderPhotoList();
    renderAnimationList();
    renderAnimationFramesBoard();
    updateTransformInputs();
    drawCanvas();
    if (message) {
      setStatus(message);
    }
  } finally {
    spriteHistory.isRestoring = false;
    updateSpriteHistoryButtons();
  }
};

const undoSpriteChange = () => {
  if (!spriteHistory.past.length) return;
  const current = captureSpriteSnapshot();
  const snapshot = spriteHistory.past.pop();
  spriteHistory.future.push(current);
  restoreSpriteSnapshot(snapshot, "Undid last sprite edit.");
};

const redoSpriteChange = () => {
  if (!spriteHistory.future.length) return;
  const current = captureSpriteSnapshot();
  const snapshot = spriteHistory.future.pop();
  spriteHistory.past.push(current);
  restoreSpriteSnapshot(snapshot, "Redid last sprite edit.");
};

const ensureCharacterName = () => {
  const typed = (characterNameInput?.value || "").trim();
  if (typed) {
    state.characterName = typed;
    return typed;
  }

  const prompted = window.prompt(
    "Create character name (used for /sprites/<character>/...):",
    state.characterName || "new_character"
  );
  if (!prompted) return "";

  const clean = prompted.trim();
  if (!clean) return "";
  state.characterName = clean;
  if (characterNameInput) {
    characterNameInput.value = clean;
  }
  return clean;
};

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

const getNaturalOrderPhotoIds = () => state.photos.map((photo) => photo.id);

const sortedFrameSelection = () => {
  const order = getNaturalOrderPhotoIds();
  return order.filter((photoId) => state.frameSelection.has(photoId));
};

const centerPoint = () => ({
  x: state.canvasSize.width / 2,
  y: state.canvasSize.height / 2,
});

const fitPhotoToCanvas = (photo) => {
  if (!photo?.image) return;
  const fitScale = Math.min(
    state.canvasSize.width / photo.image.width,
    state.canvasSize.height / photo.image.height
  );
  photo.transform.scale = Number.isFinite(fitScale) ? clamp(fitScale, 0.01, 100) : 1;
  const center = centerPoint();
  photo.transform.x = center.x;
  photo.transform.y = center.y;
  photo.transform.rotation = 0;
};

const updateTransformInputs = () => {
  const photo = getSelectedPhoto();
  if (!photo) {
    posXInput.value = state.canvasSize.width / 2;
    posYInput.value = state.canvasSize.height / 2;
    scaleInput.value = 1;
    rotationInput.value = 0;
    return;
  }

  posXInput.value = photo.transform.x.toFixed(2);
  posYInput.value = photo.transform.y.toFixed(2);
  scaleInput.value = photo.transform.scale.toFixed(3);
  rotationInput.value = photo.transform.rotation.toFixed(2);
};

const drawGuides = (ctx) => {
  const { width, height } = state.canvasSize;
  ctx.save();

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#09111d";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  const step = 32;
  for (let x = step; x < width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = step; y < height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const center = centerPoint();
  ctx.strokeStyle = "rgba(74,212,168,0.6)";
  ctx.beginPath();
  ctx.moveTo(center.x, 0);
  ctx.lineTo(center.x, height);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,190,106,0.6)";
  ctx.beginPath();
  ctx.moveTo(0, center.y);
  ctx.lineTo(width, center.y);
  ctx.stroke();

  ctx.restore();
};

const drawPhoto = (ctx, photo, { withOutline = false } = {}) => {
  if (!photo?.image) return;

  ctx.save();
  ctx.translate(photo.transform.x, photo.transform.y);
  ctx.rotate((photo.transform.rotation * Math.PI) / 180);
  ctx.scale(photo.transform.scale, photo.transform.scale);
  ctx.drawImage(photo.image, -photo.image.width / 2, -photo.image.height / 2);

  if (withOutline) {
    ctx.strokeStyle = "rgba(74,212,168,0.95)";
    ctx.lineWidth = 2 / photo.transform.scale;
    ctx.strokeRect(
      -photo.image.width / 2,
      -photo.image.height / 2,
      photo.image.width,
      photo.image.height
    );
  }

  ctx.restore();
};

const drawCanvas = () => {
  drawGuides(alignContext);

  const photo = getSelectedPhoto();
  if (photo) {
    drawPhoto(alignContext, photo, { withOutline: true });
    return;
  }

  alignContext.save();
  alignContext.fillStyle = "rgba(231,237,246,0.75)";
  alignContext.font = "600 16px Space Grotesk, Manrope, sans-serif";
  alignContext.textAlign = "center";
  alignContext.fillText(
    "No image selected. Create character and import photos.",
    state.canvasSize.width / 2,
    state.canvasSize.height / 2
  );
  alignContext.restore();
};

const renderPhotoList = () => {
  if (!photoList) return;
  photoList.innerHTML = "";

  if (!state.photos.length) {
    const empty = document.createElement("li");
    empty.className = "photo-item";
    empty.textContent = "No photos imported yet.";
    photoList.appendChild(empty);
    return;
  }

  state.photos.forEach((photo, index) => {
    const li = document.createElement("li");
    li.className = "photo-item";

    const row = document.createElement("div");
    row.className = "photo-item__row";

    const frameCheck = document.createElement("input");
    frameCheck.type = "checkbox";
    frameCheck.checked = state.frameSelection.has(photo.id);
    frameCheck.addEventListener("change", () => {
      pushSpriteHistory();
      if (frameCheck.checked) {
        state.frameSelection.add(photo.id);
      } else {
        state.frameSelection.delete(photo.id);
      }
      renderAnimationFramesBoard();
    });

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "photo-select";
    if (state.selectedPhotoId === photo.id) {
      selectButton.classList.add("active");
    }
    selectButton.textContent = photo.name;
    selectButton.addEventListener("click", () => {
      state.selectedPhotoId = photo.id;
      updateTransformInputs();
      renderPhotoList();
      drawCanvas();
      setStatus(`Selected photo: ${photo.name}`);
    });

    row.append(frameCheck, selectButton);
    li.appendChild(row);

    const meta = document.createElement("small");
    meta.textContent = `#${index + 1} - ${photo.image.width}x${photo.image.height}`;
    li.appendChild(meta);
    photoList.appendChild(li);
  });
};

const renderAnimationList = () => {
  if (!animationList) return;
  animationList.innerHTML = "";

  if (!state.animations.length) {
    const empty = document.createElement("li");
    empty.className = "animation-item";
    empty.textContent = "No animations yet.";
    animationList.appendChild(empty);
    return;
  }

  state.animations.forEach((animation) => {
    const li = document.createElement("li");
    li.className = "animation-item";
    if (animation.id === state.selectedAnimationId) {
      li.classList.add("active");
    }

    const head = document.createElement("div");
    head.className = "animation-item__head";
    const nameButton = document.createElement("button");
    nameButton.type = "button";
    nameButton.className = "photo-select";
    nameButton.textContent = animation.name;
    nameButton.addEventListener("click", () => {
      state.selectedAnimationId = animation.id;
      animationNameInput.value = animation.name;
      clipNameInput.value = animation.clipName;
      fpsInput.value = animation.fps;
      frameDurationInput.value = animation.frameDurationMs;
      state.frameSelection = new Set(animation.frames);
      if (animation.frames.length) {
        state.selectedPhotoId = animation.frames[0];
      }
      renderPhotoList();
      renderAnimationList();
      renderAnimationFramesBoard();
      updateTransformInputs();
      drawCanvas();
      setStatus(`Editing animation: ${animation.name}`);
    });

    head.appendChild(nameButton);
    li.appendChild(head);

    const firstFrameName =
      state.photos.find((photo) => photo.id === animation.frames[0])?.name || "none";
    const meta = document.createElement("small");
    meta.textContent = `clip: ${animation.clipName}.mp4 | fps: ${animation.fps} | frame ms: ${animation.frameDurationMs} | frames: ${animation.frames.length} (first: ${firstFrameName})`;
    li.appendChild(meta);
    animationList.appendChild(li);
  });
};

const createFrameThumb = (photoId, frameIndex) => {
  const figure = document.createElement("figure");
  figure.className = "frame-thumb";

  const image = document.createElement("img");
  const photo = getPhotoById(photoId);
  image.src = photo?.url || "";
  image.alt = photo ? `${photo.name} frame preview` : `Missing frame ${frameIndex + 1}`;

  const caption = document.createElement("figcaption");
  caption.textContent = `${frameIndex + 1}. ${photo?.name || "Missing image"}`;

  figure.append(image, caption);
  return figure;
};

const appendAnimationFrameGroup = ({ title, frames, isActive = false }) => {
  if (!animationFramesBoard) return;
  const card = document.createElement("article");
  card.className = "animation-frame-group";
  if (isActive) {
    card.classList.add("active");
  }

  const head = document.createElement("div");
  head.className = "animation-frame-group__head";

  const titleEl = document.createElement("h3");
  titleEl.className = "animation-frame-group__title";
  titleEl.textContent = title;

  const meta = document.createElement("span");
  meta.className = "animation-frame-group__meta";
  meta.textContent = `${frames.length} frame${frames.length === 1 ? "" : "s"}`;

  const strip = document.createElement("div");
  strip.className = "animation-frame-strip";
  if (frames.length) {
    frames.forEach((photoId, index) => {
      strip.appendChild(createFrameThumb(photoId, index));
    });
  } else {
    const empty = document.createElement("p");
    empty.className = "animation-frames-board__empty";
    empty.textContent = "No frames selected.";
    strip.appendChild(empty);
  }

  head.append(titleEl, meta);
  card.append(head, strip);
  animationFramesBoard.appendChild(card);
};

const renderAnimationFramesBoard = () => {
  if (!animationFramesBoard) return;
  animationFramesBoard.innerHTML = "";

  const draftName = animationNameInput.value.trim() || "Current Draft";
  appendAnimationFrameGroup({
    title: `Draft: ${draftName}`,
    frames: sortedFrameSelection(),
    isActive: !state.selectedAnimationId,
  });

  if (!state.animations.length) {
    return;
  }

  state.animations.forEach((animation) => {
    appendAnimationFrameGroup({
      title: animation.name,
      frames: animation.frames,
      isActive: animation.id === state.selectedAnimationId,
    });
  });
};

const syncCanvasElementSize = () => {
  alignCanvas.width = state.canvasSize.width;
  alignCanvas.height = state.canvasSize.height;
  canvasWidthInput.value = state.canvasSize.width;
  canvasHeightInput.value = state.canvasSize.height;
  drawCanvas();
};

const applyTransformInputs = () => {
  const photo = getSelectedPhoto();
  if (!photo) return;

  pushSpriteHistory();
  photo.transform.x = toNumber(posXInput.value, photo.transform.x);
  photo.transform.y = toNumber(posYInput.value, photo.transform.y);
  photo.transform.scale = clamp(toNumber(scaleInput.value, photo.transform.scale), 0.01, 100);
  photo.transform.rotation = toNumber(rotationInput.value, photo.transform.rotation);
  drawCanvas();
};

const pointInsidePhoto = (photo, x, y) => {
  if (!photo?.image) return false;

  const dx = x - photo.transform.x;
  const dy = y - photo.transform.y;
  const rad = (-photo.transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const halfW = (photo.image.width * photo.transform.scale) / 2;
  const halfH = (photo.image.height * photo.transform.scale) / 2;
  return Math.abs(localX) <= halfW && Math.abs(localY) <= halfH;
};

const pointerToCanvas = (event) => {
  const rect = alignCanvas.getBoundingClientRect();
  const sx = state.canvasSize.width / rect.width;
  const sy = state.canvasSize.height / rect.height;
  return {
    x: (event.clientX - rect.left) * sx,
    y: (event.clientY - rect.top) * sy,
  };
};

const createAnimationPayloadFromInputs = () => {
  const rawName = animationNameInput.value.trim();
  if (!rawName) {
    throw new Error("Animation name is required.");
  }
  const frames = sortedFrameSelection();
  if (!frames.length) {
    throw new Error("Select at least one photo for this animation.");
  }

  const fps = clamp(Math.round(toNumber(fpsInput.value, 12)), 1, 60);
  const frameDurationMs = clamp(Math.round(toNumber(frameDurationInput.value, 120)), 16, 5000);

  return {
    name: rawName,
    clipName: clipNameInput.value.trim() || `${rawName}_clip`,
    fps,
    frameDurationMs,
    frames,
  };
};

const createAnimation = () => {
  if (!state.photos.length) {
    setStatus("Import sprite photos first.");
    return;
  }
  try {
    const payload = createAnimationPayloadFromInputs();
    const duplicate = state.animations.find(
      (animation) => animation.name.toLowerCase() === payload.name.toLowerCase()
    );
    if (duplicate) {
      setStatus(`Animation "${payload.name}" already exists. Use Update Selected.`);
      return;
    }

    pushSpriteHistory();
    const created = {
      id: createId(),
      ...payload,
    };
    state.animations.push(created);
    state.selectedAnimationId = created.id;
    renderAnimationList();
    renderAnimationFramesBoard();
    setStatus(`Created animation "${created.name}" with ${created.frames.length} frame(s).`);
  } catch (error) {
    setStatus(error.message);
  }
};

const updateSelectedAnimation = () => {
  const target = getSelectedAnimation();
  if (!target) {
    setStatus("Select an animation to update.");
    return;
  }

  try {
    const payload = createAnimationPayloadFromInputs();
    const duplicate = state.animations.find(
      (animation) =>
        animation.id !== target.id &&
        animation.name.toLowerCase() === payload.name.toLowerCase()
    );
    if (duplicate) {
      setStatus(`Animation "${payload.name}" already exists.`);
      return;
    }

    pushSpriteHistory();
    target.name = payload.name;
    target.clipName = payload.clipName;
    target.fps = payload.fps;
    target.frameDurationMs = payload.frameDurationMs;
    target.frames = payload.frames;
    renderAnimationList();
    renderAnimationFramesBoard();
    setStatus(`Updated animation "${target.name}".`);
  } catch (error) {
    setStatus(error.message);
  }
};

const deleteSelectedAnimation = () => {
  const target = getSelectedAnimation();
  if (!target) {
    setStatus("Select an animation to delete.");
    return;
  }

  pushSpriteHistory();
  state.animations = state.animations.filter((animation) => animation.id !== target.id);
  state.selectedAnimationId = state.animations[0]?.id || null;
  renderAnimationList();
  renderAnimationFramesBoard();
  setStatus(`Deleted animation "${target.name}".`);
};

const getPreferredRecorderMimeType = () => {
  if (typeof MediaRecorder === "undefined") return "";

  const candidates = [
    'video/mp4;codecs="avc1.42E01E"',
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
};

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const drawExportFrame = (ctx, photo, width, height) => {
  ctx.clearRect(0, 0, width, height);
  drawPhoto(ctx, photo);
};

const renderAnimationClip = async (animation) => {
  const mimeType = getPreferredRecorderMimeType();
  if (!mimeType) {
    throw new Error("No browser encoder is available for video export.");
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = state.canvasSize.width;
  exportCanvas.height = state.canvasSize.height;
  const exportContext = exportCanvas.getContext("2d");
  const stream = exportCanvas.captureStream(animation.fps);

  const chunks = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const stopPromise = new Promise((resolve, reject) => {
    recorder.onerror = (event) => {
      reject(event.error || new Error("Failed to encode animation clip."));
    };
    recorder.onstop = () => {
      resolve();
    };
  });

  recorder.start();

  for (const photoId of animation.frames) {
    const photo = state.photos.find((item) => item.id === photoId);
    if (!photo) continue;
    drawExportFrame(exportContext, photo, exportCanvas.width, exportCanvas.height);
    await wait(animation.frameDurationMs);
  }

  await wait(Math.max(60, animation.frameDurationMs / 2));
  recorder.stop();
  await stopPromise;
  stream.getTracks().forEach((track) => track.stop());

  return {
    blob: new Blob(chunks, { type: mimeType }),
    mimeType,
  };
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

const exportSpriteFolder = async () => {
  const characterName = ensureCharacterName();
  if (!characterName) {
    setStatus("Character name is required.");
    return;
  }
  if (!state.animations.length) {
    setStatus("Create at least one animation before saving.");
    return;
  }
  if (!window.JSZip) {
    setStatus("JSZip did not load. Check network and reload this page.");
    return;
  }

  const zip = new window.JSZip();
  const root = zip.folder("sprites");
  const characterFolder = root.folder(sanitizeSegment(characterName, "character"));
  const manifest = {
    character: characterName,
    canvas: { ...state.canvasSize },
    animations: [],
  };

  saveExportButton.disabled = true;
  let usedWebmFallback = false;

  try {
    for (const animation of state.animations) {
      if (!animation.frames.length) continue;

      setStatus(`Rendering "${animation.name}"...`);
      const rendered = await renderAnimationClip(animation);
      const isMp4 = rendered.mimeType.includes("mp4");
      const extension = isMp4 ? "mp4" : "webm";
      if (!isMp4) {
        usedWebmFallback = true;
      }

      const animationFolder = characterFolder.folder(
        sanitizeSegment(animation.name, "animation")
      );
      const clipBase = sanitizeSegment(animation.clipName || animation.name, "clip");
      animationFolder.file(`${clipBase}.${extension}`, rendered.blob);

      manifest.animations.push({
        name: animation.name,
        clip: `${clipBase}.${extension}`,
        fps: animation.fps,
        frameDurationMs: animation.frameDurationMs,
        frameCount: animation.frames.length,
        framePhotos: animation.frames
          .map((photoId) => state.photos.find((photo) => photo.id === photoId))
          .filter(Boolean)
          .map((photo) => ({
            name: photo.name,
            transform: { ...photo.transform },
          })),
      });
    }

    characterFolder.file("manifest.json", JSON.stringify(manifest, null, 2));
    setStatus("Packaging sprite folder...");
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const zipName = `${sanitizeSegment(characterName, "character")}_sprites.zip`;
    downloadBlob(zipBlob, zipName);
    if (usedWebmFallback) {
      setStatus(
        `Saved ${zipName}. Browser encoder exported some clips as .webm; folder structure is unchanged.`
      );
    } else {
      setStatus(`Saved ${zipName} with /sprites/${sanitizeSegment(characterName)}/...`);
    }
  } catch (error) {
    setStatus(`Save failed: ${error.message}`);
  } finally {
    saveExportButton.disabled = false;
  }
};

const importPhotos = async (files) => {
  if (!files.length) return;
  const characterName = ensureCharacterName();
  if (!characterName) {
    setStatus("Character creation canceled.");
    return;
  }

  const images = files.filter((file) => file.type.startsWith("image/"));
  if (!images.length) {
    setStatus("No image files selected.");
    return;
  }

  const importedPhotos = [];
  for (const file of images) {
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      const photo = {
        id: createId(),
        name: file.name.replace(/\.[a-zA-Z0-9]+$/, ""),
        file,
        url,
        image,
        transform: {
          x: centerPoint().x,
          y: centerPoint().y,
          scale: 1,
          rotation: 0,
        },
      };
      fitPhotoToCanvas(photo);
      importedPhotos.push(photo);
    } catch (_) {
      URL.revokeObjectURL(url);
    }
  }

  if (importedPhotos.length) {
    pushSpriteHistory();
    state.photos.push(...importedPhotos);
    state.photos.sort(sortByNaturalName);
    if (!state.selectedPhotoId) {
      state.selectedPhotoId = state.photos[0].id;
    }
    renderPhotoList();
    renderAnimationFramesBoard();
    drawCanvas();
    updateTransformInputs();
    setStatus(
      `Created character "${characterName}" and imported ${importedPhotos.length} photo(s). Create animation next.`
    );
  } else {
    setStatus("Image import failed.");
  }
};

createCharacterButton?.addEventListener("click", () => {
  const characterName = ensureCharacterName();
  if (!characterName) {
    setStatus("Character name is required.");
    return;
  }

  setStatus(`Create character "${characterName}": choose sprite photos to import.`);
  spriteImageInput?.click();
});

characterNameInput?.addEventListener("input", () => {
  pushSpriteHistory();
  state.characterName = characterNameInput.value.trim();
});

animationNameInput?.addEventListener("input", () => {
  renderAnimationFramesBoard();
});

clipNameInput?.addEventListener("input", () => {
});

fpsInput?.addEventListener("input", () => {
});

frameDurationInput?.addEventListener("input", () => {
});

spriteImageInput?.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  await importPhotos(files);
  spriteImageInput.value = "";
});

createAnimationButton?.addEventListener("click", createAnimation);
updateAnimationButton?.addEventListener("click", updateSelectedAnimation);
deleteAnimationButton?.addEventListener("click", deleteSelectedAnimation);
saveExportButton?.addEventListener("click", exportSpriteFolder);
undoSpriteButton?.addEventListener("click", undoSpriteChange);
redoSpriteButton?.addEventListener("click", redoSpriteChange);

document.addEventListener(
  "keydown",
  (event) => {
  const key = event.key.toLowerCase();
  const isUndo = (event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey;
  const isRedo =
    (event.ctrlKey || event.metaKey) &&
    (key === "y" || (key === "z" && event.shiftKey));

  if (!isUndo && !isRedo) return;

  event.stopPropagation();
  event.preventDefault();
  if (isUndo) {
    undoSpriteChange();
  } else {
    redoSpriteChange();
  }
  },
  { capture: true }
);

[posXInput, posYInput, scaleInput, rotationInput].forEach((input) => {
  input?.addEventListener("input", applyTransformInputs);
});

applyCanvasSizeButton?.addEventListener("click", () => {
  pushSpriteHistory();
  const nextWidth = clamp(Math.round(toNumber(canvasWidthInput.value, 512)), 64, 4096);
  const nextHeight = clamp(Math.round(toNumber(canvasHeightInput.value, 512)), 64, 4096);
  state.canvasSize.width = nextWidth;
  state.canvasSize.height = nextHeight;
  syncCanvasElementSize();
  setStatus(`Canvas resized to ${nextWidth}x${nextHeight}.`);
});

fitImageButton?.addEventListener("click", () => {
  const photo = getSelectedPhoto();
  if (!photo) {
    setStatus("Select a photo first.");
    return;
  }
  pushSpriteHistory();
  fitPhotoToCanvas(photo);
  updateTransformInputs();
  drawCanvas();
  setStatus(`Fitted "${photo.name}" to canvas.`);
});

alignCanvas.addEventListener("pointerdown", (event) => {
  const photo = getSelectedPhoto();
  if (!photo) return;
  const point = pointerToCanvas(event);
  if (!pointInsidePhoto(photo, point.x, point.y)) return;

  pushSpriteHistory();
  dragState.active = true;
  dragState.pointerId = event.pointerId;
  dragState.offsetX = point.x - photo.transform.x;
  dragState.offsetY = point.y - photo.transform.y;
  alignCanvas.setPointerCapture(event.pointerId);
});

alignCanvas.addEventListener("pointermove", (event) => {
  if (!dragState.active || dragState.pointerId !== event.pointerId) return;
  const photo = getSelectedPhoto();
  if (!photo) return;
  const point = pointerToCanvas(event);
  photo.transform.x = point.x - dragState.offsetX;
  photo.transform.y = point.y - dragState.offsetY;
  updateTransformInputs();
  drawCanvas();
});

const stopDrag = (event) => {
  if (!dragState.active || dragState.pointerId !== event.pointerId) return;
  dragState.active = false;
  dragState.pointerId = null;
  try {
    alignCanvas.releasePointerCapture(event.pointerId);
  } catch (_) {}
};

alignCanvas.addEventListener("pointerup", stopDrag);
alignCanvas.addEventListener("pointercancel", stopDrag);
alignCanvas.addEventListener("pointerleave", stopDrag);

alignCanvas.addEventListener(
  "wheel",
  (event) => {
    const photo = getSelectedPhoto();
    if (!photo) return;
    event.preventDefault();
    pushSpriteHistory();
    const direction = Math.sign(event.deltaY);
    const multiplier = direction > 0 ? 0.96 : 1.04;
    photo.transform.scale = clamp(photo.transform.scale * multiplier, 0.01, 100);
    updateTransformInputs();
    drawCanvas();
  },
  { passive: false }
);

window.addEventListener("beforeunload", () => {
  state.photos.forEach((photo) => {
    URL.revokeObjectURL(photo.url);
  });
});

syncCanvasElementSize();
updateTransformInputs();
renderPhotoList();
renderAnimationList();
renderAnimationFramesBoard();
drawCanvas();
updateSpriteHistoryButtons();
pushSpriteHistory();
