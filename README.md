<p align="center">
  <pre>
  ██╗   ██╗██╗██████╗ ███████╗    ███████╗ ██████╗  ██████╗██╗   ██╗███████╗
  ██║   ██║██║██╔══██╗██╔════╝    ██╔════╝██╔═══██╗██╔════╝██║   ██║██╔════╝
  ██║   ██║██║██████╔╝█████╗      █████╗  ██║   ██║██║     ██║   ██║███████╗
  ╚██╗ ██╔╝██║██╔══██╗██╔══╝      ██╔══╝  ██║   ██║██║     ██║   ██║╚════██║
   ╚████╔╝ ██║██████╔╝███████╗    ██║     ╚██████╔╝╚██████╗╚██████╔╝███████║
    ╚═══╝  ╚═╝╚═════╝ ╚══════╝    ╚═╝      ╚═════╝  ╚═════╝ ╚═════╝ ╚══════╝
  </pre>
</p>

<p align="center">
  <strong>Stop context collapse. Ship one thing at a time.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vibe-focus"><img src="https://img.shields.io/npm/v/vibe-focus.svg" alt="npm version"></a>
  <a href="https://github.com/vibe-focus/vibe-focus/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/vibe-focus.svg" alt="license"></a>
  <a href="https://www.npmjs.com/package/vibe-focus"><img src="https://img.shields.io/npm/dm/vibe-focus.svg" alt="downloads"></a>
</p>

---

## The Problem

You're vibe coding with Claude Code. You start on **user authentication**. Twenty minutes in, you notice the API error handling could be better. You "quickly" refactor that. Then you spot a CSS issue. Before you know it, you've touched 15 files across 4 different concerns, your context window is bloated, and Claude starts hallucinating because it lost track of what you're actually building.

**This is context collapse.** And it kills vibe coding sessions.

## The Solution

**vibe-focus** is a Focus Guardian CLI that sits next to your AI coding agent and enforces single-task discipline:

- **Define your project scope** - what's in, what's out
- **Break work into focused tasks** with clear acceptance criteria
- **Get pushed back** when you try to context-switch before finishing
- **Auto-inject focus rules** into Claude Code via hooks
- **Track your focus score** to build better habits

## Quick Start

```bash
npm install -g vibe-focus

cd your-project
vf init
vf scope --purpose "Build a REST API" --in "endpoints" "auth" --out "frontend" "deployment"
vf add "Implement user registration" -c "POST /register endpoint" "Email validation" "Password hashing" "Returns JWT"
vf start t1
vf guard --install   # Claude Code will now enforce your focus
```

That's it. Claude Code will now **refuse to let you deviate** from your current task.

## How It Works

### 1. Define Your Scope

```bash
vf scope --purpose "E-commerce checkout flow" \
         --in "Cart" "Payment" "Order confirmation" \
         --out "Product catalog" "User profiles" "Admin panel"
```

Try to add a task outside your scope? Blocked:

```
╭──────────────────────────────────────────────────╮
│  FOCUS GUARDIAN - BLOCKED                        │
│                                                  │
│  "Add admin panel" is outside project scope.     │
│                                                  │
│  Project purpose: E-commerce checkout flow       │
│  Override: --force                               │
╰──────────────────────────────────────────────────╯
```

### 2. Work Through Tasks

```bash
vf add "Implement cart total calculation" -c "Sum line items" "Apply discounts" "Tax calculation"
vf start t1
vf check t1-c1         # Mark criteria as done
vf done                # Complete task when all criteria met
```

### 3. Get Pushed Back

Try to switch tasks before finishing?

```
╭──────────────────────────────────────────────────╮
│  FOCUS GUARDIAN - BLOCKED                        │
│                                                  │
│  You're 67% done with "Cart total calculation".  │
│  Only 1 criterion left!                          │
│                                                  │
│  Finish it. You're almost there.                 │
│  Override: --force                               │
╰──────────────────────────────────────────────────╯
```

Switch 3+ times in a day?

```
╭──────────────────────────────────────────────────╮
│  FOCUS GUARDIAN - BLOCKED                        │
│                                                  │
│  You've switched 3 times today.                  │
│  This is the context collapse pattern that       │
│  vibe-focus exists to prevent.                   │
│                                                  │
│  Pick ONE task and finish it.                    │
│  Override: --yolo                                │
╰──────────────────────────────────────────────────╯
```

### 4. Claude Code Integration

The killer feature. `vf guard --install` hooks directly into Claude Code:

- **Every prompt** gets checked against your active task
- **Claude refuses** to work on out-of-scope requests
- **Focus rules** are injected as system context
- **Acceptance criteria** become Claude's definition of done

```bash
vf guard --install    # Activate
vf guard --status     # Check if active
vf guard --remove     # Deactivate
```

What Claude sees on every prompt:

```
VIBE FOCUS ACTIVE - STRICT MODE
CURRENT TASK: t1 - Implement cart total
REMAINING CRITERIA:
  - Tax calculation
ENFORCEMENT: If request does NOT relate to this task → STOP, REMIND, REDIRECT
```

### 5. Interactive Dashboard

```bash
vf dash
```

A full TUI dashboard with keyboard navigation:

| Key | Action |
|-----|--------|
| `↑↓` | Navigate tasks / criteria |
| `Enter` | Start task |
| `Tab` | Switch between tasks and criteria panel |
| `Space` | Check/uncheck criterion |
| `d` | Mark task as done |
| `p` | Copy focused prompt to clipboard |
| `f` | Force switch (guardian override) |
| `q` | Quit |

## All Commands

| Command | Description |
|---------|-------------|
| `vf init` | Initialize vibe-focus in your project |
| `vf scope` | Define/view project scope |
| `vf add "task" -c "criteria"` | Add a task with acceptance criteria |
| `vf start <id>` | Start working on a task |
| `vf check <criterion-id>` | Mark a criterion as met |
| `vf done` | Complete the current task |
| `vf status` | Show focus dashboard |
| `vf list` | List all tasks |
| `vf switch <id>` | Switch task (guardian pushback!) |
| `vf abandon` | Abandon current task |
| `vf prompt` | Generate focused prompt for Claude Code |
| `vf scope --rules` | Write focus rules to `.claude/rules/` |
| `vf guard --install` | Install Claude Code enforcement hooks |
| `vf dash` | Interactive TUI dashboard |

## Focus Score

vibe-focus tracks your focus habits with a daily score (0-100):

| Score | Label | Meaning |
|-------|-------|---------|
| 90-100 | Deep Focus | Minimal switching, tasks completed cleanly |
| 70-89 | Good Focus | Occasional switches but mostly on-task |
| 50-69 | Moderate | Multiple switches, consider smaller tasks |
| 0-49 | Context Collapse | Too much switching, break tasks down further |

**+20** for completing a task, **-10** for switching, **-5** for overriding the guardian.

## Philosophy

1. **One task at a time.** Context switching is the enemy of vibe coding.
2. **Define done before you start.** Acceptance criteria prevent scope creep.
3. **Friction is a feature.** The pushback is intentional. It makes you think before you switch.
4. **Override is always possible.** `--force` and `--yolo` exist. You're in control. But you'll see the score impact.
5. **AI agents need boundaries too.** Without explicit scope, AI agents will happily refactor your entire codebase when you asked for a button.

## Works With

- **Claude Code** (native hook integration)
- Any AI coding agent (via `vf prompt` and `vf scope --rules`)
- Solo developers who want to stay focused
- Teams that want to prevent scope creep in AI-assisted sessions

## License

MIT
