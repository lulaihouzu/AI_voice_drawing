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
  -> ExportController 按需导出 PNG
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

- 识别用户意图，例如创建、修改、移动、删除、导出
- 提取参数，例如图形类型、颜色、位置、大小、方向
- 将自然语言转换为结构化命令
- 对无法理解的指令返回错误原因

MVP 阶段采用规则解析：

- 图形词典：圆形、圆、矩形、方框、线、直线、箭头、文字
- 颜色词典：红色、蓝色、绿色、黄色、黑色、白色
- 位置词典：中间、左边、右边、上方、下方、左上角、右下角
- 动作词典：画、创建、改成、移动、删除、撤销、重做、清空、导出

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
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" }
  | { type: "export"; format: "png" };
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

后续可将状态保存到 localStorage 或导出为 JSON 工程文件。MVP 当前支持将画布对象序列化为 SVG，再通过浏览器 Canvas 转换并下载 PNG 图片。

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
    canvas/
      CanvasEngine.ts
      objectFactory.ts
      export.ts
    state/
      store.ts
    styles/
      app.css
  tests/
    parser.test.ts
    executor.test.ts
    store.test.ts
    export.test.ts
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
- `deleteObject`
- `clearCanvas`
- `exportPng`

这些 API 不直接绑定鼠标或键盘操作，而是由语音解析后的结构化命令统一调用。

### 9.3 规则指令解析

MVP 当前支持以下高频指令：

- “画一个红色圆形”
- “画一个蓝色矩形”
- “把它改成绿色”
- “把它向右移动一点”
- “删除它”
- “撤销”
- “重做”
- “清空画布”
- “导出为图片”

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
- 使用 SVG 序列化和浏览器 Canvas API 导出 PNG

### 9.7 测试覆盖

- 测试中文指令解析
- 测试上下文引用
- 测试撤销重做
- 测试导出功能

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

## 11. 浏览器兼容性

MVP 依赖浏览器语音识别能力，建议优先使用 Chrome 或 Edge 进行演示。部分浏览器可能不支持 Web Speech API，或者需要 HTTPS 环境才能稳定使用麦克风。

如果 Web Speech API 不可用，可以采用后续方案：

- 使用云端语音识别服务
- 使用本地语音识别模型
- 在演示模式中提供预设语音文本回放，但正式交付仍应以真实语音输入为主

## 12. 后续架构扩展

- 将 CommandParser 拆成规则解析器和 AI 语义解析器
- 增加工程文件保存与加载
- 增加图层系统和对象树
- 增加模板系统
- 增加服务端，用于用户文件存储和跨设备同步
- 增加更完整的自动化测试与性能监控
