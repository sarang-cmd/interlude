/** Focus-gated keyboard, pointer, touch, virtual buttons, and standard gamepads. */
export type GameAction =
  "left" | "right" | "up" | "down" | "primary" | "secondary" | "confirm" | "pause";
export type SwipeDirection = "left" | "right" | "up" | "down";
const DEFAULT_KEYMAP: Record<string, GameAction> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  Space: "primary",
  KeyZ: "primary",
  KeyX: "secondary",
  KeyC: "secondary",
  KeyU: "secondary",
  Enter: "confirm",
  KeyP: "pause",
};
const ACTIONS: readonly GameAction[] = [
  "left",
  "right",
  "up",
  "down",
  "primary",
  "secondary",
  "confirm",
  "pause",
];

export class Input {
  private held = new Map<GameAction, Set<string>>();
  private presses = new Map<GameAction, number[]>();
  private overrides: Record<string, GameAction> = {};
  private remappedActions = new Set<GameAction>();
  private pointerAllowed = true;
  private touchAllowed = true;
  private gamepadAllowed = true;
  private repeatsAllowed = false;
  private target: HTMLElement | ShadowRoot | null = null;
  private enabled = false;
  private anyPress = false;
  private pointerPrimary = false;
  private pointer = {
    x: 0,
    y: 0,
    isDown: false,
    downTime: 0,
    downX: 0,
    downY: 0,
    hasPosition: false,
  };
  private taps: Array<{ x: number; y: number }> = [];
  private swipes: SwipeDirection[] = [];
  private padActions = new Set<GameAction>();
  private toLogical: (x: number, y: number) => { x: number; y: number } = () => ({ x: 0, y: 0 });
  onGesture: () => void = () => {};

  attach(
    target: HTMLElement | ShadowRoot,
    toLogical: (x: number, y: number) => { x: number; y: number },
  ): void {
    this.detach();
    this.target = target;
    this.toLogical = toLogical;
    target.addEventListener("keydown", this.onKeyDown as EventListener);
    target.addEventListener("keyup", this.onKeyUp as EventListener);
    target.addEventListener("pointerdown", this.onPointerDown as EventListener);
    target.addEventListener("pointermove", this.onPointerMove as EventListener);
    target.addEventListener("pointerup", this.onPointerUp as EventListener);
    target.addEventListener("pointercancel", this.onPointerUp as EventListener);
  }
  detach(): void {
    if (this.target) {
      for (const [type, handler] of [
        ["keydown", this.onKeyDown],
        ["keyup", this.onKeyUp],
        ["pointerdown", this.onPointerDown],
        ["pointermove", this.onPointerMove],
        ["pointerup", this.onPointerUp],
        ["pointercancel", this.onPointerUp],
      ] as const)
        this.target.removeEventListener(type, handler as EventListener);
    }
    this.target = null;
    this.clear();
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }
  get isEnabled(): boolean {
    return this.enabled;
  }
  setPointerPrimary(enabled: boolean): void {
    this.pointerPrimary = enabled;
  }
  configure(options: {
    pointer: boolean;
    touch: boolean;
    gamepad: boolean;
    repeat: boolean;
  }): void {
    this.pointerAllowed = options.pointer;
    this.touchAllowed = options.touch;
    this.gamepadAllowed = options.gamepad;
    this.repeatsAllowed = options.repeat;
    this.clear();
  }
  setKeymapOverrides(overrides: Record<string, string>): void {
    this.overrides = {};
    this.remappedActions.clear();
    for (const [action, code] of Object.entries(overrides)) {
      if (ACTIONS.includes(action as GameAction) && code && !this.overrides[code]) {
        this.overrides[code] = action as GameAction;
        this.remappedActions.add(action as GameAction);
      }
    }
  }
  actionFor(code: string): GameAction | undefined {
    const fallback = DEFAULT_KEYMAP[code];
    return (
      this.overrides[code] ??
      (fallback && !this.remappedActions.has(fallback) ? fallback : undefined)
    );
  }
  private acceptsPointer(event: PointerEvent): boolean {
    return event.pointerType === "touch" ? this.touchAllowed : this.pointerAllowed;
  }
  private clear(): void {
    this.held.clear();
    this.presses.clear();
    this.anyPress = false;
    this.taps = [];
    this.swipes = [];
    this.padActions.clear();
    this.pointer.isDown = false;
  }
  private press(action: GameAction, source: string): void {
    const sources = this.held.get(action) ?? new Set<string>();
    if (sources.has(source)) return;
    sources.add(source);
    this.held.set(action, sources);
    const now = performance.now();
    const queue = (this.presses.get(action) ?? []).filter((time) => now - time < 1000);
    queue.push(now);
    this.presses.set(action, queue);
    this.anyPress = true;
  }
  private release(action: GameAction, source: string): void {
    const sources = this.held.get(action);
    sources?.delete(source);
    if (!sources?.size) this.held.delete(action);
  }
  clearActivity(): void {
    this.anyPress = false;
    this.presses.clear();
    this.taps = [];
    this.swipes = [];
  }
  /** Used by the accessible on-screen controls. */
  virtualDown(action: GameAction, source = "virtual"): void {
    if (!this.enabled) return;
    this.onGesture();
    this.press(action, source);
  }
  virtualUp(action: GameAction, source = "virtual"): void {
    this.release(action, source);
  }
  private isTextField(event: Event): boolean {
    return event
      .composedPath()
      .some(
        (node) =>
          node instanceof HTMLInputElement ||
          node instanceof HTMLTextAreaElement ||
          (node instanceof HTMLElement && (node.isContentEditable || node.tagName === "SELECT")),
      );
  }
  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || this.isTextField(event)) return;
    if (!event.repeat) {
      this.anyPress = true;
      this.onGesture();
    }
    const action = this.actionFor(event.code);
    if (!action || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) this.press(action, `key:${event.code}`);
    else if (this.repeatsAllowed && action !== "pause") {
      const queue = this.presses.get(action) ?? [];
      queue.push(performance.now());
      this.presses.set(action, queue);
      this.anyPress = true;
    }
  };
  private onKeyUp = (event: KeyboardEvent): void => {
    if (!this.enabled || this.isTextField(event)) return;
    const action = this.actionFor(event.code);
    if (action) this.release(action, `key:${event.code}`);
  };
  private onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled || !this.acceptsPointer(event)) return;
    const p = this.toLogical(event.clientX, event.clientY);
    this.pointer = {
      ...p,
      hasPosition: true,
      isDown: true,
      downTime: performance.now(),
      downX: p.x,
      downY: p.y,
    };
    this.anyPress = true;
    this.onGesture();
    if (this.pointerPrimary) this.press("primary", "pointer");
    if (event.currentTarget instanceof Element) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* detached */
      }
    }
    event.preventDefault();
  };
  private onPointerMove = (event: PointerEvent): void => {
    if (!this.enabled || !this.acceptsPointer(event)) return;
    const p = this.toLogical(event.clientX, event.clientY);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.hasPosition = true;
  };
  private onPointerUp = (event: PointerEvent): void => {
    if (!this.enabled || !this.acceptsPointer(event) || !this.pointer.isDown) return;
    const p = this.toLogical(event.clientX, event.clientY);
    const dx = p.x - this.pointer.downX,
      dy = p.y - this.pointer.downY;
    const distance = Math.hypot(dx, dy);
    if (event.type !== "pointercancel" && distance >= 28)
      this.swipes.push(
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up",
      );
    else if (
      event.type !== "pointercancel" &&
      distance <= 12 &&
      performance.now() - this.pointer.downTime <= 350
    )
      this.taps.push(p);
    this.pointer.isDown = false;
    this.release("primary", "pointer");
    event.preventDefault();
  };
  /** Poll only while the panel is focused and the engine loop is running. */
  pollGamepads(): void {
    if (!this.enabled || !this.gamepadAllowed || typeof navigator.getGamepads !== "function")
      return;
    const pad = Array.from(navigator.getGamepads()).find((p) => p?.connected);
    const next = new Set<GameAction>();
    if (pad) {
      if ((pad.axes[0] ?? 0) < -0.45 || pad.buttons[14]?.pressed) next.add("left");
      if ((pad.axes[0] ?? 0) > 0.45 || pad.buttons[15]?.pressed) next.add("right");
      if ((pad.axes[1] ?? 0) < -0.45 || pad.buttons[12]?.pressed) next.add("up");
      if ((pad.axes[1] ?? 0) > 0.45 || pad.buttons[13]?.pressed) next.add("down");
      if (pad.buttons[0]?.pressed) next.add("primary");
      if (pad.buttons[1]?.pressed) next.add("secondary");
      if (pad.buttons[9]?.pressed) next.add("pause");
    }
    for (const action of next) if (!this.padActions.has(action)) this.press(action, "gamepad");
    for (const action of this.padActions) if (!next.has(action)) this.release(action, "gamepad");
    this.padActions = next;
  }
  isDown(action: GameAction): boolean {
    return !!this.held.get(action)?.size;
  }
  wasAnyPressed(consume = false): boolean {
    const result = this.anyPress;
    if (consume) this.anyPress = false;
    return result;
  }
  wasPressedWithin(action: GameAction, withinMs: number, consume = false): boolean {
    const queue = this.presses.get(action) ?? [];
    const now = performance.now();
    const fresh = queue.filter((time) => now - time <= withinMs);
    if (consume && fresh.length) fresh.shift();
    this.presses.set(action, fresh);
    return queue.some((time) => now - time <= withinMs);
  }
  consumePresses(action: GameAction): void {
    this.presses.delete(action);
  }
  pointerPosition(): { x: number; y: number; isDown: boolean; hasPosition: boolean } {
    return {
      x: this.pointer.x,
      y: this.pointer.y,
      isDown: this.pointer.isDown,
      hasPosition: this.pointer.hasPosition,
    };
  }
  drainTaps(): Array<{ x: number; y: number }> {
    const result = this.taps;
    this.taps = [];
    return result;
  }
  drainSwipes(): SwipeDirection[] {
    const result = this.swipes;
    this.swipes = [];
    return result;
  }
}
