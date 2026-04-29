# Branch Activity 重构计划

## 背景

Workspace 圆点颜色逻辑在过去几次迭代中累计修了 8 个 bug,根因是结构性的:

1. `agent_sessions.status` 字段被过载("进程活着" vs "正在干活")
2. 三个真相源最终一致而非同源(realtime Map / 30s 轮询 / SSE 多路事件)
3. "completed" 没有持久化模型,刷新即失,只能反推 task 表

修复都在打补丁,bug 还在以新形式回来。

## 目标

把"branch activity"做成**后端派生 + 单一事件流**:

- 后端从 `agent_sessions` + entries 派生出 `idle | working | completed` 三态
- 前端只读一个 REST 端点 + 一个 SSE 事件
- 删掉 `useSessionStatuses` 过滤、`prevWorkingRef`、`remote-status-bridge` 去重等所有补丁

## 数据模型

`agent_sessions` 表加两列:

```sql
ALTER TABLE agent_sessions ADD COLUMN last_user_message_at INTEGER;
ALTER TABLE agent_sessions ADD COLUMN last_completed_at INTEGER;
```

派生公式(后端,逐 branch 取最新非 dormant session):

```
working   if last_user_message_at > (last_completed_at ?? 0)
completed if last_completed_at > (last_user_message_at ?? 0)
idle      otherwise
```

不再依赖 `status` 字段做 UI 判断;`status` 字段仍然存在,但仅供 session-history-dropdown 等"具体 session 状态"使用。

## API 形状

### 新 REST 端点

```
GET /api/projects/:projectId/branches/activity
→ { branches: [{ branch: string|null, activity: "idle"|"working"|"completed", since: number }] }
```

### 新 SSE 事件

```
{ type: "branch:activity", projectId, branch, activity, since }
```

后端在以下点 emit(精确到一处 emit 函数):
- `pushEntry(type=user)` 后
- `result.subtype=success` 后
- `New Conversation` / `clearAll` 后
- session 删除 / process error 后

### 旧端点处理

- `GET /api/projects/:projectId/agent-sessions` 保留(session-history-dropdown 还在用)
- `session:status` / `session:taskCompleted` SSE 事件先双发,Phase 7 删除

## 远程 session 设计

**本地 backend 信任远程的派生结果,通过 proxy 透传**,不在本地额外推断:

- 远程 `/branches/activity` 由远程 backend 自己计算
- 本地 backend 在 proxy 层把远程 branch 名(可能要做 prefix 处理)合并到本地结果
- SSE `branch:activity` 通过 remote-bridge 透传,不去重(由派生函数本身保证幂等)

## "Completed" 生命周期

- 不过期。下一次 user message 到来时由派生公式自动转回 working。
- 刷新页面后:从后端 REST 端点获取持久化的 `last_completed_at`,绿色保持 ✓

## 阶段拆分

每个 phase 都能独立 ship 并回滚。

### Phase 1 — DB schema + 写入埋点

- [ ] `agent_sessions` 加两列 `last_user_message_at`, `last_completed_at`
- [ ] sqlite migration: 旧行设为 NULL(派生时按"未发生"处理)
- [ ] `pushEntry(type=user)` 时更新 `last_user_message_at`
- [ ] `result.subtype=success` 处理时更新 `last_completed_at`
- [ ] 单测覆盖两条更新路径

**验收**: 单测 + 手动用 SQL 看时间戳被正确写入。

### Phase 2 — 派生函数 + 单测

- [ ] 在 `agent-session-manager.ts`(或新文件 `branch-activity.ts`)加纯函数 `computeBranchActivity(sessions: AgentSession[]): Map<branch, {activity, since}>`
- [ ] 单测 4 种状态机转换:
  - 无 session → idle
  - user 消息后 → working
  - completed 后 → completed
  - completed 后再发消息 → working
- [ ] 多 session 同 branch:取最新一条非 dormant(by `updated_at`)

**验收**: 单测全过。

### Phase 3 — REST 端点

- [ ] `GET /api/projects/:projectId/branches/activity` 路由
- [ ] 远程项目走 proxy
- [ ] 单测 + curl 手测

**验收**: curl 返回正确形状,远程项目透传成功。

### Phase 4 — SSE 事件(双发)

- [ ] 后端 `EventBus` 加 `branch:activity` 事件类型
- [ ] 在写入埋点处同时 emit
- [ ] **暂时保留**老的 `session:status` / `session:taskCompleted` 事件(并行发,便于回滚)
- [ ] 远程透传:remote-status-bridge 加上 `branch:activity` 透传(无去重)

**验收**: 在 dev 环境用浏览器 devtools 观察 SSE 事件流,新老事件并发出现。

### Phase 5 — 前端切换

- [ ] 新 hook `useBranchActivity(projectId)`:REST 拉取 + SSE 订阅 reducer
- [ ] `app/page.tsx` 把 sidebar workspaceStatuses 切换成读 `useBranchActivity`
- [ ] `workspace-status.ts::computeWorkspaceStatuses` 简化到 `realtime.get(k) ?? backend.get(k) ?? "idle"`
- [ ] 保留 realtime overlay 仅供两件事:
  - 用户发消息时立即 working(`onStatusChange` 路径)
  - New Conversation 立即 idle(`onNewConversation` 路径)
- [ ] 手测覆盖矩阵:
  - 点 New Conv → 灰
  - 发消息 → 蓝
  - agent 完成 → 绿
  - **刷新页面 → 绿保持** ← 关键回归点
  - 切到其他 workspace 再切回 → 颜色不变
  - 远程项目同上

**验收**: 手测矩阵全过,自动测试套件全过。

### Phase 6 — 删 hack

- [ ] 删 `useSessionStatuses` (sidebar 不再依赖,session-history-dropdown 改成自己读 `/agent-sessions`)
- [ ] 删 `applyStatusWorking` / `applyStatusCompleted` / `applyGlobalSessionStatus` / `clearRealtimeStatus`(替换为 1-2 个简单 setter)
- [ ] 删 `prevWorkingRef` + `hasUserMessage` 边沿检测
- [ ] 删 `remote-status-bridge` 的 `lastEmittedStatusBySession` 去重
- [ ] 删 `countUserEntries` SQL + `user_entry_count` 字段(派生函数已经不需要)

**验收**: 测试 + 手测全过,代码净减少 ~150-200 行。

### Phase 7 — 关闭老事件

- [ ] 后端停发 `session:status` / `session:taskCompleted` SSE 事件
  (注:WebSocket 内的 `taskCompleted` 仍保留,前端 chat UI 还在用)
- [ ] 前端清掉对应 SSE handler
- [ ] 测试 + 手测最后一遍

**验收**: 没有回归,事件流只剩 `branch:activity` 一种(以及非 status 类的事件如 `task:changed`)。

## 风险登记

| 风险 | 缓解 |
|---|---|
| 写入埋点漏点(某个 mutate 路径忘了更新时间戳) | Phase 2 派生函数保持纯;Phase 4 双发期长一点(至少一周)便于发现差异 |
| 远程 backend 老版本没有新字段 | Phase 3 proxy 层做 fallback:远程返回 404 时本地降级到老逻辑 |
| `prevWorkingRef` 删除后失去"立即变蓝"反馈 | realtime overlay `onStatusChange` 仍保留——只是写入路径变直接 |
| Phase 4 双发期间事件冲突 | 前端 Phase 5 只订新事件,老事件依然发但前端不监听 |

## 不在范围内

- 圆点 UI 视觉变化(沿用现有的 idle/working/completed 三色)
- Task 表与 activity 的耦合(目前已经解耦,不动)
- session-history-dropdown 的"X messages" 标签(继续用 `entry_count`)
- 持久化 idle/working/completed 之外的状态(error 仍走临时 realtime,不持久化)

## 推进协议

- 每个 phase 完成 → commit + 简要状态汇报(完成项 / 验收 / 下一步)
- 任意 phase 出现"派生函数和现状不一致"的回归 → 暂停推进,先排查
- Phase 4-7 之间至少留一次"在生产数据上跑一段时间观察 SSE 流"的窗口
