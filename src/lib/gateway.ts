/**
 * Shared AI Gateway instance.
 *
 * All code that needs an AI model provider should import `gateway`
 * from here rather than calling `createGateway()` directly.
 */

import { createGateway } from "ai";

export const gateway = createGateway();
