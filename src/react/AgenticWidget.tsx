import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Maximize2, Minimize2, Send } from 'lucide-react';
import { usePlugin } from './PluginProvider';
import { MessageBubble } from './components/MessageBubble';
import { ChartRenderer } from './components/ChartRenderer';

export const AgenticWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user'|'assistant', text: string, visualizations?: any[] }[]>([]);
  const { endpoint } = usePlugin();

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);

    try {
      const res = await fetch(`${endpoint}/api/agentic-ui/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMsg, history: [], context: {} })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', text: data.summary, visualizations: data.visualizations }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Error connecting to AI.' }]);
    }
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            whileHover={{ scale: 1.05 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 rounded-full shadow-xl flex items-center justify-center text-white z-50 hover:bg-indigo-700 transition-colors"
          >
            <Bot size={28} />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`fixed bottom-6 right-6 bg-white/80 backdrop-blur-xl border border-slate-200/60 shadow-2xl rounded-2xl flex flex-col overflow-hidden z-50 ${isExpanded ? 'w-[80vw] h-[80vh] max-w-5xl' : 'w-[420px] h-[600px]'}`}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-white/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
                  <Bot size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm">Agentic UI</h3>
                  <p className="text-[11px] text-slate-500 font-medium tracking-wide uppercase">AI Workspace</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                  {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button onClick={() => setIsOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                  <Bot size={48} className="mb-4 opacity-20" />
                  <p className="font-medium text-slate-500">How can I help you today?</p>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div key={i}>
                    <MessageBubble role={m.role} text={m.text} />
                    {m.visualizations?.map((v, vi) => (
                      <ChartRenderer key={vi} type={v.type} data={v.data} />
                    ))}
                  </div>
                ))
              )}
            </div>

            <div className="p-4 bg-white/50 border-t border-slate-100">
              <div className="relative flex items-center">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Ask anything..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-none max-h-32"
                  rows={1}
                />
                <button onClick={handleSend} disabled={!input.trim()} className="absolute right-2 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-40 disabled:hover:bg-transparent transition-colors">
                  <Send size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
