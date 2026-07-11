import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

export const MessageBubble = ({ role, text }: { role: 'user' | 'assistant', text: string }) => {
  return (
    <div className={`p-4 my-2 rounded-lg max-w-[85%] ${role === 'user' ? 'bg-indigo-100 text-indigo-900 ml-auto' : 'bg-white text-slate-800 border border-slate-200'}`}>
      <div className="text-xs font-semibold mb-1 opacity-70 uppercase tracking-wide">
        {role === 'user' ? 'You' : 'Agent'}
      </div>
      <div className="prose prose-sm prose-slate max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
};
