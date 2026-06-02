import React, { useState, useEffect } from 'react';
import { authAPI } from '../services/api';

interface SettingsPageProps {
  companyId?: string;
  onCompanyCreated?: (companyId: string) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ companyId, onCompanyCreated }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentCompanyId, setCurrentCompanyId] = useState(companyId);

  useEffect(() => {
    if (currentCompanyId) {
      checkAuthStatus();
    }
  }, [currentCompanyId]);

  const checkAuthStatus = async () => {
    if (!currentCompanyId) return;

    try {
      setIsLoading(true);
      const status = await authAPI.getAuthStatus(currentCompanyId);
      setIsAuthenticated(status.isAuthenticated);
    } catch (err) {
      console.error('Error checking auth status:', err);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectContaAzul = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get the authorization URL
      const authUrl = await authAPI.getAuthorizeUrl();

      // Redirect to Conta Azul OAuth page
      window.location.href = authUrl;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to initiate OAuth connection'
      );
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    // Proativamente limpar localmente para garantir o reset
    localStorage.removeItem('companyId');
    setCurrentCompanyId(undefined);
    setIsAuthenticated(false);

    if (currentCompanyId) {
      try {
        await authAPI.disconnectCompany(currentCompanyId);
      } catch (err) {
        console.error('Erro ao desconectar no backend:', err);
      }
    }
    
    window.location.reload(); 
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 border border-transparent dark:border-gray-700">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Configurações
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Integração Conta Azul</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 rounded-md">
            <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Company ID Display */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Company ID
            </label>
            <input
              type="text"
              value={currentCompanyId || ''}
              onChange={(e) => setCurrentCompanyId(e.target.value)}
              placeholder="Digite o ID da empresa ou conecte"
              readOnly={!!isAuthenticated}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-conta-azul focus:border-conta-azul transition-colors"
            />
            {!currentCompanyId && (
               <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Este ID identifica sua empresa no nosso banco de dados.</p>
            )}
          </div>

          {/* Authentication Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Status de Autenticação
            </label>
            {isLoading ? (
              <div className="flex items-center text-gray-600 dark:text-gray-400 text-sm">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-conta-azul mr-2"></div>
                Verificando...
              </div>
            ) : isAuthenticated ? (
              <div className="flex items-center text-green-600 dark:text-green-400 text-sm">
                <span className="h-3 w-3 bg-green-500 rounded-full mr-2"></span>
                Conectado à Conta Azul
              </div>
            ) : (
              <div className="flex items-center text-gray-500 dark:text-gray-400 text-sm">
                <span className="h-3 w-3 bg-gray-300 dark:bg-gray-600 rounded-full mr-2"></span>
                Não conectado
              </div>
            )}
          </div>

          {/* Connection Button */}
          {!isAuthenticated && !currentCompanyId ? (
            <button
              onClick={handleConnectContaAzul}
              disabled={isLoading}
              className={`w-full py-3 px-4 rounded-md font-medium transition duration-200 flex items-center justify-center gap-2
                ${
                  isLoading
                    ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-conta-azul text-white hover:bg-conta-azul-dark shadow-lg shadow-blue-500/20'
                }
              `}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Conectando...
                </>
              ) : (
                <>
                  <span>🔗</span>
                  Conectar Conta Azul
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-md font-medium transition duration-200 flex items-center justify-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
              ) : (
                <>
                  <span>🔓</span>
                  {isAuthenticated ? 'Desconectar Conta Azul' : 'Limpar Sessão Local'}
                </>
              )}
            </button>
          )}

          {/* Info Text */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
            <p className="text-sm text-blue-900 dark:text-blue-300">
              <strong>Nota:</strong> Você será redirecionado para o Conta Azul para
              autorizar o acesso. Após a autorização, será possível sincronizar as
              contas a pagar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
