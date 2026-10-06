# Capability and verification matrix

Reviewed 2026-10-05 against official documentation; final-client probes below are from 6.0.0. Labels distinguish **verified
in source/tests**, **documented by a client**, **proposed AER policy**, and
**unmeasured behavior**. A configured CI job is not execution evidence.

| Channel/property | Evidence | Claim limit |
|---|---|---|
| Portable Agent Skills | Final frontmatter/resource validators and isolated package lifecycle | Format-valid/installable; manual-only/read-only are instructions |
| Codex direct representation | Sidecar/body inventory tests; [official skills documentation](https://learn.chatgpt.com/docs/build-skills) | Codex CLI 0.160.0: 13 discovered at root/nested cwd, manual routes excluded implicitly, explicit review body activated; loopback fixture |
| Claude Code direct representation | Rendered native metadata and restricted adapter inventory tests; [skills](https://code.claude.com/docs/en/skills), [subagents](https://code.claude.com/docs/en/sub-agents) | Claude Code 2.1.285: implicit exclusion, explicit review forks, Read/Grep/Glob tool inventory and rejected Skill/Bash calls; loopback fixture |
| Instruction discovery | [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Claude memory](https://code.claude.com/docs/en/memory) | Filesystem checks do not prove loading once; private settings/memory affect sessions |
| Claude owned rules destination | [Memory/rules](https://code.claude.com/docs/en/memory); existing `--instructions-file .claude/rules/aer.md` | Rules without `paths` load at startup; no import needed. AER still owns only its managed block; default destination remains AGENTS.md |
| Claude path-scoped rules | [Memory/rules](https://code.claude.com/docs/en/memory) | `paths` supports brace patterns and triggers on matching Read/Write/Edit operations. Shell access alone does not activate it; AER UI-01 remains browser-conditional in the kernel |
| Claude plugin contract option | [Plugin components](https://code.claude.com/docs/en/plugins-reference), [output styles](https://code.claude.com/docs/en/output-styles) | Skills/agents/hooks/output styles are documented. `force-for-plugin: true` plus `keep-coding-instructions: true` can deliver persistent instructions, overriding the user's style; first forced style wins on conflict. No AER plugin artifact/client probe |
| Generic portable installation | [Vercel skills CLI](https://github.com/vercel-labs/skills) and source directory layout | Source SKILL.md directories are discoverable; installation omits AER's contract/native renderer/reviewer adapter. No blanket client-control claim |
| Other clients/cloud/account uploads | Canonical standard metadata only | Discovery, executable-resource runtime and controls unverified |
| macOS arm64 / Node 24.21.0 | Local release/lifecycle tests | Observed local mechanical behavior only |
| Minimum Node 24.11.1 LTS | Exact runtime release check recorded separately | Node 24.0.0 is unsupported: inconsistent Windows filesystem identity; see release evidence |
| Linux and Windows | GitHub Actions minimum/current Node 24 matrices | Executed results and exact runtimes are recorded in [release evidence](https://github.com/aaarslan/agent-engineering-rules/blob/v6.0.0/docs/evidence/6.0.0-release.json); job configuration alone is not evidence |
| Better engineering / lower cost | No v6 provider/model trials | Unmeasured behavior; no efficacy or savings claim |

Actual local CLI probes used isolated consumer/configuration directories and a
deterministic loopback protocol fixture. No remote model provider was dispatched;
synthetic responses/token counts/cost displays are not model or spend evidence.
Both clients received AE-01 and UI-01 once in the tested root request. Codex
listed 13 skills at root and nested cwd; Claude exposed nine contextual skills,
excluded four manual routes, and loaded both explicitly invoked review bodies
with only Read/Grep/Glob tools. A model-originated Skill call to the manual review
was rejected; a reviewer Bash attempt was rejected and created no sentinel file.
The bare Claude mode was excluded from evidence because it suppressed normal
project discovery. [Probe record](https://github.com/aaarslan/agent-engineering-rules/blob/main/docs/evidence/6.0.0-client-controls.json).
These observations cover the named local versions/configurations, not every
private setting, ancestor instruction, custom destination, IDE or cloud session.

Claude's default AGENTS fallback applies only when no ancestor `CLAUDE.md`,
`.claude/CLAUDE.md` or `CLAUDE.local.md` variant exists; user `~/.claude/CLAUDE.md`
and managed instructions do not suppress that project fallback. Bare mode skips
normal discovery. An explicitly reviewed `@AGENTS.md` bridge can retain one
contract; imports have a four-hop limit. Inspect `/context` in the actual session.
A Claude-only install may choose `.claude/rules/aer.md` directly; avoid duplicate
contract deliveries.

Claude excludes `disable-model-invocation: true` skills from the description
catalog and subagent preloading. Contextual descriptions default to a configurable
1,536-character budget combined with `when_to_use`; description listings also
have an aggregate budget. Loaded skill retention after compaction is bounded
(first 5,000 tokens per skill, 25,000 combined). AER body budgets are policy limits,
not claims about exact provider tokenization or adherence.

Forked review skills need bounded scope and a supplied diff because caller
history is not assumed. AER keeps Read/Grep/Glob. Subagent tool names and command
permission patterns are distinct controls; [permission rules](https://code.claude.com/docs/en/permissions)
are not program-level read-only guarantees. [`git diff`](https://git-scm.com/docs/git-diff)
can write with `--output` or run external diff/textconv, so broad git allowances
would expand the reviewer's authority.

Codex documentation describes `.agents/skills` discovery from cwd through its
ancestors to the repository root and initial name/description/path listing, plus
`agents/openai.yaml` invocation policy. `policy.allow_implicit_invocation: false`
retains explicit `$skill` activation. Project instructions concatenate selected
AGENTS.override.md/AGENTS.md/fallback files root-to-cwd under a default 32 KiB cap. A
custom destination needs its own discovery setup. Multiple matching directories
may expose duplicate skills; AER does not edit private configuration to resolve it.

AER's compact block budget, profiles and UI placement are **proposed AER policy**,
not measured optima or format requirements. Byte estimates do not measure tokens,
cache effects or monetary costs. Compatibility dates require review when stale;
offline validators do not silently browse or fabricate new review dates.
