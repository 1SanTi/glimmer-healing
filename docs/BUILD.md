# 构建指南 / Build Guide

本文档说明如何从源码构建 Glimmer Healing。

---

## 1. 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| **Node.js** | ≥ 20 LTS | 推荐 22 |
| **pnpm** | ≥ 10 | 本项目使用 pnpm workspace，**不要用 npm** |
| **JDK** | 17 | 构建 Android 必需 |
| **Android SDK** | Platform 35 + Build-Tools 35 | 或直接用 Android Studio 安装 |

安装 pnpm：

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

验证 Android 环境：

```bash
echo $ANDROID_HOME          # Windows: echo $env:ANDROID_HOME
java -version               # 应显示 17.x
```

若未设置 `ANDROID_HOME`，指向 Android SDK 目录即可，例如：

```bash
# macOS / Linux
export ANDROID_HOME="$HOME/Library/Android/sdk"

# Windows PowerShell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
```

---

## 2. 安装依赖

```bash
git clone https://github.com/1SanTi/glimmer-healing.git
cd glimmer-healing
pnpm install
```

> **注意**：首次安装会下载约 1 GB 依赖（Expo + React Native 生态）。
> 项目使用 `patchedDependencies` 对 `expo@55.0.6` 与 `@shopify/react-native-skia@2.4.18` 打了补丁，
> pnpm 会自动应用，无需手动操作。

### 关于 `miaoda-expo-devkit`

本项目使用百度秒搭平台的构建工具链 `miaoda-expo-devkit`（公开 npm 包）。
其 `pnpm-config.json` 会通过根目录 `.pnpmfile.cjs` 拦截部分被标记的依赖。
如遇安装报错 `Restricted: ...`，说明命中了该拦截规则，属于预期行为。

---

## 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，至少填入：

```ini
EXPO_PUBLIC_SUPABASE_URL=https://<你的项目>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<你的 anon key>
```

> ⚠️ `.env` 已被 `.gitignore` 忽略，**切勿提交**。
> ⚠️ 所有 `EXPO_PUBLIC_*` 变量都会被内联进客户端 bundle，只适合放公开信息。
> 详见 [SECURITY.md](../SECURITY.md)。

后端尚未就绪？请先完成 [自部署指南](SELF-HOSTING.md)。

---

## 4. 开发调试

```bash
pnpm start        # 启动 Metro，扫码用 Expo Go 打开
pnpm android      # 直接安装到已连接的 Android 设备/模拟器
pnpm ios          # iOS 模拟器（需 macOS）
pnpm web          # 浏览器中运行
```

---

## 5. 构建 Android APK

### 5.1 生成原生工程

`/android` 与 `/ios` 目录已被 `.gitignore` 忽略，由 Expo 预构建生成：

```bash
npx expo prebuild --platform android --clean
```

### 5.2 生成签名密钥

发布版 APK 需要签名。若还没有 keystore：

```bash
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore release.keystore \
  -alias glimmer \
  -keyalg RSA -keysize 2048 -validity 10000
```

> 🔒 **`release.keystore` 及其密码绝不可提交到仓库。**
> 请妥善备份：一旦丢失，你将无法为已发布的 App 提供可覆盖升级的新版本。

### 5.3 配置签名

在 `android/gradle.properties` 中追加：

```properties
GLIMMER_STORE_FILE=../release.keystore
GLIMMER_KEY_ALIAS=glimmer
GLIMMER_STORE_PASSWORD=你的store密码
GLIMMER_KEY_PASSWORD=你的key密码
```

然后在 `android/app/build.gradle` 的 `android { }` 块内加入：

```gradle
signingConfigs {
    release {
        storeFile file(GLMMER_STORE_FILE)
        storePassword GLIMMER_STORE_PASSWORD
        keyAlias GLIMMER_KEY_ALIAS
        keyPassword GLIMMER_KEY_PASSWORD
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        shrinkResources true
    }
}
```

> 由于 `expo prebuild --clean` 会重新生成 `android/`，上述改动会被覆盖。
> 长期方案是将其固化为
> [Expo Config Plugin](https://docs.expo.dev/config-plugins/introduction/)，
> 或用 CI 在构建前自动注入（见 [.github/workflows/release.yml](../.github/workflows/release.yml)）。

### 5.4 打包

```bash
cd android
./gradlew assembleRelease        # Windows: .\gradlew.bat assembleRelease
```

产物：

```
android/app/build/outputs/apk/release/app-release.apk
```

安装到设备：

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

---

## 6. 使用 EAS Build（云端构建，免配 Android SDK）

若不想在本地配置 Android 工具链：

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile production
```

构建完成后 EAS 会给出下载链接。注意 EAS 会将其自己的签名密钥托管在 Expo 服务器上。

---

## 7. 常见问题

| 现象 | 原因与解决 |
|------|-----------|
| `pnpm: command not found` | 未启用 corepack，执行 `corepack enable` |
| `Restricted: <package>` | 命中 `miaoda-expo-devkit` 的依赖拦截规则，属预期行为 |
| Gradle 报 `SDK location not found` | 未设置 `ANDROID_HOME`，或缺少 `android/local.properties` |
| 构建报 Java 版本错误 | 需 JDK 17；JDK 21+ 可能与当前 Gradle 不兼容 |
| Metro 缓存导致的怪异报错 | `pnpm start --clear` 或删除 `node_modules/.cache` |
| 依赖安装卡住 | pnpm 配置了 `minimumReleaseAge: 1440`（元数据最小年龄），属正常策略 |
| APK 安装提示「不安全的应用程序」 | 自签名 APK 的正常提示，选择「仍然安装」 |

---

## 8. 发布流程（维护者）

打标签即触发 CI 自动构建并发布 APK：

```bash
git tag v1.0.461
git push origin v1.0.461
```

GitHub Actions 会构建 APK 并作为 Release 附件上传。

**默认行为**：未做额外配置时，CI 使用 React Native 模板的调试签名。
产出的 APK 可以正常安装使用，但不同构建之间签名可能变化，不适合正式分发。

**启用正式签名**：在 **Settings → Secrets and variables → Actions** 中配置：

| 类型 | 名称 | 值 |
|------|------|-----|
| Variable | `ANDROID_SIGNING_ENABLED` | `true`（开关） |
| Secret | `ANDROID_KEYSTORE_BASE64` | keystore 的 base64：`base64 -w0 release.keystore` |
| Secret | `ANDROID_KEY_ALIAS` | key 别名 |
| Secret | `ANDROID_STORE_PASSWORD` | keystore 密码 |
| Secret | `ANDROID_KEY_PASSWORD` | key 密码 |

**让发布包连接你自己的后端**（否则下载者只能浏览界面，无法登录与使用 AI 功能）：

| 类型 | 名称 | 值 |
|------|------|-----|
| Variable | `EXPO_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| Variable | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | 你的 anon key |
| Variable | `EXPO_PUBLIC_APP_ID` | 可选 |

> ⚠️ 这些值会被内联进 APK 并可被解包读取，因此**只能放公开信息**。
> 切勿放入 `service_role` key、支付私钥或模型 API Key。

