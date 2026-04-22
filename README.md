# DevFlow

DevFlow 是一个基于 `Vite + React + TypeScript + Tauri` 的可视化软件开发工作台，围绕需求录入、产品规划、线框原型、交付物生成和 AI 辅助工作流组织。

## 开发命令

```bash
npm install
npm run dev
npm run build
npm run tauri dev
```

## 当前主结构

```text
src/
  components/
    ai/           AI 面板
    canvas/       原型画布与组件库
    product/      产品工作台
    project/      项目创建入口
    workspace/    文件浏览、聊天、终端
  modules/
    ai/           AI service 与全局 AI store
    scope-detector/
  store/          Zustand 业务状态
  types/          领域类型
  utils/          纯工具函数
src-tauri/        本地工具命令与桌面壳
```

## 推荐演进结构

```text
src/
  app/            应用装配、路由、全局样式
  features/
    project/
    product/
    design/
    delivery/
    workspace/
    ai/
  shared/
    ui/
    store/
    types/
    utils/
```

推荐原则：

- `features/*` 按业务域组织页面、组件、hooks、store，减少跨目录来回跳转。
- `shared/*` 只放跨域复用内容，避免新的“大杂烩 components/store/types”。
- `src-tauri` 继续只保留桌面壳和本地工具命令，不混入实验性后端。
