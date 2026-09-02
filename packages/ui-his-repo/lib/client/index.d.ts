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
/** 注册会话视图 tab「代码仓」（conversation.view list 槽；chat=0 / trajectory=10 之后）。 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map