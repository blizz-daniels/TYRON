const toQuaternion = (x, y, z) => {
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);

  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3,
  };
};

export class PhysicsSystem {
  constructor({ gravity = [0, -9.81, 0] } = {}) {
    this.gravity = gravity;
    this.ready = false;
    this.rapier = null;
    this.world = null;
    this.bodies = new Map();
  }

  async init() {
    const rapier = await import(
      "https://cdn.skypack.dev/@dimforge/rapier3d-compat"
    );
    await rapier.init();
    this.rapier = rapier;
    this.world = new rapier.World({
      x: this.gravity[0],
      y: this.gravity[1],
      z: this.gravity[2],
    });
    this.ready = true;
  }

  ensureBody(entity, transform, collider) {
    if (!this.world) return;
    if (this.bodies.has(entity.id)) return;

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
      const radius = collider.size[0] / 2;
      colliderDesc = this.rapier.ColliderDesc.ball(radius);
    } else {
      colliderDesc = this.rapier.ColliderDesc.cuboid(
        collider.size[0] / 2,
        collider.size[1] / 2,
        collider.size[2] / 2
      );
    }
    if (collider.isTrigger && colliderDesc.setSensor) {
      colliderDesc.setSensor(true);
    }
    this.world.createCollider(colliderDesc, body);
    this.bodies.set(entity.id, body);
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
      transform.rotation = [rotation.x, rotation.y, rotation.z];
    });

    Array.from(this.bodies.entries()).forEach(([id, body]) => {
      if (!liveIds.has(id)) {
        this.world.removeRigidBody(body);
        this.bodies.delete(id);
      }
    });
  }
}
