import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, TrendingUp, Calendar, Clock, AlertCircle, ArrowUpDown, LayoutDashboard } from 'lucide-react';
import { receivableAPI, authAPI } from '../services/api';

interface Receivable {
  id: string;
  contaAzulId: string;
  description: string;
  value: any;
  dueDate: string;
  status: string;
}

type SortOption = 'date-asc' | 'date-desc' | 'val-high' | 'val-low' | 'alpha-asc';

const receivablesCache: Record<string, any> = {};

const ReceivablesPage: React.FC<{ companyId?: string }> = ({ companyId }) => {
  const defaultCompanyId = companyId || localStorage.getItem('companyId') || '';
  
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [companyName, setCompanyName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalReceivables, setTotalReceivables] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>('date-asc');
  const [visibleItems, setVisibleItems] = useState(15);

  const loadData = useCallback(async (force = false) => {
    if (!defaultCompanyId) return;

    if (!force && receivablesCache[defaultCompanyId]) {
      const cache = receivablesCache[defaultCompanyId];
      setReceivables(cache.data || []);
      setTotalReceivables(cache.total || 0);
      return;
    }

    try {
      setIsLoading(true);
      const [details, response] = await Promise.allSettled([
        authAPI.getCompanyDetails(defaultCompanyId),
        receivableAPI.listReceivables(defaultCompanyId, 1, 100)
      ]);

      if (details.status === 'fulfilled') setCompanyName(details.value?.name || '');
      
      const data = response.status === 'fulfilled' ? (response.value?.data || []) : [];
      const total = response.status === 'fulfilled' ? (response.value?.pagination?.total || data.length) : 0;

      setReceivables(data);
      setTotalReceivables(total);

      receivablesCache[defaultCompanyId] = { data, total };
    } catch (err) {
      setError('Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  }, [defaultCompanyId]);

  useEffect(() => { 
    loadData();
    setVisibleItems(15);
  }, [loadData]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await receivableAPI.syncReceivables(defaultCompanyId);
      await loadData(true);
    } catch (err) {
      setError('Erro na sincronização');
    } finally {
      setIsSyncing(false);
    }
  };

  const sortedReceivables = useMemo(() => {
    const list = [...receivables];
    switch (sortBy) {
      case 'date-asc': return list.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      case 'date-desc': return list.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
      case 'val-high': return list.sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
      case 'val-low': return list.sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
      case 'alpha-asc': return list.sort((a, b) => a.description.localeCompare(b.description));
      default: return list;
    }
  }, [receivables, sortBy]);

  const visibleReceivables = useMemo(() => {
    return sortedReceivables.slice(0, visibleItems);
  }, [sortedReceivables, visibleItems]);

  const formatCurrency = (val: any) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(val) || 0);
  const formatDate = (date: string) => date ? new Date(date).toLocaleDateString('pt-BR') : 'N/A';

  return (
    <div className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold dark:text-white">Contas a Receber {companyName && `• ${companyName}`}</h1>
            <p className="text-gray-500">Gestão de entradas financeiras</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
                <ArrowUpDown size={16} />
              </div>
              <select 
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg text-sm dark:text-gray-200 outline-none focus:ring-2 focus:ring-green-500 transition-all appearance-none cursor-pointer min-w-[180px]"
              >
                <option value="date-asc">Vencimento (Antigo)</option>
                <option value="date-desc">Vencimento (Recente)</option>
                <option value="val-high">Maior Valor</option>
                <option value="val-low">Menor Valor</option>
                <option value="alpha-asc">Ordem Alfabética</option>
              </select>
            </div>

            <button 
              onClick={handleSync} 
              disabled={isSyncing}
              className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-green-500/20 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
            </button>
          </div>
        </div>

        {error && <div className="bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-4 rounded-lg mb-6 border border-red-200 dark:border-red-800 flex items-center gap-3">
          <AlertCircle size={20} /> {error}
        </div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border dark:border-gray-700 flex items-center gap-4 transition-all hover:shadow-md">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg"><Clock size={24}/></div>
            <div><p className="text-sm text-gray-500 dark:text-gray-400">Total Recebíveis</p><p className="text-xl font-bold dark:text-white">{totalReceivables}</p></div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border dark:border-gray-700 flex items-center gap-4 transition-all hover:shadow-md">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg"><TrendingUp size={24}/></div>
            <div><p className="text-sm text-gray-500 dark:text-gray-400">Valor Total</p><p className="text-xl font-bold dark:text-white">{formatCurrency(receivables.reduce((a, b) => a + (parseFloat(b.value) || 0), 0))}</p></div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">Descrição</th>
                  <th className="px-6 py-4">Valor</th>
                  <th className="px-6 py-4">Vencimento</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {visibleReceivables.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-4 dark:text-gray-200 font-medium">{r.description}</td>
                    <td className="px-6 py-4 font-bold dark:text-white">{formatCurrency(r.value)}</td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{formatDate(r.dueDate)}</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-100 dark:border-green-800 flex items-center gap-1.5 w-fit">
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {receivables.length === 0 && !isLoading && (
                  <tr><td colSpan={4} className="p-16 text-center">
                    <LayoutDashboard size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                    <p className="text-gray-400">Nenhum registro encontrado.</p>
                  </td></tr>
                )}
                {isLoading && receivables.length === 0 && (
                   <tr><td colSpan={4} className="p-16 text-center">
                    <RefreshCw size={32} className="mx-auto mb-4 text-green-600 animate-spin" />
                    <p className="text-gray-400">Carregando dados...</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {receivables.length > visibleItems && (
            <div className="p-4 border-t dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 text-center">
              <button
                onClick={() => setVisibleItems(prev => prev + 15)}
                className="text-sm font-semibold text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors flex items-center gap-2 mx-auto"
              >
                Mostrar Mais ({receivables.length - visibleItems} restantes)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReceivablesPage;