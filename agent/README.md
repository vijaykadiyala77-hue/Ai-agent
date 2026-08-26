# DevAgent.ai - Autonomous Coding Companion

![DevAgent.ai Banner](https://via.placeholder.com/1200x400/0066CC/FFFFFF?text=DevAgent.ai+Autonomous+Coding+Companion)

An AI-powered coding assistant that helps you write, modify, and manage code in your GitHub repository through natural language interactions. Powered by Google Gemini and designed for seamless GitHub integration.

## 🚀 Features

- **Autonomous Coding**: Create, update, and delete files in your GitHub repo via natural language
- **Intelligent Assistance**: Get help with coding questions, debugging, and code explanations
- **GitHub Integration**: Directly commit changes to your repository with proper commit messages
- **Multi-language Support**: Understands and responds in English, Telugu, Tenglish (Telugu-English), and Hinglish
- **Secure Proxy Architecture**: Node.js/Express backend securing communication with n8n workflows
- **FastAPI Backend**: High-performance Python backend powered by Google Gemini
- **Real-time Collaboration**: See pending changes and confirm before committing

## 🏗️ Architecture

DevAgent.ai consists of three main components:

1. **Frontend**: HTML/CSS/JavaScript interface (served by the backend)
2. **Node.js Proxy Server**: Secure Express server that routes requests to n8n workflows
3. **FastAPI Backend**: Python server handling AI logic and GitHub operations

```
┌─────────────────┐    ┌──────────────────┐    ┌────────────────────┐
│   Frontend      │───▶│  Node.js Proxy   │───▶│   FastAPI Backend  │
│ (HTML/JS/CSS)   │    │  (Express)       │    │  (Python/FastAPI)  │
└─────────────────┘    └──────────────────┘    └────────────────────┘
                                                     │
                                                     ▼
                                              ┌─────────────────┐
                                              │   GitHub API    │
                                              └─────────────────┘
                                                     │
                                                     ▼
                                              ┌─────────────────┐
                                              │ Google Gemini   │
                                              └─────────────────┘
```

## 📋 Prerequisites

- Node.js 18+
- Python 3.10+
- Google Gemini API Key
- GitHub Personal Access Token (with repo scope)
- Optional: n8n instance for extended workflows

## 🔧 Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/devagent-coding-agent.git
cd devagent-coding-agent
```

### 2. Backend Setup (Python)

```bash
# Navigate to backend directory
cd agent/backend

# Create virtual environment (optional but recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file from example
cp .env.example .env
```

Edit `.env` with your credentials:
```env
GEMINI_API_KEY=your_gemini_api_key_here
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_OWNER=your_github_username
GITHUB_REPO=your_target_repository
AI_MODEL=gemini-3.5-flash  # or your preferred model
PORT=8000
```

### 3. Proxy Server Setup (Node.js)

```bash
# Navigate to root agent directory
cd ../..

# Install Node.js dependencies
npm install

# Create .env file
cp .env.example .env  # If exists, otherwise create manually
```

Edit `.env` with your configuration:
```env
PORT=3000
N8N_WEBHOOK_URL=http://localhost:8000  # Points to your FastAPI backend
```

### 4. Start the Services

**Option A: Development Mode (Separate Terminals)**

Terminal 1 - Start FastAPI Backend:
```bash
cd agent/backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Terminal 2 - Start Node.js Proxy:
```bash
cd agent
npm start
```

**Option B: Production Mode**
Both services can be deployed separately or together depending on your infrastructure.

## 🚦 Usage

1. Open your browser and navigate to `http://localhost:3000`
2. Start chatting with DevAgent.ai!
3. Examples of what you can ask:
   - "Create a Python calculator script"
   - "Update the README with installation instructions"
   - "How do I implement a binary search algorithm?"
   - "Delete the old test file"
   - "Explain this code snippet: [paste code]"

## 📁 Project Structure

```
agent/
├── index.html              # Main frontend interface
├── script.js               # Frontend logic
├── style.css               # Styling
├── package.json            # Node.js dependencies
├── server.js               # Express proxy server
└── backend/                # FastAPI backend
    ├── main.py             # FastAPI application
    ├── agent.py            # Core AI agent logic
    ├── github_client.py    # GitHub API wrapper
    ├── requirements.txt    # Python dependencies
    ├── .env.example        # Environment variables template
    └── .env                # Environment variables (create from example)
```

## 🛠️ Configuration

### Environment Variables

**Backend (.env):**
- `GEMINI_API_KEY`: Your Google Gemini API key
- `GITHUB_TOKEN`: GitHub personal access token
- `GITHUB_OWNER`: GitHub username/organization
- `GITHUB_REPO`: Target repository name
- `AI_MODEL`: Gemini model to use (default: gemini-3.5-flash)
- `PORT`: Backend server port (default: 8000)

**Proxy Server (.env):**
- `PORT`: Proxy server port (default: 3000)
- `N8N_WEBHOOK_URL`: URL of your FastAPI backend (default: http://localhost:8000)

## 🔒 Security Notes

- Never commit your `.env` file to version control
- The proxy server adds a security layer between the frontend and AI backend
- GitHub tokens should have minimal required permissions (repo scope is sufficient)
- All API keys and tokens are stored server-side, never exposed to the client

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Google Gemini](https://ai.google.dev/) for powerful AI capabilities
- [FastAPI](https://fastapi.tiangolo.com/) for high-performance Python backend
- [Express.js](https://expressjs.com/) for reliable Node.js server
- [GitHub API](https://docs.github.com/en/rest) for seamless repository integration

---

*Built with ❤️ by the DevAgent.ai Team*

*Powered by Google Gemini + GitHub Integration*