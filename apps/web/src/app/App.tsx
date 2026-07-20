import { App as AntdApp, ConfigProvider } from 'antd';
import ptBR from 'antd/locale/pt_BR';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from '../lib/query-client';
import { SessionProvider } from '../auth/session-context';
import { theme } from './theme';
import { router } from './router';

export function App() {
  return (
    <ConfigProvider theme={theme} locale={ptBR}>
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <RouterProvider router={router} />
          </SessionProvider>
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  );
}
