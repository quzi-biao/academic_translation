# 闻一翻译 / academic_translation

面向学术文献的块级对照翻译系统。系统复用 long-memory-system 的 PDF/DOCX -> Markdown -> Block 化思路，并结合文献总结、领域/作者风格提示词生成、逐块翻译，形成左原文右译文的一一对应阅读体验。

## 目录结构

```text
academic_translation/
  website/          官网落地页
  web-app/          ToC 用户端 Web 应用，默认开发端口 7001
  admin-frontend/   后台管理系统
  server/           API、微信支付、点数、文档解析和翻译任务，默认端口 7000
```

## 核心流程

1. 用户注册/登录。
2. 用户通过微信充值点数。
3. 用户上传 PDF/DOCX/MD/TXT 文献。
4. 后端上传原文件到 OSS。
5. 后端将文件转为 Markdown。
6. Markdown 被拆成 Block 树。
7. 系统总结文献内容，生成翻译提示词。
8. 系统按 Block 逐块翻译。
9. 用户在 Web 应用查看左原文、右译文的对照结果。

## 本地开发

### Server

```bash
cd server
npm install
npx prisma generate
npm run dev
```

默认读取 `server/.env`，端口为 `7000`。如果本机端口被占用，可临时使用：

```bash
PORT=17000 npm run dev
```

### ToC Web

```bash
cd web-app
npm install
npm run dev
```

默认端口 `7001`，并代理 `/api` 到 `http://localhost:7000`。

### Admin

```bash
cd admin-frontend
npm install
npm run dev
```

## 数据库

数据库名：`academic_translation`

```bash
cd server
npx prisma db push
node scripts/seed.js
```

默认后台账号：`admin / admin`


## 代理与端口

推荐拓扑：

- 公网代理机 `your-public-host.example.com`：Nginx 对外监听 `7001` HTTPS
- 实际应用服务器 `127.0.0.1`：Docker/Node 服务监听 `7000`
- Nginx 转发：`your-public-host.example.com:7001` -> `127.0.0.1:7000`
- 微信回调：`https://your-public-host.example.com:7001/api/payment/notify`

Nginx 配置文件：`server/nginx/academic_translation.conf`

## 部署

```bash
docker-compose --env-file server/.env.production up -d --build
```

生产路径：

- 官网：`/`
- 用户端：`/app`
- 后台：`/admin`
- API：`/api`

## 关键环境变量

- `DATABASE_URL`
- `OSS_ENDPOINT`
- `OSS_KEY_ID`
- `OSS_KEY_SECRET`
- `OSS_BUCKET`
- `OSS_FOLDER`
- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `MINERU_BIN`
- `WX_APPID`
- `WX_MCHID`
- `WX_PRIVATE_KEY_PATH`
- `WX_PUBLIC_KEY_PATH`
- `WX_NOTIFY_URL`
