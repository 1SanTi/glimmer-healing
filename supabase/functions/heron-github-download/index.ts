/**
 * heron-github-download — 苍鹭医生 GitHub 资源下载代理
 * 通过 GitHub API 获取仓库信息、文件树或单文件内容，返回给前端。
 * 请求体: { action, repo, path?, ref?, token? }
 * action: 'repo_info' | 'tree' | 'file' | 'readme'
 * 响应: { ... }
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const API = 'https://api.github.com';

function parseRepo(input: string): { owner: string; repo: string; ref?: string; path?: string } {
  // 支持 owner/repo 或完整 URL
  let s = input.trim();
  s = s.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  const refMatch = s.match(/@([^/]+)/);
  let ref: string | undefined;
  if (refMatch) { ref = refMatch[1]; s = s.replace(/@[^/]+/, ''); }
  const parts = s.split('/').filter(Boolean);
  const owner = parts[0];
  const repo = parts[1];
  const path = parts.slice(4).join('/') || undefined; // /tree/<ref>/<path>
  return { owner, repo, ref, path };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  let action = '';
  let repoInput = '';
  let path = '';
  let ref = '';
  let token = '';
  try {
    const body = await req.json();
    action = String(body.action || 'repo_info');
    repoInput = String(body.repo || '');
    path = String(body.path || '');
    ref = String(body.ref || '');
    token = String(body.token || '');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
  if (!repoInput) {
    return new Response(JSON.stringify({ error: 'Missing repo' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  const parsed = parseRepo(repoInput);
  if (!parsed.owner || !parsed.repo) {
    return new Response(JSON.stringify({ error: '仓库地址无效，请检查 URL' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
  const useRef = ref || parsed.ref || 'main';
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'heron-doctor',
  };
  const envToken = Deno.env.get('GITHUB_TOKEN');
  const useToken = token || envToken || '';
  if (useToken) headers['Authorization'] = `Bearer ${useToken}`;

  const ghFetch = async (url: string) => {
    const r = await fetch(url, { headers });
    if (r.status === 401) throw new Error('Token 认证失败，请检查 Token');
    if (r.status === 404) throw new Error('仓库或资源不存在，请检查 URL');
    if (r.status === 403) {
      const body = await r.json().catch(() => ({}));
      if (body?.message?.includes('rate limit')) throw new Error('GitHub 接口限流，请稍后再试');
      throw new Error('无访问权限，私有仓库需要 Token');
    }
    if (!r.ok) throw new Error(`GitHub 错误：${r.status}`);
    return r.json();
  };

  try {
    if (action === 'repo_info') {
      const info = await ghFetch(`${API}/repos/${parsed.owner}/${parsed.repo}`);
      return new Response(JSON.stringify({
        name: info.name,
        fullName: info.full_name,
        description: info.description || '',
        stars: info.stargazers_count,
        language: info.language || '',
        defaultBranch: info.default_branch,
        htmlUrl: info.html_url,
      }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    if (action === 'readme') {
      const r = await fetch(`${API}/repos/${parsed.owner}/${parsed.repo}/readme?ref=${useRef}`, { headers });
      if (r.ok) {
        const data = await r.json();
        const content = data.content ? atob(String(data.content).replace(/\s/g, '')) : '';
        return new Response(JSON.stringify({ content, encoding: data.encoding }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ content: '（该仓库暂无 README）' }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    if (action === 'tree') {
      const usePath = path || parsed.path || '';
      const url = `${API}/repos/${parsed.owner}/${parsed.repo}/contents/${usePath}?ref=${useRef}`;
      const data = await ghFetch(url);
      const list = Array.isArray(data) ? data.map((f: Record<string, unknown>) => ({
        name: String(f.name || ''),
        type: String(f.type || ''),
        size: Number(f.size || 0),
        path: String(f.path || ''),
      })) : [];
      return new Response(JSON.stringify({ files: list }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    if (action === 'file') {
      const usePath = path || parsed.path || '';
      const data = await ghFetch(`${API}/repos/${parsed.owner}/${parsed.repo}/contents/${usePath}?ref=${useRef}`);
      if (data.type === 'file' && data.content) {
        const content = data.encoding === 'base64' ? atob(String(data.content).replace(/\s/g, '')) : String(data.content);
        return new Response(JSON.stringify({ name: data.name, content, size: data.size }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: '该路径不是文件' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});