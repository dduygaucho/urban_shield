# Agent orchestration (UrbanShield)

This folder is the **single place** for multi-agent workflows. Each subfolder is a **phase** with **non-overlapping** agent briefs.

## Start here

| Phase | Goal | Open |
|-------|------|------|
| **Phase A** | Run Next.js and see the Mapbox map | [phase-a/HUMAN_ORCHESTRATION.md](./phase-a/HUMAN_ORCHESTRATION.md) |

## Conflict-free rule (non-negotiable)

Two agents may run **in parallel** only if their **allowed path lists are disjoint**. If a path is not listed in an agent brief, that agent **must not** edit it.

## Phase A conflict matrix (who may touch what)

| Path pattern | Phase A parallel? | Owner |
|--------------|-------------------|--------|
| `apps/web/app/map/**` | Yes (Agent MAP) | [phase-a/AGENT_MAP_UI.md](./phase-a/AGENT_MAP_UI.md) |
| `apps/web/app/page.tsx` | Yes (Agent INTEGRATION) | [phase-a/AGENT_INTEGRATION_UI.md](./phase-a/AGENT_INTEGRATION_UI.md) |
| `apps/web/lib/api.ts` | Yes (Agent INTEGRATION) | [phase-a/AGENT_INTEGRATION_UI.md](./phase-a/AGENT_INTEGRATION_UI.md) |
| `apps/web/app/layout.tsx`, `globals.css`, `package.json`, `next.config.*`, `tailwind.*`, `tsconfig.json` | **No parallel agent** — human or one serial task | [phase-a/HUMAN_ORCHESTRATION.md](./phase-a/HUMAN_ORCHESTRATION.md) |
| `apps/web/app/report/**`, `services/api/**`, `libs/schemas/**` | **Not Phase A** — do not assign | [FEATURE_REGISTRY.md](../../FEATURE_REGISTRY.md) |

## How to use Cursor (practical)

1. Read [phase-a/HUMAN_ORCHESTRATION.md](./phase-a/HUMAN_ORCHESTRATION.md) and complete **your** steps first.
2. Open **two Cursor chats** (two windows).
3. In each chat, **@ (attach)** the matching agent `.md` file from `docs/agents/phase-a/` and paste the **“Paste into Cursor”** block from that file as the first message.
4. If an agent proposes edits outside its allowed list, **reject** and repeat the allowed list.

## Related repo docs

- [FEATURE_REGISTRY.md](../../FEATURE_REGISTRY.md) — long-term ownership by “Person 1–4”
- [README.md](../../README.md) — install and run commands
- Root [MULTI_AGENT_PLAYBOOK.md](../../MULTI_AGENT_PLAYBOOK.md) — short pointer back to this folder
