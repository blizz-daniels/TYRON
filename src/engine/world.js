let nextEntityId = 1;

export class World {
  constructor() {
    this.entities = new Map();
  }

  createEntity(name = "Entity", forcedId = null) {
    const id = forcedId ?? nextEntityId++;
    if (id >= nextEntityId) {
      nextEntityId = id + 1;
    }
    const entity = {
      id,
      name,
      components: new Map(),
    };
    this.entities.set(id, entity);
    return entity;
  }

  destroyEntity(entityId) {
    this.entities.delete(entityId);
  }

  addComponent(entity, component) {
    entity.components.set(component.type, component);
    return component;
  }

  getComponent(entity, type) {
    return entity.components.get(type);
  }

  getEntities() {
    return Array.from(this.entities.values());
  }
}
