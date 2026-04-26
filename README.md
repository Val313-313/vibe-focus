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
  <strong>your AI agent does everything you say. that's the problem.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.2.0-green" alt="version">
  <a href="https://github.com/Val313-313/vibe-focus/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Val313-313/vibe-focus" alt="license"></a>
  <a href="https://github.com/Val313-313/vibe-focus"><img src="https://img.shields.io/github/stars/Val313-313/vibe-focus" alt="stars"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="node">
</p>

<p align="center">
  a <a href="https://philstranger.com">phil stranger</a> project
</p>

---

## the annoying problem

you're vibe coding. you tell Claude "build user auth." twenty minutes in you notice bad error handling. "quickly fix that." then some CSS catches your eye. forty-five minutes later: 15 files touched, 4 different concerns, nothing shipped, and your AI agent is hallucinating because it lost track of what you actually wanted.

your AI agent didn't stop you. it did exactly what you asked. every single time.

**that's context collapse.** and it's context switching on steroids.

## the fix

**vibe-focus** is a CLI that sits next to your AI coding agent and tells it: "no. finish what you started."

- **scope it** — define what's in, what's out. out-of-scope? blocked.
- **one task, clear criteria** — no "done" without meeting them.
- **pushback** — try to switch before finishing? the guardian says no.
- **park it** — new idea mid-task? noted. not now.
- **hook it** — plugs into your AI agent. every prompt gets checked.

## what's new

- **team collaboration** — built-in `vf team` commands share focus state across your team. see who's working on what, sync tasks, and inject coworker context into guard hooks. solo focus, team awareness.
- **focus history** — `vf history` shows a sparkline of your focus score over time. streaks, trends, weekly averages. all in the terminal.
- **multi-tab workers** — `vf start t2 --worker api` runs parallel tasks in separate terminal tabs. each worker tracks independently.
- **extension API** — `import { loadState } from 'vibe-focus'` — build plugins on top of the core. powers team and vibeteamz cloud integrations.
- **vibeteamz cloud** — `vf vibeteamz login` connects to the vibeteamz platform. live dashboards, team chat, task management, milestones, and activity feeds from your terminal.

## install

> **Install once globally, then `vf init` in each project. No per-project reinstall needed.**

```bash
pnpm add -g github:Val313-313/vibe-focus
```

no npm registry needed. installs directly from GitHub. after this, `vf` works in every project — just run `vf init` to set up each one.

## 30 seconds to focus

```bash
# Initialize in any project
cd your-project
vf init
vf scope --purpose "Build a REST API" --in "endpoints" "auth" --out "frontend" "deployment"
vf add "User registration" -c "POST /register" "Email validation" "Password hashing" "Returns JWT"
vf start t1
vf guard --install              # auto-detects agent, or:
vf guard --install --agent cursor
vf guard --install --agent copilot
```

done. your AI agent now refuses to let you drift.

## how it actually works

### 1. define your scope

```bash
vf scope --purpose "E-commerce checkout" \
         --in "Cart" "Payment" "Order confirmation" \
         --out "Product catalog" "User profiles" "Admin panel"
```

try to sneak in an admin panel task:

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

### 2. work the task

```bash
vf add "Cart total calculation" -c "Sum line items" "Apply discounts" "Tax calculation"
vf start t1
vf check t1-c1         # done
vf check t1-c2         # done
vf done                # ship it
```

or add criteria interactively:

```bash
vf add "Cart total calculation" -i
# prompts you line by line. empty line = done.
```

### 3. get pushed back

67% done and trying to switch?

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

3+ switches in a day? pattern detected:

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

yes, the override flag is `--yolo`. you earned it.

### 4. AI agent integration

the real thing. `vf guard --install` hooks into your AI agent:

```bash
vf guard --install                  # auto-detect (Claude Code if available)
vf guard --install --agent claude   # Claude Code: hook + rules
vf guard --install --agent cursor   # Cursor: .cursor/rules/vibe-focus.mdc
vf guard --install --agent copilot  # Copilot: .github/copilot-instructions.md
vf guard --install --agent windsurf # Windsurf: .windsurfrules
vf guard --install --agent generic  # print rules to stdout
```

- **every prompt** gets checked against your active task
- **off-task requests** get refused and parked as notes
- **focus rules** are injected as system context
- **acceptance criteria** become the agent's definition of done

what your AI agent sees on every prompt:

```
VIBE FOCUS ACTIVE - STRICT MODE
CURRENT TASK: t1 - Cart total calculation
REMAINING CRITERIA:
  - Tax calculation
ENFORCEMENT: If request does NOT relate to this task → STOP, REMIND, REDIRECT
```

### 5. park ideas, don't lose them

mid-task eureka moment? park it:

```bash
vf note "refactor the auth middleware"
```

come back later:

```bash
vf note --list              # see all parked ideas
vf note --promote n1        # turn it into a real task
```

### 6. session memory

closing your terminal? save where you left off:

```bash
vf context "implemented cart total, tax calc still open, decided to use Stripe Tax API"
```

next session, the guard hook auto-injects this context. no more "where was I?"

### 7. flow mode

tired of Claude asking permission for every file edit?

```bash
vf flow --on          # auto-approve tools until current task is done
vf superflow --on     # auto-approve until ALL tasks are done
```

auto-disables when you `vf done`. guardrails stay on.

### 8. interactive dashboard

```bash
vf dash
```

| Key | Action |
|-----|--------|
| `↑↓` | Navigate tasks / criteria |
| `Enter` | Start task |
| `Tab` | Switch panels |
| `Space` | Check/uncheck criterion |
| `d` | Mark task done |
| `p` | Copy prompt to clipboard |
| `f` | Force switch (override) |
| `q` | Quit |

### 9. focus history

see your focus over time:

```bash
vf history
```

```
Focus History (14 days)
Score: ▁▃▅▇▇█▅▃▅▇██▇█
       M T W T F S S M T W T F S S
Streak: 5 days | Avg: 78 | Best: 95
```

```bash
vf history -n 30    # last 30 days
vf history --json   # export as JSON
```

### 10. multi-tab workers

working on frontend and backend at the same time? separate tabs, separate focus:

```bash
# Terminal 1
vf start t1 --worker ui
# works on t1, tracked as "ui" worker

# Terminal 2
vf start t2 --worker api
# works on t2, tracked as "api" worker
```

each worker has its own task and guardian. no cross-contamination.

### 11. extension API

build on top of vibe-focus:

```typescript
import { loadState, loadScope } from 'vibe-focus';

const state = loadState();            // full project state
const scope = loadScope();            // project scope
const active = state.tasks.find(t => t.status === 'active');
```

powers the built-in team and vibeteamz cloud integrations. publish your own extensions via pnpm.

## all commands

### core workflow

| Command | What it does |
|---------|-------------|
| `vf init` | Initialize project |
| `vf add "task" -c "criterion"` | Add task with acceptance criteria |
| `vf add "task" -i` | Add task, enter criteria interactively |
| `vf start <id>` | Start a task (one at a time) |
| `vf check <criterion-id>` | Mark criterion as met |
| `vf check --all` | Mark all criteria as met |
| `vf done` | Complete task (all criteria must be met) |
| `vf list` | List all tasks |
| `vf status` | Full dashboard with score, pipeline, events |

### focus protection

| Command | What it does |
|---------|-------------|
| `vf guard --install` | Install focus guard (auto-detects agent) |
| `vf guard --install --agent cursor` | Install for Cursor |
| `vf guard --remove` | Remove the guard |
| `vf guard --status` | Check if guard is active |
| `vf switch <id>` | Switch task (guardian pushback!) |
| `vf scope` | Define/view project scope |
| `vf scope --rules` | Write rules for AI agent |
| `vf note "idea"` | Park an idea without losing focus |
| `vf note --promote <id>` | Promote note to task |
| `vf abandon` | Abandon task (score penalty) |

### workflow & productivity

| Command | What it does |
|---------|-------------|
| `vf dash` | Interactive TUI dashboard |
| `vf flow --on` | Auto-approve tools until task done |
| `vf superflow --on` | Auto-approve until ALL tasks done |
| `vf context "summary"` | Save session context |
| `vf context --show` | Show last saved context |
| `vf prompt` | Generate focused prompt for AI agent |
| `vf history` | Focus history sparkline |
| `vf history -n 30` | Last 30 days of history |
| `vf history --json` | Export history as JSON |

### team & cloud

| Command | What it does |
|---------|-------------|
| `vf team init` | Initialize team mode for this project |
| `vf team status` | Show team members and their focus state |
| `vf team sync` | Sync team presence files via Git |
| `vf team who <path>` | Check who is working on a file |
| `vf team msg "text"` | Send or read team messages |
| `vf msg "text"` | Send a message to other tabs/workers |
| `vf say "text"` | Send a message to vibeteamz team chat |
| `vf vibeteamz login` | Authenticate with vibeteamz cloud |
| `vf vibeteamz link <id>` | Link project to vibeteamz |
| `vf vibeteamz status` | Show cloud connection status |
| `vf vibeteamz pull` | Show full project dashboard from cloud |
| `vf vibeteamz tasks` | List project tasks from vibeteamz |

### advanced

| Command | What it does |
|---------|-------------|
| `vf start <id> --worker <name>` | Start task in a named worker tab |
| `vf done --worker <name>` | Complete task for a specific worker |
| `vf watch` | Watch for changes, cross-tab sync, auto-heartbeats |
| `vf hook --install` | Install git hooks for auto-tracking |
| `vf setup` | One-command project setup wizard |
| `vf join` | Join an existing project (team onboarding) |
| `vf all` | Show all tasks: local + vibeteamz |
| `import { loadState } from 'vibe-focus'` | Extension API — build plugins on top |

## focus score

daily score. 0-100. no mercy.

| Score | Label | What it means |
|-------|-------|---------|
| 90-100 | Deep Focus | clean execution. minimal switching. |
| 70-89 | Good Focus | mostly on track. occasional detours. |
| 50-69 | Moderate | too much switching. break tasks down. |
| 0-49 | Context Collapse | you need vibe-focus more than anyone. |

**+20** complete a task. **-10** switch. **-5** override guardian. **-15** abandon.

## philosophy

1. **one task at a time.** context switching is the enemy.
2. **define done before you start.** acceptance criteria prevent scope creep.
3. **friction is a feature.** the pushback makes you think.
4. **override is always possible.** `--force` and `--yolo` exist. your call. but the score remembers.
5. **AI agents need boundaries too.** without scope, they'll refactor your entire codebase when you asked for a button.

## works with

- **Claude Code** — native hook integration + flow mode
- **Cursor** — rules file in `.cursor/rules/`
- **GitHub Copilot** — instructions in `.github/copilot-instructions.md`
- **Windsurf** — rules in `.windsurfrules`
- **Any AI agent** — via `vf prompt` and `vf scope --rules`
- **Solo devs** who want to ship, not spiral
- **Teams** preventing scope creep in AI-assisted sessions
- **Your own tools** — Extension API (`lib.ts`) lets you build on top of vibe-focus

## build it. ship it. learn.

made by [phil stranger](https://philstranger.com)

## License

MIT
