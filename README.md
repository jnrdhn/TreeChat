# 🌿 TreeChat

**Branching AI Conversations.** Explore, branch, and visualize your thoughts as an interactive tree.

TreeChat is a modern, privacy-focused chat interface for Large Language Models. Instead of linear chat histories that lock you into a single path, TreeChat lets you branch out at any point, experiment with different prompts, and visualize the entire conversation as a living, growing tree.

## ✨ Features

- **🌳 Interactive Tree Canvas**: Every conversation is a tree. Pan, zoom, and drag around your conversation history using a beautifully rendered node graph.
- **🔀 Seamless Branching**: Want to see what happens if you tweak a prompt? Just edit a node or reply to an older message to instantly create a new branch. You never lose your train of thought.
- **🧠 Advanced Context Control**: Inject specific nodes or entire historical branches into your current context, allowing for complex, multi-threaded reasoning.
- **🔌 Multi-Model Support**:
  - **Ollama**: Connects seamlessly to your local Ollama instance for fast, private, offline inference.
  - **Claude (Anthropic)**: Full support for Anthropic's Claude API.
- **💾 Local First & Private**: Your conversations never leave your machine. Everything is stored locally in your browser via IndexedDB.
- **💅 Premium Aesthetics**: A modern, dark-mode UI with glassmorphism, smooth animations, and a polished user experience.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Ollama](https://ollama.com/) (if you plan to run models locally)

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/yourusername/TreeChat.git](https://github.com/jnrdhn/TreeChat.git)
   cd TreeChat
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   The application will be available at [http://localhost:5173](http://localhost:5173).

### Configuring Ollama (Important)

For TreeChat to communicate with your local Ollama instance from the browser, you **must** enable Cross-Origin Resource Sharing (CORS) on the Ollama server.

Start Ollama with the `OLLAMA_ORIGINS` environment variable:

**Mac/Linux:**
```bash
OLLAMA_ORIGINS="*" ollama serve
```

**Windows (Command Prompt):**
```cmd
set OLLAMA_ORIGINS="*"
ollama serve
```

**Windows (PowerShell):**
```powershell
$env:OLLAMA_ORIGINS="*"
ollama serve
```

## 🛠️ Built With

- **[React](https://react.dev/) + [Vite](https://vitejs.dev/)**: For a blazing fast frontend experience.
- **[Zustand](https://zustand-demo.pmnd.rs/)**: For simple, predictable global state management.
- **[React Flow](https://reactflow.dev/)**: Powers the interactive, draggable node canvas.
- **[Dagre](https://github.com/dagrejs/dagre)**: Handles the automatic, top-down tree layout.
- **[IndexedDB (idb)](https://github.com/jakearchibald/idb)**: Ensures robust, fast local persistence.

## 💡 How to Use

1. **Start a Chat:** Open the app and select your model (Ollama or Claude) from the dropdown. Type your first message to kick off the tree.
2. **Branch Out:** Double-click on any message in the chat history to branch from it, or edit your previous prompts to see how the AI responds differently.
3. **Manage Context:** Use the "Network" or "Fork" icons on the nodes in the canvas to feed different parts of the tree as context into your current active branch.
4. **Settings:** Click the gear icon in the sidebar to configure your Ollama Base URL, add your Claude API key, or define global system prompts.

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
