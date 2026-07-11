import React, { createContext, useContext } from 'react';
import './styles/globals.css';

interface PluginContextType {
  endpoint: string;
  theme?: 'light' | 'dark';
}

const PluginContext = createContext<PluginContextType | null>(null);

export const usePlugin = () => {
  const ctx = useContext(PluginContext);
  if (!ctx) throw new Error("usePlugin must be used within AgenticUIProvider");
  return ctx;
};

export const AgenticUIProvider: React.FC<{
  endpoint: string;
  theme?: 'light' | 'dark';
  children: React.ReactNode;
}> = ({ endpoint, theme = 'light', children }) => {
  return (
    <PluginContext.Provider value={{ endpoint, theme }}>
      {children}
    </PluginContext.Provider>
  );
};
