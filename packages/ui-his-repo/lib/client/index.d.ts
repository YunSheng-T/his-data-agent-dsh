import type { Context as ClientContext } from '@deepseek-ai/cordis';
declare module '@deepseek-ai/cordis' {
    interface Context {
        slots: {
            register(options: {
                name: string;
                id?: string;
                order?: number;
                label?: string;
            }, component: (props: never) => React.JSX.Element): () => void;
            inject(key: string, callback: () => (() => void) | Iterable<() => void>): () => void;
        };
    }
}
/** 依赖注入声明：apply 访问 ctx.slots 必须先 inject（cordis ctx 是代理，未声明即抛 without inject）。 */
export declare const inject: string[];
/** 注册会话视图 tab「代码仓」（conversation.view list 槽；chat=0 / trajectory=10 之后）。 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map