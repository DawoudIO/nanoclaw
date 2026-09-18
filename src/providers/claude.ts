/**
 * Claude provider container config — always registered (imported
 * unconditionally by providers/index.ts), because it now serves two
 * independent installs, not just the custom-endpoint one it was written
 * for:
 *
 * 1. Custom Anthropic-compatible endpoint (ANTHROPIC_BASE_URL set): the
 *    real auth token never enters the container. Setup creates an OneCLI
 *    generic secret (host-pattern = base URL hostname, header-name =
 *    Authorization, value-format = "Bearer {value}") so the proxy rewrites
 *    the Authorization header on the wire. The container only needs:
 *      - ANTHROPIC_BASE_URL — so the SDK knows where to call
 *      - ANTHROPIC_AUTH_TOKEN=placeholder — so the SDK adds an
 *        Authorization: Bearer header for OneCLI to overwrite
 *
 * 2. Every install, standard or custom-endpoint: the three Claude Code
 *    operator overrides documented in-source in the agent-runner
 *    (CLAUDE_CODE_AUTO_COMPACT_WINDOW, CLAUDE_TRANSCRIPT_ROTATE_BYTES,
 *    CLAUDE_TRANSCRIPT_ROTATE_AGE_DAYS) are read `process.env` inside the
 *    container, but nothing forwarded them from the host — before this
 *    file was unconditionally loaded, they were unreachable on every
 *    standard install, silently falling back to their hardcoded defaults
 *    no matter what the operator set. See nanocoai/nanoclaw#3714.
 *
 * Both halves are independently no-op-safe when unset: an install with
 * neither a custom endpoint nor any of the three overrides in its `.env`
 * gets an empty contribution, identical to before this file was always
 * loaded.
 */
import { readEnvFile } from '../env.js';
import { registerProviderContainerConfig } from './provider-container-registry.js';

const COMPACT_ENV_KEYS = [
  'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
  'CLAUDE_TRANSCRIPT_ROTATE_BYTES',
  'CLAUDE_TRANSCRIPT_ROTATE_AGE_DAYS',
] as const;

registerProviderContainerConfig('claude', () => {
  const dotenv = readEnvFile(['ANTHROPIC_BASE_URL', ...COMPACT_ENV_KEYS]);
  const env: Record<string, string> = {};
  if (dotenv.ANTHROPIC_BASE_URL) {
    env.ANTHROPIC_BASE_URL = dotenv.ANTHROPIC_BASE_URL;
    env.ANTHROPIC_AUTH_TOKEN = 'placeholder';
  }
  for (const key of COMPACT_ENV_KEYS) {
    if (dotenv[key]) env[key] = dotenv[key];
  }
  return { env };
});
