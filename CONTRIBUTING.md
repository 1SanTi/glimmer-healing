# 参与贡献 / Contributing

感谢你有兴趣为 Glimmer Healing 做出贡献！

> 🩺 **这是一个心理健康类应用，请对内容保持审慎。**
> 涉及心理测评量表、危机干预文案、AI 心理建议的改动，请确保不会对使用者造成伤害。
> 任何可能弱化风险识别或危机干预能力的改动都不会被合并。

---

## 我可以怎么帮忙

- 🐛 报告 Bug（请使用 Issue 模板）
- 💡 提出新功能建议
- 📖 改进文档（尤其是 [自部署指南](docs/SELF-HOSTING.md)）
- 🌍 补充多语言翻译
- 🔧 提交代码修复
- 🔒 报告安全问题（**请勿开公开 Issue**，见 [SECURITY.md](SECURITY.md)）

---

## 开发流程

### 1. Fork 并克隆

```bash
git clone https://github.com/<你的用户名>/glimmer-healing.git
cd glimmer-healing
git remote add upstream https://github.com/1SanTi/glimmer-healing.git
```

### 2. 创建分支

从 `main` 拉出分支，命名建议：

```bash
git checkout -b fix/dream-analysis-crash
git checkout -b feat/add-mbti-scale
git checkout -b docs/improve-self-hosting
```

### 3. 搭建开发环境

见 [构建指南](docs/BUILD.md)。最小步骤：

```bash
pnpm install
cp .env.example .env     # 填入你自己的 Supabase 配置
pnpm start
```

> 没有后端也可以用 `pnpm web` 跑起界面，但登录与 AI 功能不可用。

### 4. 提交前自检

```bash
pnpm lint                 # Biome + ESLint + oxlint
npx tsc --noEmit          # 类型检查
```

请确保这两条命令通过后再提交。

---

## 代码规范

### 通用

- **TypeScript 严格模式**，避免 `any`；确需使用时请注释说明原因
- **不要新增硬编码的密钥、手机号、密码或任何个人信息** —— 这是硬性红线
- 环境变量统一走 `EXPO_PUBLIC_*`，且只能放**可公开**的值
- 提交信息使用 [Conventional Commits](https://www.conventionalcommits.org/)：
  `feat:` / `fix:` / `docs:` / `refactor:` / `chore:`

### 前端

- 样式使用 **NativeWind**（Tailwind 类名），避免内联 `style` 对象
- 页面放在 `src/app/` 下，遵循 Expo Router 文件即路由的约定
- 可复用逻辑抽到 `src/hooks/`，数据访问统一走 `src/db/api.ts`
- 基础组件放 `src/components/ui/`，业务组件放 `src/components/`

### 后端

- Edge Function 放 `supabase/functions/<name>/index.ts`
- **任何新建表都必须启用 RLS 并编写策略**。默认拒绝，按需放行
- 新增迁移请追加为 `supabase/migrations/000NN_描述.sql`，**不要修改已发布的迁移**
- 密钥只通过 `Deno.env.get(...)` 读取，绝不硬编码

---

## 数据库迁移规则

1. **已合并的迁移不可修改** —— 它们可能已在他人环境中执行过
2. 新迁移使用下一个序号，文件名用英文短横线连接：`00048_add_mood_reminder.sql`
3. 迁移需可重复执行（使用 `IF NOT EXISTS` / `CREATE OR REPLACE`）
4. 修改函数的迁移请一并更新 `supabase/schema.sql` 中的对应片段，保持快照一致

---

## Pull Request

提交 PR 时请：

- 关联相关 Issue（`Closes #123`）
- 说明**改了什么**与**为什么改**
- 附上验证方式（截图、复现步骤或测试结果）
- 若是 UI 改动，请附前后对比截图
- 保持 PR 聚焦单一目的，避免混杂无关格式化改动

PR 模板会自动提示这些内容。

---

## 安全红线（会被直接拒绝）

- ❌ 提交真实密钥、令牌、私钥或 `.env`
- ❌ 提交真实手机号、身份证号、住址等个人信息（含测试数据）
- ❌ 放宽 RLS 策略以便“方便调试”（例如把 `admin_users` 的 INSERT 放开）
- ❌ 将 `service_role` key 引入客户端代码
- ❌ 未经脱敏的线上数据库导出

如果不慎提交了密钥，请**立即在对应平台轮换该密钥** —— 仅删除提交是不够的，它仍留在 Git 历史中。

---

## 行为准则

参与本项目即表示你同意：

- 尊重所有贡献者，不对他人的心理状况、经历或选择做评判
- 不发布污名化心理健康问题的言论
- 接受建设性批评，也以建设性的方式提出批评

违反者将被移出项目。
