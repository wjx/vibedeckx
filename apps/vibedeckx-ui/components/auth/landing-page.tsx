"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  Apple,
  Monitor,
  Terminal,
  Copy,
  Check,
  Download,
  CornerDownRight,
} from "lucide-react";

type Platform = "macos" | "linux" | "windows";

const platforms: {
  id: Platform;
  label: string;
  icon: typeof Apple;
  steps: { text: string; command?: string }[];
}[] = [
  {
    id: "macos",
    label: "macOS",
    icon: Apple,
    steps: [
      { text: "Download the package from the latest release" },
      { text: "Install globally", command: "npm install -g ./vibedeckx-0.1.6-darwin-arm64.tar.gz" },
      { text: "Launch the orchestrator", command: "vibedeckx" },
    ],
  },
  {
    id: "linux",
    label: "Linux",
    icon: Terminal,
    steps: [
      { text: "Download the package from the latest release" },
      { text: "Run directly with npx", command: "npx -y ./vibedeckx-0.1.6-linux-x64.tar.gz" },
    ],
  },
  {
    id: "windows",
    label: "Windows",
    icon: Monitor,
    steps: [
      { text: "Download the package from the latest release" },
      { text: "Run directly with npx", command: "npx -y ./vibedeckx-0.1.6-win-x64.tar.gz" },
    ],
  },
];

const PAINS = [
  {
    n: "01",
    title: "Code without testing is a guess.",
    body: "A coding agent edits files. It doesn't run your dev server, doesn't smoke-test the migration, doesn't verify the build. You're stuck switching terminals, breaking the loop.",
  },
  {
    n: "02",
    title: "One conversation is a bottleneck.",
    body: "Real work is parallel — auth here, billing there, a hot bugfix on a third branch. A single chat thread is a queue. Three branches need three sessions, isolated and observable.",
  },
  {
    n: "03",
    title: "One vendor is a leash.",
    body: "Claude Code today, Codex tomorrow, something better next quarter. Your workflow shouldn't have to be rebuilt every time the agent layer shifts.",
  },
];

const CAPABILITIES = [
  {
    coord: "[01.A]",
    title: "Agent Orchestration",
    body: "Spawn, monitor, pause and resume coding-agent sessions. Plan/edit modes switch in place; history survives restarts.",
  },
  {
    coord: "[01.B]",
    title: "Executors — your testing surface",
    body: "Named, reusable units of work: shell commands (PTY-backed for dev servers and TUIs) or AI-driven prompts. The agent calls them, you queue them, output streams back.",
  },
  {
    coord: "[02.A]",
    title: "Branch-Scoped Workspaces",
    body: "Every project × branch carries its own session, rules, tasks, executors and worktree. Run multiple agents at once without state collisions.",
  },
  {
    coord: "[02.B]",
    title: "Provider-Agnostic Layer",
    body: "Claude Code today. Codex via the AgentProvider interface, next. One UI, one protocol, no rewrite when the agent layer changes.",
  },
  {
    coord: "[03.A]",
    title: "Distributed Execution",
    body: "Drive agents and executors on a remote box from your laptop UI via transparent WebSocket proxying. Reverse-tunnel mode reaches NAT'd hosts.",
  },
  {
    coord: "[03.B]",
    title: "Tasks & Rules",
    body: "Per-project task lists with AI-suggested titles. Branch-scoped rules feed the agent's context — structure beside the chat, not buried inside it.",
  },
  {
    coord: "[03.C]",
    title: "Worktrees, first-class",
    body: "Create / list / delete from the UI. Agent paths resolve against the worktree, so parallel branches stay genuinely parallel — not a shell trick.",
  },
];

const RACK_LANES = [
  {
    coord: "[01.A]",
    branch: "feature/auth-rebuild",
    agent: "claude-code",
    status: "RUNNING",
    statusTone: "live",
    detail: "edit · components/auth/landing-page.tsx",
  },
  {
    coord: "[01.B]",
    branch: "fix/migration-rollback",
    agent: "codex",
    status: "PLANNING",
    statusTone: "warn",
    detail: "exec · pnpm test --filter storage",
  },
  {
    coord: "[01.C]",
    branch: "refactor/pricing-engine",
    agent: "claude-code",
    status: "IDLE",
    statusTone: "idle",
    detail: "awaiting executor · build:ui",
  },
] as const;

function CodeBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="vdx-code-block">
      <span className="vdx-code-prompt">$</span>
      <code className="vdx-code-text">{command}</code>
      <button
        onClick={handleCopy}
        className="vdx-code-copy"
        aria-label="Copy command"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function StatusDot({ tone }: { tone: "live" | "warn" | "idle" }) {
  return <span className={`vdx-status-dot vdx-status-dot--${tone}`} aria-hidden />;
}

export function LandingPage({ onSignIn }: { onSignIn: () => void }) {
  const [activePlatform, setActivePlatform] = useState<Platform>("macos");
  const activeConfig = platforms.find((p) => p.id === activePlatform)!;

  return (
    <div className="vdx-landing">
      <style>{vdxStyles}</style>

      {/* Atmospheric layers */}
      <div className="vdx-grain" aria-hidden />
      <div className="vdx-rule-grid" aria-hidden />
      <div className="vdx-vignette" aria-hidden />

      {/* Top nav */}
      <header className="vdx-nav">
        <div className="vdx-nav-inner">
          <div className="vdx-brand">
            <div className="vdx-brand-mark">
              <span>VDX</span>
            </div>
            <div className="vdx-brand-name">
              <span className="vdx-brand-word">Vibedeckx</span>
              <span className="vdx-brand-coord">{"// CTRL.PLANE"}</span>
            </div>
          </div>
          <div className="vdx-nav-meta">
            <span className="vdx-nav-meta-line">v0.1.6 · OPS-04</span>
            <a
              href="https://github.com/vibedeckx-dev/vibedeckx"
              target="_blank"
              rel="noopener noreferrer"
              className="vdx-nav-link"
            >
              source
            </a>
            <button onClick={onSignIn} className="vdx-nav-cta">
              Enter cockpit
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="vdx-hero">
        <div className="vdx-hero-inner">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
            className="vdx-eyebrow"
          >
            <span className="vdx-eyebrow-tick">/ /</span>
            CONTROL PLANE FOR CODING AGENTS
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.2, 0.7, 0.2, 1] }}
            className="vdx-hero-title"
          >
            <span className="vdx-display vdx-italic">A coding agent,</span>{" "}
            <span className="vdx-display vdx-italic">alone,</span>{" "}
            <span className="vdx-display vdx-italic">is not enough.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            className="vdx-hero-sub"
          >
            Vibedeckx is the outer orchestrator that runs them &mdash; schedules many in parallel,
            wraps them in a real testing surface, and lets you swap Claude Code, Codex
            and what comes next without rebuilding your workflow.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.28 }}
            className="vdx-hero-actions"
          >
            <button onClick={onSignIn} className="vdx-btn-primary">
              Enter the cockpit
              <ArrowRight className="h-4 w-4" />
            </button>
            <a href="#capabilities" className="vdx-btn-ghost">
              See the system
              <CornerDownRight className="h-4 w-4" />
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="vdx-hero-meta"
          >
            <span>self-hosted</span>
            <span className="vdx-dot" />
            <span>local-first</span>
            <span className="vdx-dot" />
            <span>provider-agnostic</span>
            <span className="vdx-dot" />
            <span>parallel by default</span>
          </motion.div>
        </div>

        {/* Live agent rack */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
          className="vdx-rack"
        >
          <div className="vdx-rack-header">
            <span className="vdx-rack-title">FLEET / live agent rack</span>
            <span className="vdx-rack-coord">3 sessions · 1 worktree set · ts {liveTimestamp()}</span>
          </div>
          <div className="vdx-rack-body">
            {RACK_LANES.map((lane, i) => (
              <motion.div
                key={lane.coord}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.5 + i * 0.08 }}
                className="vdx-lane"
              >
                <span className="vdx-lane-coord">{lane.coord}</span>
                <span className="vdx-lane-branch">{lane.branch}</span>
                <span className="vdx-lane-agent">{lane.agent}</span>
                <span className={`vdx-lane-status vdx-lane-status--${lane.statusTone}`}>
                  <StatusDot tone={lane.statusTone} />
                  {lane.status}
                </span>
                <span className="vdx-lane-detail">{lane.detail}</span>
              </motion.div>
            ))}
            <div className="vdx-rack-scanline" aria-hidden />
          </div>
        </motion.div>
      </section>

      {/* Manifesto / pains */}
      <section className="vdx-manifesto">
        <div className="vdx-section-head">
          <span className="vdx-section-tick">— 01</span>
          <h2 className="vdx-section-title">
            Why an agent <span className="vdx-display vdx-italic">on its own</span> ships less than you think.
          </h2>
        </div>
        <div className="vdx-pains">
          {PAINS.map((p) => (
            <article key={p.n} className="vdx-pain">
              <span className="vdx-pain-num vdx-display">{p.n}</span>
              <h3 className="vdx-pain-title">{p.title}</h3>
              <p className="vdx-pain-body">{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section id="capabilities" className="vdx-capabilities">
        <div className="vdx-section-head">
          <span className="vdx-section-tick">— 02</span>
          <h2 className="vdx-section-title">
            What the orchestrator gives you that <span className="vdx-display vdx-italic">a chat window</span> can&rsquo;t.
          </h2>
        </div>
        <div className="vdx-cap-grid">
          {CAPABILITIES.map((c, i) => (
            <article
              key={c.coord}
              className={`vdx-cap vdx-cap--${(i % 3) + 1}`}
            >
              <span className="vdx-cap-coord">{c.coord}</span>
              <h3 className="vdx-cap-title">{c.title}</h3>
              <p className="vdx-cap-body">{c.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Differentiators */}
      <section className="vdx-diff">
        <div className="vdx-section-head">
          <span className="vdx-section-tick">— 03</span>
          <h2 className="vdx-section-title">
            What makes this <span className="vdx-display vdx-italic">unlike</span> Cursor, Aider and Claude Code itself.
          </h2>
        </div>

        <article className="vdx-diff-row vdx-diff-row--A">
          <div className="vdx-diff-copy">
            <span className="vdx-diff-tag">orchestrator-first</span>
            <h3 className="vdx-diff-title">
              They <span className="vdx-display vdx-italic">are</span> the agent. We sit <span className="vdx-display vdx-italic">above</span> the agent.
            </h3>
            <p className="vdx-diff-body">
              Cursor, Aider and Claude Code embed the agent in their own chat. Vibedeckx
              treats the agent as a replaceable subprocess. The value is in scheduling,
              the testing surface, and multi-session control.
            </p>
          </div>
          <div className="vdx-diff-visual">
            <DiffStackVisual />
          </div>
        </article>

        <article className="vdx-diff-row vdx-diff-row--B">
          <div className="vdx-diff-copy">
            <span className="vdx-diff-tag">tests are first-class</span>
            <h3 className="vdx-diff-title">
              Executors give the agent a <span className="vdx-display vdx-italic">verification loop</span>, not just a shell.
            </h3>
            <p className="vdx-diff-body">
              Tests, builds and dev servers are named, reusable, queueable artifacts the
              agent can call &mdash; closer to a personal CI than an inline command. The agent
              edits, the executor verifies, the result feeds the next turn.
            </p>
          </div>
          <div className="vdx-diff-visual">
            <DiffExecutorVisual />
          </div>
        </article>

        <article className="vdx-diff-row vdx-diff-row--C">
          <div className="vdx-diff-copy">
            <span className="vdx-diff-tag">parallel · self-hosted · swappable</span>
            <h3 className="vdx-diff-title">
              Multiple agents, on your machine &mdash; or someone else&rsquo;s.
            </h3>
            <p className="vdx-diff-body">
              Branch is the unit of parallelism. Provider is the unit of choice. Drive a
              remote box through reverse-tunnel when the work needs more iron. Single
              binary, local SQLite, your code never leaves the network you allow.
            </p>
          </div>
          <div className="vdx-diff-visual">
            <DiffArchitectureVisual />
          </div>
        </article>
      </section>

      {/* Architecture map */}
      <section className="vdx-arch">
        <div className="vdx-section-head">
          <span className="vdx-section-tick">— 04</span>
          <h2 className="vdx-section-title">
            The map.
          </h2>
        </div>
        <div className="vdx-arch-board">
          <ArchitectureMap />
        </div>
      </section>

      {/* Install */}
      <section className="vdx-install">
        <div className="vdx-section-head">
          <span className="vdx-section-tick">— 05</span>
          <h2 className="vdx-section-title">
            One binary. <span className="vdx-display vdx-italic">Run it.</span>
          </h2>
          <p className="vdx-install-sub">
            Download from the{" "}
            <a
              href="https://github.com/vibedeckx-dev/vibedeckx/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="vdx-link"
            >
              latest release <Download className="inline h-3.5 w-3.5 ml-0.5" />
            </a>
            . Pick your platform.
          </p>
        </div>

        <div className="vdx-install-tabs">
          {platforms.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePlatform(p.id)}
              className={`vdx-install-tab ${activePlatform === p.id ? "is-active" : ""}`}
            >
              <p.icon className="h-3.5 w-3.5" />
              {p.label}
            </button>
          ))}
        </div>

        <div className="vdx-install-card">
          <div className="vdx-install-card-head">
            <span>installation · {activeConfig.label.toLowerCase()}</span>
            <span className="vdx-install-card-coord">~/{activeConfig.id}</span>
          </div>
          <ol className="vdx-install-steps">
            {activeConfig.steps.map((step, i) => (
              <li key={i} className="vdx-install-step">
                <span className="vdx-install-step-n">{String(i + 1).padStart(2, "0")}</span>
                <div className="vdx-install-step-body">
                  <p className="vdx-install-step-text">{step.text}</p>
                  {step.command && <CodeBlock command={step.command} />}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Closing */}
      <section className="vdx-closing">
        <p className="vdx-closing-line">
          <span className="vdx-display vdx-italic">The agent does the work.</span>
          <br />
          <span className="vdx-display vdx-italic">Vibedeckx makes sure it ships.</span>
        </p>
        <button onClick={onSignIn} className="vdx-btn-primary vdx-btn-primary--lg">
          Enter the cockpit
          <ArrowRight className="h-4 w-4" />
        </button>
      </section>

      <footer className="vdx-footer">
        <div className="vdx-footer-inner">
          <span>VIBEDECKX · CTRL.PLANE FOR CODING AGENTS</span>
          <span className="vdx-footer-sep">— — —</span>
          <span>self-hosted · MIT · 2026</span>
        </div>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Visuals                                                                    */
/* -------------------------------------------------------------------------- */

function DiffStackVisual() {
  return (
    <div className="vdx-stack">
      <div className="vdx-stack-row vdx-stack-row--top">
        <span className="vdx-stack-label">VIBEDECKX</span>
        <span className="vdx-stack-sub">orchestrator · scheduling · executors · UI</span>
      </div>
      <div className="vdx-stack-divider" aria-hidden />
      <div className="vdx-stack-fleet">
        <div className="vdx-stack-cell">
          <span className="vdx-stack-cell-label">claude-code</span>
          <span className="vdx-stack-cell-status">running</span>
        </div>
        <div className="vdx-stack-cell">
          <span className="vdx-stack-cell-label">codex</span>
          <span className="vdx-stack-cell-status">planning</span>
        </div>
        <div className="vdx-stack-cell vdx-stack-cell--ghost">
          <span className="vdx-stack-cell-label">+ next</span>
          <span className="vdx-stack-cell-status">slot open</span>
        </div>
      </div>
      <div className="vdx-stack-foot">↑ swappable agent layer</div>
    </div>
  );
}

function DiffExecutorVisual() {
  return (
    <div className="vdx-loop">
      <div className="vdx-loop-node vdx-loop-node--agent">
        <span className="vdx-loop-tag">agent</span>
        <span className="vdx-loop-text">edit src/server.ts</span>
      </div>
      <div className="vdx-loop-arrow">→</div>
      <div className="vdx-loop-node vdx-loop-node--exec">
        <span className="vdx-loop-tag">executor</span>
        <span className="vdx-loop-text">pnpm test</span>
      </div>
      <div className="vdx-loop-arrow">→</div>
      <div className="vdx-loop-node vdx-loop-node--result">
        <span className="vdx-loop-tag">result</span>
        <span className="vdx-loop-text">3 failed · feed back</span>
      </div>
      <div className="vdx-loop-return" aria-hidden />
    </div>
  );
}

function DiffArchitectureVisual() {
  return (
    <div className="vdx-fan">
      <div className="vdx-fan-laptop">
        <span className="vdx-fan-label">your laptop</span>
        <span className="vdx-fan-sub">vibedeckx · UI + sqlite</span>
      </div>
      <svg className="vdx-fan-lines" viewBox="0 0 200 80" preserveAspectRatio="none">
        <path d="M100 0 L20 80" />
        <path d="M100 0 L100 80" />
        <path d="M100 0 L180 80" />
      </svg>
      <div className="vdx-fan-targets">
        <div className="vdx-fan-target">local · branch A</div>
        <div className="vdx-fan-target">local · branch B</div>
        <div className="vdx-fan-target vdx-fan-target--remote">remote · gpu-box-01</div>
      </div>
    </div>
  );
}

function ArchitectureMap() {
  return (
    <div className="vdx-map">
      <div className="vdx-map-row vdx-map-row--top">
        <div className="vdx-map-block vdx-map-block--user">
          <span className="vdx-map-coord">[ YOU ]</span>
          <span className="vdx-map-label">browser UI · localhost:3000</span>
        </div>
      </div>

      <div className="vdx-map-trunk" aria-hidden />

      <div className="vdx-map-row">
        <div className="vdx-map-block vdx-map-block--core">
          <span className="vdx-map-coord">[ ORCHESTRATOR ]</span>
          <span className="vdx-map-label">Fastify · WebSocket · SQLite</span>
          <span className="vdx-map-foot">scheduling · sessions · patches · auth</span>
        </div>
      </div>

      <div className="vdx-map-row vdx-map-row--split">
        <div className="vdx-map-leg vdx-map-leg--left" aria-hidden />
        <div className="vdx-map-leg vdx-map-leg--right" aria-hidden />
      </div>

      <div className="vdx-map-row vdx-map-row--cells">
        <div className="vdx-map-cluster">
          <span className="vdx-cluster-label">AGENTS</span>
          <div className="vdx-cluster-cells">
            <div className="vdx-cluster-cell">claude-code</div>
            <div className="vdx-cluster-cell">codex</div>
            <div className="vdx-cluster-cell vdx-cluster-cell--ghost">+ next</div>
          </div>
        </div>
        <div className="vdx-map-cluster">
          <span className="vdx-cluster-label">EXECUTORS</span>
          <div className="vdx-cluster-cells">
            <div className="vdx-cluster-cell">cmd · pnpm dev</div>
            <div className="vdx-cluster-cell">cmd · pnpm test</div>
            <div className="vdx-cluster-cell">prompt · review pr</div>
          </div>
        </div>
        <div className="vdx-map-cluster">
          <span className="vdx-cluster-label">WORKTREES</span>
          <div className="vdx-cluster-cells">
            <div className="vdx-cluster-cell">feature/auth</div>
            <div className="vdx-cluster-cell">fix/migration</div>
            <div className="vdx-cluster-cell">refactor/pricing</div>
          </div>
        </div>
      </div>

      <div className="vdx-map-trunk vdx-map-trunk--down" aria-hidden />

      <div className="vdx-map-row">
        <div className="vdx-map-block vdx-map-block--remote">
          <span className="vdx-map-coord">[ REMOTE / OPTIONAL ]</span>
          <span className="vdx-map-label">ws-proxy · reverse tunnel · NAT-traversal</span>
        </div>
      </div>
    </div>
  );
}

function liveTimestamp(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const vdxStyles = `
  .vdx-landing {
    --ink: oklch(0.10 0.005 80);
    --ink-deep: oklch(0.07 0.005 80);
    --paper: oklch(0.96 0.01 85);
    --bone: oklch(0.86 0.015 85);
    --warm: oklch(0.55 0.012 80);
    --warm-dim: oklch(0.40 0.008 80);
    --line: oklch(0.22 0.005 80);
    --line-soft: oklch(0.16 0.005 80);
    --amber: oklch(0.82 0.16 70);
    --amber-deep: oklch(0.62 0.18 60);
    --card: oklch(0.13 0.005 80);
    --card-2: oklch(0.16 0.006 80);
    --rose: oklch(0.72 0.15 30);
    --green: oklch(0.78 0.14 145);

    position: relative;
    min-height: 100vh;
    background: var(--ink);
    color: var(--paper);
    font-family: var(--font-geist-sans), system-ui, sans-serif;
    overflow-x: hidden;
    isolation: isolate;
  }

  .vdx-landing::before {
    content: "";
    position: fixed;
    inset: 0;
    background:
      radial-gradient(1200px 600px at 80% -10%, oklch(0.22 0.04 70 / 0.45), transparent 60%),
      radial-gradient(900px 500px at -10% 30%, oklch(0.18 0.02 220 / 0.25), transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  .vdx-grain {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    opacity: 0.10;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.45 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  }

  .vdx-rule-grid {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    background-image:
      linear-gradient(to right, oklch(1 0 0 / 0.025) 1px, transparent 1px),
      linear-gradient(to bottom, oklch(1 0 0 / 0.025) 1px, transparent 1px);
    background-size: 96px 96px;
    mask-image: radial-gradient(1400px 800px at 50% 30%, black 30%, transparent 80%);
  }

  .vdx-vignette {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    background: radial-gradient(ellipse at 50% 0%, transparent 30%, oklch(0.05 0.005 80 / 0.4) 100%);
  }

  .vdx-display { font-family: var(--font-instrument-serif), serif; font-weight: 400; letter-spacing: -0.01em; }
  .vdx-italic { font-style: italic; }
  .vdx-mono { font-family: var(--font-jetbrains-mono), monospace; }

  /* ---- Nav ---- */
  .vdx-nav {
    position: relative;
    z-index: 5;
    border-bottom: 1px solid var(--line-soft);
    backdrop-filter: blur(8px);
    background: oklch(0.10 0.005 80 / 0.6);
  }
  .vdx-nav-inner {
    max-width: 1240px;
    margin: 0 auto;
    padding: 16px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .vdx-brand { display: flex; align-items: center; gap: 12px; }
  .vdx-brand-mark {
    width: 32px; height: 32px;
    border-radius: 6px;
    background: linear-gradient(160deg, var(--amber), var(--amber-deep));
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-jetbrains-mono), monospace;
    font-weight: 600;
    font-size: 10px;
    letter-spacing: -0.04em;
    color: var(--ink-deep);
    box-shadow: 0 0 30px oklch(0.78 0.16 70 / 0.2), inset 0 0 0 1px oklch(1 0 0 / 0.08);
  }
  .vdx-brand-name {
    display: flex; flex-direction: column; line-height: 1.05;
  }
  .vdx-brand-word {
    font-family: var(--font-instrument-serif), serif;
    font-style: italic;
    font-size: 18px;
    color: var(--paper);
  }
  .vdx-brand-coord {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 9.5px;
    letter-spacing: 0.08em;
    color: var(--warm);
    margin-top: 1px;
  }
  .vdx-nav-meta {
    display: flex; align-items: center; gap: 18px;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11px;
    color: var(--warm);
  }
  .vdx-nav-meta-line { letter-spacing: 0.06em; }
  .vdx-nav-link {
    color: var(--bone);
    text-decoration: none;
    transition: color 0.2s;
  }
  .vdx-nav-link:hover { color: var(--amber); }
  .vdx-nav-cta {
    display: inline-flex; align-items: center; gap: 6px;
    border: 1px solid var(--line);
    background: transparent;
    color: var(--paper);
    padding: 8px 14px;
    border-radius: 999px;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11px;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: all 0.18s ease;
  }
  .vdx-nav-cta:hover {
    border-color: var(--amber);
    color: var(--amber);
    transform: translateY(-1px);
  }

  /* ---- Hero ---- */
  .vdx-hero {
    position: relative;
    z-index: 2;
    max-width: 1240px;
    margin: 0 auto;
    padding: 88px 28px 56px;
  }
  .vdx-hero-inner {
    max-width: 920px;
  }
  .vdx-eyebrow {
    display: inline-flex; align-items: center; gap: 10px;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11px;
    letter-spacing: 0.18em;
    color: var(--amber);
    border: 1px solid oklch(0.78 0.16 70 / 0.35);
    padding: 6px 12px;
    border-radius: 999px;
    background: oklch(0.78 0.16 70 / 0.06);
  }
  .vdx-eyebrow-tick { letter-spacing: 0; opacity: 0.7; }

  .vdx-hero-title {
    margin: 26px 0 22px;
    font-size: clamp(48px, 8vw, 112px);
    line-height: 0.96;
    letter-spacing: -0.025em;
    color: var(--paper);
  }

  .vdx-hero-sub {
    max-width: 640px;
    font-size: 17px;
    line-height: 1.55;
    color: var(--bone);
  }

  .vdx-hero-actions {
    display: flex;
    gap: 14px;
    margin-top: 32px;
    flex-wrap: wrap;
  }

  .vdx-btn-primary {
    display: inline-flex; align-items: center; gap: 10px;
    background: var(--amber);
    color: var(--ink-deep);
    border: 1px solid var(--amber);
    padding: 12px 22px;
    border-radius: 999px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 0 0 0 oklch(0.78 0.16 70 / 0);
  }
  .vdx-btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 14px 36px -12px oklch(0.78 0.16 70 / 0.55);
    background: oklch(0.86 0.16 72);
  }
  .vdx-btn-primary--lg {
    padding: 16px 30px;
    font-size: 15px;
  }

  .vdx-btn-ghost {
    display: inline-flex; align-items: center; gap: 8px;
    background: transparent;
    color: var(--paper);
    border: 1px solid var(--line);
    padding: 12px 20px;
    border-radius: 999px;
    font-size: 14px;
    text-decoration: none;
    transition: all 0.2s;
  }
  .vdx-btn-ghost:hover {
    border-color: var(--bone);
    background: oklch(1 0 0 / 0.03);
  }

  .vdx-hero-meta {
    margin-top: 38px;
    display: flex;
    align-items: center;
    gap: 14px;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11px;
    letter-spacing: 0.08em;
    color: var(--warm);
    flex-wrap: wrap;
  }
  .vdx-dot {
    width: 3px; height: 3px;
    background: var(--amber);
    border-radius: 50%;
    opacity: 0.7;
  }

  /* ---- Agent Rack ---- */
  .vdx-rack {
    margin-top: 64px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: linear-gradient(180deg, var(--card) 0%, oklch(0.09 0.005 80) 100%);
    overflow: hidden;
    position: relative;
    box-shadow: 0 30px 80px -40px oklch(0 0 0 / 0.6), inset 0 1px 0 oklch(1 0 0 / 0.04);
  }
  .vdx-rack-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 18px;
    border-bottom: 1px solid var(--line);
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11px;
    color: var(--warm);
    letter-spacing: 0.06em;
    background: oklch(0.10 0.005 80 / 0.6);
  }
  .vdx-rack-title { color: var(--bone); }
  .vdx-rack-coord { color: var(--warm); }
  .vdx-rack-body {
    position: relative;
    padding: 6px 0;
  }
  .vdx-lane {
    display: grid;
    grid-template-columns: 80px 1.6fr 1fr 1fr 2fr;
    align-items: center;
    gap: 18px;
    padding: 14px 18px;
    border-bottom: 1px dashed oklch(1 0 0 / 0.04);
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 13px;
    color: var(--bone);
    transition: background 0.2s;
  }
  .vdx-lane:last-child { border-bottom: none; }
  .vdx-lane:hover { background: oklch(1 0 0 / 0.02); }
  .vdx-lane-coord { color: var(--warm); font-size: 11px; letter-spacing: 0.05em; }
  .vdx-lane-branch { color: var(--paper); }
  .vdx-lane-agent { color: var(--bone); opacity: 0.85; }
  .vdx-lane-status {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 11px;
    letter-spacing: 0.08em;
  }
  .vdx-lane-status--live { color: var(--amber); }
  .vdx-lane-status--warn { color: oklch(0.82 0.13 95); }
  .vdx-lane-status--idle { color: var(--warm); }
  .vdx-lane-detail { color: var(--warm); font-size: 11.5px; opacity: 0.85; }
  @media (max-width: 900px) {
    .vdx-lane { grid-template-columns: 60px 1fr 1fr; }
    .vdx-lane-agent, .vdx-lane-detail { display: none; }
  }

  .vdx-status-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .vdx-status-dot--live {
    background: var(--amber);
    box-shadow: 0 0 0 0 var(--amber);
    animation: vdxPulse 1.6s ease-in-out infinite;
  }
  .vdx-status-dot--warn {
    background: oklch(0.82 0.13 95);
    box-shadow: 0 0 12px oklch(0.82 0.13 95 / 0.45);
  }
  .vdx-status-dot--idle {
    background: var(--warm);
    box-shadow: 0 0 0 1px var(--warm-dim);
  }
  @keyframes vdxPulse {
    0%   { box-shadow: 0 0 0 0 oklch(0.82 0.16 70 / 0.55); }
    70%  { box-shadow: 0 0 0 7px oklch(0.82 0.16 70 / 0); }
    100% { box-shadow: 0 0 0 0 oklch(0.82 0.16 70 / 0); }
  }

  .vdx-rack-scanline {
    position: absolute;
    left: 0; right: 0; top: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--amber), transparent);
    opacity: 0.55;
    animation: vdxScan 6s linear infinite;
  }
  @keyframes vdxScan {
    0%   { transform: translateY(0); opacity: 0; }
    8%   { opacity: 0.5; }
    100% { transform: translateY(220px); opacity: 0; }
  }

  /* ---- Section heads ---- */
  .vdx-section-head {
    max-width: 920px;
    margin: 0 auto 40px;
  }
  .vdx-section-tick {
    display: inline-block;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11px;
    letter-spacing: 0.18em;
    color: var(--amber);
    margin-bottom: 16px;
  }
  .vdx-section-title {
    font-size: clamp(30px, 4vw, 52px);
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--paper);
    font-weight: 500;
  }

  /* ---- Manifesto ---- */
  .vdx-manifesto {
    position: relative;
    z-index: 2;
    max-width: 1240px;
    margin: 0 auto;
    padding: 96px 28px;
    border-top: 1px solid var(--line-soft);
  }
  .vdx-pains {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    border: 1px solid var(--line);
    border-radius: 14px;
    overflow: hidden;
    background: var(--line);
  }
  @media (max-width: 900px) {
    .vdx-pains { grid-template-columns: 1fr; }
  }
  .vdx-pain {
    background: var(--card);
    padding: 32px 28px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .vdx-pain-num {
    font-size: 56px;
    line-height: 0.9;
    color: var(--amber);
    opacity: 0.95;
  }
  .vdx-pain-title {
    font-size: 19px;
    line-height: 1.3;
    color: var(--paper);
    font-weight: 500;
  }
  .vdx-pain-body {
    font-size: 14.5px;
    line-height: 1.6;
    color: var(--bone);
    opacity: 0.9;
  }

  /* ---- Capabilities ---- */
  .vdx-capabilities {
    position: relative;
    z-index: 2;
    max-width: 1240px;
    margin: 0 auto;
    padding: 96px 28px;
    border-top: 1px solid var(--line-soft);
  }
  .vdx-cap-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 14px;
  }
  @media (max-width: 1024px) {
    .vdx-cap-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 640px) {
    .vdx-cap-grid { grid-template-columns: 1fr; }
  }
  .vdx-cap {
    background: var(--card);
    border: 1px solid var(--line-soft);
    border-radius: 12px;
    padding: 22px 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: relative;
    transition: border-color 0.25s, transform 0.25s;
  }
  .vdx-cap:hover {
    border-color: oklch(0.78 0.16 70 / 0.35);
    transform: translateY(-2px);
  }
  /* Asymmetric grid spans for richness */
  .vdx-cap--1 { grid-column: span 4; }
  .vdx-cap--2 { grid-column: span 2; }
  .vdx-cap--3 { grid-column: span 3; }
  /* tweak run: items 4..7 alternate */
  .vdx-cap-grid > .vdx-cap:nth-child(4) { grid-column: span 3; }
  .vdx-cap-grid > .vdx-cap:nth-child(5) { grid-column: span 2; }
  .vdx-cap-grid > .vdx-cap:nth-child(6) { grid-column: span 2; }
  .vdx-cap-grid > .vdx-cap:nth-child(7) { grid-column: span 2; }
  @media (max-width: 1024px) {
    .vdx-cap-grid > .vdx-cap { grid-column: span 1 !important; }
  }

  .vdx-cap-coord {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 10.5px;
    letter-spacing: 0.12em;
    color: var(--amber);
    opacity: 0.9;
  }
  .vdx-cap-title {
    font-size: 18px;
    line-height: 1.3;
    color: var(--paper);
    font-weight: 500;
  }
  .vdx-cap-body {
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--bone);
    opacity: 0.85;
  }

  /* ---- Differentiators ---- */
  .vdx-diff {
    position: relative;
    z-index: 2;
    max-width: 1240px;
    margin: 0 auto;
    padding: 96px 28px;
    border-top: 1px solid var(--line-soft);
  }
  .vdx-diff-row {
    display: grid;
    grid-template-columns: 1.05fr 0.95fr;
    gap: 56px;
    align-items: center;
    padding: 56px 0;
    border-top: 1px dashed oklch(1 0 0 / 0.06);
  }
  .vdx-diff-row:first-of-type { border-top: 1px solid var(--line); }
  @media (max-width: 900px) {
    .vdx-diff-row { grid-template-columns: 1fr; gap: 28px; padding: 32px 0; }
  }
  .vdx-diff-row--B { direction: rtl; }
  .vdx-diff-row--B > * { direction: ltr; }
  @media (max-width: 900px) {
    .vdx-diff-row--B { direction: ltr; }
  }
  .vdx-diff-tag {
    display: inline-block;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    color: var(--amber);
    margin-bottom: 14px;
  }
  .vdx-diff-title {
    font-size: clamp(26px, 3.2vw, 38px);
    line-height: 1.12;
    letter-spacing: -0.015em;
    color: var(--paper);
    font-weight: 500;
    margin-bottom: 14px;
  }
  .vdx-diff-body {
    font-size: 15px;
    line-height: 1.65;
    color: var(--bone);
    opacity: 0.9;
    max-width: 480px;
  }

  /* Diff visuals */
  .vdx-diff-visual {
    background: linear-gradient(180deg, var(--card-2), var(--card));
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 26px;
    min-height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
  }
  .vdx-diff-visual::before {
    content: "";
    position: absolute;
    inset: 0;
    background:
      radial-gradient(400px 200px at 80% 20%, oklch(0.78 0.16 70 / 0.10), transparent 70%);
    pointer-events: none;
  }

  .vdx-stack {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-family: var(--font-jetbrains-mono), monospace;
  }
  .vdx-stack-row {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 16px;
    background: oklch(0.11 0.005 80);
  }
  .vdx-stack-row--top {
    border-color: oklch(0.78 0.16 70 / 0.35);
    background: oklch(0.78 0.16 70 / 0.05);
  }
  .vdx-stack-label {
    font-size: 11px;
    letter-spacing: 0.16em;
    color: var(--amber);
  }
  .vdx-stack-sub {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--bone);
    letter-spacing: 0.02em;
  }
  .vdx-stack-divider {
    height: 12px;
    background-image: linear-gradient(to right, var(--warm-dim) 50%, transparent 0%);
    background-size: 6px 1px;
    background-repeat: repeat-x;
    background-position: center;
  }
  .vdx-stack-fleet {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .vdx-stack-cell {
    background: oklch(0.11 0.005 80);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .vdx-stack-cell--ghost {
    border-style: dashed;
    opacity: 0.6;
  }
  .vdx-stack-cell-label { color: var(--paper); font-size: 12px; }
  .vdx-stack-cell-status { color: var(--warm); font-size: 10.5px; letter-spacing: 0.06em; }
  .vdx-stack-foot {
    margin-top: 4px;
    font-size: 11px;
    color: var(--warm);
    text-align: center;
    letter-spacing: 0.06em;
  }

  .vdx-loop {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr auto 1fr auto 1fr;
    gap: 10px;
    align-items: center;
    font-family: var(--font-jetbrains-mono), monospace;
    position: relative;
  }
  .vdx-loop-node {
    background: oklch(0.11 0.005 80);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 80px;
  }
  .vdx-loop-node--agent { border-color: oklch(0.78 0.16 70 / 0.35); }
  .vdx-loop-node--exec { border-color: oklch(0.6 0.13 200 / 0.30); }
  .vdx-loop-node--result { border-color: oklch(0.7 0.16 25 / 0.30); }
  .vdx-loop-tag { font-size: 10px; letter-spacing: 0.14em; color: var(--amber); text-transform: uppercase; }
  .vdx-loop-text { font-size: 12px; color: var(--paper); }
  .vdx-loop-arrow {
    color: var(--warm);
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 16px;
  }
  .vdx-loop-return {
    grid-column: 1 / -1;
    height: 16px;
    margin-top: 4px;
    border-top: 1px dashed var(--warm-dim);
    position: relative;
  }
  .vdx-loop-return::before {
    content: "↺ feedback loop";
    position: absolute;
    top: -8px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--card-2);
    color: var(--warm);
    font-size: 10px;
    letter-spacing: 0.12em;
    padding: 0 8px;
  }

  .vdx-fan {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    font-family: var(--font-jetbrains-mono), monospace;
  }
  .vdx-fan-laptop {
    border: 1px solid oklch(0.78 0.16 70 / 0.35);
    border-radius: 10px;
    background: oklch(0.78 0.16 70 / 0.05);
    padding: 12px 16px;
    text-align: center;
  }
  .vdx-fan-label { color: var(--amber); font-size: 11px; letter-spacing: 0.16em; }
  .vdx-fan-sub { display: block; color: var(--bone); font-size: 12px; margin-top: 2px; }
  .vdx-fan-lines {
    width: 100%;
    height: 56px;
    display: block;
    overflow: visible;
  }
  .vdx-fan-lines path {
    stroke: var(--warm-dim);
    stroke-width: 1;
    stroke-dasharray: 4 4;
    fill: none;
  }
  .vdx-fan-targets {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .vdx-fan-target {
    background: oklch(0.11 0.005 80);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px;
    text-align: center;
    color: var(--paper);
    font-size: 11px;
  }
  .vdx-fan-target--remote {
    border-color: oklch(0.6 0.13 200 / 0.30);
    color: oklch(0.78 0.10 200);
  }

  /* ---- Architecture map ---- */
  .vdx-arch {
    position: relative;
    z-index: 2;
    max-width: 1240px;
    margin: 0 auto;
    padding: 96px 28px;
    border-top: 1px solid var(--line-soft);
  }
  .vdx-arch-board {
    border: 1px solid var(--line);
    border-radius: 18px;
    background:
      linear-gradient(180deg, var(--card-2), var(--ink));
    padding: 40px 28px 48px;
    box-shadow: 0 30px 80px -40px oklch(0 0 0 / 0.7), inset 0 1px 0 oklch(1 0 0 / 0.04);
    position: relative;
    overflow: hidden;
  }
  .vdx-arch-board::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(to right, oklch(1 0 0 / 0.02) 1px, transparent 1px),
      linear-gradient(to bottom, oklch(1 0 0 / 0.02) 1px, transparent 1px);
    background-size: 28px 28px;
    pointer-events: none;
  }
  .vdx-map {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    font-family: var(--font-jetbrains-mono), monospace;
  }
  .vdx-map-row { width: 100%; display: flex; justify-content: center; }
  .vdx-map-block {
    border: 1px solid var(--line);
    background: oklch(0.10 0.005 80);
    border-radius: 12px;
    padding: 16px 24px;
    text-align: center;
    min-width: 280px;
  }
  .vdx-map-block--user {
    border-color: oklch(0.78 0.16 70 / 0.30);
    background: oklch(0.78 0.16 70 / 0.04);
  }
  .vdx-map-block--core {
    border-color: oklch(0.78 0.16 70 / 0.50);
    background: oklch(0.78 0.16 70 / 0.07);
    box-shadow: 0 0 60px oklch(0.78 0.16 70 / 0.12);
    min-width: 360px;
  }
  .vdx-map-block--remote { border-style: dashed; opacity: 0.85; }
  .vdx-map-coord { color: var(--amber); font-size: 11px; letter-spacing: 0.16em; }
  .vdx-map-label { display: block; color: var(--paper); font-size: 13px; margin-top: 4px; }
  .vdx-map-foot { display: block; color: var(--warm); font-size: 11px; margin-top: 6px; }
  .vdx-map-trunk {
    width: 1px;
    height: 28px;
    background: linear-gradient(to bottom, transparent, var(--warm-dim), transparent);
  }
  .vdx-map-trunk--down { height: 28px; }
  .vdx-map-row--split { height: 28px; align-items: stretch; }
  .vdx-map-leg {
    width: 50%;
    border-top: 1px dashed var(--warm-dim);
  }
  .vdx-map-leg--left { border-right: 1px dashed var(--warm-dim); border-top-right-radius: 12px; }
  .vdx-map-leg--right { border-left: 1px dashed var(--warm-dim); border-top-left-radius: 12px; margin-left: -1px; }

  .vdx-map-row--cells { gap: 10px; flex-wrap: wrap; padding: 0 8px; }
  .vdx-map-cluster {
    flex: 1;
    min-width: 220px;
    border: 1px solid var(--line);
    background: oklch(0.10 0.005 80);
    border-radius: 12px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .vdx-cluster-label { font-size: 10.5px; letter-spacing: 0.16em; color: var(--amber); }
  .vdx-cluster-cells { display: flex; flex-direction: column; gap: 6px; }
  .vdx-cluster-cell {
    background: oklch(0.13 0.005 80);
    border: 1px solid var(--line-soft);
    border-radius: 6px;
    padding: 8px 10px;
    color: var(--bone);
    font-size: 11.5px;
  }
  .vdx-cluster-cell--ghost { border-style: dashed; opacity: 0.6; }

  /* ---- Install ---- */
  .vdx-install {
    position: relative;
    z-index: 2;
    max-width: 880px;
    margin: 0 auto;
    padding: 96px 28px;
    border-top: 1px solid var(--line-soft);
  }
  .vdx-install-sub {
    margin-top: 14px;
    color: var(--bone);
    font-size: 15px;
  }
  .vdx-link {
    color: var(--amber);
    text-decoration: none;
    border-bottom: 1px dashed oklch(0.78 0.16 70 / 0.5);
    padding-bottom: 1px;
    transition: color 0.2s;
  }
  .vdx-link:hover { color: oklch(0.88 0.16 72); }

  .vdx-install-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
    margin-top: 32px;
  }
  .vdx-install-tab {
    display: inline-flex; align-items: center; gap: 8px;
    background: transparent;
    border: 1px solid var(--line);
    color: var(--bone);
    padding: 9px 16px;
    border-radius: 999px;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11.5px;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: all 0.18s;
  }
  .vdx-install-tab:hover { color: var(--paper); border-color: var(--bone); }
  .vdx-install-tab.is-active {
    background: var(--amber);
    color: var(--ink-deep);
    border-color: var(--amber);
  }

  .vdx-install-card {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
    overflow: hidden;
  }
  .vdx-install-card-head {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 18px;
    border-bottom: 1px solid var(--line);
    background: oklch(0.10 0.005 80);
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11px;
    color: var(--warm);
    letter-spacing: 0.06em;
  }
  .vdx-install-card-coord { color: var(--amber); }
  .vdx-install-steps {
    list-style: none;
    margin: 0;
    padding: 22px 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .vdx-install-step {
    display: grid;
    grid-template-columns: 36px 1fr;
    gap: 14px;
    align-items: start;
  }
  .vdx-install-step-n {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11px;
    letter-spacing: 0.14em;
    color: var(--amber);
    margin-top: 4px;
  }
  .vdx-install-step-text {
    color: var(--bone);
    font-size: 14px;
    margin-bottom: 8px;
  }

  .vdx-code-block {
    display: flex; align-items: center; gap: 10px;
    background: oklch(0.07 0.005 80);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px 12px;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 12px;
  }
  .vdx-code-prompt { color: var(--amber); }
  .vdx-code-text {
    flex: 1;
    color: var(--paper);
    overflow-x: auto;
    white-space: pre;
  }
  .vdx-code-copy {
    color: var(--warm);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: inline-flex;
    transition: color 0.15s, background 0.15s;
  }
  .vdx-code-copy:hover { color: var(--paper); background: oklch(1 0 0 / 0.04); }

  /* ---- Closing ---- */
  .vdx-closing {
    position: relative;
    z-index: 2;
    max-width: 1240px;
    margin: 0 auto;
    padding: 120px 28px 96px;
    text-align: center;
    border-top: 1px solid var(--line-soft);
  }
  .vdx-closing-line {
    font-size: clamp(36px, 5.2vw, 72px);
    line-height: 1.06;
    color: var(--paper);
    margin-bottom: 36px;
    letter-spacing: -0.02em;
  }

  /* ---- Footer ---- */
  .vdx-footer {
    position: relative;
    z-index: 2;
    border-top: 1px solid var(--line-soft);
    padding: 24px 28px;
  }
  .vdx-footer-inner {
    max-width: 1240px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 18px;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 10.5px;
    letter-spacing: 0.16em;
    color: var(--warm);
    flex-wrap: wrap;
  }
  .vdx-footer-sep { opacity: 0.4; }
`;
