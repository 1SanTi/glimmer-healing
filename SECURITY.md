# 安全策略 / Security Policy

## 报告安全问题

如果你发现了安全漏洞，**请不要开公开 Issue**。请通过以下方式私下联系：

- 使用 GitHub 的 [Private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
  （仓库 **Security** 标签页 → **Report a vulnerability**）

请在报告中包含：影响范围、复现步骤、以及（如果可能）修复建议。我们会在确认后尽快发布修复。

---

## 部署前必读：权限模型

本项目的权限模型分为两层，**只有第二层是安全边界**。

### 第一层：客户端管理员门禁（❌ 不是安全边界）

`src/lib/adminConfig.ts` 中的 `ADMIN_PHONE` / `ADMIN_PASSWORD` 来自 `EXPO_PUBLIC_*` 环境变量。
这类变量会在构建时被 Metro **内联进 JS bundle**：

```bash
unzip app-release.apk assets/index.android.bundle
strings assets/index.android.bundle | grep EXPO_PUBLIC_
```

也就是说，**任何拿到 APK 的人都能读出这些字面量**。这一层的作用仅仅是隐藏管理后台入口。

> ⚠️ **推论**：如果你曾经用真实凭据打出过安装包并对外分发，该凭据必须视为已泄露并立即更换。
> 更彻底的做法是放弃密码门禁，改为仅以数据库中的 `admin_users` 表判定管理员身份。

### 第二层：服务端 RLS 策略（✅ 真正的边界）

真正的权限由 PostgreSQL Row Level Security 承担，核心是 `public.is_admin()` 函数与
`public.admin_users` 表。**自部署时必须逐项确认以下要求**：

#### 要求 1：`admin_users` 表的 INSERT 策略必须限制为管理员

```sql
-- ✅ 正确：只有已是管理员的用户可以添加新管理员
CREATE POLICY admin_users_insert_admin
  ON public.admin_users FOR INSERT TO authenticated
  WITH CHECK (is_admin());

-- ❌ 危险：任何登录用户都能把自己写进 admin_users，从而自我提权
CREATE POLICY admin_users_insert_self
  ON public.admin_users FOR INSERT
  WITH CHECK (auth.uid() = id);
```

若使用后者，任意注册用户只需一次 SDK 调用即可成为管理员，进而读取/修改
`user_subscriptions`、`redemption_codes` 等全部业务数据，并可生成或作废兑换码。

**本仓库已默认采用安全写法。** 由于 `is_admin()` 依赖 `admin_users` 表本身，
首位管理员无法通过客户端自助产生，必须在数据库中手动播种，见
[自部署指南](docs/SELF-HOSTING.md#3-设置首位管理员)。

#### 要求 2：`admin_users` 的 SELECT 策略

`is_admin()` 需要读取该表，因此 SELECT 策略为 `USING (true)` 是本项目的设计前提。
该表的暴露范围仅限「哪些用户 ID 是管理员」，不包含敏感信息。如果你希望进一步收紧，
可改为 `USING (auth.uid() = id OR is_admin())`。

#### 要求 3：使用 `service_role` 的 Edge Function 必须自行鉴权

`service_role` 密钥会绕过**全部** RLS 策略。因此任何使用它的 Edge Function
都**必须自己校验调用者身份** —— 不能因为「客户端已经做过校验」就省略。

✅ 正确写法（参考 `alipay-pay`、`get-admin-stats`）：

```ts
const authHeader = req.headers.get('Authorization');
if (!authHeader) return json({ error: '请先登录' }, 401);

// 用调用者的 JWT 构造客户端，再校验身份
const anonClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!,
  { global: { headers: { Authorization: authHeader } } },
);
const { data: { user } } = await anonClient.auth.getUser();
if (!user) return json({ error: '身份验证失败' }, 401);

// 管理员端点还需校验管理员身份
const { data: isAdmin } = await anonClient.rpc('is_admin');
if (isAdmin !== true) return json({ error: '无管理员权限' }, 403);

// 通过鉴权后才使用 service_role
```

❌ 错误写法：

```ts
// 直接使用 service_role，不校验调用者
const supabase = createClient(url, SERVICE_ROLE_KEY);
// 注释写着「安全性由前端密码弹窗保障」—— 客户端校验不构成任何保护
```

**后果示例**：若 `generate-codes` 缺少鉴权，任何人都能直接
`POST /functions/v1/generate-codes` 凭空生成高级会员兑换码，
从而免费获取全部付费权益与 AI 额度（直接消耗你的模型调用费用）。

Edge Function 是**公开可访问的 URL**，不要假设「客户端没调用就没人知道」。

#### 要求 4：密钥只能放在服务端

- ✅ Supabase anon key 可以放在 `EXPO_PUBLIC_*` —— 它本身设计为公开，权限完全由 RLS 控制。
- ❌ **`service_role` key 绝不能出现在客户端**。它会绕过全部 RLS。
- ❌ 支付宝私钥、各模型厂商 API Key 等必须放在 Edge Function Secrets 中。

本项目全部 32 个 Edge Function 均通过 `Deno.env.get(...)` 读取密钥，
所需密钥清单见 `supabase/secrets/required.json`。

#### 要求 5：`.env` 不得提交

仓库仅包含 `.env.example`。`.gitignore` 已忽略 `.env` 与 `.env*.local`。
如果你 fork 后不慎提交了真实凭据，**仅删除文件是不够的** —— 它仍留在 Git 历史中，
需要重写历史（`git filter-repo`）并**立即轮换该凭据**。

---

## 开源前的脱敏记录

本仓库在首次公开发布前，已将以下个人信息从工作区与 Git 历史中移除：

| 类型 | 处理方式 |
|------|----------|
| 管理员手机号（硬编码于多个 SQL 迁移与 TSX） | 替换为占位符 `13800000000`，或改为读取 `admin_users` 表 |
| 管理员密码（硬编码于 `profile.tsx`） | 改为由 `EXPO_PUBLIC_ADMIN_PASSWORD` 读取，并增加空值护栏 |
| 客服/联系手机号（`agreement.tsx`） | 改为由 `EXPO_PUBLIC_ADMIN_PHONE` 读取 |
| 含手机号的文件名（`00027_update_admin_phone_<原手机号>.sql`） | 重命名为 `00027_update_admin_phone.sql` |
| Supabase 后端地址与 anon key（`.env`） | 从版本控制移除，改为提供 `.env.example` |
| 原 Git 历史（含上述字面量） | 丢弃并重新初始化，历史中不含任何真实数据 |

---

## 支持的版本

安全修复只针对最新发布版本。请始终使用
[Releases 页面](https://github.com/1SanTi/glimmer-healing/releases/latest) 的最新版本。

---

## 首次开源时一并修复的缺陷

除个人信息脱敏外，本次公开发布前还修复了以下安全缺陷。
**如果你此前部署过本项目的早期版本，请务必核对第 1～3 项在你实例上的实际状态。**

| # | 缺陷 | 影响 | 修复 |
|---|------|------|------|
| 1 | `admin_users` 的 INSERT 策略为 `WITH CHECK (auth.uid() = id)` | 任何已注册用户都能把自己写入该表，进而通过 `is_admin()` **自行提权为管理员**，读取与修改全部订阅、兑换码数据 | 改为 `WITH CHECK (is_admin())`，见 migration `00031`；首位管理员改为在数据库中手动播种 |
| 2 | `generate-codes` 使用 `service_role` 且**无任何服务端鉴权** | 任何人可直接 `POST` 该函数**凭空生成高级会员兑换码**，免费获取全部付费权益与 AI 额度（直接消耗你的模型调用费用） | 新增 `auth.getUser()` + `is_admin()` 双重校验后才使用 `service_role` |
| 3 | `get-admin-stats` 使用 `service_role` 且**无任何服务端鉴权** | 任何人可调用并获取用户总数等运营数据 | 同上 |
| 4 | 管理员密码以明文硬编码在客户端，并已随 APK 对外分发 | 解包 APK 即可提取该密码，应视为**已泄露** | 改为由 `EXPO_PUBLIC_ADMIN_PASSWORD` 读取，并增加空值护栏；**真实权限改由服务端 `admin_users` 表承担** |

> ⚠️ **第 1～3 项修复改变了权限行为。**
> 对于**已经部署过**的实例，数据库迁移不会自动重跑，旧的宽松策略很可能仍然生效。
>
> 修复存量实例的两种方式（任选其一）：
>
> 1. 执行本仓库提供的幂等迁移
>    [`supabase/migrations/00048_harden_admin_users_insert_policy.sql`](supabase/migrations/00048_harden_admin_users_insert_policy.sql)；
> 2. 或到 Supabase Dashboard → **Authentication → Policies** 手动核对
>    `admin_users` 的 INSERT 策略。
>
> 同时必须**重新部署** `generate-codes` 与 `get-admin-stats`
> （`supabase functions deploy generate-codes get-admin-stats`）——
> 函数代码的修复不会自动生效。完整步骤见
> [自部署指南第 10 节](docs/SELF-HOSTING.md#10-已有部署的升级重要)。
>
> 第 4 项的密码应尽快更换。由于服务端权限现已不依赖该密码，
> 更换后即使密码再次泄露也不会造成权限提升。

