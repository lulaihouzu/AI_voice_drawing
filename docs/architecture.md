# AI 语音绘图工具技术架构文档

## 1. 架构目标

本工具的目标是实现“语音输入 -> 指令理解 -> 绘图执行 -> 画布反馈”的完整闭环。系统需要在不依赖鼠标和键盘的前提下，让用户通过自然语言完成绘图创作。

技术架构关注四个重点：

- 语音识别结果如何稳定进入系统
- 自然语言如何转换为结构化绘图指令
- 指令如何映射为可执行的画布操作
- 画布状态、上下文和历史记录如何维护

## 2. 推荐技术栈

MVP 推荐采用 Web 应用方式实现，便于演示、调试和跨平台运行。

| 层级 | 推荐方案 | 说明 |
| --- | --- | --- |
| 前端框架 | React + TypeScript + Vite | 快速搭建交互式单页应用 |
| 画布渲染 | SVG | 渲染基础图形、文本、线条和箭头 |
| 语音识别 | Web Speech API | 浏览器原生能力，适合 MVP 快速验证 |
| 状态管理 | Zustand | 管理画布对象、当前对象、历史记录、语音状态和导出请求 |
| 指令解析 | 本地规则解析 | MVP 保证稳定、低延迟、可测试 |
| 样式 | 普通 CSS | 控制界面布局和状态提示 |
| 测试 | Vitest | 单元测试指令解析、执行、状态闭环和导出 |

后续如果需要更强语音识别和语义理解能力，可以接入云端语音识别服务或大模型接口，但 MVP 优先保证本地规则链路可控。

## 3. 总体流程

```text
用户语音
  -> SpeechInput 获取音频并识别文本
  -> CommandParser 解析自然语言
  -> CommandNormalizer 补全默认值与上下文
  -> CommandExecutor 执行结构化指令
  -> CanvasEngine 更新画布对象
  -> StateManager 记录历史与当前对象
  -> FeedbackManager 给出操作反馈
  -> ExportController 按需导出 PNG/SVG/JSON
```

## 4. 模块设计

### 4.1 SpeechInput

职责：

- 请求麦克风权限
- 启动和停止语音识别
- 接收浏览器语音识别文本
- 将识别结果传给指令解析模块
- 处理识别失败、权限拒绝和超时

关键输出：

```ts
type SpeechResult = {
  text: string;
  confidence?: number;
  isFinal: boolean;
};
```

### 4.2 CommandParser

职责：

- 识别用户意图，例如创建、修改、移动、调整层级、删除、导出、保存、加载
- 提取参数，例如图形类型、颜色、位置、大小、方向
- 将自然语言转换为结构化命令
- 对无法理解的指令返回错误原因

MVP 阶段采用规则解析：

- 图形词典：圆形、圆、矩形、方框、线、直线、箭头、文字
- 颜色词典：红色、蓝色、绿色、黄色、黑色、白色
- 位置词典：中间、左边、右边、上方、下方、左上角、右下角
- 动作词典：画、创建、改成、移动、置顶、置底、前移、后移、删除、撤销、重做、清空、导出、保存、加载

后续可增加语义解析适配器：

```ts
interface SemanticParser {
  parse(text: string, context: CommandContext): Promise<ParsedCommand>;
}
```

### 4.3 CommandNormalizer

职责：

- 为缺失参数填入默认值
- 解析“它”“刚才那个”等上下文引用
- 将模糊表达转换为具体数值
- 将复合指令拆解为多个原子指令

示例：

```text
“把它向右移动一点”
  -> 当前对象 = lastActiveObject
  -> 方向 = right
  -> 距离 = 30px
```

### 4.4 CommandExecutor

职责：

- 接收结构化命令
- 调用 CanvasEngine 执行具体画布操作
- 处理撤销、重做、导出等全局命令
- 将执行结果返回给 FeedbackManager

结构化命令示例：

```ts
type DrawingCommand =
  | { type: "create"; shape: ShapeType; style?: ShapeStyle; position?: PositionSpec; text?: string }
  | { type: "update"; target: TargetSpec; patch: ShapePatch }
  | { type: "move"; target: TargetSpec; direction: Direction; distance?: number }
  | { type: "delete"; target: TargetSpec }
  | { type: "layer"; target: TargetSpec; action: "front" | "back" | "forward" | "backward" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" }
  | { type: "export"; format: "png" | "svg" | "json" }
  | { type: "project"; action: "save" | "load" };
```

### 4.5 CanvasEngine

职责：

- 创建和渲染画布对象
- 管理对象坐标、尺寸、颜色、层级
- 根据命令执行绘图操作
- 提供导出能力
- 提供对象查询能力，例如按类型、位置或最近编辑时间查找对象

建议对象模型：

```ts
type CanvasObject = {
  id: string;
  type: "circle" | "rect" | "line" | "arrow" | "text";
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  rotation?: number;
  style: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    fontSize?: number;
  };
  text?: string;
  createdAt: number;
  updatedAt: number;
};
```

### 4.6 StateManager

职责：

- 保存当前画布对象列表
- 保存当前选中对象或最近操作对象
- 维护撤销栈和重做栈
- 维护浏览器本地工程快照
- 保存最近语音识别文本和执行结果
- 为上下文解析提供状态

推荐状态：

```ts
type AppState = {
  objects: CanvasObject[];
  activeObjectId?: string;
  lastCreatedObjectId?: string;
  lastCommandText?: string;
  undoStack: CanvasSnapshot[];
  redoStack: CanvasSnapshot[];
  feedback: FeedbackMessage[];
};
```

### 4.7 FeedbackManager

职责：

- 展示识别文本
- 展示执行结果
- 提示错误原因
- 在需要时向用户追问
- 后续可扩展为语音播报

反馈示例：

- “已创建红色圆形。”
- “没有找到可以删除的对象。”
- “请说明要修改哪个图形。”
- “暂不支持这个指令，你可以试试说：画一个蓝色矩形。”

### 4.8 AiCommandProvider

职责：

- 定义可替换的 AI 指令解析 provider 接口
- 接收语音文本和当前画布上下文
- 返回结构化 `DrawingCommand[]` 草案，而不是直接操作画布
- 标记是否需要用户确认
- 在无法生成命令时返回原因和建议

当前实现：

- `MockAiCommandProvider`：本地 deterministic mock，不请求网络，不需要 API key。
- mock 场景覆盖用户登录、注册、订单支付、客服工单、审批、项目发布、三步流程图和强调当前图形。
- `validateDrawingCommands`：对 AI 命令草案做 allow-list 校验、字段清洗和错误反馈。
- `HttpAiCommandProvider`：通过 HTTP POST 调用后端代理或本地 AI 服务，自动处理超时、HTTP 错误、非法 JSON 和 schema 校验失败。
- `createConfiguredAiCommandProvider`：从 `VITE_AI_COMMAND_ENDPOINT` 读取服务地址，避免把模型 API key 放进前端包。
- `AiCommandPlanner`：封装 provider 调用结果，保存待澄清问题，用户补充后重新生成结构化命令计划。
- `server/deepseekProxy.mjs`：本地 Node 代理服务，从 `DEEPSEEK_API_KEY` 读取密钥，调用 DeepSeek Chat Completions 接口并输出前端协议 JSON。
- `runVoiceCommandText`：规则解析失败且 AI 解析开启时进入 planner；AI 命令计划需要语音确认后才执行。

## 5. 指令执行机制

### 5.1 单步指令

输入：

```text
画一个红色圆形
```

解析结果：

```json
{
  "type": "create",
  "shape": "circle",
  "style": {
    "fill": "red"
  },
  "position": {
    "region": "center"
  }
}
```

执行结果：

- 创建圆形对象
- 设置填充色为红色
- 放置在画布中心
- 更新当前对象为新圆形
- 写入历史记录
- 输出成功反馈

### 5.2 上下文指令

输入：

```text
把它放大一点
```

解析结果：

```json
{
  "type": "update",
  "target": {
    "ref": "active"
  },
  "patch": {
    "scale": 1.2
  }
}
```

执行前会通过 StateManager 查找当前对象。如果当前对象不存在，则返回需要补充目标对象的反馈。

### 5.3 复合指令

输入：

```text
画两个圆，并用箭头连接
```

拆解结果：

```json
[
  {
    "type": "create",
    "shape": "circle",
    "position": {
      "region": "left"
    }
  },
  {
    "type": "create",
    "shape": "circle",
    "position": {
      "region": "right"
    }
  },
  {
    "type": "create",
    "shape": "arrow",
    "from": {
      "ref": "previous:0"
    },
    "to": {
      "ref": "previous:1"
    }
  }
]
```

执行时需要顺序执行，并将前两步创建的对象 ID 传给第三步。

## 6. 错误处理

| 场景 | 处理方式 |
| --- | --- |
| 麦克风权限被拒绝 | 提示用户开启浏览器麦克风权限 |
| 语音无法识别 | 提示用户重新说一遍 |
| 指令无法解析 | 给出可用指令示例 |
| 目标对象不存在 | 追问用户要操作哪个对象 |
| 参数缺失 | 使用默认值或追问 |
| 执行失败 | 保持画布不变并反馈失败原因 |

## 7. 数据与历史记录

MVP 阶段可以将画布状态保存在浏览器内存中。每次执行会改变画布的命令前，先保存一份快照到撤销栈。

撤销流程：

```text
当前状态 -> redoStack
undoStack 栈顶 -> 当前状态
```

重做流程：

```text
当前状态 -> undoStack
redoStack 栈顶 -> 当前状态
```

当前支持将状态保存到 localStorage，也支持导出带版本字段的 JSON 工程文件。导出层可将画布对象序列化为 SVG 后直接下载 SVG 文件，或通过浏览器 Canvas 转换并下载 PNG 图片。

## 8. 当前目录结构

```text
AI_voice_drawing/
  README.md
  docs/
    product.md
    architecture.md
    design.md
  package.json
  index.html
  src/
    main.tsx
    App.tsx
    components/
      CanvasView.tsx
      VoicePanel.tsx
      FeedbackPanel.tsx
      ExportController.tsx
    speech/
      SpeechInput.ts
    commands/
      parser.ts
      normalizer.ts
      executor.ts
      types.ts
    ai/
      index.ts
      types.ts
      commandPlanner.ts
      configuredProvider.ts
      mockCommandProvider.ts
      commandSchema.ts
      httpCommandProvider.ts
    canvas/
      CanvasEngine.ts
      objectFactory.ts
      export.ts
      project.ts
      projectStorage.ts
    state/
      store.ts
    styles/
      app.css
  tests/
    parser.test.ts
    executor.test.ts
    store.test.ts
    export.test.ts
    aiProvider.test.ts
    aiPlanner.test.ts
    commandSchema.test.ts
    httpAiProvider.test.ts
```

## 9. 当前实现方式

### 9.1 工程基础

当前项目已采用 Vite + React + TypeScript 搭建前端单页应用，并使用 Vitest 做单元测试。

```bash
npm install
```

当前运行依赖为 React、React DOM、Zustand 和 lucide-react；画布渲染由项目内自研 SVG 渲染层完成，没有引入 Fabric、Konva 等第三方画布业务库。

### 9.2 画布引擎

画布操作 API 集中在 `src/canvas` 与 `src/commands/executor.ts` 中：

- `createCircle`
- `createRect`
- `createLine`
- `createArrow`
- `createText`
- `updateObject`
- `moveObject`
- `reorderObject`
- `deleteObject`
- `clearCanvas`
- `exportPng`
- `exportSvg`
- `exportJson`
- `saveProject`
- `loadProject`

这些 API 不直接绑定鼠标或键盘操作，而是由语音解析后的结构化命令统一调用。

### 9.3 规则指令解析

MVP 当前支持以下高频指令：

- “画一个红色圆形”
- “画一个蓝色矩形”
- “把它改成绿色”
- “把它向右移动一点”
- “把它置顶”
- “把左边那个圆上移一层”
- “删除它”
- “撤销”
- “重做”
- “清空画布”
- “导出为图片”
- “导出为 SVG”
- “导出为 JSON”
- “导出工程文件”
- “保存工程”
- “加载工程”

每条语音文本都转换成 `DrawingCommand`。

### 9.4 语音识别

使用浏览器 `SpeechRecognition` 或 `webkitSpeechRecognition`：

- 设置语言为 `zh-CN`
- 开启连续识别或按需识别
- 获取最终识别结果
- 将文本传给 CommandParser

### 9.5 执行链路

完整调用链：

```ts
speechInput.onResult((text) => {
  const parsed = commandParser.parse(text, state.getContext());
  const commands = commandNormalizer.normalize(parsed, state.getContext());
  const result = commandExecutor.execute(commands);
  feedbackManager.show(result.message);
});
```

### 9.6 反馈与导出

- 在界面展示最近识别文本
- 在界面展示执行结果
- 无法理解时展示建议指令
- 使用 SVG 序列化直接导出 SVG
- 使用 SVG 序列化和浏览器 Canvas API 导出 PNG
- 使用 JSON 序列化导出工程文件
- 使用 localStorage 保存和加载浏览器本地工程快照

### 9.7 测试覆盖

- 测试中文指令解析
- 测试上下文引用
- 测试撤销重做
- 测试图层顺序调整
- 测试导出功能
- 测试 AI mock provider 的命令计划和失败反馈
- 测试 AI 命令 schema 校验和 HTTP AI provider 的服务调用、失败降级
- 测试 AI command planner 的复杂命令计划、待澄清状态和用户回答补全
- 测试 AI 解析开关、语音开关指令、AI fallback 和确认执行入口
- 测试一句话主题图示模板生成和 AI 语音确认执行闭环
- 测试 AI 画布总结、优化建议和洞察反馈闭环
- 测试 DeepSeek 代理请求体、模型 JSON 解析、配置失败和代理响应归一化

### 9.8 AI 适配器

当前 AI 适配器位于 `src/ai`：

- `AiCommandProvider`：统一 provider 接口。
- `AiCommandContext`：传递画布对象、当前对象和最近对象等上下文。
- `AiCommandResult`：区分可执行命令草案、洞察反馈与失败反馈。
- `MockAiCommandProvider`：测试和演示用 provider，不访问真实模型。
- `MockAiCommandProvider` 内置主题模板，支持将“生成订单支付流程图”等一句话转换为顺序节点和连接箭头。
- `canvasInsights`：根据当前画布对象生成中文内容总结和优化建议。
- `validateDrawingCommands`：校验未知 JSON 是否为合法 `DrawingCommand[]`，并返回清洗后的命令数组。
- `HttpAiCommandProvider`：向配置的 AI 解析服务发送 `{ text, context }`，并把命令响应或 `kind: "insight"` 洞察响应转换为统一的 `AiCommandResult`。
- `server/deepseekProxy.mjs`：真实模型代理，要求 DeepSeek 使用 JSON 对象返回命令、洞察或失败结果。
- `createConfiguredAiCommandProvider`：读取 `import.meta.env.VITE_AI_COMMAND_ENDPOINT` 创建 HTTP provider。
- `AiCommandPlanner`：把 provider 命令结果整理为可确认的命令计划；把洞察结果直接返回给反馈链路；遇到“没有当前对象”等可补充失败时生成 `AiClarification`，等待用户下一句语音补全。

HTTP provider 的请求体只包含用户文本、当前对象 ID、最近对象 ID、语言和序列化后的画布对象概要，不包含浏览器密钥。真实模型 API key 必须保存在后端代理或本地服务中。当前已提供 DeepSeek 本地代理，使用 `DEEPSEEK_API_KEY` 调用 `https://api.deepseek.com/chat/completions`。未配置 `VITE_AI_COMMAND_ENDPOINT` 时，前端使用 mock provider 保证本地演示可用。AI 命令计划默认进入待确认状态，用户说“确认执行”后才进入执行器；画布总结、优化建议等洞察结果只进入反馈面板和语音播报，不进入执行器。

## 10. 如何运行

当前仓库已包含可运行的前端 MVP。推荐使用 Chrome 或 Edge 进行语音演示。

### 10.1 安装依赖

```bash
npm install
```

### 10.2 启动开发环境

```bash
npm run dev
```

启动后打开终端显示的本地地址，通常是：

```text
http://localhost:5173
```

### 10.3 授权麦克风

浏览器会请求麦克风权限。用户需要允许麦克风访问，否则语音输入功能无法工作。

### 10.4 构建生产版本

```bash
npm run build
```

### 10.5 本地预览生产版本

```bash
npm run preview
```

### 10.6 运行测试

```bash
npm run test
```

### 10.7 配置 AI 解析服务

```bash
VITE_AI_COMMAND_ENDPOINT=/api/ai/commands npm run dev
```

该地址应由后端代理或本地服务提供，建议返回以下 JSON 结构：

```json
{
  "commands": [
    {
      "type": "create",
      "shape": "circle",
      "style": {
        "fill": "#ef4444"
      }
    }
  ],
  "explanation": "生成一个红色圆形。",
  "confidence": 0.8,
  "requiresConfirmation": true
}
```

如果服务无法生成命令，可返回：

```json
{
  "ok": false,
  "reason": "模型暂时不可用。",
  "suggestions": ["稍后再试"],
  "retryable": true
}
```

前端收到响应后会先执行 JSON 解析、服务失败判断和 `validateDrawingCommands` 校验，校验失败时不会进入命令执行链路。

洞察类响应可返回：

```json
{
  "kind": "insight",
  "message": "当前画布共有 3 个对象，建议增加箭头连接关键节点。",
  "explanation": "生成画布优化建议。",
  "confidence": 0.8
}
```

洞察类响应不需要用户确认，也不会修改画布。

### 10.8 使用 DeepSeek 真实模型代理

先在一个终端启动本地代理：

```bash
export DEEPSEEK_API_KEY=你的_DeepSeek_API_Key
npm run ai:deepseek
```

再在另一个终端启动已连接代理的前端：

```bash
npm run dev:ai
```

默认代理地址为：

```text
http://localhost:8787/api/ai/commands
```

可选环境变量：

```bash
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
AI_PROXY_PORT=8787
AI_PROXY_CORS_ORIGIN=*
```

代理服务会把前端传来的语音文本和画布上下文发给 DeepSeek，要求模型返回 JSON 对象。代理会归一化三类结果：

- `commands`：可执行命令草案，前端还会再次执行 schema 校验。
- `kind: "insight"`：画布总结或优化建议，只进入反馈播报。
- `ok: false`：模型或代理无法生成结果时的失败反馈。

## 11. 浏览器兼容性

MVP 依赖浏览器语音识别能力，建议优先使用 Chrome 或 Edge 进行演示。部分浏览器可能不支持 Web Speech API，或者需要 HTTPS 环境才能稳定使用麦克风。

如果 Web Speech API 不可用，可以采用后续方案：

- 使用云端语音识别服务
- 使用本地语音识别模型
- 在演示模式中提供预设语音文本回放，但正式交付仍应以真实语音输入为主

## 12. 后续架构扩展

后续拓展会按照 [`docs/ai-expansion-roadmap.md`](ai-expansion-roadmap.md) 分模块推进。

### 12.1 拓展基础能力

- 已增加对象命名和按名称引用能力，支持更精确的语音编辑。
- 已增加按位置、类型和尺寸定位对象的能力，例如左边圆形、右边圆形、最大矩形。
- 已增加 SVG 文件导出能力。
- 已增加 JSON 工程文件导出和浏览器本地工程保存/加载能力。
- 已增加图层顺序调整能力，支持置顶、置底、上移一层和下移一层。
- 后续增加图层面板和对象树，为复杂画布管理做准备。
- 增加模板系统，例如流程图节点、判断节点和思维导图节点。

### 12.2 AI 指令理解

AI 能力不直接操作 DOM、SVG 或应用状态，而是输出结构化命令草案：

```text
语音文本
  -> 规则解析优先
  -> AI 解析适配器
  -> 结构化命令草案
  -> 命令 schema 校验
  -> CommandExecutor
```

关键约束：

- 已增加 `AiCommandProvider` 接口和 `MockAiCommandProvider`。
- 已增加 `validateDrawingCommands` 命令 schema 校验器。
- 已增加 `HttpAiCommandProvider` 和 `VITE_AI_COMMAND_ENDPOINT` 配置入口，用于对接后端代理或本地 AI 服务。
- 已增加 DeepSeek 本地代理服务，真实模型 API key 只保存在代理进程环境变量中。
- 已增加 `AiCommandPlanner`，支持复杂命令计划和多轮澄清状态。
- 已增加 AI 解析开关、语音开关指令、待确认计划和前端执行入口。
- 已增加一句话生成图示基础模板，mock provider 可生成多类流程图命令计划。
- 已增加 AI 洞察反馈，支持画布内容总结和优化建议。
- 可执行 AI 输出必须经过命令 schema 校验。
- 洞察类 AI 输出只允许作为文本反馈，不进入命令执行器。
- 测试环境默认使用 mock provider。
- 真实模型调用应通过后端代理或本地服务注入密钥，不把 API key 打包进前端。
- AI 解析失败时回退到规则解析反馈链路。

### 12.3 交付增强

- 增加更完整的自动化测试与错误路径测试。
- 固化 demo 脚本和浏览器兼容说明。
- 在 README 中补充最终 demo 视频链接。
