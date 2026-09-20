# Glimmer Healing（微光心愈）

> 一款从「关注问题」转向「关注优势」的心理健康陪伴与成长移动应用。
> 结合积极心理学理念，提供沉浸式倾诉、趣味互动、专业心理自测与 AI 深度干预能力。

[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS%20%7C%20Web-3ddc84?logo=android&logoColor=white)](#-下载安装)
[![Expo](https://img.shields.io/badge/Expo-55.0.6-000020?logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.83.2-61dafb?logo=react&logoColor=white)](https://reactnative.dev)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3ecf8e?logo=supabase&logoColor=white)](https://supabase.com)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## ⬇️ 下载安装

### 方式一：直接下载 APK（推荐，最快）

前往 **[Releases 页面](https://github.com/1SanTi/glimmer-healing/releases/latest)** 下载最新版 `Glimmer-Healing-*.apk`，在 Android 手机上安装。

> **安装提示**：首次安装需在「设置 → 安全 → 允许安装未知来源应用」中授权你的浏览器或文件管理器。
> 若系统提示「不安全的应用」，选择「仍然安装」即可 —— 这是因为本 APK 使用自签名证书，而非 Google Play 上架签名。

**系统要求**：Android 7.0（API 24）及以上。

> ℹ️ 预编译 APK 内置了原作者的 Supabase 后端地址。它适合**体验功能**，但其中的数据会写入该后端。
> 如果你想部署自己的服务，请参阅 [自部署指南](docs/SELF-HOSTING.md) 并自行构建，见 [方式二](#方式二从源码构建)。

### 方式二：从源码构建

适用于 iOS、Web，或想要连接自己后端的场景：

```bash
git clone https://github.com/1SanTi/glimmer-healing.git
cd glimmer-healing
pnpm install
cp .env.example .env      # 填入你自己的 Supabase 配置

pnpm start                # 启动开发服务器（Expo Go / 模拟器）
pnpm android              # 直接跑 Android
pnpm web                  # 跑 Web 版
```

构建独立 APK 的完整步骤见 **[构建指南](docs/BUILD.md)**。

---

## ✨ 功能特性

### 心理健康工具

| 功能 | 说明 |
|------|------|
| 🧪 **专业心理测评** | 免费量表 SCL-90、SDS、MHT；会员量表含房树人 HTP、自信度测试、MBTI 等 |
| 🎨 **3D 心灵沙盘室** | 自由摆放沙具构建内心场景，支持 AI 深度解读 |
| 🖼️ **心绘小屋 / 心灵速写** | 绘画创作 + AI 生图 + AI 速写解析 |
| 🌀 **曼陀罗绘画** | 曼陀罗绘制与 AI 解析 |
| 🃏 **电子 OH 卡** | 抽卡探索与 AI 解读 |
| 🕸️ **关系网络图** | 可视化人际关系，AI 关系洞察分析 |
| 🧊 **冰山分析** | 萨提亚冰山模型逐层剖析 |
| 💭 **梦境解析器** | 记录梦境并获取心理解读 |
| 📓 **笔记系统** | 支持文件夹层级管理的心灵笔记 |
| 🎵 **音乐疗愈** | 冥想音乐库与生成式疗愈音乐 |
| 🫁 **呼吸练习 / 沉浸睡眠** | 正念呼吸引导与助眠音频 |
| 🆘 **危机干预** | 内置 CrisisProvider，识别风险表达并给出求助资源 |
| 🌳 **希望树** | 记录积极事件、积累幸福感日志 |

### 苍鹭医生（AI 智能体）

内置名为「苍鹭医生」的 AI 心理陪伴智能体，支持多轮自然语言深度咨询，具备：

- **记忆系统** — 跨会话记住用户情况
- **技能编排** — 按心理学流派选择干预策略
- **联网检索 / 网页阅读 / PDF 解析** — 为对话提供事实依据
- **语音输入与 TTS 播报**
- **结果卡片** — 结构化输出分析结论

### 会员与运营体系

- **三级会员**：体验版（free）→ 心愈版（level 1）→ AI 工作台版（workspace）
- **AI 积分额度**：体验版 5/日、心愈版 50/日、AI 工作台版 100/日，单次 AI 交互扣减 5 点，每日 24:00 重置
- **兑换码激活**：生成、核销、作废全流程 + 兑换流水审计
- **管理员后台**：运营概览、套餐分布、兑换码管理、会员延期/取消订阅

---

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| **客户端** | Expo 55 · React Native 0.83 · Expo Router 55（类型化路由） |
| **语言** | TypeScript 5.9 |
| **样式** | NativeWind 4（Tailwind CSS）· React Native Reanimated 4 |
| **UI 组件** | `@rn-primitives/*` · lucide-react-native · react-native-svg |
| **状态与存储** | React Context · AsyncStorage · expo-sqlite |
| **后端** | Supabase（PostgreSQL + Auth + Storage + Realtime） |
| **服务端逻辑** | 33 个 Supabase Edge Functions（Deno / TypeScript） |
| **AI 能力** | 多模型路由（DeepSeek / GLM / Qwen / Kimi / 混元 等） |
| **支付** | 支付宝（含单文件版 Deno SDK） |
| **可观测性** | Sentry React Native |
| **代码质量** | Biome · ESLint · oxlint |

---

## 📁 项目结构

```
.
├── src/
│   ├── app/                      # Expo Router 路由（文件即路由）
│   │   ├── (auth)/               # 登录 / 注册
│   │   └── (app)/                # 主应用
│   │       ├── (tabs)/           # 底部标签：首页 / 疗愈 / 测玩 / 学苑 / 我的
│   │       └── ...               # 各功能页（沙盘、梦境、OH 卡、关系图等）
│   ├── components/
│   │   ├── heron/                # 苍鹭医生智能体 UI
│   │   └── ui/                   # 基础组件库
│   ├── lib/
│   │   ├── heron/                # 智能体核心：agent / memory / skills / models
│   │   ├── adminConfig.ts        # 管理员入口配置（环境变量驱动）
│   │   └── aiStream.ts           # AI 流式响应
│   ├── hooks/                    # useSubscription / useAiQuota
│   ├── db/api.ts                 # 数据访问层
│   └── client/supabase.ts        # Supabase 客户端
├── supabase/
│   ├── migrations/               # 47 个数据库迁移
│   ├── functions/                # 33 个 Edge Functions
│   ├── schema.sql                # 完整数据库结构快照
│   └── secrets/required.json     # 所需服务端密钥清单
├── docs/
│   ├── prd.md                    # 产品需求文档
│   ├── BUILD.md                  # 构建指南
│   └── SELF-HOSTING.md           # 自部署指南
└── app.json                      # Expo 配置
```

---

## 🔐 安全说明

> **⚠️ 请务必阅读 [SECURITY.md](SECURITY.md)。**

本仓库在开源前已做过脱敏处理。以下几点需要你特别注意：

1. **客户端管理员门禁不是安全边界。** `EXPO_PUBLIC_*` 环境变量会被内联进 JS bundle，解包 APK 即可读取。
   真正的权限控制必须由服务端 RLS 策略承担。详见 [SECURITY.md](SECURITY.md)。
2. **切勿提交 `.env`。** 仓库仅包含 `.env.example`。所有真实密钥（`service_role` key、支付私钥、模型 API Key）
   必须配置在 Supabase Edge Function 的 Secrets 中。
3. **自部署前请检查 `admin_users` 表的 RLS 策略。** 若允许普通用户写入该表，任何注册用户都能自行提升为管理员。

发现安全问题请参考 [SECURITY.md](SECURITY.md) 中的私下报告流程，不要直接开公开 Issue。

---

## 🤝 参与贡献

欢迎提交 Issue 与 Pull Request，请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

### 第三方组件

项目依赖的第三方库遵循各自的许可证（Expo、React Native、Supabase JS、`@rn-primitives/*`、lucide 等）。
`supabase/functions/_shared/alipay-sdk-deno.ts` 基于 [alipay-sdk](https://www.npmjs.com/package/alipay-sdk) 改造。

## ⚠️ 免责声明

本应用提供的所有服务均为**心理健康辅助性质**，**不构成专业心理诊断、心理治疗或医疗建议**，
不能替代专业心理咨询师或精神科医生的服务。

如果你或你身边的人正处于心理危机中，请立即联系当地心理援助热线或紧急服务。

## 🙏 致谢

本项目最初通过 [百度秒搭（Miaoda）](https://comate.baidu.com/) AI 应用生成平台构建，其后持续迭代开发。
