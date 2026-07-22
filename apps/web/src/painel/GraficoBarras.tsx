import { theme } from 'antd';

export interface GraficoBarrasItem {
  label: string;
  value: number;
}

/**
 * Gráfico de barras horizontal em SVG/HTML próprio, sem biblioteca de
 * gráficos (design.md D1): barras proporcionais ao maior valor, coloridas
 * pelos tokens do tema AntD. Cada valor é texto visível no DOM, então os
 * cenários de spec são asserções diretas, sem mock de lib de gráfico.
 */
export function GraficoBarras({ items }: { items: GraficoBarrasItem[] }) {
  const { token } = theme.useToken();
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 160, flexShrink: 0, color: token.colorTextSecondary, fontSize: 13 }}>
            {item.label}
          </span>
          <div
            style={{
              flex: 1,
              background: token.colorFillSecondary,
              borderRadius: token.borderRadius,
              overflow: 'hidden',
              height: 20,
            }}
          >
            <div
              style={{
                width: `${(item.value / max) * 100}%`,
                height: '100%',
                background: token.colorPrimary,
                borderRadius: token.borderRadius,
              }}
            />
          </div>
          <span style={{ width: 40, textAlign: 'right', flexShrink: 0 }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}
