import { apiClient } from '@/shared/api/client';

// MCP API-KEY 管理（GET /api/mcp-token，POST /api/mcp-token/{reveal,rotate}）
// 明文只在用户主动点击「查看明文」时取回，不落任何持久化存储

export interface McpApiKeyView {
  configured: boolean;
  masked: string | null;
  updatedAt: string | null;
}

export interface McpApiKeyPlain {
  apiKey: string;
}

export const mcpTokenApi = {
  getView: () => apiClient.get<McpApiKeyView>('/api/mcp-token'),
  reveal: () => apiClient.post<McpApiKeyPlain>('/api/mcp-token/reveal'),
  rotate: () => apiClient.post<McpApiKeyPlain>('/api/mcp-token/rotate'),
};
