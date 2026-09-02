import type { Context } from '@deepseek-ai/cordis';
/** hisRepo 服务接口（workspace-repo 注册的服务）——最小面，够代码仓树用。 */
interface HisRepoFace {
    branches(): string[];
    currentBranch(): string;
    treeWithState(branch: string): Array<{
        path: string;
        kind: string;
        dirty?: string;
        uncommitted?: boolean;
    }>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        hisRepo: HisRepoFace;
    }
}
export declare const name = "ui-his-repo";
export declare const inject: string[];
/** 挂载 /his-repo/* 只读 JSON 端点（分支列表 / 当前分支 / 文件树）。写操作（新建 SQL 等）后续接 gated 流程。 */
export declare function apply(ctx: Context): void;
export {};
//# sourceMappingURL=index.d.ts.map