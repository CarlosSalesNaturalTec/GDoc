import { useState } from 'react';
import { Input } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useNarrowMode } from '../app/responsive';

/**
 * Campo de busca permanentemente acessível no cabeçalho (capability
 * `web-busca`, change `shell-e-inicio`; design.md D5).
 *
 * **Não consulta o servidor.** Acionar navega para a tela de resultados com o
 * termo na URL (`/busca?q=…`), e é ela que dispara a consulta. Essa divisão é
 * o que preserva o requisito "Busca acionada explicitamente pelo usuário", que
 * a change arquivada `busca-acionamento-explicito` normatizou por decisão
 * deliberada: busca a cada tecla multiplica requisições e produz resultados
 * que piscam. O campo aqui muda **onde** a busca começa, nunca **como** ela
 * dispara.
 *
 * Termo vazio não navega: sem critério, a tela de busca não tem o que
 * apresentar — o seu "estado inicial permitido" é justamente "nada consultado
 * ainda".
 */
export function BuscaNoCabecalho() {
  const navigate = useNavigate();
  const isNarrow = useNarrowMode();
  const [termo, setTermo] = useState('');

  function handleSearch(valor: string) {
    const limpo = valor.trim();
    if (limpo === '') return;
    navigate(`/busca?q=${encodeURIComponent(limpo)}`);
  }

  return (
    <Input.Search
      allowClear
      placeholder="Buscar documentos"
      aria-label="Buscar documentos"
      // O botão da lupa custa ~48px e some abaixo do limiar: em 375px o
      // cabeçalho ainda carrega o acionador da navegação, o sino e o menu de
      // identidade, e **medindo** sobrou largura zero para o campo em si — a
      // caixa aparecia, mas não dava para digitar nela. Enter continua
      // acionando a busca, que é o caminho primário em qualquer largura.
      enterButton={!isNarrow}
      // No modo largo, largura fixa; abaixo do limiar o campo ocupa o espaço
      // restante da linha com um piso de largura útil — nunca uma largura em
      // pixel que estouraria a linha e produziria rolagem horizontal
      // (capability `web-responsividade`).
      style={isNarrow ? { flex: 1, minWidth: 120 } : { width: 320, maxWidth: 320, minWidth: 0 }}
      value={termo}
      onChange={(e) => setTermo(e.target.value)}
      onSearch={handleSearch}
    />
  );
}
