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
    readWorking(path: string): string | null;
    readCommitted(branch: string, path: string): string | null;
    writeWorking(path: string, content: string): unknown;
    /** 单调递增版本号：任何写操作/外部 git 变化自增。 */
    revision: number;
    /** 订阅仓变更；返回退订函数。 */
    subscribe(fn: () => void): () => void;
}
/** hisModeling 服务接口（domain-tools-modeling 注册的 Provider）——模型目录 + ER 图。 */
interface ModelField {
    n: string;
    t: string;
    c: string;
    std: string | null;
    pk?: boolean;
    skip?: string;
}
interface HisModelFace {
    _state: {
        models: Record<string, {
            file: string;
            name: string;
            cn: string;
            domain: string;
            layer: string;
            version: string;
            published: boolean;
            fields: ModelField[];
        }>;
    };
    readFields(file: string): {
        model: string;
        file: string;
        cn: string;
        domain: string;
        layer: string;
        version: string;
        published: boolean;
        fields: ModelField[];
        bindingRate: string;
    };
    genDdl(file: string): {
        model: string;
        version: string;
        ddl: string;
    };
}
/** hisAnchor 服务接口（workspace-anchor 注册）——锚定条读当前锚定 + 切换。 */
interface HisAnchorFace {
    getCurrent(): null | {
        kind: string;
        file?: string;
        branch?: string;
        dir?: string | null;
        path?: string | null;
        key: string;
        at: string;
    };
    anchor(args: {
        file?: string;
        branch?: string;
        dir?: string | null;
        path?: string | null;
    }): unknown;
}
/** hisDevAst 服务接口（domain-tools-dev 注册）——血缘上下行。 */
interface HisDevAstFace {
    upstream(repo: unknown, path: string): unknown[];
    downstream(repo: unknown, path: string): unknown[];
    parseEtl(text: string): unknown;
    parseDag(text: string): unknown;
    scanScriptJob(repo: unknown, modeling: unknown, onto: unknown, path: string): any | null;
}
/** hisDryrun 服务接口（domain-tools-dev 注册）——ETL dry-run 采样。 */
interface HisDryrunFace {
    dryrun(args: {
        sql: string;
        parsed: unknown;
        sampleRows?: number;
    }): Promise<unknown>;
}
/** hisOps 服务接口（domain-tools-ops 注册）——.ops 解析 + 配对校验。 */
interface HisOpsFace {
    parseOps(text: string): {
        action?: string;
        count?: number;
        layers?: unknown[];
        [k: string]: unknown;
    };
    provider: {
        catalog: Array<{
            path: string;
            name: string;
        }>;
        check(args: {
            names: string[];
            pauseText: string;
            resumeText: string;
        }): unknown;
    };
}
/** hisOntology 服务接口（domain-tools-ontology 注册）——本体扫描。 */
interface HisOntologyFace {
    classifyJob(job: unknown, ctx: unknown): {
        ok: boolean;
        jobType?: string;
        jobTypeName?: string;
        instance?: string;
        instanceName?: string;
        signals?: unknown[];
        [k: string]: unknown;
    };
    policiesFor(jobTypeId: string): {
        policies?: Array<{
            id: string;
            name: string;
            goal?: string;
            via?: string;
        }>;
    };
    rulesFor(jobTypeId: string): {
        ruleCount?: number;
        rules?: Array<{
            id: string;
            name: string;
            severity?: string;
            policy?: string;
            impl?: {
                engine?: string;
                ruleset?: string;
            } | null;
            via?: string;
        }>;
    };
    scanPlan(jobTypeId: string): unknown;
    consistencyCheck(path: string, ctx: unknown): {
        ok: boolean;
        status?: string;
        conflicts?: Array<{
            field: string;
            kind: string;
            design?: string;
            code?: string;
            note?: string;
        }>;
        releaseBaseline?: unknown;
        note?: string;
    };
    reasonChain(ctx: unknown, path: string): {
        ok: boolean;
        nodes?: Array<{
            id: string;
            type: string;
            name: string;
            sub?: string;
        }>;
        edges?: Array<{
            type: string;
            from: string;
            to: string;
            label: string;
        }>;
    };
    anchoredObject(ctx: unknown): {
        ok: boolean;
        anchored?: {
            objectType?: {
                type: string;
                typeName: string;
            };
            name?: string;
        };
        objectType?: {
            type: string;
            typeName: string;
        };
        relations?: Array<{
            link: string;
            count: number;
        }>;
        why?: string;
    };
    trace(): unknown;
    ontVersion: string;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        hisRepo: HisRepoFace;
        hisModeling: HisModelFace;
        hisAnchor: HisAnchorFace;
        hisDevAst: HisDevAstFace;
        hisOntology: HisOntologyFace;
        hisDryrun: HisDryrunFace;
        hisOps: HisOpsFace;
    }
}
export declare const name = "ui-his-repo";
export declare const inject: string[];
/** 挂载 /his-repo/* 只读 JSON 端点（分支列表 / 当前分支 / 文件树）。写操作（新建 SQL 等）后续接 gated 流程。 */
export declare function apply(ctx: Context): void;
export {};
//# sourceMappingURL=index.d.ts.map