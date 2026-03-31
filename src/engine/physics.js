import * as THREE from "three";

const toQuaternion = (x, y, z) =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

const toEuler = (rotation) =>
  new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
  );

export class PhysicsSystem {
  constructor({ gravity = [0, -9.81, 0] } = {}) {
    this.gravity = gravity;
    this.ready = false;
    this.rapier = null;
    this.world = null;
    this.bodies = new Map();
  }

  async init() {
    const rapierModule = await import(
      "https://cdn.skypack.dev/@dimforge/rapier3d-compat"
    );
    const rapier = rapierModule.default ?? rapierModule;
    if (typeof rapier.init !== "function" || typeof rapier.World !== "function") {
      throw new Error("Rapier module did not expose the expected compat API.");
    }

    await rapier.init();
    this.rapier = rapier;
    this.world = new rapier.World({
      x: this.gravity[0],
      y: this.gravity[1],
      z: this.gravity[2],
    });
    this.ready = true;
  }

  reset() {
    this.bodies.clear();
    if (this.rapier) {
      this.world = new this.rapier.World({
        x: this.gravity[0],
        y: this.gravity[1],
        z: this.gravity[2],
      });
    }
  }

  ensureBody(entity, transform, collider) {
    if (!this.world) return;
    if (this.bodies.has(entity.id)) return;

    const scale = Array.isArray(transform.scale) && transform.scale.length >= 3
      ? transform.scale
      : [1, 1, 1];
    const offset = Array.isArray(collider.offset) && collider.offset.length >= 3
      ? collider.offset
      : [0, 0, 0];
    const scaledOffset = [
      offset[0] * scale[0],
      offset[1] * scale[1],
      offset[2] * scale[2],
    ];

    let desc;
    if (collider.body === "dynamic") {
      desc = this.rapier.RigidBodyDesc.dynamic();
    } else if (collider.body === "kinematic") {
      desc = this.rapier.RigidBodyDesc.kinematicPositionBased();
    } else {
      desc = this.rapier.RigidBodyDesc.fixed();
    }

    desc.setTranslation(
      transform.position[0],
      transform.position[1],
      transform.position[2]
    );
    const rotation = toQuaternion(
      transform.rotation[0],
      transform.rotation[1],
      transform.rotation[2]
    );
    if (desc.setRotation) {
      desc.setRotation(rotation);
    }

    const body = this.world.createRigidBody(desc);

    let colliderDesc;
    if (collider.shape === "sphere") {
      const size = Array.isArray(collider.size) && collider.size.length >= 3
        ? collider.size
        : [1, 1, 1];
      const radius = Math.max(
        Math.abs(size[0] * scale[0]),
        Math.abs(size[1] * scale[1]),
        Math.abs(size[2] * scale[2])
      ) / 2;
      colliderDesc = this.rapier.ColliderDesc.ball(radius);
    } else {
      const size = Array.isArray(collider.size) && collider.size.length >= 3
        ? collider.size
        : [1, 1, 1];
      colliderDesc = this.rapier.ColliderDesc.cuboid(
        Math.max(Math.abs(size[0] * scale[0]), 0.001) / 2,
        Math.max(Math.abs(size[1] * scale[1]), 0.001) / 2,
        Math.max(Math.abs(size[2] * scale[2]), 0.001) / 2
      );
    }
    if (typeof colliderDesc.setTranslation === "function") {
      colliderDesc.setTranslation(scaledOffset[0], scaledOffset[1], scaledOffset[2]);
    }
    if (collider.isTrigger && colliderDesc.setSensor) {
      colliderDesc.setSensor(true);
    }
    this.world.createCollider(colliderDesc, body);
    this.bodies.set(entity.id, body);
  }

  applyImpulse(entityId, impulse) {
    const body = this.bodies.get(entityId);
    if (!body || typeof body.applyImpulse !== "function") return false;

    const vector = {
      x: Number.isFinite(impulse?.x) ? impulse.x : Array.isArray(impulse) ? impulse[0] ?? 0 : 0,
      y: Number.isFinite(impulse?.y) ? impulse.y : Array.isArray(impulse) ? impulse[1] ?? 0 : 0,
      z: Number.isFinite(impulse?.z) ? impulse.z : Array.isArray(impulse) ? impulse[2] ?? 0 : 0,
    };

    body.applyImpulse(vector, true);
    return true;
  }

  applyAngularImpulse(entityId, impulse) {
    const body = this.bodies.get(entityId);
    if (!body) return false;

    const vector = {
      x: Number.isFinite(impulse?.x) ? impulse.x : Array.isArray(impulse) ? impulse[0] ?? 0 : 0,
      y: Number.isFinite(impulse?.y) ? impulse.y : Array.isArray(impulse) ? impulse[1] ?? 0 : 0,
      z: Number.isFinite(impulse?.z) ? impulse.z : Array.isArray(impulse) ? impulse[2] ?? 0 : 0,
    };

    if (typeof body.applyTorqueImpulse === "function") {
      body.applyTorqueImpulse(vector, true);
      return true;
    }

    if (typeof body.setAngvel === "function") {
      body.setAngvel(vector, true);
      return true;
    }

    return false;
  }

  getBody(entityId) {
    return this.bodies.get(entityId) ?? null;
  }

  getTranslation(entityId) {
    const body = this.bodies.get(entityId);
    if (!body || typeof body.translation !== "function") return null;
    return body.translation();
  }

  getLinearVelocity(entityId) {
    const body = this.bodies.get(entityId);
    if (!body || typeof body.linvel !== "function") return null;
    return body.linvel();
  }

  setLinearVelocity(entityId, velocity) {
    const body = this.bodies.get(entityId);
    if (!body || typeof body.setLinvel !== "function") return false;

    body.setLinvel(
      {
        x: Number.isFinite(velocity?.x) ? velocity.x : 0,
        y: Number.isFinite(velocity?.y) ? velocity.y : 0,
        z: Number.isFinite(velocity?.z) ? velocity.z : 0,
      },
      true
    );
    return true;
  }

  update(_delta, ecsWorld, componentType) {
    if (!this.ready) return;
    const liveIds = new Set();
    const entities = ecsWorld.getEntities();
    entities.forEach((entity) => {
      const transform = entity.components.get(componentType.Transform);
      const collider = entity.components.get(componentType.Collider);
      if (!transform || !collider) return;
      liveIds.add(entity.id);
      this.ensureBody(entity, transform, collider);
      const body = this.bodies.get(entity.id);
      if (!body) return;

      if (collider.body === "kinematic") {
        if (body.setNextKinematicTranslation) {
          body.setNextKinematicTranslation({
            x: transform.position[0],
            y: transform.position[1],
            z: transform.position[2],
          });
        }
        if (body.setNextKinematicRotation) {
          body.setNextKinematicRotation(
            toQuaternion(
              transform.rotation[0],
              transform.rotation[1],
              transform.rotation[2]
            )
          );
        }
      }
    });

    this.world.step();

    entities.forEach((entity) => {
      const transform = entity.components.get(componentType.Transform);
      const collider = entity.components.get(componentType.Collider);
      if (!transform || !collider) return;
      if (collider.body !== "dynamic") return;
      const body = this.bodies.get(entity.id);
      if (!body) return;
      const position = body.translation();
      const rotation = body.rotation();
      transform.position = [position.x, position.y, position.z];
      const euler = toEuler(rotation);
      transform.rotation = [euler.x, euler.y, euler.z];
    });

    Array.from(this.bodies.entries()).forEach(([id, body]) => {
      if (!liveIds.has(id)) {
        this.world.removeRigidBody(body);
        this.bodies.delete(id);
      }
    });
  }
}
