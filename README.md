# QuizX

QuizX 是一个通用的极简刷题 Web 应用。用户选择题库后逐题作答，每次提交都会立即看到对错、正确选项和解析；学习进度仅保存在当前浏览器中。

## 技术栈

- Next.js 16.3.4、React 19.2.8、TypeScript
- Ajv 8 + JSON Schema 2020-12
- react-markdown 严格白名单渲染
- Vitest、Testing Library、Playwright
- pnpm 11；Node.js `>=20.9.0`

项目不使用数据库、账号、服务端会话或学习数据存储。

## 快速开始

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。仓库自带一套包含单选、多选和判断题的 JavaScript 示例题库。

生产运行：

```bash
pnpm build
pnpm start
```

`dev`、`build` 和 `start` 都会先校验全部题库。任一 JSON 无法解析或不符合规范时，命令会在启动服务前失败，并输出文件、字段位置和原因。

## 常用命令

| 命令 | 用途 |
|---|---|
| `pnpm dev` | 校验题库并启动开发服务 |
| `pnpm validate:data` | 单独校验全部题库 JSON |
| `pnpm lint` | ESLint 静态检查 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm test` | 单元、组件和 API 契约测试 |
| `pnpm build` | 校验内容并生成生产构建 |
| `pnpm test:e2e` | 启动生产服务并运行 Chrome 端到端测试 |
| `pnpm test:lifecycle` | 验证进程内只读、重启加载和非法内容拒绝启动 |
| `pnpm verify` | 顺序执行全部质量门 |

## 题库内容

题库文件放在 `data/question-banks/*.json`，JSON Schema 位于 `data/question-bank.schema.json`。一个文件只包含一个题库，题目按数组顺序展示。

```json
{
  "id": "example-bank",
  "title": "示例题库",
  "description": "题库简介。",
  "version": 1,
  "questions": [
    {
      "id": "q001",
      "type": "single",
      "stemMd": "题干支持受限 **Markdown**。",
      "options": [
        { "id": "A", "text": "选项 A" },
        { "id": "B", "text": "选项 B" }
      ],
      "correctOptionIds": ["A"],
      "explanationMd": "解释正确答案及常见错误。"
    }
  ]
}
```

题型为 `single`、`multiple` 或 `judgment`。任何题目内容、答案或顺序变化后都必须递增题库 `version`，从而使浏览器中的旧进度自动失效。

题干和解析只允许段落、换行、粗体、斜体、列表、行内代码和 fenced code block。原始 HTML、链接、图片及脚本不会渲染；选项始终作为纯文本输出。题库目录不在 `public` 下，浏览器无法直接下载答案文件。

## API

MVP 仅提供三个 JSON API：

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/banks` | 返回按标题排序的题库摘要 |
| `GET` | `/api/banks/:bankId/questions/:position` | 按从 1 开始的位置返回无答案题目 |
| `POST` | `/api/banks/:bankId/questions/:questionId/answer` | 校验版本和答案并返回即时反馈 |

所有错误都使用 `{ "error": { "code": "...", "message": "..." } }`。服务端不信任前端题型或选项状态，也不会保存作答记录。

## 本地进度

进度固定保存在 localStorage 的 `quizx.progress`，每个题库只记录：

```json
{
  "example-bank": {
    "bankVersion": 1,
    "nextPosition": 2,
    "completed": false
  }
}
```

答案、对错、解析、分数和统计都不会持久化。存储损坏或不可用时，应用会安全地从第 1 题开始。

## 验收

PRD 第 11 节全部功能点及其测试证据记录在 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)。
