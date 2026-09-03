import type { Context as ClientContext } from '@deepseek-ai/cordis';
declare module '@deepseek-ai/cordis' {
    interface Context {
        slots: {
            register(options: {
                name: string;
                priority?: number;
                id?: string;
                order?: number;
                label?: string;
            }, component: (props: never) => React.JSX.Element): () => void;
            inject(key: string, callback: () => (() => void) | Iterable<() => void>): () => void;
        };
    }
}
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map