/** HIS 代码仓树插件 host 端：经 Typert RPC 暴露 hisRepo 服务（branches/treeWithState）给浏览器 client。 */
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'

/** hisRepo 服务接口（workspace-repo 注册的服务）——最小面，够代码仓树用。 */
interface HisRepoFace {
  branches(): string[]
  currentBranch(): string
  treeWithState(branch: string): Array<{ path: string; kind: string; dirty?: string; uncommitted?: boolean }>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    hisRepo: HisRepoFace
  }
}

export const inject = ['typert', 'hisRepo']

/** host 端 RPC 命名空间 owner：client 经 ctx.remote.hisRepo 调用。 */
export class HisRepoController extends TypertRemoteService {
  static inject = ['typert', 'hisRepo']

  constructor(ctx: Context) {
    super(ctx, 'hisRepoController', { namespace: 'hisRepo' })
  }

  @Remote('branches')
  branches(_req: unknown): string[] {
    return this.ctx.hisRepo.branches()
  }

  @Remote('currentBranch')
  currentBranch(_req: unknown): string {
    return this.ctx.hisRepo.currentBranch()
  }

  @Remote('tree')
  tree(req: { branch: string }): ReturnType<HisRepoFace['treeWithState']> {
    return this.ctx.hisRepo.treeWithState(req.branch)
  }
}

export function apply(ctx: Context): void {
  ctx.plugin(HisRepoController)
}
