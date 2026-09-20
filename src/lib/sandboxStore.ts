/**
 * 沙盘截图内存暂存 — 避免将大体积 base64 放入 URL query param
 * sandbox.tsx 写入 → sandbox-result.tsx 读取后清除
 */

interface SandboxCapture {
  base64: string;       // data:image/png;base64,... 完整数据URL
  objectsCount: number; // 沙盘中放置的物件总数
  returnExpertId?: string;
}

let pending: SandboxCapture | null = null;

export function setSandboxCapture(data: SandboxCapture) {
  pending = data;
}

export function getSandboxCapture(): SandboxCapture | null {
  return pending;
}

export function clearSandboxCapture() {
  pending = null;
}
