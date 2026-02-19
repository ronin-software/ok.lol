/**
 * Default document injection — merges system defaults into a principal's
 * document set so the agent always has baseline guidance.
 *
 * Core templates are always injected when absent.
 * Tool docs are injected only for capabilities in the provided list.
 */

import { assert } from "@/lib/assert";
import type { CapabilitySpec } from "@ok.lol/capability";
import type { Document } from "../../context";
import { CORE_PATHS, corePriorities, coreTemplates, type CorePath } from "./core";
import { TOOL_NAMES, toolTemplates } from "./tools";

export { CORE_PATHS, type CorePath } from "./core";
export { TOOL_NAMES } from "./tools";

/**
 * Returns documents with missing core/tool paths filled by system defaults.
 *
 * Core paths (soul, identity, user, guide) are always injected when absent.
 * Tool docs are injected only for capabilities in the provided list.
 * Principals override any default by writing to the same path.
 */
export function withDefaults(
  documents: Document[],
  capabilities?: CapabilitySpec[],
): Document[] {
  assert(Array.isArray(documents), "documents must be an array");

  const existing = new Set(documents.map((d) => d.path));
  const defaults: Document[] = [];

  for (const path of CORE_PATHS) {
    if (existing.has(path)) continue;
    defaults.push({
      contents: coreTemplates[path],
      default: true,
      path,
      priority: corePriorities[path],
    });
  }

  // Tool docs — one per available capability that has a template.
  if (capabilities) {
    for (const cap of capabilities) {
      const path = `tools/${cap.name}`;
      if (existing.has(path)) continue;
      const template = toolTemplates[cap.name];
      if (!template) continue;
      defaults.push({
        activation: template.activation,
        contents: template.contents,
        default: true,
        path,
        priority: template.priority,
      });
    }
  }

  const result = [...defaults, ...documents];

  // Postcondition: every core path is present.
  for (const path of CORE_PATHS) {
    assert(
      result.some((d) => d.path === path),
      `withDefaults postcondition: missing core path "${path}"`,
    );
  }

  return result;
}
