import React, { useState, useEffect } from 'react';
import { readTextFile, BaseDirectory } from '@tauri-apps/api/fs';
import { homeDir } from '@tauri-apps/api/path';

function App() {
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUserConfig();
  }, []);

  const loadUserConfig = async () => {
    try {
      // Try to read the config file from the user's home directory
      const homePath = await homeDir();
      const configPath = `${homePath}.riana${homePath.includes('\\') ? '\\' : '/'}config.json`;
      
      console.log('Attempting to read config from:', configPath);
      
      // Read the config file
      const configContent = await readTextFile(configPath);
      const config = JSON.parse(configContent);
      
      console.log('Config loaded:', { email: config.email, hasToken: !!config.token });
      
      if (config.email && config.token) {
        // Check if token is still valid
        const now = new Date();
        const expiry = new Date(config.expiresAt);
        
        if (now >= expiry) {
          setError('Authentication token has expired. Please run riana login again.');
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

  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading Riana IDE...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="error">
          <h2>Configuration Error</h2>
          <p>{error}</p>
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', opacity: 0.7 }}>
            Please run <code>riana login</code> in your terminal to authenticate.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="welcome-container">
        <h1 className="welcome-title">Riana IDE</h1>
        <p className="welcome-email">Welcome, {userEmail}</p>
        <div className="status-badge">
          ✓ Authenticated
        </div>
      </div>
    </div>
  );
}

export default App;
