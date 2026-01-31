# Vibedeckx 项目管理功能设计

## 概述

为 vibedeckx 添加项目管理功能，允许用户创建和管理多个工作空间项目。

## 需求

- 工作空间项目模式：用户选择目录作为项目根目录
- 仅在目录中创建 `.vibedeckx/` 配置文件夹
- 项目基本信息：名称、路径、创建时间
- 多项目模式：支持多个项目，可在列表中切换
- 全局存储：项目列表存储在 `~/.vibedeckx/`

## 架构

```
vibedeckx/
├── packages/
│   └── vibedeckx/           # 主包（可通过 npx 安装）
│       ├── src/
│       │   ├── bin.ts       # CLI 入口
│       │   ├── server.ts    # Fastify 后端服务
│       │   ├── storage/     # 存储层（SQLite）
│       │   └── ...
│       └── dist/
│           └── ui/          # 构建后的前端文件
└── apps/
    └── vibedeckx-ui/        # 前端应用（Vite + React）
```

## 后端 API

### 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/projects | 创建项目 |
| GET | /api/projects | 获取项目列表 |
| GET | /api/projects/:id | 获取单个项目详情 |
| DELETE | /api/projects/:id | 删除项目记录 |
| POST | /api/projects/:id/open | 打开/切换到项目 |
| POST | /api/dialog/select-folder | 打开系统目录选择对话框 |

### 目录选择实现

使用 Node.js 的 `child_process` 调用系统原生对话框：
- macOS: `osascript` (AppleScript)
- Windows: `powershell` (System.Windows.Forms)
- Linux: `zenity` 或 `kdialog`

### 数据模型

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
```

存储位置：`~/.vibedeckx/data.sqlite`

## 前端界面

### 项目管理界面

1. **首次启动/无项目时** - 显示欢迎页面，带有"创建项目"按钮

2. **项目列表视图** - 侧边栏或顶部下拉菜单显示所有项目
   - 每个项目显示：名称、路径、创建时间
   - 当前项目高亮显示
   - 点击切换项目

3. **创建项目流程：**
   - 点击"创建项目"按钮
   - 调用后端 API 打开系统目录选择器
   - 用户选择目录后，输入项目名称（默认使用目录名）
   - 确认后创建项目

4. **项目信息展示** - 显示当前项目的基本信息卡片

### 新增组件

- `ProjectSelector` - 项目选择器/切换器
- `ProjectCard` - 项目信息卡片
- `CreateProjectDialog` - 创建项目对话框

## NPX 安装与启动

### package.json

```json
{
  "name": "vibedeckx",
  "bin": {
    "vibedeckx": "./dist/bin.js"
  }
}
```

### CLI 命令

```bash
npx vibedeckx              # 启动服务并打开浏览器
npx vibedeckx --port 8080  # 指定端口
```

### 启动流程

1. 解析命令行参数
2. 初始化 SQLite 数据库
3. 启动 Fastify 服务器
4. 自动打开浏览器访问 UI
5. 监听退出信号，优雅关闭

### 构建流程

1. `pnpm build:ui` - 构建前端
2. `pnpm build:main` - 编译后端 + 复制 UI
3. `pnpm build` - 执行上述两步
