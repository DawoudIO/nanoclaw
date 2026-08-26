/**
 * Regression tests for the CLI approval gates.
 *
 * Why this file exists: commit 43662ef2 set `access: 'free'` on
 * groups-create, groups-restart, wirings-create and destinations-add.
 * `'free'` is not a member of the `Access` union, so it never equalled
 * `'approval'` in `commandDecide` and every one of those four gates was
 * silently removed for agent callers. The whole suite stayed green, because
 * the only approval-hold test in dispatch.test.ts covers `wirings-update`
 * and nothing asserted these four at all.
 *
 * Two layers here, deliberately:
 *   1. the declared access level on the real registered commands — catches a
 *      re-flip of the literal, which is what actually happened;
 *   2. the guard's decision for an agent caller — catches a future exemption
 *      being threaded in below the declared level.
 *
 * There are no auto-approve carve-outs by design. Bulk setup is meant to run
 * host-side, where the guard allows unconditionally (trusted socket) and no
 * approval card is raised at all.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockGetContainerConfig = vi.fn();
vi.mock('../db/container-configs.js', () => ({
  getContainerConfig: (...args: unknown[]) => mockGetContainerConfig(...args),
}));

import { commandGuardSpec } from './guard.js';
import { lookup, type CommandDef } from './registry.js';
import './resources/index.js'; // real registrations — must import for lookup() to resolve

/** The four commands whose gates were removed. */
const GATED = ['groups-create', 'groups-restart', 'wirings-create', 'destinations-add'] as const;

describe('declared access level', () => {
  it.each(GATED)('%s is registered as approval-gated', (name) => {
    const cmd = lookup(name);
    expect(cmd, `${name} is not registered — did it get renamed?`).toBeDefined();
    // Asserting the literal, not just "is truthy": the bug was a value
    // outside the Access union that quietly behaved like 'open'.
    expect(cmd!.access).toBe('approval');
  });
});

describe('guard decision for agent callers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 'global' scope so the group-scope allowlist isn't what's under test
    // here (wirings-create is not in GROUP_SCOPE_RESOURCES and would DENY
    // before ever reaching the approval branch).
    mockGetContainerConfig.mockResolvedValue({ cli_scope: 'global' });
  });

  /** Runs the real decide fn for a registered command against given args. */
  async function decide(name: string, args: Record<string, unknown>) {
    const cmd = lookup(name);
    expect(cmd, `${name} is not registered`).toBeDefined();
    return commandGuardSpec(cmd as CommandDef).decide({
      actor: { kind: 'agent', agentGroupId: 'ag-1', sessionId: 's1' },
      payload: args,
    } as Parameters<ReturnType<typeof commandGuardSpec>['decide']>[0]);
  }

  it.each(GATED)('%s holds for an agent caller', async (name) => {
    // Argument shape is irrelevant: the gate is on the command, not the call.
    expect((await decide(name, { id: 'ag-1' })).effect).toBe('hold');
  });

  it('holds groups-create in every form — bare, templated, and restamp-apply', async () => {
    // No form is exempt. A templated stamp still mints a persistent agent
    // identity, which upstream treats as a security concern in its own right
    // (nanocoai/nanoclaw#2807), and --yes additionally overwrites the target's
    // skills, persona, context and tasks.
    for (const args of [
      { folder: 'anything' },
      { template: 'support/community-support' },
      { template: 'support/community-support', yes: true },
    ]) {
      expect((await decide('groups-create', args)).effect).toBe('hold');
    }
  });

  it('holds groups-restart with and without --rebuild', async () => {
    expect((await decide('groups-restart', { id: 'ag-1' })).effect).toBe('hold');
    expect((await decide('groups-restart', { id: 'ag-1', rebuild: true })).effect).toBe('hold');
  });

  it('always allows host callers, gate or no gate', async () => {
    const cmd = lookup('groups-create') as CommandDef;
    const decision = await commandGuardSpec(cmd).decide({
      actor: { kind: 'host' },
      payload: { folder: 'anything' },
    } as Parameters<ReturnType<typeof commandGuardSpec>['decide']>[0]);
    expect(decision.effect).toBe('allow');
  });
});
