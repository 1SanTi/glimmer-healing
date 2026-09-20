/**
 * 应用对外联系信息
 * =====================================================================
 *
 * 这些值通过环境变量配置，以便自部署者填入自己的联系方式，
 * 避免在开源代码中硬编码原作者的个人邮箱。
 *
 * 在 `.env` 中设置：
 *
 * ```
 * EXPO_PUBLIC_CONTACT_EMAIL=support@your-domain.com
 * EXPO_PUBLIC_CONTACT_WEBSITE=https://your-domain.com
 * EXPO_PUBLIC_PRIVACY_CONTACT_EMAIL=privacy@your-domain.com
 * ```
 *
 * ⚠️ 与其它 `EXPO_PUBLIC_*` 变量一样，它们会被内联进客户端 bundle 并可被解包读取。
 *    这里只应填写**面向公众**的联系方式，不要填个人邮箱或任何凭据。
 */

/** 通用联系邮箱 */
export const CONTACT_EMAIL = process.env.EXPO_PUBLIC_CONTACT_EMAIL ?? 'support@example.com';

/** 官网地址（展示用，不含协议头） */
export const CONTACT_WEBSITE = process.env.EXPO_PUBLIC_CONTACT_WEBSITE ?? 'example.com';

/** 隐私政策相关联系邮箱，未单独配置时回退到通用联系邮箱 */
export const PRIVACY_CONTACT_EMAIL = process.env.EXPO_PUBLIC_PRIVACY_CONTACT_EMAIL ?? CONTACT_EMAIL;
