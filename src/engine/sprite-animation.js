import * as THREE from "three";

const DEFAULT_FPS = 12;
const DEFAULT_LOOP = true;
const DEFAULT_COLLIDER = Object.freeze({
  type: "box",
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  depth: 0.1,
});

const textureLoader = new THREE.TextureLoader();
const sharedTextureCache = new Map();

const normalizeString = (value, fallback = "") =>
  typeof value === "string" ? value.trim() : fallback;

export const normalizeSpriteKey = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const naturalSort = (a, b) =>
  String(a ?? "").localeCompare(String(b ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });

export const createDefaultSpriteCollider = () => ({
  type: DEFAULT_COLLIDER.type,
  x: DEFAULT_COLLIDER.x,
  y: DEFAULT_COLLIDER.y,
  width: DEFAULT_COLLIDER.width,
  height: DEFAULT_COLLIDER.height,
  depth: DEFAULT_COLLIDER.depth,
});

export const cloneSpriteCollider = (collider) => ({
  type: normalizeString(collider?.type, DEFAULT_COLLIDER.type) || DEFAULT_COLLIDER.type,
  x: Number.isFinite(collider?.x) ? collider.x : DEFAULT_COLLIDER.x,
  y: Number.isFinite(collider?.y) ? collider.y : DEFAULT_COLLIDER.y,
  width: Number.isFinite(collider?.width) ? collider.width : DEFAULT_COLLIDER.width,
  height: Number.isFinite(collider?.height) ? collider.height : DEFAULT_COLLIDER.height,
  depth: Number.isFinite(collider?.depth) ? collider.depth : DEFAULT_COLLIDER.depth,
});

export const normalizeSpriteEvent = (event) => ({
  frame: Number.isFinite(event?.frame) ? Math.max(0, Math.floor(event.frame)) : 0,
  type: normalizeString(event?.type, "frame"),
  data:
    event && typeof event.data === "object" && !Array.isArray(event.data)
      ? { ...event.data }
      : {},
});

export const normalizeSpriteFrame = (frame, index = 0) => {
  if (!frame) {
    return {
      index,
      name: `frame_${String(index + 1).padStart(3, "0")}`,
      source: "",
      relativePath: "",
      collider: null,
      events: [],
    };
  }

  const source = normalizeString(frame.source ?? frame.url ?? frame.relativePath ?? "", "");
  const relativePath = normalizeString(frame.relativePath ?? source, source);
  const name =
    normalizeString(frame.name, "") ||
    normalizeString(frame.fileName, "") ||
    source.split("/").pop() ||
    `frame_${String(index + 1).padStart(3, "0")}`;

  return {
    index: Number.isFinite(frame.index) ? frame.index : index,
    name,
    source,
    relativePath,
    width: Number.isFinite(frame.width) ? frame.width : null,
    height: Number.isFinite(frame.height) ? frame.height : null,
    collider:
      frame.collider && typeof frame.collider === "object"
        ? cloneSpriteCollider(frame.collider)
        : null,
    events: Array.isArray(frame.events)
      ? frame.events.map((event) => normalizeSpriteEvent(event))
      : [],
  };
};

const normalizeAnimationFrameMap = (animation) => {
  if (!Array.isArray(animation?.frames)) return [];
  return animation.frames.map((frame, index) => normalizeSpriteFrame(frame, index));
};

export const normalizeSpriteAnimation = (animation) => {
  const frames = normalizeAnimationFrameMap(animation);
  const colliders = Array.isArray(animation?.colliders)
    ? animation.colliders.map((entry) => ({
        frame: Number.isFinite(entry?.frame) ? Math.max(0, Math.floor(entry.frame)) : 0,
        collider: cloneSpriteCollider(entry?.collider),
      }))
    : [];
  const events = Array.isArray(animation?.events)
    ? animation.events.map((event) => normalizeSpriteEvent(event))
    : [];

  return {
    name: normalizeString(animation?.name, "idle") || "idle",
    fps: Number.isFinite(animation?.fps) && animation.fps > 0 ? animation.fps : DEFAULT_FPS,
    loop: animation?.loop !== false,
    frames,
    colliders,
    events,
    blendMode: normalizeString(animation?.blendMode, "replace") || "replace",
    dedicatedKey: normalizeString(animation?.dedicatedKey, "").toLowerCase(),
    stateMachine: animation?.stateMachine && typeof animation.stateMachine === "object"
      ? { ...animation.stateMachine }
      : null,
    spriteSheet:
      animation?.spriteSheet && typeof animation.spriteSheet === "object"
        ? { ...animation.spriteSheet }
        : null,
  };
};

export const normalizeSpriteCharacter = (sprite = {}) => {
  const animations = Array.isArray(sprite.animations)
    ? sprite.animations.map((animation) => normalizeSpriteAnimation(animation))
    : [];
  const defaultAnimation =
    normalizeString(sprite.defaultAnimation, "") ||
    animations.find((animation) => animation.name?.toLowerCase() === "idle")?.name ||
    animations[0]?.name ||
    "";

  return {
    characterName: normalizeString(sprite.characterName, "Sprite Character") || "Sprite Character",
    defaultAnimation,
    activeAnimation: normalizeString(sprite.activeAnimation, "") || defaultAnimation,
    activeFrameIndex:
      Number.isFinite(sprite.activeFrameIndex) && sprite.activeFrameIndex >= 0
        ? Math.floor(sprite.activeFrameIndex)
        : 0,
    playing: sprite.playing !== false,
    colliderEditMode: Boolean(sprite.colliderEditMode),
    displaySize:
      Array.isArray(sprite.displaySize) && sprite.displaySize.length === 2
        ? [
            Number.isFinite(sprite.displaySize[0]) ? sprite.displaySize[0] : 1,
            Number.isFinite(sprite.displaySize[1]) ? sprite.displaySize[1] : 1.6,
          ]
        : [1, 1.6],
    animations,
  };
};

const textureReadyPromise = (texture) =>
  texture?.userData?.readyPromise instanceof Promise
    ? texture.userData.readyPromise
    : Promise.resolve(texture);

export const getSharedSpriteTextureCache = () => sharedTextureCache;

export const clearSharedSpriteTextureCache = () => {
  sharedTextureCache.forEach((record) => {
    record.texture?.dispose?.();
  });
  sharedTextureCache.clear();
};

export const loadSpriteTexture = (source) => {
  const key = normalizeString(source, "");
  if (!key) return null;

  const existing = sharedTextureCache.get(key);
  if (existing) {
    return existing.texture;
  }

  let resolveReady;
  let rejectReady;
  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const texture = textureLoader.load(
    key,
    (loadedTexture) => {
      const image = loadedTexture?.image;
      if (image && Number.isFinite(image.width) && Number.isFinite(image.height)) {
        texture.image = image;
        texture.needsUpdate = true;
        texture.userData.width = image.width;
        texture.userData.height = image.height;
      }
      resolveReady(texture);
    },
    undefined,
    (error) => rejectReady(error)
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.userData.sharedSpriteTexture = true;
  texture.userData.source = key;
  texture.userData.readyPromise = readyPromise;

  sharedTextureCache.set(key, {
    source: key,
    texture,
    readyPromise: texture.userData.readyPromise,
  });
  return texture;
};

export const buildRuntimeSpriteAnimation = (animation, textureCache = loadSpriteTexture) => {
  const normalized = normalizeSpriteAnimation(animation);
  const loadedFrames = normalized.frames.map((frame) => {
    const source = frame.source || frame.relativePath;
    const texture = textureCache(source);
    if (texture) {
      texture.userData.spriteFrameName = frame.name;
      texture.userData.spriteFrameIndex = frame.index;
      texture.userData.spriteAnimationName = normalized.name;
    }
    return texture;
  });

  return {
    name: normalized.name,
    fps: normalized.fps,
    loop: normalized.loop,
    frames: loadedFrames,
    frameMeta: normalized.frames.map((frame, index) => ({
      ...frame,
      texture: loadedFrames[index] ?? null,
    })),
    colliders: normalized.colliders.map((entry) => ({
      frame: entry.frame,
      collider: cloneSpriteCollider(entry.collider),
    })),
    events: normalized.events.map((event) => normalizeSpriteEvent(event)),
    blendMode: normalized.blendMode,
    stateMachine: normalized.stateMachine,
    spriteSheet: normalized.spriteSheet,
  };
};

export const resolveSpriteColliderForFrame = (animation, frameIndex) => {
  if (!animation) return null;
  const safeFrame = Math.max(0, Math.floor(frameIndex || 0));
  const fromFrame = animation.frameMeta?.[safeFrame]?.collider;
  if (fromFrame) {
    return cloneSpriteCollider(fromFrame);
  }

  const colliderEntry = Array.isArray(animation.colliders)
    ? animation.colliders.find((entry) => entry.frame === safeFrame)
    : null;
  if (colliderEntry?.collider) {
    return cloneSpriteCollider(colliderEntry.collider);
  }

  return null;
};

export const resolveSpriteEventsForFrame = (animation, frameIndex) => {
  if (!animation) return [];
  const safeFrame = Math.max(0, Math.floor(frameIndex || 0));
  const frameEvents = animation.frameMeta?.[safeFrame]?.events ?? [];
  const animationEvents = Array.isArray(animation.events)
    ? animation.events.filter((event) => event.frame === safeFrame)
    : [];

  return [...frameEvents, ...animationEvents].map((event) => normalizeSpriteEvent(event));
};

export const parseSpriteAssetPath = (rawPath) => {
  const normalizedPath = normalizeString(rawPath, "").replace(/\\/g, "/");
  if (!normalizedPath) return null;

  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.length < 3) return null;

  const assetIndex = segments.findIndex((segment) => segment.toLowerCase() === "assets");
  const baseIndex = assetIndex >= 0 ? assetIndex + 1 : 0;
  if (segments.length - baseIndex < 3) return null;

  const characterName = segments[baseIndex];
  const animationName = segments[baseIndex + 1];
  const fileName = segments[segments.length - 1];
  const relativePath = segments.slice(baseIndex).join("/");
  const extension = fileName.includes(".")
    ? fileName.split(".").pop().toLowerCase()
    : "";
  const stem = fileName.replace(/\.[^.]+$/, "");

  return {
    characterName,
    animationName,
    fileName,
    fileStem: stem,
    extension,
    relativePath,
    fullPath: normalizedPath,
  };
};

const readJsonPayload = async (entry) => {
  if (!entry?.file) return null;
  try {
    const text = await entry.file.text();
    return JSON.parse(text);
  } catch (error) {
    console.warn("Failed to parse sprite JSON payload:", error);
    return null;
  }
};

const ensureCharacterRecord = (characters, characterName) => {
  if (!characters.has(characterName)) {
    characters.set(characterName, {
      name: characterName,
      animations: new Map(),
      sourceRoot: "",
    });
  }
  return characters.get(characterName);
};

const ensureAnimationRecord = (character, animationName) => {
  if (!character.animations.has(animationName)) {
    character.animations.set(animationName, {
      name: animationName,
      fps: DEFAULT_FPS,
      loop: DEFAULT_LOOP,
      frames: [],
      colliders: [],
      events: [],
      spriteSheet: null,
      stateMachine: null,
    });
  }
  return character.animations.get(animationName);
};

const mergeAnimationJson = (animation, payload, fallbackAnimationName) => {
  if (!payload || typeof payload !== "object") return;
  if (Number.isFinite(payload.fps) && payload.fps > 0) {
    animation.fps = payload.fps;
  }
  if (typeof payload.loop === "boolean") {
    animation.loop = payload.loop;
  }
  if (payload.blendMode) {
    animation.blendMode = payload.blendMode;
  }
  if (payload.spriteSheet && typeof payload.spriteSheet === "object") {
    animation.spriteSheet = { ...payload.spriteSheet };
  }
  if (payload.stateMachine && typeof payload.stateMachine === "object") {
    animation.stateMachine = { ...payload.stateMachine };
  }

  const payloadFrames = Array.isArray(payload.frames) ? payload.frames : [];
  if (payloadFrames.length && !animation.frames.length) {
    const nextFrames = payloadFrames.map((frame, index) => {
      if (typeof frame === "string") {
        return {
          index,
          name: frame.replace(/\.[^.]+$/, ""),
          source: frame,
          relativePath: frame,
          collider: null,
          events: [],
        };
      }
      return normalizeSpriteFrame(frame, index);
    });
    animation.frames = nextFrames;
  }

  if (Array.isArray(payload.colliders)) {
    animation.colliders = payload.colliders
      .map((entry) => ({
        frame: Number.isFinite(entry?.frame) ? Math.max(0, Math.floor(entry.frame)) : 0,
        collider: cloneSpriteCollider(entry?.collider),
      }))
      .filter((entry) => Number.isFinite(entry.frame));
  }

  if (Array.isArray(payload.events)) {
    animation.events = payload.events.map((event) => normalizeSpriteEvent(event));
  }

  if (Array.isArray(payload.frameEvents)) {
    payload.frameEvents.forEach((event) => {
      const normalizedEvent = normalizeSpriteEvent(event);
      const frame = normalizedEvent.frame;
      const frameTarget = animation.frames[frame];
      if (frameTarget) {
        frameTarget.events = [...(frameTarget.events || []), normalizedEvent];
      }
    });
  }

  if (!animation.name && fallbackAnimationName) {
    animation.name = fallbackAnimationName;
  }
};

export const loadSpriteCharactersFromEntries = async (entries) => {
  const characters = new Map();
  if (!Array.isArray(entries) || !entries.length) {
    return [];
  }

  const jsonPayloads = new Map();
  const imageEntries = [];

  for (const entry of entries) {
    const file = entry?.file;
    if (!file) continue;

    const parsed = parseSpriteAssetPath(entry.path || file.webkitRelativePath || file.name);
    if (!parsed) continue;

    if (parsed.extension === "json") {
      const payload = await readJsonPayload(entry);
      if (!payload) continue;
      jsonPayloads.set(`${parsed.characterName}/${parsed.animationName}`, payload);
      continue;
    }

    if (parsed.extension !== "png") continue;

    const objectUrl = entry.source || URL.createObjectURL(file);
    imageEntries.push({
      parsed,
      file,
      source: objectUrl,
      url: objectUrl,
    });
  }

  imageEntries.sort((a, b) => naturalSort(a.parsed.fileName, b.parsed.fileName));

  imageEntries.forEach((entry) => {
    const character = ensureCharacterRecord(characters, entry.parsed.characterName);
    const animation = ensureAnimationRecord(character, entry.parsed.animationName);

    if (!character.sourceRoot) {
      character.sourceRoot = entry.parsed.relativePath
        .split("/")
        .slice(0, -2)
        .join("/");
    }

    animation.frames.push(
      normalizeSpriteFrame(
        {
          index: animation.frames.length,
          name: entry.parsed.fileStem,
          source: entry.url,
          relativePath: entry.parsed.relativePath,
        },
        animation.frames.length
      )
    );
  });

  jsonPayloads.forEach((payload, key) => {
    const [characterName, animationName] = key.split("/");
    const character = ensureCharacterRecord(characters, characterName);
    const animation = ensureAnimationRecord(character, animationName);
    mergeAnimationJson(animation, payload, animationName);
  });

  characters.forEach((character) => {
    character.animations.forEach((animation) => {
      if (!animation.frames.length) {
        return;
      }
      if (!Array.isArray(animation.colliders)) {
        animation.colliders = [];
      }
      if (!Array.isArray(animation.events)) {
        animation.events = [];
      }

      if (!animation.fps || !Number.isFinite(animation.fps)) {
        animation.fps = DEFAULT_FPS;
      }
      if (typeof animation.loop !== "boolean") {
        animation.loop = DEFAULT_LOOP;
      }

      animation.frames.sort((a, b) => naturalSort(a.name, b.name));
      animation.frames = animation.frames.map((frame, index) =>
        normalizeSpriteFrame({ ...frame, index }, index)
      );

      animation.frames.forEach((frame) => {
        if (!frame.collider) {
          const colliderEntry = animation.colliders.find((entry) => entry.frame === frame.index);
          if (colliderEntry?.collider) {
            frame.collider = cloneSpriteCollider(colliderEntry.collider);
          }
        } else if (
          !animation.colliders.some((entry) => entry.frame === frame.index)
        ) {
          animation.colliders.push({
            frame: frame.index,
            collider: cloneSpriteCollider(frame.collider),
          });
        }
      });
    });
  });

  return Array.from(characters.values())
    .map((character) => ({
      name: character.name,
      sourceRoot: character.sourceRoot,
      animations: Array.from(character.animations.values())
        .map((animation) => normalizeSpriteAnimation(animation))
        .sort((a, b) => naturalSort(a.name, b.name)),
    }))
    .sort((a, b) => naturalSort(a.name, b.name));
};

export class SpriteAnimator {
  constructor({
    animations = [],
    textureCache = loadSpriteTexture,
    animationName = "",
    playing = true,
  } = {}) {
    this.textureCache = textureCache;
    this.animations = new Map();
    this.activeAnimationName = "";
    this.currentFrameIndex = 0;
    this.accumulator = 0;
    this.playing = playing !== false;
    this.finished = false;
    this._pendingEvents = [];
    this.setAnimations(animations);
    const fallbackAnimation = this.animations.values().next().value ?? null;
    this.setAnimation(animationName || fallbackAnimation?.name || "", {
      reset: true,
      playing,
    });
  }

  setAnimations(animations = []) {
    this.animations.clear();
    const normalizedAnimations = Array.isArray(animations) ? animations : [];
    normalizedAnimations.forEach((animation) => {
      const runtimeAnimation = buildRuntimeSpriteAnimation(animation, this.textureCache);
      this.animations.set(runtimeAnimation.name, runtimeAnimation);
    });
    return this;
  }

  getAnimation(name = this.activeAnimationName) {
    if (!name) return null;
    return this.animations.get(name) ?? null;
  }

  getCurrentAnimation() {
    return this.getAnimation(this.activeAnimationName);
  }

  setAnimation(name, { reset = true, frameIndex = 0, playing } = {}) {
    const nextAnimation =
      this.getAnimation(name) ?? this.animations.values().next().value ?? null;
    if (!nextAnimation) {
      this.activeAnimationName = "";
      this.currentFrameIndex = 0;
      this.accumulator = 0;
      this.finished = false;
      return null;
    }

    const changed = this.activeAnimationName !== nextAnimation.name;
    this.activeAnimationName = nextAnimation.name;
    if (reset || changed) {
      this.currentFrameIndex = this.clampFrameIndex(frameIndex);
      this.accumulator = 0;
      this.finished = false;
    }
    if (typeof playing === "boolean") {
      this.playing = playing;
    }
    return nextAnimation;
  }

  clampFrameIndex(frameIndex) {
    const animation = this.getCurrentAnimation();
    if (!animation || !animation.frames.length) return 0;
    return Math.min(Math.max(Math.floor(frameIndex), 0), animation.frames.length - 1);
  }

  play() {
    this.playing = true;
    this.finished = false;
    return this;
  }

  pause() {
    this.playing = false;
    return this;
  }

  stop({ resetFrame = true } = {}) {
    this.playing = false;
    this.accumulator = 0;
    this.finished = false;
    if (resetFrame) {
      this.currentFrameIndex = 0;
    }
    return this;
  }

  setFps(fps) {
    const animation = this.getCurrentAnimation();
    if (!animation) return this;
    animation.fps = Number.isFinite(fps) && fps > 0 ? fps : animation.fps;
    return this;
  }

  scrubTo(frameIndex, { clamp = true } = {}) {
    const animation = this.getCurrentAnimation();
    if (!animation || !animation.frames.length) return this;
    const nextIndex = clamp
      ? this.clampFrameIndex(frameIndex)
      : Math.max(0, Math.floor(frameIndex));
    this.currentFrameIndex = nextIndex;
    this.accumulator = 0;
    this.finished = false;
    return this;
  }

  seek(frameIndex, options = {}) {
    return this.scrubTo(frameIndex, options);
  }

  getFrameCount() {
    const animation = this.getCurrentAnimation();
    return animation?.frames?.length ?? 0;
  }

  getCurrentFrameTexture() {
    const animation = this.getCurrentAnimation();
    if (!animation || !animation.frames.length) return null;
    return animation.frames[this.currentFrameIndex] ?? animation.frames[0] ?? null;
  }

  getCurrentFrameMeta() {
    const animation = this.getCurrentAnimation();
    if (!animation || !animation.frameMeta?.length) return null;
    return animation.frameMeta[this.currentFrameIndex] ?? animation.frameMeta[0] ?? null;
  }

  getCurrentCollider() {
    const animation = this.getCurrentAnimation();
    if (!animation) return null;
    return resolveSpriteColliderForFrame(animation, this.currentFrameIndex);
  }

  getCurrentEvents() {
    const animation = this.getCurrentAnimation();
    if (!animation) return [];
    return resolveSpriteEventsForFrame(animation, this.currentFrameIndex);
  }

  update(delta = 0) {
    const animation = this.getCurrentAnimation();
    if (!animation || !animation.frames.length) {
      return {
        animation: animation?.name ?? "",
        frameChanged: false,
        frameIndex: 0,
        events: [],
        finished: this.finished,
      };
    }

    const fps = Number.isFinite(animation.fps) && animation.fps > 0 ? animation.fps : DEFAULT_FPS;
    const frameDuration = 1 / fps;
    const events = [];
    let frameChanged = false;

    if (this.playing && !this.finished) {
      this.accumulator += Math.max(delta, 0);
      while (this.accumulator >= frameDuration) {
        this.accumulator -= frameDuration;
        frameChanged = true;

        const nextIndex = this.currentFrameIndex + 1;
        if (nextIndex >= animation.frames.length) {
          if (animation.loop) {
            this.currentFrameIndex = 0;
          } else {
            this.currentFrameIndex = animation.frames.length - 1;
            this.finished = true;
            this.playing = false;
            break;
          }
        } else {
          this.currentFrameIndex = nextIndex;
        }

        const currentEvents = resolveSpriteEventsForFrame(animation, this.currentFrameIndex);
        if (currentEvents.length) {
          events.push(...currentEvents);
        }
      }
    }

    return {
      animation: animation.name,
      frameChanged,
      frameIndex: this.currentFrameIndex,
      events,
      finished: this.finished,
    };
  }
}

export const getSpriteFrameAspect = (texture, fallback = 1) => {
  const image = texture?.image;
  if (!image || !Number.isFinite(image.width) || !Number.isFinite(image.height) || image.height === 0) {
    return fallback;
  }
  return image.width / image.height;
};

export const getSpriteFrameSize = (texture, fallback = [1, 1]) => {
  const aspect = getSpriteFrameAspect(texture, fallback[0] / Math.max(fallback[1], 0.001));
  const height = fallback[1] ?? 1;
  return [Math.max(aspect * height, 0.01), Math.max(height, 0.01)];
};

export const spriteTexturePromise = textureReadyPromise;
