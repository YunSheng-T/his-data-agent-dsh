export const name = 'ui-his-repo';
export const inject = ['webServer', 'hisRepo', 'hisModeling'];
function json(res, code, body) {
    const payload = JSON.stringify(body);
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(payload);
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.setEncoding('utf8');
        req.on('data', (c) => { data += c; });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}
/** 挂载 /his-repo/* 只读 JSON 端点（分支列表 / 当前分支 / 文件树）。写操作（新建 SQL 等）后续接 gated 流程。 */
export function apply(ctx) {
    const repo = () => ctx.hisRepo;
    const branches = ctx.webServer.register({
        kind: 'exact',
        path: '/his-repo/branches',
        handler: async (_req, res) => {
            try {
                json(res, 200, { branches: repo().branches() });
            }
            catch (e) {
                json(res, 500, { error: e instanceof Error ? e.message : String(e) });
            }
        },
    });
    const current = ctx.webServer.register({
        kind: 'exact',
        path: '/his-repo/current-branch',
        handler: async (_req, res) => {
            try {
                json(res, 200, { current: repo().currentBranch() });
            }
            catch (e) {
                json(res, 500, { error: e instanceof Error ? e.message : String(e) });
            }
        },
    });
    const tree = ctx.webServer.register({
        kind: 'exact',
        path: '/his-repo/tree',
        handler: async (req, res) => {
            try {
                const url = new URL(req.url ?? '/', 'http://127.0.0.1');
                const branch = url.searchParams.get('branch') ?? repo().currentBranch();
                json(res, 200, { branch, tree: repo().treeWithState(branch) });
            }
            catch (e) {
                json(res, 500, { error: e instanceof Error ? e.message : String(e) });
            }
        },
    });
    // 模型目录（只读）：模型列表按 layer 分组，含字段绑定率（bound/total）
    const models = ctx.webServer.register({
        kind: 'exact',
        path: '/his-repo/models',
        handler: async (_req, res) => {
            try {
                const list = Object.values(ctx.hisModeling._state.models).map((m) => ({
                    file: m.file, name: m.name, cn: m.cn, domain: m.domain, layer: m.layer,
                    version: m.version, published: m.published,
                    bound: m.fields.filter((f) => f.std).length, total: m.fields.length,
                }));
                json(res, 200, { models: list });
            }
            catch (e) {
                json(res, 500, { error: e instanceof Error ? e.message : String(e) });
            }
        },
    });
    ctx.effect(() => () => { branches(); current(); tree(); models(); }, 'ui-his-repo: web routes');
}
