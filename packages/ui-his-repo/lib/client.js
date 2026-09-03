window.__ModuleLoader__.load({
	id: "@his/ui-his-repo",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/workspace-css.ts
		const SIDEBAR_CSS = "/* Rows (hisR_*) */.hisR_projectRow,.hisR_sessionRow{cursor:pointer;user-select:none;color:var(--dsw-alias-label-primary);border-radius:8px;align-items:center;gap:6px;padding:0 8px;display:flex}.hisR_projectRow:hover,.hisR_sessionRow:hover,.hisR_sessionRow.hisR_selected{background:var(--dsw-alias-interactive-bg-hover)}.hisR_searchResultRow{box-sizing:border-box;cursor:pointer;text-align:left;width:100%;min-height:48px;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:8px;flex-direction:column;align-items:stretch;padding:4px 8px;display:flex}.hisR_searchResultRow:hover,.hisR_searchResultRow.hisR_selected{background:var(--dsw-alias-interactive-bg-hover)}.hisR_searchResultHeading{align-items:center;min-width:0;display:flex}.hisR_searchResultTitle{text-overflow:ellipsis;white-space:nowrap;min-width:0;margin-left:4px;font-size:14px;line-height:20px;overflow:hidden}.hisR_searchResultMeta{align-items:center;gap:6px;min-width:0;margin-left:20px;display:flex}.hisR_searchResultWorkspace,.hisR_searchResultSnippet{text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:17px;overflow:hidden}.hisR_searchResultWorkspace{max-width:40%;color:var(--dsw-alias-label-tertiary);flex:none}.hisR_searchResultSnippet{min-width:0;color:var(--dsw-alias-label-secondary);flex:1}.hisR_projectRow{box-sizing:border-box;align-items:center;height:34px}.hisR_projectRow .hisR_rowActions{height:20px}.hisR_sessionRow{height:32px;animation:hisR_row-in .15s var(--ds-ease-in-out);gap:0}.hisR_sessionRow .hisR_title{margin:0 6px 0 4px}.hisR_flatSessionRowWithoutStatus .hisR_title{margin-left:0}@keyframes hisR_row-in{0%{opacity:0}}.hisR_slot{width:16px;height:20px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;display:inline-flex}.hisR_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}.hisR_folderActive{color:var(--dsw-alias-state-business-primary)}.hisR_projectRow .hisR_chevron{display:none}.hisR_projectRow:hover .hisR_chevron{display:inline-flex}.hisR_projectRow:hover .hisR_folder{display:none}.hisR_arrow{transition:transform .15s var(--ds-ease-in-out)}.hisR_arrowOpen{transform:rotate(90deg)}.hisR_projectText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}.hisR_title{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:14px;line-height:20px;overflow:hidden}.hisR_renameInput{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-elevated-fill);min-width:0;color:inherit;border-radius:4px;outline:none;padding:0 2px;font-size:14px;line-height:20px}.hisR_sessionRow .hisR_title{flex:1}.hisR_meta{text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px;overflow:hidden}.hisR_time{color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px;line-height:20px}.hisR_dot{flex:none}.hisR_rowActions{flex:none;align-items:center;gap:12px;display:none}.hisR_projectRow:hover .hisR_rowActions,.hisR_sessionRow:hover .hisR_rowActions,.hisR_projectRow.hisR_menuOpen .hisR_rowActions,.hisR_sessionRow.hisR_menuOpen .hisR_rowActions{display:inline-flex}.hisR_sessionRow:hover .hisR_time,.hisR_sessionRow.hisR_menuOpen .hisR_time{display:none}.hisR_projectRow.hisR_menuOpen,.hisR_sessionRow.hisR_menuOpen{background:var(--dsw-alias-interactive-bg-hover)}.hisR_sessionRow.hisR_dropBefore,.hisR_sessionRow.hisR_dropAfter{position:relative}.hisR_sessionRow.hisR_dropBefore:before,.hisR_sessionRow.hisR_dropAfter:after{content:\"\";z-index:1;background:linear-gradient(55deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 0 / 5px 7px no-repeat, linear-gradient(125deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 5px / 5px 7px no-repeat, linear-gradient(var(--dsw-alias-state-business-primary) 0 0) 4px 5px / calc(100% - 4px) 2px no-repeat;pointer-events:none;height:12px;position:absolute;left:0;right:4px}.hisR_sessionRow.hisR_dropBefore:before{top:-7px}.hisR_sessionRow.hisR_dropAfter:after{bottom:-7px}.hisR_hoverContent{flex-direction:column;gap:8px;display:flex}.hisR_hoverTitle{color:#fff;overflow-wrap:break-word;font-size:14px;line-height:20px}.hisR_hoverPath{color:#cfd3d6;word-break:break-all;font-size:12px;line-height:16px}.hisR_hoverTime{color:#cfd3d6;font-size:12px;line-height:16px}.hisR_hoverStatus{color:#adb2b8;align-items:center;gap:8px;font-size:12px;line-height:20px;display:flex}.hisR_iconButton{cursor:pointer;width:16px;height:16px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;border-radius:4px;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.hisR_iconButton:hover{color:var(--dsw-alias-label-primary)}.hisR_chevron{color:var(--dsw-alias-label-caption)}@media (prefers-reduced-motion:reduce){.hisR_sessionRow,.hisR_arrow{transition:none;animation:none}}\n/* WorkspaceBrowser (hisB_*) */.hisB_root{--dsh-session-list-edge-inset:var(--dsh-sidebar-inline-padding);--dsh-session-list-scrollbar-width:8px;--dsh-session-list-scrollbar-offset:2px;box-sizing:border-box;min-height:0;padding-right:var(--dsh-session-list-edge-inset);flex-direction:column;flex:1;display:flex}.hisB_root.hisB_rail{padding-right:0}.hisB_iconButton{cursor:pointer;width:28px;height:28px;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.hisB_iconButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.hisB_sectionHeader{box-sizing:border-box;height:36px;color:var(--dsw-alias-label-tertiary);border-radius:12px;flex:none;justify-content:flex-end;align-items:center;gap:4px;margin-bottom:4px;padding-left:4px;display:flex;overflow:hidden}.hisB_root:not(.hisB_rail) .hisB_sectionHeader{margin-top:2px;margin-right:-4px}.hisB_sectionLabel{white-space:nowrap;opacity:1;visibility:visible;min-width:0;max-width:45%;transition:max-width .18s var(--ds-ease-in-out), margin-right .18s var(--ds-ease-in-out), opacity .12s var(--ds-ease-in-out), transform .18s var(--ds-ease-in-out), visibility 0s linear;flex:none;line-height:20px;overflow:hidden}.hisB_sectionLabelHidden{opacity:0;visibility:hidden;max-width:0;margin-right:-4px;transition-delay:0s,0s,0s,0s,.18s;transform:translate(-4px)}.hisB_searchSlot{box-sizing:border-box;min-width:0;max-width:28px;transition:max-width .18s var(--ds-ease-in-out), padding-left .18s var(--ds-ease-in-out);flex:1;align-items:center;margin-left:auto;padding-left:0;display:flex}.hisB_searchSlotExpanded{max-width:100%;padding-left:0}.hisB_headerActions{opacity:1;visibility:visible;max-width:60px;transition:max-width .18s var(--ds-ease-in-out), opacity .12s var(--ds-ease-in-out), transform .18s var(--ds-ease-in-out), visibility 0s linear;flex:none;align-items:center;gap:4px;display:flex;overflow:hidden}.hisB_headerActionsHidden{opacity:0;visibility:hidden;pointer-events:none;max-width:0;transition-delay:0s,0s,0s,.18s;transform:translate(4px)}.hisB_search{box-sizing:border-box;cursor:text;width:100%;height:28px;color:var(--dsw-alias-label-secondary);transition:width .18s var(--ds-ease-in-out), padding .18s var(--ds-ease-in-out), border-color .18s var(--ds-ease-in-out), background-color .18s var(--ds-ease-in-out);background:0 0;border:none;border-radius:50%;flex:none;align-items:center;gap:0;margin:0;padding:0;display:flex;overflow:hidden}.hisB_searchExpanded{border:1px solid var(--dsw-alias-border-l2);width:calc(100% + 4px);height:30px;color:var(--dsw-alias-label-caption);background:0 0;border-radius:10px;margin-inline:-2px;padding:0 4px 0 0}.hisB_searchButton{cursor:pointer;width:28px;height:28px;color:inherit;background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.hisB_searchExpanded .hisB_searchButton{width:28px;height:30px}.hisB_searchButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.hisB_searchExpanded .hisB_searchButton:hover{background:0 0}.hisB_searchInput{opacity:0;pointer-events:none;width:0;min-width:0;color:var(--dsw-alias-label-primary);transition:opacity .12s var(--ds-ease-in-out);background:0 0;border:none;outline:none;flex:1;font-size:13px;line-height:18px}.hisB_searchExpanded .hisB_searchInput{opacity:1;pointer-events:auto;margin-left:-2px}.hisB_searchInput::placeholder{color:var(--dsw-alias-label-tertiary)}.hisB_clearButton{cursor:pointer;width:24px;height:24px;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.hisB_clearButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.hisB_rail .hisB_sectionHeader{justify-content:flex-start;gap:0;margin-bottom:12px;padding-left:0}.hisB_rail .hisB_headerActions{max-width:none}.hisB_rail .hisB_iconButton{width:36px;height:36px;color:var(--dsw-alias-label-primary)}.hisB_rail .hisB_search{background:0 0;border-color:#0000;gap:0;width:36px;height:36px;margin:0 0 12px;padding:0}.hisB_rail .hisB_searchButton{width:36px;height:36px;color:var(--dsw-alias-label-primary)}.hisB_rail .hisB_searchButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.hisB_listArea{min-height:0;margin-left:-4px;margin-right:calc(-1 * var(--dsh-session-list-edge-inset));flex-direction:column;flex:1;padding-left:4px;display:flex;overflow:visible}.hisB_rail .hisB_listArea{margin-left:0;margin-right:0;padding-left:0}.hisB_treeBody{flex-direction:column;flex:1;min-height:0;display:flex;position:relative}.hisB_fade{left:0;right:var(--dsh-session-list-edge-inset);background:linear-gradient(to bottom, transparent, var(--dsw-specific-sidebar-fill));pointer-events:none;height:24px;position:absolute;bottom:0}.hisB_wide{animation:hisB_wide-in .2s var(--ds-ease-in-out)}@keyframes hisB_wide-in{0%{opacity:0}}.hisB_list{min-height:0;margin-left:-4px;margin-right:var(--dsh-session-list-scrollbar-offset);padding-left:4px;padding-right:calc(var(--dsh-session-list-edge-inset) - var(--dsh-session-list-scrollbar-width) - var(--dsh-session-list-scrollbar-offset));scrollbar-gutter:stable;flex:1;padding-bottom:16px;overflow-y:auto}.hisB_flatList>*+*,.hisB_searchTree>[role=treeitem]+[role=treeitem],.hisB_groupSection>*+*{margin-top:2px}.hisB_searchStatus,.hisB_searchWarning{color:var(--dsw-alias-label-tertiary);padding:10px 12px;font-size:12px;line-height:18px}.hisB_searchWarning{color:var(--dsw-alias-label-secondary)}.hisB_groupSection{position:relative}.hisB_groupSection+.hisB_groupSection{margin-top:4px}.hisB_listTopDropIndicator,.hisB_workspaceDropBefore:before,.hisB_workspaceDropAfter:after{content:\"\";z-index:1;background:linear-gradient(55deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 0 / 5px 7px no-repeat, linear-gradient(125deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 5px / 5px 7px no-repeat, linear-gradient(var(--dsw-alias-state-business-primary) 0 0) 4px 5px / calc(100% - 4px) 2px no-repeat;pointer-events:none;height:12px;position:absolute;left:0;right:0}.hisB_listTopDropIndicator{top:-8px;left:0;right:var(--dsh-session-list-edge-inset)}.hisB_listTopDropActive>.hisB_workspaceDropBefore:first-child:before{display:none}.hisB_workspaceDropBefore:before{top:-8px}.hisB_workspaceDropAfter:after{bottom:-8px}.hisB_sessionOverflowButton{cursor:pointer;text-align:left;width:100%;height:28px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;border-radius:8px;padding:0 12px 0 28px;font-size:12px}.hisB_groupSection>.hisB_sessionOverflowButton{margin-top:0}.hisB_sessionOverflowButton:hover{color:var(--dsw-alias-label-secondary);background:0 0}.hisB_empty{color:var(--dsw-alias-label-tertiary);padding:16px 12px;font-size:13px}.hisB_renameInput{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);width:100%;height:44px;color:var(--dsw-alias-label-primary);background:0 0;border-radius:22px;outline:none;padding:7px 14px;font-size:14px;font-weight:400;line-height:22px}.hisB_renameInput:disabled{color:var(--dsw-alias-label-dimmed)}.hisB_renameError{color:var(--dsw-alias-state-error-primary);margin-top:8px;font-size:12px;line-height:18px}.hisB_deleteAction:not(:disabled){color:var(--dsw-alias-state-error-primary)}.hisB_deleteStatus{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}@media (prefers-reduced-motion:reduce){.hisB_wide{animation:none}.hisB_search,.hisB_sectionLabel,.hisB_searchSlot,.hisB_searchInput,.hisB_headerActions{transition:none}}";
		//#endregion
		//#region src/client/index.tsx
		/** HIS 数据工作台 client 端 — 侧栏「切换」形态（方案 A）：官方会话浏览默认原样；切换钮进 HIS 代码仓树视图。
		*  观感：注入官方 WorkspaceBrowser/Rows 的 CSS（类名前缀 hisB_/hisR_），行 DOM 逐像素复刻官方 projectRow/sessionRow，
		*        图标几何自官方 primitives（IconFolderOpen16/IconFolderClose16/IconTriangleRightFill14 原样 path）。 */
		const modeStore = (() => {
			let mode = "official";
			const listeners = /* @__PURE__ */ new Set();
			return {
				get: () => mode,
				isHis: () => mode === "his",
				toggle: () => {
					mode = mode === "official" ? "his" : "official";
					listeners.forEach((f) => f());
				},
				subscribe: (fn) => {
					listeners.add(fn);
					return () => {
						listeners.delete(fn);
					};
				}
			};
		})();
		function ensureCss() {
			if (typeof document === "undefined") return;
			const mark = "his-repo/sidebar";
			if (document.querySelector("style[data-plugin-css=\"" + mark + "\"]")) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "@his/ui-his-repo";
			tag.dataset.pluginCss = mark;
			tag.textContent = SIDEBAR_CSS;
			document.head.appendChild(tag);
		}
		async function fetchRepoTree(branch) {
			const out = {
				branches: [],
				current: "",
				tree: []
			};
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
		function buildTree(flat) {
			const root = {
				name: "",
				path: "",
				dirs: [],
				files: []
			};
			for (const f of flat) {
				const segs = f.path.split("/").filter(Boolean);
				let cur = root;
				let acc = "";
				for (let i = 0; i < segs.length - 1; i++) {
					acc = acc ? acc + "/" + segs[i] : segs[i];
					let next = cur.dirs.find((d) => d.path === acc);
					if (!next) {
						next = {
							name: segs[i],
							path: acc,
							dirs: [],
							files: []
						};
						cur.dirs.push(next);
					}
					cur = next;
				}
				cur.files.push(f);
			}
			const sortDir = (d) => {
				d.dirs.sort((a, b) => a.name < b.name ? -1 : 1);
				d.files.sort((a, b) => a.path < b.path ? -1 : 1);
				d.dirs.forEach(sortDir);
			};
			sortDir(root);
			return root;
		}
		/** 官方图标几何（自 @deepseek-ai/dsh-client-ui-primitives，path 原样）。 */
		function IconFolderOpen16({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z",
					fill: "currentColor"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					opacity: "0.2",
					d: "M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z",
					fill: "currentColor"
				})]
			});
		}
		function IconFolderClose16({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					transform: "translate(1.5 2.429)",
					d: "M5.05582 0.518756L4.50669 0.86654L5.05582 0.518756ZM13 9.4837L13.65 9.4837L13.65 3.53962L13 3.53962L12.35 3.53962L12.35 9.4837L13 9.4837ZM11.3264 1.86603L11.3264 1.21603L6.52313 1.21603L6.52313 1.86603L6.52313 2.51603L11.3264 2.51603L11.3264 1.86603ZM5.58054 1.34727L6.12968 0.999489L5.60495 0.170972L5.05582 0.518756L4.50669 0.86654L5.03141 1.69506L5.58054 1.34727ZM4.11323 1.23058e-13L4.11323 -0.65L1.67359 -0.65L1.67359 5.00699e-14L1.67359 0.65L4.11323 0.65L4.11323 1.23058e-13ZM0 1.67359L-0.65 1.67359L-0.65 9.4837L0 9.4837L0.65 9.4837L0.65 1.67359L0 1.67359ZM11.3264 11.1573L11.3264 10.5073L1.67359 10.5073L1.67359 11.1573L1.67359 11.8073L11.3264 11.8073L11.3264 11.1573ZM0 9.4837L-0.65 9.4837C-0.65 10.767 0.390308 11.8073 1.67359 11.8073L1.67359 11.1573L1.67359 10.5073C1.10828 10.5073 0.65 10.049 0.65 9.4837L0 9.4837ZM1.67359 5.00699e-14L1.67359 -0.65C0.390307 -0.65 -0.65 0.390309 -0.65 1.67359L0 1.67359L0.65 1.67359C0.65 1.10828 1.10828 0.65 1.67359 0.65L1.67359 5.00699e-14ZM5.05582 0.518756L5.60495 0.170972C5.28121 -0.340193 4.71829 -0.65 4.11323 -0.65L4.11323 1.23058e-13L4.11323 0.65C4.27282 0.65 4.4213 0.731715 4.50669 0.86654L5.05582 0.518756ZM6.52313 1.86603L6.52313 1.21603C6.36354 1.21603 6.21507 1.13431 6.12968 0.999489L5.58054 1.34727L5.03141 1.69506C5.35515 2.20622 5.91808 2.51603 6.52313 2.51603L6.52313 1.86603ZM13 3.53962L13.65 3.53962C13.65 2.25634 12.6097 1.21603 11.3264 1.21603L11.3264 1.86603L11.3264 2.51603C11.8917 2.51603 12.35 2.97431 12.35 3.53962L13 3.53962ZM13 9.4837L12.35 9.4837C12.35 10.049 11.8917 10.5073 11.3264 10.5073L11.3264 11.1573L11.3264 11.8073C12.6097 11.8073 13.65 10.767 13.65 9.4837L13 9.4837Z",
					fill: "currentColor"
				})
			});
		}
		function IconTriangleRight14({ size = 14, open }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 14 14",
				fill: "none",
				"aria-hidden": true,
				className: "hisR_arrow" + (open ? " hisR_arrowOpen" : ""),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z",
					fill: "currentColor"
				})
			});
		}
		/** footer 切换钮。 */
		function ToggleAction(props) {
			const isHis = (0, react.useSyncExternalStore)(modeStore.subscribe, modeStore.isHis);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: modeStore.toggle,
				title: isHis ? "返回会话浏览" : "HIS 数据工作台",
				className: "hisR_projectRow",
				style: {
					width: "100%",
					border: "none",
					background: isHis ? "var(--dsw-alias-interactive-bg-hover)" : "transparent",
					color: isHis ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-secondary)",
					cursor: "pointer",
					justifyContent: props.wide ? "flex-start" : "center",
					padding: props.wide ? "0 8px" : 0
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "hisR_slot",
					style: { fontSize: 14 },
					children: isHis ? "◀" : "▤"
				}), props.wide ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "hisR_title",
					style: { fontSize: 13 },
					children: isHis ? "返回会话浏览" : "HIS 数据工作台"
				}) : null]
			});
		}
		/** HIS 代码仓树视图。 */
		function HisRepoView(props) {
			const [repo, setRepo] = (0, react.useState)({
				branches: [],
				current: "",
				tree: []
			});
			const [error, setError] = (0, react.useState)("");
			const [collapsed, setCollapsed] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [selected, setSelected] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				ensureCss();
			}, []);
			(0, react.useEffect)(() => {
				let alive = true;
				(async () => {
					const r = await fetchRepoTree();
					if (!alive) return;
					setRepo(r);
					if (!r.branches.length && !r.tree.length) setError("代码仓服务未就绪");
				})();
				return () => {
					alive = false;
				};
			}, []);
			const pickBranch = async (b) => {
				setRepo((prev) => ({
					...prev,
					current: b
				}));
				setSelected("");
				const r = await fetchRepoTree(b);
				setRepo((prev) => ({
					...prev,
					tree: r.tree
				}));
			};
			const toggleDir = (p) => {
				setCollapsed((prev) => {
					const n = new Set(prev);
					if (n.has(p)) n.delete(p);
					else n.add(p);
					return n;
				});
			};
			const tree = (0, react.useMemo)(() => buildTree(repo.tree), [repo.tree]);
			if (!props.wide) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "hisB_root hisB_rail",
				style: { paddingTop: 4 },
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "hisB_sectionHeader",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "hisB_iconButton",
						onClick: props.expandSidebar,
						title: "HIS 数据工作台",
						style: { fontSize: 15 },
						children: "▤"
					})
				})
			});
			const rowBase = {
				width: "100%",
				cursor: "pointer",
				fontFamily: "inherit"
			};
			const renderDir = (d, depth) => {
				const isCollapsed = collapsed.has(d.path);
				const pad = 4 + depth * 14;
				const out = [];
				if (d.path) out.push(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					role: "treeitem",
					"aria-expanded": !isCollapsed,
					onClick: () => toggleDir(d.path),
					className: "hisR_projectRow",
					style: {
						...rowBase,
						paddingLeft: pad
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "hisR_slot hisR_folder" + (!isCollapsed ? " hisR_folderActive" : ""),
							children: isCollapsed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderClose16, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderOpen16, {})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "hisR_slot hisR_chevron",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconTriangleRight14, { open: !isCollapsed })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "hisR_projectText",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "hisR_title",
								children: d.name
							})
						})
					]
				}, "d" + d.path));
				if (!isCollapsed) {
					for (const sub of d.dirs) out.push(...renderDir(sub, depth + 1));
					for (const f of d.files) {
						const isSel = selected === f.path;
						out.push(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							role: "treeitem",
							"aria-selected": isSel,
							onClick: () => setSelected(f.path),
							className: "hisR_sessionRow hisR_flatSessionRowWithoutStatus" + (isSel ? " hisR_selected" : ""),
							style: {
								...rowBase,
								paddingLeft: pad + 14
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "hisR_title",
								children: f.path.slice(f.path.lastIndexOf("/") + 1)
							}), f.uncommitted || f.dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "hisR_time",
								style: { color: "var(--dsw-alias-state-error-primary)" },
								children: "未提交"
							}) : null]
						}, "f" + f.path));
					}
				}
				return out;
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "hisB_root",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "hisB_sectionHeader",
					role: "presentation",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "hisB_sectionLabel",
							style: {
								color: "var(--dsw-alias-label-tertiary)",
								fontSize: 13
							},
							children: "代码仓"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "hisB_headerActions",
							style: { maxWidth: "none" },
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								value: repo.current,
								onChange: (e) => void pickBranch(e.target.value),
								title: "分支",
								style: {
									height: 28,
									maxWidth: 120,
									borderRadius: 10,
									border: "1px solid var(--dsw-alias-border-l2)",
									background: "transparent",
									color: "var(--dsw-alias-label-primary)",
									fontSize: 12,
									padding: "0 4px",
									fontFamily: "inherit"
								},
								children: repo.branches.map((b) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: b,
									children: b
								}, b))
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "hisB_iconButton",
								onClick: modeStore.toggle,
								title: "返回会话浏览",
								style: { fontSize: 12 },
								children: "◀"
							})]
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "hisB_listArea",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "hisB_treeBody",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "hisB_list",
							role: "tree",
							children: error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "hisB_empty",
								style: { color: "var(--dsw-alias-state-error-primary)" },
								children: error
							}) : repo.tree.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "hisB_empty",
								children: "加载中…"
							}) : renderDir(tree, 0)
						})
					})
				})]
			});
		}
		const inject = ["slots"];
		function apply(ctx) {
			ensureCss();
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "his-workspace-toggle",
				order: 90,
				label: "数据工作台"
			}, (props) => ToggleAction(props)));
			ctx.slots.inject("sidebar.workspaces", () => {
				let disposeHis = null;
				const sync = () => {
					if (modeStore.isHis() && !disposeHis) disposeHis = ctx.slots.register({
						name: "sidebar.workspaces",
						priority: -1
					}, (props) => HisRepoView(props));
					else if (!modeStore.isHis() && disposeHis) {
						disposeHis();
						disposeHis = null;
					}
				};
				sync();
				const off = modeStore.subscribe(sync);
				return () => {
					off();
					if (disposeHis) {
						disposeHis();
						disposeHis = null;
					}
				};
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map