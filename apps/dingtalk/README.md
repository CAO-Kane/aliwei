# apps/dingtalk — 钉钉端占位

本目录是钉钉端前端的预留位置,**当前为空骨架**,只锁定 monorepo 拓扑。

## 计划方案

钉钉 H5 应用接入时,需要做的事:

1. 选框架:Next.js 复用(SSR + JS-SDK)/ Vite + React(纯 SPA)/ uni-app(同时出 H5 和小程序)
2. 复用 `packages/*`:
   - `@aliwei/domain` — AGENTS 数组 + 黑话词库(完全无改动;prompts 在 apps/api 里)
   - `@aliwei/ui` — 大部分 assistant-ui 组件可直接用,`cn` 也在这
3. 钉钉特有逻辑放本 app 内:
   - `src/client/auth/dingtalk-sso.ts` — 钉钉免登(替代 guest_id cookie)
   - `src/client/sdk/` — 钉钉 JS-SDK 包装(jsapi 鉴权、扫码、文件选择等)
4. **后端复用 apps/api**,不需要新起一个。钉钉端 fetch 时 `Authorization: Bearer <钉钉返回的 token>`(或 corpId),api 端加一个识别中间件就行。CORS origin 白名单加上钉钉的 H5 域名。

实现前应先建一份钉钉版的 spec,放到 `docs/superpowers/specs/`。
