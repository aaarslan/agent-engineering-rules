# Capability and verification matrix

Reviewed 2026-10-02 against official documentation. Labels distinguish **verified
in source/tests**, **documented by a client**, **proposed AER policy**, and
**unmeasured behavior**. A configured CI job is not execution evidence.

| Channel/property | Evidence | Claim limit |
|---|---|---|
| Portable Agent Skills | Final frontmatter/resource validators and isolated package lifecycle | Format-valid/installable; manual-only/read-only are instructions |
| Codex direct representation | Sidecar/body inventory tests; [official skills documentation](https://learn.chatgpt.com/docs/build-skills) | Invocation policy documented; final-session discovery/invocation unverified |
| Claude Code direct representation | Rendered native metadata and restricted adapter inventory tests; [skills](https://code.claude.com/docs/en/skills), [subagents](https://code.claude.com/docs/en/sub-agents) | Manual invocation/fork/tool allowlist documented; actual session/tool probes unverified |
| Instruction discovery | [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Claude memory](https://code.claude.com/docs/en/memory) | Filesystem checks do not prove loading once; private settings/memory affect sessions |
| Optional plugins | No final plugin artifact | Explicitly deferred; no discovery/control/update claim |
| Other clients/cloud/account uploads | Canonical standard metadata only | Discovery, executable-resource runtime and controls unverified |
| macOS arm64 / Node 24.21.0 | Local release/lifecycle tests | Observed local mechanical behavior only |
| Minimum Node 24.0.0 | Exact runtime release check recorded separately | See release evidence; do not infer from the newer runtime |
| Linux and Windows | Required pinned-action CI matrices retained | Execution unavailable locally; gates unverified until actual jobs pass |
| Better engineering / lower cost | No v6 provider/model trials | Unmeasured behavior; no efficacy or savings claim |

Local binaries inspected: Claude Code 2.1.285 and Codex CLI 0.160.0 (`--version`
and `--help` only initially). Their presence is not final-artifact discovery or
invocation evidence. No model trial is authorized by this implementation task.

Claude documentation currently describes `AGENTS.md` fallback in 2.1.277+, with
session limitations before 2.1.281; `CLAUDE.md`/`CLAUDE.local.md` and user/managed
settings can change discovery. An explicitly reviewed `@AGENTS.md` bridge can
retain one contract; inspect `/context` in the actual session. Forked review skills
need bounded scope and supplied diff because caller history is not assumed.

Codex documentation describes repository `.agents/skills` discovery and initial
name/description/path listing, plus `agents/openai.yaml` invocation policy. A
custom destination needs its own discovery setup. Multiple matching directories
may expose duplicate skills; AER does not edit private configuration to resolve it.

AER's compact block budget, profiles and UI placement are **proposed AER policy**,
not measured optima or format requirements. Byte estimates do not measure tokens,
cache effects or monetary costs. Compatibility dates require review when stale;
offline validators do not silently browse or fabricate new review dates.
