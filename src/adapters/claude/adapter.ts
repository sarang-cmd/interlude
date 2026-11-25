import defaults from "./selectors.json";
import { StructuralAdapter, type StructuralSelectors } from "../structural";
export type ClaudeSelectors = StructuralSelectors;
export const SELECTOR_OVERRIDE_KEY = "interlude.claudeSelectors";
export class ClaudeAdapter extends StructuralAdapter {
  constructor(overrides: Partial<ClaudeSelectors> = {}) {
    super(
      { id: "claude", displayName: "Claude", hosts: ["claude.ai"], selectors: defaults },
      overrides,
    );
  }
}
