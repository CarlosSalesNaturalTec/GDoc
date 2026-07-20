import { useState } from 'react';
import { App, Button, Card, Form, Input, Typography } from 'antd';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { LoginRequest } from '@gdoc/shared';
import { useSession } from './session-context';
import { ApiError } from '../lib/api-client';

interface LocationState {
  from?: { pathname: string };
}

function redirectTarget(state: unknown): string {
  return (state as LocationState | null)?.from?.pathname ?? '/';
}

export function LoginPage() {
  const { status, login } = useSession();
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (status === 'authenticated') {
    return <Navigate to={redirectTarget(location.state)} replace />;
  }

  async function handleSubmit(values: LoginRequest) {
    setSubmitting(true);
    try {
      await login(values);
      navigate(redirectTarget(location.state), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        // US 1.2 cenário 3: aviso específico, nunca confundido com a mensagem genérica.
        message.error('Esta conta está desativada. Procure a administração.');
      } else if (err instanceof ApiError && err.status === 401) {
        // US 1.2 cenário 2: mensagem genérica — não revela e-mail vs. senha.
        message.error('E-mail ou senha inválidos.');
      } else {
        message.error('Não foi possível entrar. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Card style={{ width: 360 }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginTop: 0 }}>
          GDoc
        </Typography.Title>
        <Form<LoginRequest> layout="vertical" onFinish={handleSubmit} disabled={submitting}>
          <Form.Item name="email" label="E-mail" rules={[{ required: true, type: 'email' }]}>
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="Senha" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={submitting}>
              Entrar
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
