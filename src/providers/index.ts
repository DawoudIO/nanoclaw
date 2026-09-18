// Host-side provider container-config barrel.
// Providers that need host-side container setup (extra mounts, env passthrough,
// per-session directories) self-register on import.
//
// claude.js is imported unconditionally (not just for custom-endpoint
// installs) because it now also forwards the Claude Code compact/rotation
// operator overrides that every install can set, not only custom-endpoint
// ones — see claude.ts's own docstring and nanocoai/nanoclaw#3714. Its
// custom-endpoint logic stays a no-op when ANTHROPIC_BASE_URL is unset, so
// this is safe for standard installs too.
//
// Skills add a new provider by appending one import line below.
import './claude.js';
