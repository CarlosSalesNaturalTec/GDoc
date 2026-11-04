import { paleta, TAMANHO_MINIMO_TEXTO, FAMILIA_TITULO } from '../app/theme';
import { BrandMark } from './BrandMark';

/**
 * Marca do shell expandido: logomarca, nome do produto e descritor (demanda do
 * cliente nº 2, seção 1.1; capability `identidade-visual`, requisito "Marca do
 * shell expandido apresenta o nome e o descritor do produto").
 *
 * **A logomarca é decorativa aqui** (design.md D5). Até esta change ela
 * carregava o nome acessível da marca via `alt`, porque era a única portadora
 * dele neste estado; com "PapelHub" escrito ao lado em texto, manter o `alt`
 * faria leitor de tela anunciar a marca duas vezes em sequência. A decisão D7
 * de `identidade-visual-isetes` não está sendo contrariada — a premissa dela
 * deixou de valer.
 *
 * **A moldura escura permanece**, pelo `BrandMark`: o ativo
 * (`logo-papelhub.jpg`, 301×502) não tem transparência, e `identidade-visual`
 * proíbe apresentá-lo sobre fundo claro sem moldura própria.
 *
 * **Os 150 px de largura da demanda não se aplicam a este ativo.** Ele é
 * retrato (301×502), de modo que 150 px de largura dariam **250 px de altura**
 * — um quarto da coluna num menu de 264 px. A medida pressupõe a logomarca
 * branca horizontal da dependência externa E1, ainda não entregue. O que
 * resolve a queixa de "miniatura ilegível" agora é o nome em **texto**, que
 * não depende de ativo nenhum; a logomarca cresce de 40 para 96 px de altura
 * (24 → 58 px de largura) e assume a medida pedida quando o PNG transparente
 * chegar.
 */
export function MarcaDoProduto({ clientName }: { clientName?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <BrandMark height={96} />
      <div>
        <div
          style={{
            color: paleta.branco,
            fontFamily: FAMILIA_TITULO,
            fontWeight: 600,
            fontSize: 20,
            lineHeight: '26px',
          }}
        >
          PapelHub
        </div>
        {/* Descritor: constante do produto, não varia por implantação —
            distingue-se da identificação do cliente, logo abaixo. */}
        <div
          style={{
            color: paleta.textoSobreEscuro,
            fontSize: TAMANHO_MINIMO_TEXTO,
            lineHeight: '18px',
          }}
        >
          Gestão de Documentos
        </div>
        {/* Identificação do cliente, quando a implantação a configura
            (capability `identidade-visual`). Fica depois do descritor para que
            a leitura siga produto → descrição → organização. Mesmo tom do
            descritor, sem opacidade: atenuar por `opacity` desfaria o par
            apurado por cálculo (5,48:1 na base do degradê) e burlaria o piso
            que `sistema-de-design` exige. A distinção entre os dois é
            estrutural, não de intensidade. */}
        {clientName && (
          <div
            style={{
              color: paleta.textoSobreEscuro,
              fontSize: TAMANHO_MINIMO_TEXTO,
              lineHeight: '18px',
            }}
          >
            {clientName}
          </div>
        )}
      </div>
    </div>
  );
}
