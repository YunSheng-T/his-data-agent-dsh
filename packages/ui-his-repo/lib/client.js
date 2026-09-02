window.__ModuleLoader__.load({
	id: "@his/ui-his-repo",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/index.tsx
		/** HIS 代码仓树 client 端：注册为会话视图 tab（conversation.view，仿 ui-trajectory），
		*  同源 fetch host 的 /his-repo/* JSON 端点（ctx.webServer 注册）展示分支 + 文件树。 */
		async function fetchRepoState(branch) {
			const out = {};
			try {
				const [b, c, t] = await Promise.all([
					fetch("/his-repo/branches").then((r) => r.json()),
					fetch("/his-repo/current-branch").then((r) => r.json()),
					fetch(branch ? "/his-repo/tree?branch=" + encodeURIComponent(branch) : "/his-repo/tree").then((r) => r.json())
				]);
				if (b && Array.isArray(b.branches)) out.branches = b.branches;
				if (c && typeof c.current === "string") out.current = c.current;
				if (t && Array.isArray(t.tree)) {
					out.current = t.branch ?? out.current;
					out.tree = t.tree;
				}
			} catch {}
			return out;
		}
		/** 分支 + 文件树面板（会话视图 tab 内容）。 */
		function HisRepoPanel() {
			const [branches, setBranches] = (0, react.useState)([]);
			const [current, setCurrent] = (0, react.useState)("");
			const [tree, setTree] = (0, react.useState)([]);
			const [error, setError] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				let alive = true;
				(async () => {
					const s = await fetchRepoState();
					if (!alive) return;
					setBranches(s.branches ?? []);
					setCurrent(s.current ?? "");
					setTree(s.tree ?? []);
					if (!s.branches && !s.tree) setError("代码仓服务未就绪（host 未挂载 workspace-repo）");
				})();
				return () => {
					alive = false;
				};
			}, []);
			const pick = async (b) => {
				setCurrent(b);
				const s = await fetchRepoState(b);
				if (s.tree) setTree(s.tree);
			};
			const rows = tree.length ? tree.map((t) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					padding: "2px 0 2px 12px",
					whiteSpace: "nowrap",
					overflow: "hidden",
					textOverflow: "ellipsis"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: t.kind === "dir" ? "#d8a24a" : "#9aa4b2",
							marginRight: 6,
							fontFamily: "monospace"
						},
						children: t.kind === "dir" ? "▸" : "·"
					}),
					t.path,
					t.uncommitted ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: "#e5484d",
							marginLeft: 6
						},
						children: "未提交"
					}) : null,
					t.dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: "#e5484d",
							marginLeft: 6
						},
						children: "已修改"
					}) : null
				]
			}, t.path)) : error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					padding: 8,
					color: "#e5484d"
				},
				children: error
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					padding: 8,
					color: "#888"
				},
				children: "加载中…"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					padding: "12px 16px",
					fontSize: 13,
					height: "100%",
					display: "flex",
					flexDirection: "column"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						marginBottom: 8,
						display: "flex",
						alignItems: "center",
						gap: 8
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontWeight: 600,
							color: "#d0d4da"
						},
						children: "代码仓"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
						value: current,
						onChange: (e) => void pick(e.target.value),
						style: {
							flex: 1,
							minWidth: 0,
							background: "#1b1f27",
							color: "#d0d4da",
							border: "1px solid #2c323c",
							borderRadius: 4,
							padding: "3px 6px",
							fontSize: 12
						},
						children: branches.map((b) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: b,
							children: b
						}, b))
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						overflow: "auto",
						flex: 1,
						fontFamily: "monospace",
						fontSize: 12,
						color: "#c8ccd2"
					},
					children: rows
				})]
			});
		}
		/** 注册会话视图 tab「代码仓」（conversation.view list 槽；chat=0 / trajectory=10 之后）。 */
		function apply(ctx) {
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "his-repo",
				order: 20,
				label: "代码仓"
			}, () => HisRepoPanel()));
		}
		//#endregion
		exports.apply = apply;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map