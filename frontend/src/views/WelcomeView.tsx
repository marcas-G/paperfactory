import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Send } from 'lucide-react';

export default function WelcomeView() {
  const navigate = useNavigate();
  const { createProject } = useStore();
  const [question, setQuestion] = useState('');

  const handleSend = async () => {
    if (!question.trim()) return;
    const result = await createProject(question);
    if (result?.id) {
      navigate(`/research/${result.id}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center text-text-faint">
        <div className="text-5xl mb-4">🔬</div>
        <div className="text-xl font-semibold text-text-muted mb-2">PaperFactory</div>
        <div className="text-sm text-text-faint max-w-md text-center leading-relaxed">
          Ask a research question and let the AI agent conduct literature search, hypothesis generation, and more.
        </div>
      </div>
      <div className="px-8 pb-6">
        <div className="flex items-center gap-2 bg-bg-layer1 border border-border-base/50 rounded-xl min-h-[48px] transition-colors focus-within:border-border-strong">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Enter research question..."
            className="flex-1 px-4 py-2.5 bg-transparent text-[13px] text-text-strong outline-none placeholder:text-text-faint"
          />
          <button
            onClick={handleSend}
            disabled={!question.trim()}
            className="w-[30px] h-[30px] rounded-md flex items-center justify-center bg-accent text-white disabled:opacity-30 disabled:cursor-not-allowed mr-1 mb-1 cursor-pointer"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}


