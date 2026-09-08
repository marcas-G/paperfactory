# PaperFactory Frontend Redesign

## Overview

Complete frontend rebuild: **React 18 + Vite + shadcn/ui + Tailwind CSS + TypeScript**.
ChatGPT/Claude-style interface for AI-driven scientific research workflow.

## Core Principles

1. **Chat-first** — primary interaction is a conversation with the research agent
2. **Project list as homepage** — sidebar shows all projects, main area shows active research chat
3. **Phase progress inline** — horizontal phase bar at top of chat area, not a separate panel
4. **Dark theme default** — OpenCode OC-2 aesthetic (#0a0a0a base, translucent layers)
5. **Tool cards collapsible** — papers, hypotheses, tool calls shown as expandable cards in chat flow
6. **Approval inline** — approve/modify/reject buttons appear directly in the message stream

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│  PF  PaperFinder                          [🌐] [🌙]         │  ← TopBar (40px)
├──────────┬───────────────────────────────────────────────────┤
│          │                                                   │
│ ● Project A (running)   ← Sidebar (260px)                   │
│ ● Project B (done)      - project list with status dots     │
│ ● Project C (error)     - search/filter                     │
│ ● Project D             - [+ New] button at bottom          │
│          │                                                   │
│          │  ┌───────────────────────────────────────────┐    │
│          │  │ Lit ✓  Gap ✓  Hypothesis ●  Exp ○  ...   │    │  ← PhaseBar
│          │  └───────────────────────────────────────────┘    │
│          │                                                   │
│          │  Chat Area (scrollable)                           │
│          │  ┌─────────────────────────────────────────┐      │
│          │  │  👤 Does exercise improve memory?       │      │  ← User bubble (right)
│          │  ├─────────────────────────────────────────┤      │
│          │  │  🤖 Searching literature...             │      │  ← AI message (left)
│          │  │  [📄 Papers (12) ▼]                     │      │  ← Collapsible tool card
│          │  │  [💡 Hypothesis ▼]                      │      │  ← Collapsible tool card
│          │  │  [⚡ Review Required: Approve|Modify]    │      │  ← Approval inline
│          │  └─────────────────────────────────────────┘      │
│          │                                                   │
│          │  ┌─────────────────────────────────────────┐      │
│          │  │  Enter research question...      [→]    │      │  ← InputBar
│          │  └─────────────────────────────────────────┘      │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | React 18 | Best AI tool ecosystem (v0, Cursor, Claude) |
| Build | Vite 6 | Fast HMR, same as current |
| Styling | Tailwind CSS 4 + shadcn/ui | AI-friendly, dark theme native |
| Router | React Router 7 | Client-side routing |
| State | Zustand | Lightweight, no boilerplate |
| HTTP | axios | Keep current client pattern |
| i18n | react-i18next | Same pattern as vue-i18n |
| Icons | lucide-react | shadcn/ui default |
| Markdown | react-markdown + react-syntax-highlighter | For agent output rendering |

## File Structure

```
frontend/
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx                          # App entry + providers
    ├── App.tsx                           # Root layout (Sidebar + Router)
    ├── router.tsx                        # Route definitions
    ├── i18n.ts                           # i18n setup
    ├── store/
    │   └── useStore.ts                   # Zustand global state
    ├── api/
    │   ├── client.ts                     # Axios instance (baseURL: /api)
    │   └── types.ts                      # Shared TypeScript interfaces
    ├── components/
    │   ├── ui/                           # shadcn/ui components (auto-generated)
    │   ├── layout/
    │   │   ├── TopBar.tsx                # Top nav bar (40px)
    │   │   ├── Sidebar.tsx               # Project list sidebar (260px)
    │   │   └── PhaseBar.tsx              # Horizontal phase progress bar
    │   ├── chat/
    │   │   ├── ChatArea.tsx              # Scrollable chat container
    │   │   ├── UserMessage.tsx           # User message bubble (right-aligned)
    │   │   ├── AIMessage.tsx             # AI message (left-aligned, multi-part)
    │   │   ├── ToolCard.tsx              # Collapsible card (papers, hypothesis, etc.)
    │   │   ├── ApprovalCard.tsx          # Inline approval buttons
    │   │   └── ThinkingIndicator.tsx     # Animated dots + text
    │   └── input/
    │       └── InputBar.tsx              # Text input + send button
    ├── views/
    │   ├── WelcomeView.tsx               # Empty state (no project selected)
    │   ├── ResearchView.tsx              # Main research chat (SSE-driven)
    │   ├── ProjectsView.tsx              # Project list page (accessible from nav)
    │   └── PapersView.tsx                # Global papers search
    └── locales/
        ├── en.json
        └── zh.json
```

## Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `WelcomeView` | Welcome screen + input (no project selected) |
| `/research/:projectId` | `ResearchView` | Research chat with phase bar |
| `/projects` | `ProjectsView` | All projects list |
| `/papers` | `PapersView` | Global papers search |

## Global State (Zustand)

```typescript
interface AppState {
  // Projects
  projects: ProjectSummary[]
  fetchProjects: () => Promise<void>
  createProject: (question: string) => Promise<ProjectSummary>
  deleteProject: (id: string) => Promise<void>

  // Research status
  status: 'ready' | 'running' | 'done' | 'error'
  setStatus: (s: Status) => void

  // SSE
  sseConnected: boolean
  sseMessages: SSEMessage[]

  // UI
  language: 'zh' | 'en'
  setLanguage: (l: 'zh' | 'en') => void
}
```

## Key Behaviors

### Chat Message Flow

1. User types question → clicks send → `POST /api/research/stream` starts research
2. SSE connects → `GET /api/research/stream?q=...`
3. SSE events mapped to chat messages:
   - `phase:start` → PhaseBar updates (phase becomes "running")
   - `thinking`/`message` → AIMessage with ThinkingIndicator (streaming)
   - `search:result`/`paper:found` → ToolCard (papers, collapsible)
   - `hypothesis:proposed` → ToolCard (hypothesis)
   - `phase:awaiting_approval` → ApprovalCard (inline buttons)
   - `phase:complete` → PhaseBar updates (phase becomes "done")
   - `run:complete` → Final completion message, disconnect SSE
   - `run:error` → Error message, disconnect SSE

### PhaseBar

- 8 phases rendered horizontally with status indicators
- `○` = pending, `●` (pulsing) = running, `✓` = done, `!` = error
- Clicking a phase opens a detail drawer from the right (360px)
- Auto-scrolls to keep current running phase visible

### Approval Flow

- When `phase:awaiting_approval` received, ApprovalCard appears in chat stream
- Three buttons: Approve / Modify (opens feedback textarea) / Reject (opens reason textarea)
- Decision sent via `POST /api/projects/:id/phases/:runId/decision`
- Card updates to show decision result

### Streaming Text

- `thinking` events update the last thinking message in-place (not append new)
- Text rendered with markdown support
- Tool cards appear as distinct collapsible sections within AI messages

## Color Scheme (Dark Theme)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#0a0a0a` | Page background |
| `--bg-layer-1` | `rgba(255,255,255,0.031)` | Sidebar, panels |
| `--bg-layer-2` | `rgba(255,255,255,0.056)` | Cards, bubbles |
| `--bg-layer-3` | `rgba(255,255,255,0.094)` | Hover states |
| `--text-strong` | `rgba(255,255,255,0.936)` | Headings, user text |
| `--text-base` | `rgba(255,255,255,0.618)` | Body text |
| `--text-muted` | `rgba(255,255,255,0.422)` | Labels, meta |
| `--text-faint` | `rgba(255,255,255,0.284)` | Placeholders |
| `--border` | `rgba(255,255,255,0.063)` | Hairline borders (0.5px) |
| `--accent` | `#034cff` | Links, buttons, active states |
| `--success` | `#12c905` | Completed phases |
| `--warning` | `#fcd53a` | Running phases, warnings |
| `--danger` | `#fc533a` | Errors, reject |

## API Compatibility

- Keep same API endpoints (no backend changes needed)
- Same axios client pattern (`baseURL: '/api'`)
- Fix URL prefix inconsistency: all calls through `client.get('/projects')` → `/api/projects`
- SSE still uses `EventSource` for `GET /api/research/stream`
- POST SSE uses `fetch` with `ReadableStream` for `POST /api/research/stream`

## Migration Steps

1. Scaffold React + Vite + Tailwind + shadcn/ui project
2. Set up global state (Zustand), router, i18n
3. Build layout shell (TopBar + Sidebar + main content area)
4. Build chat components (UserMessage, AIMessage, ToolCard, ApprovalCard)
5. Build InputBar with SSE integration
6. Build PhaseBar with detail drawer
7. Build views (Welcome, Research, Projects, Papers)
8. Replace `frontend/` directory, update Dockerfile for React
9. Verify with Puppeteer test suite
10. Full rebuild + Docker deploy
