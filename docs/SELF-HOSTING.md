# 自部署指南 / Self-Hosting Guide

本项目后端基于 [Supabase](https://supabase.com)（PostgreSQL + Auth + Storage + Edge Functions）。
本文档说明如何部署一套自己的后端。

> ⚠️ 开始前请先阅读 [SECURITY.md](../SECURITY.md)，其中列出了**必须确认的安全配置**。

---

## 1. 创建 Supabase 项目

1. 登录 [supabase.com/dashboard](https://supabase.com/dashboard)，新建项目
2. 记下 **Project URL**、**anon key**（Settings → API）
3. 获取 **service_role key**（同样在 Settings → API）—— ⚠️ 它绕过全部 RLS，**只能用于服务端**

---

## 2. 初始化数据库

两种方式二选一。

### 方式 A：一次性导入完整结构（推荐新部署）

在 Supabase Dashboard → **SQL Editor** 中执行 `supabase/schema.sql` 的全部内容。
该文件是完整结构快照，包含所有表、RLS 策略、函数与触发器。

### 方式 B：按顺序执行迁移（推荐跟随上游更新）

在 SQL Editor 中按文件名数字顺序依次执行 `supabase/migrations/*.sql`（00001 → 00048）。

或用 Supabase CLI：

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

> **注意**：迁移 `00025` 与 `00027` 中的管理员手机号为占位符 `13800000000`。
> 若你选择「手机号判定管理员」的旧方案，请替换为你自己的号码；
> 否则无需改动，因为迁移 `00030` 之后管理员改由 `admin_users` 表管理。

---

## 3. 设置首位管理员

由于安全策略限制「只有管理员才能添加管理员」（见 [SECURITY.md](../SECURITY.md)），
**首位管理员必须在数据库中手动播种**，无法通过 App 自助获得。

1. 先在 App 中注册一个账号（或在 Dashboard → Authentication → Users 中手动创建）
2. 在 SQL Editor 中执行：

```sql
-- 查看所有用户，找到你自己的账号
SELECT id, phone, email, created_at FROM auth.users ORDER BY created_at DESC;

-- 把自己设为管理员
INSERT INTO public.admin_users (id)
SELECT id FROM auth.users WHERE phone = '你的手机号';
```

3. 验证：

```sql
-- 应以你的身份返回 true（在 App 内请求时）
SELECT public.is_admin();
```

4. 在 `.env` 中配置客户端管理后台入口：

```ini
EXPO_PUBLIC_ADMIN_PHONE=你的手机号
EXPO_PUBLIC_ADMIN_PASSWORD=一个强密码
```

> 再次提醒：这两个值会被内联进 APK，**仅供隐藏入口**，不构成安全边界。
> 真正生效的是上一步写入的 `admin_users` 记录。

---

## 4. 部署 Edge Functions

本项目包含 32 个可部署边缘函数（另有 1 个共享模块 `_shared/alipay-sdk-deno.ts`），位于 `supabase/functions/`。

```bash
# 安装 Supabase CLI
npm install -g supabase

supabase link --project-ref <your-project-ref>

# 部署全部函数
supabase functions deploy
```

### 配置密钥

所需密钥清单见 `supabase/secrets/required.json`。使用 CLI 批量设置：

```bash
supabase secrets set \
  DEEPSEEK_API_KEY=sk-xxx \
  GLM_API_KEY=xxx \
  QWEN_API_KEY=xxx \
  KIMI_API_KEY=xxx \
  # ... 其余按需
```

也可以在 Dashboard → **Edge Functions → Secrets** 中图形化配置。

#### 密钥说明

| 分组 | 密钥 | 用途 | 可否留空 |
|------|------|------|----------|
| **AI 模型** | `DEEPSEEK_API_KEY` | 苍鹭医生主模型 | 否（核心功能） |
| | `GLM_API_KEY` / `QWEN_API_KEY` / `KIMI_API_KEY` / `HY3_API_KEY` / `TENCENT_MAAS_API_KEY` | 多模型路由备选 | 可（仅影响对应模型） |
| | `NEX_API_KEY` / `AGNES_API_KEY` | 图像生成 | 可 |
| | `VIDU_API_KEY` / `HY_IMAGE_KEY` | 视频/图像生成 | 可 |
| **地图** | `BAIDU_MAP_AK` / `AMAP_AK` | 关系网络图地理编码 | 可（该功能降级） |
| **语音** | `MINIMAX_*` | TTS 播报 | 可 |
| **支付** | `ALIPAY_*` | 支付宝下单/查询/回调 | 可（不配则无法付费） |
| **短信** | 见 `send-sms-code` | 手机号验证码 | 否（否则无法注册登录） |

> 💡 **最小可用配置**：只配 `DEEPSEEK_API_KEY` + 一个短信服务，即可跑通「注册登录 → 心理测评 → AI 对话」主流程。

---

## 5. 存储桶

部分迁移会创建存储桶（如 `generated_audio`、`note`、`oh_cards`、`heron_web` 等）。
它们随迁移自动创建。请在 Dashboard → **Storage** 中确认存在，并检查每个桶的公开/私有属性是否符合预期：

- **公开桶**（如头像、OH 卡背景）：允许匿名读取
- **私有桶**（如用户笔记）：仅允许本人访问，策略依赖 `auth.uid()`

---

## 6. 手机号登录与短信验证码

`send-sms-code` / `verify-sms-code` 两个函数负责验证码流程。
Supabase Auth 自带的手机号登录需要接入第三方短信服务商（Twilio、阿里云短信等）：

**Supabase 内置方案**：Dashboard → Authentication → Providers → Phone，
填入短信服务商凭据。

**自建方案**：修改 `supabase/functions/send-sms-code/index.ts`，接入你自己的短信 API。

> 开发调试时，可在 Authentication → Providers → Phone 中开启测试号码，
> 用固定的验证码跳过真实短信。

---

## 7. 支付宝配置（可选）

支付相关函数：`alipay-pay` / `alipay-query` / `alipay-notify`。
需要配置应用 ID、应用私钥、支付宝公钥等，见 `secrets/required.json` 中的 `ALIPAY_*` 分组。

`alipay-notify` 是异步回调地址，部署后需将其公网 URL 配置到支付宝开放平台：

```
https://<project-ref>.supabase.co/functions/v1/alipay-notify
```

> ⚠️ 支付回调务必做**签名验签**。请勿在未验签的情况下信任回调内容。

---

## 8. 客户端指向你的后端

编辑 `.env`：

```ini
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

然后重新构建（见 [BUILD.md](BUILD.md)）。

> 注意：预编译的 Release APK 内置的是原作者的后端地址，无法通过配置文件切换。
> 要连接自己的后端，必须自行构建。

---

## 9. 部署检查清单

部署完成后请逐项确认：

- [ ] `schema.sql` 或全部迁移已成功执行，无报错
- [ ] `public.admin_users` 已播种首位管理员
- [ ] **`admin_users` 的 INSERT 策略是 `WITH CHECK (is_admin())`，而非 `auth.uid() = id`**
- [ ] 已确认 `service_role` key 未出现在任何客户端代码或 `EXPO_PUBLIC_*` 变量中
- [ ] 所有 Edge Functions 部署成功（`supabase functions list`）
- [ ] 至少配置了 AI 模型密钥与短信服务
- [ ] 存储桶存在且策略符合预期
- [ ] 已用普通账号验证：**无法**读取他人的 `user_subscriptions`、`redemption_codes`
- [ ] 已用普通账号验证：**无法**把自己插入 `admin_users`
- [ ] `.env` 未提交到版本控制

---

## 10. 已有部署的升级（重要）

如果你在 2026-09 之前已经部署过本项目，**请务必执行本节**。

数据库迁移不会自动重跑，因此早期版本中存在的宽松 RLS 策略很可能仍留在你的实例上。
`supabase/migrations/00048_harden_admin_users_insert_policy.sql` 专门用于修复这类存量实例。

```bash
supabase db push        # 或直接在 SQL Editor 中执行 00048 文件内容
```

该迁移做的事情：

1. 删除 `admin_users_insert_self` 策略（`WITH CHECK (auth.uid() = id)`）
2. 重建为 `admin_users_insert_admin`（`WITH CHECK (is_admin())`）

### 还需要你手动完成的三件事

| # | 事项 | 说明 |
|---|------|------|
| 1 | **审计现有管理员** | 执行迁移文件末尾的查询。若该漏洞曾被利用，攻击者的 user id 会出现在 `admin_users` 中，需手动删除 |
| 2 | **重新部署两个 Edge Function** | `generate-codes` 与 `get-admin-stats` 原先缺少服务端鉴权，需重新部署为当前版本：`supabase functions deploy generate-codes get-admin-stats` |
| 3 | **核对兑换码历史** | 执行迁移文件末尾的兑换码统计查询，确认没有异常的批量生成记录 |

> ⚠️ 若第 1、3 步发现异常数据，说明漏洞可能已被利用。
> 应同时排查 `payment_orders` 与用户订阅记录，并考虑轮换 `service_role` key。

