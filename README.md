# 🌿 TreeChat

**Branching AI Conversations.** Explore, branch, and visualize your thoughts as an interactive tree.

TreeChat is a modern, privacy-focused chat interface for Large Language Models. Instead of linear chat histories that lock you into a single path, TreeChat lets you branch out at any point, experiment with different prompts, and visualize the entire conversation as a living, growing tree.

## ✨ Features

- **🌳 Interactive Tree Canvas** — Every conversation grows into a navigable node graph. Pan, zoom, and click through your entire history.
- **🔀 Seamless Branching** — Click any node on the canvas to jump back to that point, then send a new message. TreeChat creates a new branch with its own color-coded thread automatically.
- **✏️ Inline Editing** — Hover over any user message and click the pencil icon to edit it inline. The AI re-runs from that point, and downstream branches are cleanly removed.
- **🧠 Advanced Context Control** — Use the action buttons on canvas nodes to inject individual nodes (Network icon) or entire branch histories (Fork icon) as extra context for your next message.
- **🔌 Multi-Provider Support**
  - **Ollama** — Local, private, offline inference. Connects to any model you have pulled.
  - **Claude (Anthropic)** — Full Claude API support with live key validation in Settings.
- **💾 Local First & Private** — Conversations are stored entirely in your browser via IndexedDB. No account, no backend, no data leaving your machine.
- **💅 Premium Aesthetics** — Dark-mode glassmorphism UI with smooth animations and a polished, responsive layout.

## 📸 Preview

> Add a screenshot or GIF of the node canvas here — contributions welcome!

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [Ollama](https://ollama.com/) (optional — only needed for local inference)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/jnrdhn/TreeChat.git
   cd TreeChat
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

### Configuring Ollama (Required for local models)

Browsers block cross-origin requests by default. You must start Ollama with CORS enabled:

**Mac / Linux**
```bash
OLLAMA_ORIGINS="*" ollama serve
```

**Windows — Command Prompt**
```cmd
set OLLAMA_ORIGINS="*"
ollama serve
```

**Windows — PowerShell**
```powershell
$env:OLLAMA_ORIGINS="*"
ollama serve
```

## 🛠️ Built With

| Tool | Purpose |
|---|---|
| [React](https://react.dev/) + [Vite](https://vitejs.dev/) | Blazing-fast frontend framework & dev server |
| [TypeScript](https://www.typescriptlang.org/) | End-to-end type safety |
| [Zustand](https://zustand-demo.pmnd.rs/) | Lightweight, scalable state management |
| [React Flow](https://reactflow.dev/) | Interactive, draggable node canvas |
| [Dagre](https://github.com/dagrejs/dagre) | Automatic top-down tree layout algorithm |
| [idb](https://github.com/jakearchibald/idb) | IndexedDB wrapper for local persistence |
| [Vitest](https://vitest.dev/) | Unit testing for core domain logic |

## 💡 How to Use

1. **Start a chat** — Select a model from the dropdown in the input bar, type your first message, and hit Send.
2. **Watch the tree grow** — The left panel renders your conversation as a live node graph. Pan and zoom freely.
3. **Branch from any point** — Click a node on the canvas to set it as the active parent. Type a new message to fork the conversation from there with a new color-coded branch.
4. **Edit past messages** — Hover over a user bubble in the chat and click the ✏️ icon to edit it inline. The AI re-generates from that point.
5. **Inject cross-branch context** — Click the **Network** icon on a node to use that node's content as context, or the **Fork** icon to inject its full history. Pills appear in the input bar confirming what's included.
6. **Configure providers** — Click the ⚙️ gear icon in the sidebar to set your Ollama URL, add a Claude API key, or write a global system prompt.

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place. Any contributions you make are **greatly appreciated**.

1. Fork the project
2. Create your feature branch — `git checkout -b feature/amazing-feature`
3. Commit your changes — `git commit -m 'feat: add amazing feature'`
4. Push to the branch — `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for more information.
