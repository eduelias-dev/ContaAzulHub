import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const authAPI = {
  getAuthorizeUrl: async () => {
    const response = await api.get('/auth/authorize');
    return response.data.authUrl;
  },

  getAuthStatus: async (companyId: string) => {
    const response = await api.get(`/auth/status/${companyId}`);
    return response.data;
  },

  getCompanyDetails: async (companyId: string) => {
    const response = await api.get(`/auth/company/${companyId}`);
    return response.data;
  },

  disconnectCompany: async (companyId: string) => {
    const response = await api.delete(`/auth/disconnect/${companyId}`);
    return response.data;
  },

  authorizeCompany: async (companyId: string, code: string) => {
    const response = await api.post(`/auth/authorize/${companyId}`, { code });
    return response.data;
  },
};

export const payableAPI = {
  listPayables: async (companyId: string, page: number = 1, pageSize: number = 20) => {
    const response = await api.get(`/payables/${companyId}`, {
      params: { page, pageSize },
    });
    return response.data;
  },

  getPayable: async (companyId: string, payableId: string) => {
    const response = await api.get(`/payables/${companyId}/${payableId}`);
    return response.data;
  },

  syncPayables: async (companyId: string) => {
    const response = await api.post(`/payables/${companyId}/sync`);
    return response.data;
  },

  getSyncStatus: async (companyId: string) => {
    const response = await api.get(`/payables/${companyId}/sync/status`);
    return response.data;
  },

  deletePayables: async (companyId: string) => {
    const response = await api.delete(`/payables/${companyId}`);
    return response.data;
  },
};

export const receivableAPI = {
  listReceivables: async (companyId: string, page: number = 1, pageSize: number = 20) => {
    const response = await api.get(`/receivables/${companyId}`, {
      params: { page, pageSize },
    });
    return response.data;
  },

  syncReceivables: async (companyId: string) => {
    const response = await api.post(`/receivables/${companyId}/sync`);
    return response.data;
  },
};
