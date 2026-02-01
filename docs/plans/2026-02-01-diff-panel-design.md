# Diff Panel Design

显示未提交的文件变更（git diff）在右侧面板中。

## 设计决策

- **布局模式**: Tab 切换（Executors | Diff）
- **内容展示**: 全部展开式，所有修改文件 diff 直接展开显示
- **Diff 格式**: Unified Diff（统一视图）
- **数据更新**: 手动刷新

## 整体布局结构

右侧面板改造后结构：

```
右侧面板 (w-1/2)
├── Tab 栏 (h-14, border-b)
│   ├── [Executors] Tab
│   └── [Diff] Tab
│
└── Tab 内容区 (flex-1, overflow-hidden)
    ├── 当 tab="executors" 时：<ExecutorPanel />
    └── 当 tab="diff" 时：<DiffPanel />
```

Tab 栏与左侧 Header 高度一致（h-14），使用 shadcn/ui 风格。

## DiffPanel 组件结构

```
DiffPanel
├── Header 区 (flex-shrink-0, p-4, border-b)
│   ├── 左侧：标题 "Uncommitted Changes"
│   ├── 中间：文件统计 (如 "3 files changed")
│   └── 右侧：刷新按钮 (RefreshCw 图标)
│
└── 内容区 (flex-1, overflow-auto)
    ├── 空状态：无修改时显示 "No uncommitted changes"
    │
    └── 有修改时：
        ├── FileDiff (文件1)
        │   ├── 文件头 (文件路径 + 状态标签)
        │   └── Diff 内容 (代码块，行号 + 着色)
        ├── FileDiff (文件2)
        └── FileDiff (文件N)
```

FileDiff 单个文件区块：
- 文件路径显示，如 `src/components/Button.tsx`
- 状态标签：Modified（黄色）、Added（绿色）、Deleted（红色）
- Diff 内容用等宽字体，删除行红色背景，新增行绿色背景
- 行号显示在左侧

## 后端 API

### GET /api/projects/:id/diff

响应结构：

```typescript
{
  files: Array<{
    path: string           // 文件相对路径
    status: 'modified' | 'added' | 'deleted' | 'renamed'
    oldPath?: string       // renamed 时的原路径
    hunks: Array<{
      oldStart: number     // 旧文件起始行
      oldLines: number     // 旧文件行数
      newStart: number     // 新文件起始行
      newLines: number     // 新文件行数
      lines: Array<{
        type: 'context' | 'add' | 'delete'
        content: string    // 行内容（不含前缀符号）
        oldLineNo?: number // 旧行号
        newLineNo?: number // 新行号
      }>
    }>
  }>
}
```

实现方式：
- 使用 `git diff --no-color` 获取 diff 输出
- 解析 unified diff 格式，提取文件和 hunk 信息
- 在当前选中的 worktree 路径下执行命令

## 前端文件结构

新增文件：

```
apps/vibedeckx-ui/
├── components/
│   ├── diff/
│   │   ├── index.ts              # 导出
│   │   ├── diff-panel.tsx        # 主面板组件
│   │   ├── file-diff.tsx         # 单文件 diff 展示
│   │   └── diff-line.tsx         # 单行渲染（着色、行号）
│   └── right-panel/
│       └── right-panel.tsx       # Tab 容器
├── hooks/
│   └── use-diff.ts               # diff 数据获取 hook
└── lib/
    └── api.ts                    # 新增 getDiff 方法
```

修改文件：

```
app/page.tsx
  - 将 <ExecutorPanel /> 替换为 <RightPanel />
```

## 样式规范

颜色方案（深色主题）：

| 元素 | 样式 |
|------|------|
| 新增行背景 | `bg-green-900/30` |
| 删除行背景 | `bg-red-900/30` |
| 新增行文字 | `text-green-400` |
| 删除行文字 | `text-red-400` |
| 上下文行 | 默认文字色 |
| 行号 | `text-muted-foreground` |
| 文件头背景 | `bg-muted` |
| Modified 标签 | `bg-yellow-500/20 text-yellow-500` |
| Added 标签 | `bg-green-500/20 text-green-500` |
| Deleted 标签 | `bg-red-500/20 text-red-500` |

字体：
- Diff 内容使用 `font-mono`（等宽字体）
- 行号宽度固定，右对齐
