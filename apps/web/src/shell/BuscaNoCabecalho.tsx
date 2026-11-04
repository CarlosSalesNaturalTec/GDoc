import { useState } from 'react';
import { Button, Input } from 'antd';
import { useNavigate } from 'react-router-dom';
import { IconeBuscar } from '../app/icons';
import { useNarrowMode } from '../app/responsive';

/**
 * Campo de busca permanentemente acessível na barra superior (capability
 * `web-busca`, requisito "Campo de busca permanentemente acessível no
 * cabeçalho"; change `menu-lateral-e-barra-superior`, design.md D3).
 *
 * **Não consulta o servidor.** Acionar navega para a tela de resultados com o
 * termo na URL (`/busca?q=…`), e é ela que dispara a consulta. Essa divisão é
 * o que preserva o requisito "Busca acionada explicitamente pelo usuário", que
 * a change arquivada `busca-acionamento-explicito` normatizou por decisão
 * deliberada: busca a cada tecla multiplica requisições e produz resultados
 * que piscam. Termo vazio não navega.
 *
 * **O acionador vai dentro do campo, e por isso não é `Input.Search`.** O
 * `Input.Search` do design system renderiza o botão num
 * `ant-input-group-addon` — **adjacente** ao campo, fora da caixa — com ou sem
 * `enterButton`; foi o que a verificação mostrou. O requisito proíbe botão
 * adjacente, então o acionador entra como `suffix` de um `Input` comum, dentro
 * do `ant-input-affix-wrapper`. `type="search"` preserva o papel de
 * `searchbox`.
 *
 * Isso também apaga a ramificação `enterButton={!isNarrow}` que existia só
 * para o botão verde separado não consumir a largura do campo em 375px: sem
 * botão adjacente, o problema deixa de existir e o componente deixa de
 * precisar conhecer o modo de apresentação.
 *
 * **A largura é teto, não medida** (design.md D3): no limiar de 992px a barra
 * dispõe de 680px, e o campo divide com o sino, a ajuda e a ação de envio —
 * 600px fixos estourariam a linha e produziriam a rolagem horizontal que
 * `web-responsividade` proíbe. Medido na app: 400px em 992, 432 em 1024 e o
 * teto de 600 a partir de 1280.
 *
 * **Abaixo do limiar o teto não basta: o campo precisa de piso.** A medição em
 * 375px mostrou o campo colapsando para **24px** — caixa visível em que não se
 * digita. `flex: 1` sem piso cede toda a largura aos controles vizinhos; é o
 * mesmo defeito que a change `responsividade-mobile-tablet` já havia corrigido
 * uma vez, e que voltou ao se retirar o botão adjacente junto com o piso. O
 * piso vale só no modo estreito: no largo há folga de sobra, e um piso ali
 * competiria com o teto.
 */
export const TETO_LARGURA_BUSCA = 600;

/** Piso de largura útil do campo no modo estreito (medido em 375px). */
export const PISO_LARGURA_BUSCA = 120;

export const APOIO_BUSCA = 'Buscar por nome, código (ex.: PRT-NSP-001) ou palavra-chave';

export function BuscaNoCabecalho() {
  const navigate = useNavigate();
  const isNarrow = useNarrowMode();
  const [termo, setTermo] = useState('');

  function handleSearch() {
    const limpo = termo.trim();
    if (limpo === '') return;
    navigate(`/busca?q=${encodeURIComponent(limpo)}`);
  }

  return (
    <Input
      type="search"
      allowClear
      placeholder={APOIO_BUSCA}
      aria-label="Buscar documentos"
      style={{ flex: 1, maxWidth: TETO_LARGURA_BUSCA, minWidth: isNarrow ? PISO_LARGURA_BUSCA : 0 }}
      value={termo}
      onChange={(e) => setTermo(e.target.value)}
      onPressEnter={handleSearch}
      suffix={
        <Button
          type="text"
          size="small"
          aria-label="Buscar"
          icon={<IconeBuscar />}
          onClick={handleSearch}
        />
      }
    />
  );
}
