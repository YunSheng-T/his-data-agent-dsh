// @his/studio 本体扫描 UI 结构断言（P5 · 对齐 verifier v12 静态断言语义）
// 真实 studio 前端是数据驱动（非原型硬编码文本），故做源码结构断言：本体扫描页签/分派/viewScriptScan/CSS/端点齐全。
// 用法：node tests/regression/assert-ontology-scan.mjs；run-all 自动发现。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const studio = path.resolve(here, '../../packages/studio-ui')
const html = fs.readFileSync(path.join(studio, 'public/index.html'), 'utf8')
const srv = fs.readFileSync(path.join(studio, 'index.js'), 'utf8')

const checks = []
const check = (label, ok, extra = '') => { checks.push(ok); console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (extra ? ' — ' + extra : '')) }

// 页签常量
check('SCRIPT_TABS 含 code/scan/lineage', html.includes("SCRIPT_TABS = [['code','脚本代码'],['scan','扫描'],['lineage','血缘影响']]"))
check('SVC_TABS 含 code/lineage', html.includes("SVC_TABS = [['code','定义代码'],['lineage','血缘影响']]"))

// 文件类型派发
check('renderRepoWs 分派 script（scan→viewScriptScan）', html.includes("f.kind === 'script'") && html.includes('viewScriptScan(f)'))
check('renderRepoWs 分派 svc', html.includes("f.kind === 'svc'"))
check('renderSubTabs 分派 script/svc', html.includes("fkind === 'script' ? SCRIPT_TABS") && html.includes("fkind === 'svc' ? SVC_TABS"))

// viewScriptScan 本体扫描页
check('viewScriptScan 函数存在', html.includes('function viewScriptScan'))
check('viewScriptScan 调 onto-scan 端点', html.includes("/api/repo/onto-scan?path="))

// 本体扫描 CSS 类
for (const cls of ['onto-head', 'onto-badge', 'onto-stats', 'lnk-wrap', 'lnk-node', 'lnk-edge', 'lnk-inh', 'trc', 'inc-wrap', 'fnd']) {
  check('CSS .' + cls, html.includes('.' + cls))
}

// studio 后端端点与文件类型
check('studio index 含 onto-scan 端点', srv.includes("/api/repo/onto-scan"))
check('studio index file kind script', srv.includes(".endsWith('.sql') ? 'script'"))
check('studio index file kind svc', srv.includes(".endsWith('.svc') ? 'svc'"))
check('studio index inject 含 hisOntology', srv.includes("'hisOntology'"))

const pass = checks.filter(Boolean).length
console.log('\n== ontology-scan: ' + pass + '/' + checks.length + ' 通过 ==')
process.exit(pass === checks.length ? 0 : 1)
