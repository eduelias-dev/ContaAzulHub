import React, { useState, useEffect } from 'react';
import { payableAPI, authAPI } from '../services/api';

interface Payable {
  id: string;
  contaAzulId: string;
  description: string;
  value: number;
  dueDate: string;
  status: string;
  createdAt: string;
}

interface DashboardPageProps {
  companyId?: string;
}

const DashboardPage: React.FC<DashboardPageProps> = ({ companyId }) => {
  const [payables, setPayables] = useState<Payable[]>([]);
  const [companyName, setCompanyName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [totalPayables, setTotalPayables] = useState(0);

  const defaultCompanyId = companyId || localStorage.getItem('companyId') || '';

  useEffect(() => {
    if (defaultCompanyId) {
      loadPayables();
      loadSyncStatus();
      loadCompanyDetails();
    }
  }, [defaultCompanyId]);

  const loadCompanyDetails = async () => {
    try {
      const details = await authAPI.getCompanyDetails(defaultCompanyId);
      setCompanyName(details.name);
    } catch (err) {
      console.error('Error loading company details:', err);
    }
  };

  const loadPayables = async () => {
    if (!defaultCompanyId) return;

    try {
      setIsLoading(true);
      setError(null);
      const response = await payableAPI.listPayables(defaultCompanyId, 1, 100);
      setPayables(response.data || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar contas a pagar'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const loadSyncStatus = async () => {
    if (!defaultCompanyId) return;

    try {
      const status = await payableAPI.getSyncStatus(defaultCompanyId);
      setLastSyncAt(status.lastSyncAt ? new Date(status.lastSyncAt) : null);
      setTotalPayables(status.totalPayables || 0);
    } catch (err) {
      console.error('Error loading sync status:', err);
    }
  };

  const handleSync = async () => {
    if (!defaultCompanyId) return;

    try {
      setIsSyncing(true);
      setError(null);
      await payableAPI.syncPayables(defaultCompanyId);

      // Reload data after sync
      setTimeout(() => {
        loadPayables();
        loadSyncStatus();
      }, 1000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao sincronizar contas'
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (dateString: string): string => {
    return new Intl.DateTimeFormat('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(dateString));
  };

  const getStatusBadgeColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'paid':
      case 'pago':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'pending':
      case 'pendente':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'overdue':
      case 'vencido':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Dashboard {companyName ? `- ${companyName}` : ''}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Contas a Pagar Sincronizadas</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 rounded-md">
            <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Stats Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Total Payables */}
          <div className="bg-white dark:bg-gray-800 border border-transparent dark:border-gray-700 rounded-lg shadow p-6">
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">Total de Contas</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalPayables}</p>
          </div>

          {/* Total Value */}
          <div className="bg-white dark:bg-gray-800 border border-transparent dark:border-gray-700 rounded-lg shadow p-6">
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">Valor Total</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(
                payables.reduce((sum, p) => sum + (Number(p.value) || 0), 0)
              )}
            </p>
          </div>

          {/* Last Sync */}
          <div className="bg-white dark:bg-gray-800 border border-transparent dark:border-gray-700 rounded-lg shadow p-6">
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">Última Sincronização</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {lastSyncAt
                ? formatDate(lastSyncAt.toString())
                : 'Nunca sincronizado'}
            </p>
          </div>
        </div>

        {/* Payables Table */}
        <div className="bg-white dark:bg-gray-800 border border-transparent dark:border-gray-700 rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-conta-azul"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Carregando contas a pagar...</p>
            </div>
          ) : payables.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                Nenhuma conta a pagar sincronizada.
              </p>
              <button
                onClick={handleSync}
                className="mt-4 text-conta-azul hover:text-conta-azul-dark font-medium"
              >
                Clique para sincronizar
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Descrição
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Valor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Vencimento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {payables.map((payable) => (
                    <tr key={payable.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">
                        {payable.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {formatCurrency(parseFloat(payable.value.toString()))}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {formatDate(payable.dueDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(
                            payable.status
                          )}`}
                        >
                          {payable.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
