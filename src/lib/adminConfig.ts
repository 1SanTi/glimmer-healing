/**
 * 管理员入口配置
 * =====================================================================
 *
 * ## ⚠️ 安全边界说明（必读）
 *
 * 本模块提供的是**客户端管理员门禁**，它的唯一作用是隐藏管理后台入口，
 * **不构成任何安全边界**。原因：
 *
 * 1. `EXPO_PUBLIC_*` 前缀的环境变量会在构建时被 Metro **内联进 JS bundle**。
 *    任何人解包 APK（`unzip` + 读取 `assets/index.android.bundle`）都能直接
 *    读到这些字面量。也就是说，只要用这套配置打出过安装包，该凭据就等同于公开。
 * 2. 客户端代码无法被信任。攻击者可以绕过 UI 直接调用 Supabase SDK。
 *
 * 真正的权限控制由服务端负责：`public.admin_users` 表 + `is_admin()` 函数 +
 * 各表的 RLS 策略。请务必确认 `admin_users` 表**不允许普通用户自行写入**，
 * 否则任何注册用户都能把自己提升为管理员。详见仓库根目录 `SECURITY.md`。
 *
 * ## 自部署配置方式
 *
 * 在 `.env` 中设置（不要提交到 Git）：
 *
 * ```
 * EXPO_PUBLIC_ADMIN_PHONE=13800000000
 * EXPO_PUBLIC_ADMIN_PASSWORD=<你自己设定的强密码>
 * ```
 *
 * 留空则管理后台入口整体关闭（见 `isAdminLoginEnabled`）。
 *
 * 更推荐的做法：不要使用密码门禁，改为在数据库中把管理员用户 ID 写入
 * `admin_users` 表，并让客户端仅通过该表判断管理员身份。
 */

/** 管理员手机号。未配置时为空字符串。 */
export const ADMIN_PHONE = process.env.EXPO_PUBLIC_ADMIN_PHONE ?? '';

/** 管理员入口密码。未配置时为空字符串。 */
export const ADMIN_PASSWORD = process.env.EXPO_PUBLIC_ADMIN_PASSWORD ?? '';

/**
 * 管理员入口是否启用。
 *
 * 这个判断是必要的安全护栏：若未配置环境变量，`ADMIN_PHONE` 与 `ADMIN_PASSWORD`
 * 都会是空字符串，此时若直接比较 `'' === ''` 会成立，导致任何人留空点击即可
 * 进入管理后台。因此必须先确认凭据已配置。
 */
export const isAdminLoginEnabled = ADMIN_PHONE.length > 0 && ADMIN_PASSWORD.length > 0;
