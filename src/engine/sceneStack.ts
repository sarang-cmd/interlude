/** The active scene sits at the top; modal scenes can restore the scene below. */
export class SceneStack<T> {
  private readonly scenes: T[];
  constructor(initial: T) {
    this.scenes = [initial];
  }
  get current(): T {
    return this.scenes[this.scenes.length - 1] as T;
  }
  push(scene: T): void {
    this.scenes.push(scene);
  }
  pop(): T {
    if (this.scenes.length > 1) this.scenes.pop();
    return this.current;
  }
  replace(scene: T): void {
    this.scenes[this.scenes.length - 1] = scene;
  }
  reset(scene: T): void {
    this.scenes.splice(0, this.scenes.length, scene);
  }
}
