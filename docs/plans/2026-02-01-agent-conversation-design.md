# Agent Conversation 功能设计

## 概述

在 vibedeckx 首页的项目卡片下方实现 coding agent 对话功能，支持在当前 worktree 中启动 Claude Code 进行对话，实时显示 agent 输出。

## 需求确认

- **Agent 类型**: 先只支持 Claude Code，后续扩展
- **交互模式**: 对话模式，解析 JSON 输出为结构化消息
- **通信协议**: JSON 模式 (`--output-format=stream-json --input-format=stream-json`)
- **权限模式**: 自动批准 (`--dangerously-skip-permissions`)
- **会话管理**: 后台持续运行，前端重连时恢复历史消息
- **会话绑定**: 每个 worktree 最多一个 agent 会话（一对一绑定）

## 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend                           │
├─────────────────────────────────────────────────────────┤
│  page.tsx                                               │
│    ├── ProjectCard (worktree 选择)                      │
│    ├── AgentConversation (新组件)                       │
│    │     ├── 消息列表 (AgentMessage 组件)               │
│    │     └── 输入框 (复用 PromptInput)                  │
│    └── useAgentSession hook (JSON Patch + WebSocket)    │
└─────────────────────────────────────────────────────────┘
                          │
                          │ WebSocket (JSON Patch) + REST API
                          ▼
┌─────────────────────────────────────────────────────────┐
│                      Backend                            │
├─────────────────────────────────────────────────────────┤
│  AgentSessionManager                                    │
│    ├── 启动 Claude Code CLI 子进程                      │
│    ├── stdin/stdout JSON 通信                          │
│    ├── EntryIndexProvider (消息索引管理)                │
│    ├── ConversationPatch (RFC 6902 Patch 生成)         │
│    └── WebSocket 广播 JSON Patch 给前端                 │
└─────────────────────────────────────────────────────────┘
                          │
                          │ stdin/stdout JSON
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Claude Code CLI                       │
└─────────────────────────────────────────────────────────┘
```

## JSON Patch 协议 (RFC 6902)

参考 vibe-kanban 的设计，使用 JSON Patch 协议实现可靠的消息去重：

### WebSocket 消息格式

```typescript
// 发送给前端的消息类型
type AgentWsMessage =
  | { JsonPatch: Patch }      // RFC 6902 patch 操作
  | { Ready: true }           // 历史消息发送完成
  | { finished: true }        // 会话结束，不要重连
  | { error: string };        // 错误消息

// Patch 操作
type Patch = PatchEntry[];
interface PatchEntry {
  op: "add" | "replace" | "remove";
  path: string;              // 如 "/entries/0" 或 "/status"
  value?: PatchValue;
}
```

### 关键设计

- **ADD vs REPLACE**: 新消息用 `add`，流式更新用 `replace`，明确区分语义
- **EntryIndexProvider**: 提供单调递增的索引，确保每条消息有唯一索引
- **历史重放**: 连接时发送所有历史 patches，然后发送 `{ Ready: true }`
- **Immer**: 前端使用 Immer 应用 patches，实现结构共享优化渲染

## 数据模型

### 数据库表 - agent_sessions

```sql
CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  status TEXT DEFAULT 'running',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, worktree_path),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

### 消息类型

```typescript
type AgentMessage =
  | { type: 'user'; content: string; timestamp: number }
  | { type: 'assistant'; content: string; timestamp: number }
  | { type: 'tool_use'; tool: string; input: unknown; toolUseId?: string; timestamp: number }
  | { type: 'tool_result'; tool: string; output: string; toolUseId?: string; timestamp: number }
  | { type: 'thinking'; content: string; timestamp: number }
  | { type: 'error'; message: string; timestamp: number }
  | { type: 'system'; content: string; timestamp: number };
```

## API 设计

### REST API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/projects/:projectId/agent-sessions` | GET | 获取项目所有 agent 会话 |
| `/api/projects/:projectId/agent-sessions` | POST | 创建新会话（指定 worktree） |
| `/api/agent-sessions/:sessionId` | GET | 获取会话详情和历史消息 |
| `/api/agent-sessions/:sessionId` | DELETE | 停止并删除会话 |
| `/api/agent-sessions/:sessionId/message` | POST | 发送用户消息到会话 |

### WebSocket

| 端点 | 说明 |
|------|------|
| `/api/agent-sessions/:sessionId/stream` | 双向通信：接收消息流 + 发送用户输入 |

## Claude Code 启动参数

```bash
npx -y @anthropic-ai/claude-code \
  -p \
  --output-format=stream-json \
  --input-format=stream-json \
  --dangerously-skip-permissions \
  --verbose
```

## 实现步骤

### Phase 1: 后端基础
1. 新增 `agent-session-manager.ts`
2. 新增 `agent-types.ts`
3. 扩展 storage - 添加 agent_sessions 表
4. 扩展 server.ts - 添加 API 路由

### Phase 2: 前端基础
5. 新增 `hooks/use-agent-session.ts`
6. 新增 `components/agent/agent-conversation.tsx`
7. 新增 `components/agent/agent-message.tsx`
8. 修改 `app/page.tsx` - 集成组件

### Phase 3: 消息解析
9. 实现 Claude Code JSON 消息解析
10. 支持多种消息类型渲染

## 文件变更清单

```
packages/vibedeckx/src/
├── agent-session-manager.ts  [新增] - 会话管理、进程生命周期
├── agent-types.ts            [新增] - 消息类型定义
├── conversation-patch.ts     [新增] - RFC 6902 Patch 工具
├── entry-index-provider.ts   [新增] - 消息索引管理
├── server.ts                 [修改] - API 路由
├── storage/
│   ├── types.ts              [修改] - 添加 AgentSession 类型
│   └── sqlite.ts             [修改] - 添加 agent_sessions 表

apps/vibedeckx-ui/
├── hooks/
│   └── use-agent-session.ts  [新增] - JSON Patch 流式处理 + Immer
├── components/
│   └── agent/
│       ├── index.ts          [新增]
│       ├── agent-conversation.tsx  [新增] - 对话容器组件
│       └── agent-message.tsx       [新增] - 消息渲染组件
├── app/
│   └── page.tsx              [修改] - 集成 AgentConversation
```
