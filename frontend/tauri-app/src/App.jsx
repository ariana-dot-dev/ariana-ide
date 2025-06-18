import React, { useState, useEffect } from 'react';
import { readTextFile } from '@tauri-apps/api/fs';
import { homeDir } from '@tauri-apps/api/path';
import { appWindow } from '@tauri-apps/api/window';

function App() {
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    loadUserConfig();
    
    // Check if window is maximized
    appWindow.isMaximized().then(setIsMaximized);
  }, []);

  const loadUserConfig = async () => {
    try {
      const homePath = await homeDir();
      const configPath = `${homePath}.ariana${homePath.includes('\\') ? '\\' : '/'}config.json`;
      
      const configContent = await readTextFile(configPath);
      const config = JSON.parse(configContent);
      
      if (config.email && config.token) {
        const now = new Date();
        const expiry = new Date(config.expiresAt);
        
        if (now >= expiry) {
          setError('Authentication token has expired. Please run ariana login again.');
        } else {
          setUserEmail(config.email);
        }
      } else {
        setError('Invalid configuration. Missing email or token.');
      }
    } catch (err) {
      console.error('Failed to load user config:', err);
      setError('Failed to load user configuration. Please ensure you are logged in via the CLI.');
    } finally {
      setLoading(false);
    }
  };

  const handleMinimize = () => appWindow.minimize();
  const handleMaximize = () => {
    if (isMaximized) {
      appWindow.unmaximize();
    } else {
      appWindow.maximize();
    }
    setIsMaximized(!isMaximized);
  };
  const handleClose = () => appWindow.close();

  if (loading) {
    return (
      <div className="h-screen bg-black text-white flex flex-col rounded-lg overflow-hidden">
        <div data-tauri-drag-region className="h-10 bg-zinc-900 flex items-center justify-center px-4 select-none relative">
          <span className="text-sm font-medium text-zinc-400">ariana</span>
          <div className="absolute right-4 flex items-center space-x-3">
            <button className="w-3 h-3 rounded-full bg-zinc-600 hover:bg-zinc-500 transition-colors"></button>
            <button className="w-3 h-3 rounded-full bg-zinc-600 hover:bg-zinc-500 transition-colors"></button>
            <button className="w-3 h-3 rounded-full bg-zinc-600 hover:bg-zinc-500 transition-colors"></button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center bg-black">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-8 h-8 border-2 border-zinc-700 border-t-white rounded-full animate-spin"></div>
            <p className="text-zinc-400">Loading ariana IDE...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-black text-white flex flex-col rounded-lg overflow-hidden">
        <div data-tauri-drag-region className="h-10 bg-zinc-900 flex items-center justify-center px-4 select-none relative">
          <span className="text-sm font-medium text-zinc-400">ariana</span>
          <div className="absolute right-4 flex items-center space-x-3">
            <button onClick={handleMinimize} className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors"></button>
            <button onClick={handleMaximize} className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 transition-colors"></button>
            <button onClick={handleClose} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors"></button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center bg-black">
          <div className="text-center max-w-md px-6">
            <h2 className="text-xl font-semibold text-red-400 mb-4">Configuration Error</h2>
            <p className="text-zinc-300 mb-6">{error}</p>
            <p className="text-sm text-zinc-500">
              Please run <code className="bg-zinc-800 px-2 py-1 rounded">ariana login</code> in your terminal to authenticate.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="font-mono h-screen w-screen bg-gradient-to-b from-sky-300 to-sky-200 flex flex-col rounded-lg overflow-hidden">
    <div className="h-full w-full text-sky-200 bg-gradient-to-b from-sky-600 to-sky-400 flex flex-col rounded-lg">
      {/* Custom Titlebar */}
      <div data-tauri-drag-region className="h-10 flex items-center justify-center px-4 select-none relative">
        <span className="text-sm font-medium font-sans">Ariana IDE</span>
        <div className="absolute right-4 gap-2 flex items-center">
          <button 
            onClick={handleMinimize}
            className="w-3 h-3 rounded-full opacity-90 bg-gradient-to-bl from-blue-600 to-yellow-400 hover:opacity-100 transition-colors cursor-pointer"
          ></button>
          <button 
            onClick={handleMaximize}
            className="w-3 h-3 rounded-full opacity-90 bg-gradient-to-bl from-blue-600 to-green-400 hover:opacity-100 transition-colors cursor-pointer"
          ></button>
          <button 
            onClick={handleClose}
            className="w-3 h-3 rounded-full opacity-90 bg-gradient-to-bl from-blue-600 to-red-400 hover:opacity-100 transition-colors cursor-pointer"
          ></button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 font-mono flex items-center justify-center ">
        <div className="text-center">
          <div className='flex flex-col items-center gap-0.5'>
            <img src="./assets/app-icon-grad.png" className=' w-56'/>
            <h1 className="text-5xl font-mono font-bold mb-8">Ariana IDE</h1>
          </div>
          <p className="text-sky-200 text-lg mb-6">Welcome, {userEmail}</p>
        </div>
      </div>
    </div>
    </div>
  );
}

export default App;
