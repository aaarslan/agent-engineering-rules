# Install

Five minutes, three steps. Works in any repository.

## 1. Get the directory into your repo

Any one of these, from your repository root:

    git clone https://github.com/aaarslan/agent-engineering-rules agent-rules && rm -rf agent-rules/.git

    git submodule add https://github.com/aaarslan/agent-engineering-rules agent-rules

or download the release zip and unpack it as `agent-rules/`. The folder name is yours to choose; the examples below assume `agent-rules/`.

## 2. Point your agents at it

Create (or append to) `AGENTS.md` in your repository root:

    ## Agent Engineering Rules

    Before starting any task, read `agent-rules/AGENTS.md` and load the files its task table routes for the current task. Required context, not optional documentation.
    Active profile: `agent-rules/profiles/standard.md`.
    Active canonical contexts: none preselected; select from evidence per the router.
    Project contexts: none.
    Treat `agent-rules/` as read-only. Host rules override it except the correctness, security, and data-integrity priorities in `agent-rules/core/priorities.md`.

Edit two lines to fit your project: the profile (`standard` for maintained software, `prototype` for experiments, `regulated` for compliance-sensitive work) and the contexts line (for example `` `agent-rules/contexts/typescript-react.md` `` for a React app; list what matches your stack, or leave it for the agent to select).

Codex CLI, Codex Cloud, and other AGENTS.md-reading agents are done at this point.

## 3. Claude Code wiring

Create (or append to) `CLAUDE.md` in your repository root:

    @AGENTS.md
    @agent-rules/AGENTS.md

Recommended: guaranteed delivery. Measurement showed Claude Code often skips rule files even when the router is in context. The included hook injects the routed rules mechanically. Create `.claude/settings.json` in your repository root:

    {
      "hooks": {
        "UserPromptSubmit": [
          {
            "matcher": "",
            "hooks": [
              { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/agent-rules/tools/route-hook.mjs\" 1" },
              { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/agent-rules/tools/route-hook.mjs\" 2" },
              { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/agent-rules/tools/route-hook.mjs\" 3" },
              { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/agent-rules/tools/route-hook.mjs\" 4" }
            ]
          }
        ]
      }
    }

## Verify

    node agent-rules/tools/validate-system.mjs

should print `PASS`. Then ask your agent: "Which engineering rules apply to a bug fix in this repo?" It should name files from `agent-rules/`, not generic advice.

## Agent-driven setup

Alternatively, after step 1, tell your agent: "Adopt the rules in agent-rules/ per its ADOPT.md." It will detect your stack, pick contexts and a profile from evidence, and write the host block itself.

## Troubleshooting

- **The agent ignores the rules.** This is common and measured, not hypothetical. Wire the hook (step 3); prose pointers alone under-deliver on Claude Code.
- **Too much context loading.** Check that your host block lists only contexts your stack uses; the router is selective by design.
- **Validator fails after edits.** You edited inside `agent-rules/`; it is read-only by contract. Put project-specific rules in your own files and reference them from your host `AGENTS.md`.
