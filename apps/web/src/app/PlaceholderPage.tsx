import { Result } from 'antd';

/** Tela reservada para as fatias catalogadas em docs/frontend_roadmap.md — ainda sem funcionalidade própria. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <Result
      status="info"
      title={title}
      subTitle="Esta tela chega em uma próxima fatia da implementação (ver docs/frontend_roadmap.md)."
    />
  );
}
