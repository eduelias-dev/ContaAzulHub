import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Receipt, Settings, Sun, Moon } from 'lucide-react';
import DashboardPage from './pages/DashboardPage';
import ReceivablesPage from './pages/ReceivablesPage';
import SettingsPage from './pages/SettingsPage';
import './index.css';

type Page = 'dashboard' | 'receivables' | 'settings';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [companyId, setCompanyId] = useState<string | undefined>(
    localStorage.getItem('companyId') || undefined
  );
  const [isDarkMode, setIsDarkMode] = useState<boolean>(
    localStorage.getItem('darkMode') === 'true'
  );

  // Aplicar dark mode no root
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', isDarkMode.toString());
  }, [isDarkMode]);

  // Capturar parâmetros da URL do OAuth
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlCompanyId = urlParams.get('companyId');
    const isAuthenticated = urlParams.get('authenticated');

    if (urlCompanyId) {
      setCompanyId(urlCompanyId);
      localStorage.setItem('companyId', urlCompanyId);
      window.history.replaceState({}, document.title, window.location.pathname);
      if (isAuthenticated === 'true') {
        setCurrentPage('dashboard');
      }
    }
  }, []);

  const handleCompanyCreated = (newCompanyId: string) => {
    setCompanyId(newCompanyId);
    localStorage.setItem('companyId', newCompanyId);
  };

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col fixed h-full">
        <div className="p-6">
          <h1 className="text-xl font-bold text-conta-azul dark:text-blue-400">
            🏢 ContaAzul Hub
          </h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          <button
            onClick={() => setCurrentPage('dashboard')}
            className={`w-full text-left px-4 py-3 rounded-md transition-all flex items-center gap-3 ${
              currentPage === 'dashboard'
                ? 'bg-conta-azul text-white shadow-lg shadow-blue-500/30'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Receipt size={20} /> Contas a Pagar
          </button>
          <button
            onClick={() => setCurrentPage('receivables')}
            className={`w-full text-left px-4 py-3 rounded-md transition-all flex items-center gap-3 ${
              currentPage === 'receivables'
                ? 'bg-conta-azul text-white shadow-lg shadow-blue-500/30'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <LayoutDashboard size={20} /> Contas a Receber
          </button>
          <button
            onClick={() => setCurrentPage('settings')}
            className={`w-full text-left px-4 py-3 rounded-md transition-all flex items-center gap-3 ${
              currentPage === 'settings'
                ? 'bg-conta-azul text-white shadow-lg shadow-blue-500/30'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Settings size={20} /> Configurações
          </button>
        </nav>

        {/* Footer Sidebar with Toggle */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={toggleDarkMode}
            className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <span>{isDarkMode ? 'Modo Claro' : 'Modo Escuro'}</span>
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {companyId && (
            <div className="mt-4 px-4 text-xs text-gray-500 dark:text-gray-400 truncate">
              ID: {companyId}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-64 overflow-y-auto">
        {currentPage === 'dashboard' ? (
          <DashboardPage companyId={companyId} />
        ) : currentPage === 'receivables' ? (
          <ReceivablesPage companyId={companyId} />
        ) : (
          <SettingsPage
            companyId={companyId}
            onCompanyCreated={handleCompanyCreated}
          />
        )}
      </main>
    </div>
  );
}

export default App;