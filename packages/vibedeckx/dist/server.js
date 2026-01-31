import fastify from "fastify";
import { fastifyStatic } from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { selectFolder } from "./dialog.js";
export const createServer = (opts) => {
    const UI_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "./ui");
    const server = fastify();
    // 提供静态 UI 文件
    server.register(fastifyStatic, {
        root: UI_ROOT,
    });
    // SPA 路由支持
    server.setNotFoundHandler(async (req, reply) => {
        return reply.status(200).sendFile("index.html");
    });
    // CORS
    server.addHook("onSend", (req, reply, payload, done) => {
        reply.header("access-control-allow-origin", "*");
        reply.header("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
        reply.header("access-control-allow-headers", "Content-Type");
        done(null, payload);
    });
    // 获取所有项目
    server.get("/api/projects", async (req, reply) => {
        const projects = opts.storage.projects.getAll();
        return reply.code(200).send({ projects });
    });
    // 获取单个项目
    server.get("/api/projects/:id", async (req, reply) => {
        const project = opts.storage.projects.getById(req.params.id);
        if (!project) {
            return reply.code(404).send({ error: "Project not found" });
        }
        return reply.code(200).send({ project });
    });
    // 打开目录选择对话框
    server.post("/api/dialog/select-folder", async (req, reply) => {
        const folderPath = await selectFolder();
        if (!folderPath) {
            return reply.code(200).send({ path: null, cancelled: true });
        }
        return reply.code(200).send({ path: folderPath, cancelled: false });
    });
    // 创建项目
    server.post("/api/projects", async (req, reply) => {
        const { name, path: projectPath } = req.body;
        // 检查路径是否已存在
        const existing = opts.storage.projects.getByPath(projectPath);
        if (existing) {
            return reply.code(409).send({ error: "Project with this path already exists" });
        }
        // 创建 .vibedeckx 目录
        const vibedeckxDir = path.join(projectPath, ".vibedeckx");
        await mkdir(vibedeckxDir, { recursive: true });
        // 创建配置文件
        const configPath = path.join(vibedeckxDir, "config.json");
        const config = {
            name,
            created_at: new Date().toISOString(),
        };
        await writeFile(configPath, JSON.stringify(config, null, 2));
        // 保存到数据库
        const id = randomUUID();
        const project = opts.storage.projects.create({ id, name, path: projectPath });
        return reply.code(201).send({ project });
    });
    // 删除项目
    server.delete("/api/projects/:id", async (req, reply) => {
        const project = opts.storage.projects.getById(req.params.id);
        if (!project) {
            return reply.code(404).send({ error: "Project not found" });
        }
        opts.storage.projects.delete(req.params.id);
        return reply.code(200).send({ success: true });
    });
    return {
        start: async (port) => {
            await server.listen({ port, host: "0.0.0.0" });
            return `http://localhost:${port}`;
        },
        close: async () => {
            await server.close();
        },
    };
};
