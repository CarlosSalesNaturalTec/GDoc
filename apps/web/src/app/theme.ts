import type { ThemeConfig } from 'antd';

/**
 * Origem única dos tokens de apresentação da SPA (capability
 * `sistema-de-design`, requisito "Tokens de apresentação têm origem única";
 * change `identidade-visual-isetes`, design.md D1). Nenhuma tela declara cor
 * de marca, família tipográfica ou raio por literal: tudo deriva daqui e
 * chega aos componentes pelo `ConfigProvider` de `App.tsx`.
 *
 * As cores vêm do guia visual do cliente, **menos** nos dois pontos em que o
 * próprio guia se contradiz com o piso de acessibilidade que ele exige — ver
 * `verdeAcao` (design.md D2) e `bordaControle` (design.md D3). Os pares
 * normatizados são apurados por cálculo em `__tests__/contraste.test.ts`, não
 * por inspeção visual.
 */
export const paleta = {
  /** Topo do degradê da navegação e fundo da tela de login (15,76:1 com branco — nível AAA). */
  marinhoEscuro: '#012442',
  /** Base do degradê da navegação (8,16:1 com branco). */
  marinhoClaro: '#0B5382',
  /**
   * Verde da logomarca. Superfície de destaque — item de navegação ativo,
   * indicador —, **nunca** fundo de texto branco: mede 2,21:1 com branco
   * (design.md D2). Sobre ele vai `texto`, que mede 7,77:1.
   */
  verdeMarca: '#0EC782',
  /** Verde de ação: fundo de botão principal, com rótulo branco a 5,37:1 (design.md D2). */
  verdeAcao: '#067A52',
  /** Links (8,06:1 sobre branco). */
  azulLink: '#025484',
  /** Texto corrente (17,16:1 sobre branco; 15,92:1 sobre a superfície). */
  texto: '#0F1D26',
  /** Texto de apoio (6,30:1 sobre branco; 5,85:1 sobre a superfície). */
  textoApoio: '#52626E',
  /** Fundo da aplicação. */
  superficie: '#F3F7F9',
  /** Branco das superfícies de cartão e do rótulo sobre fundo de ação. */
  branco: '#FFFFFF',
  /**
   * Texto de apoio **sobre a navegação escura** — identificação do cliente
   * sob a logomarca, por exemplo. Opaco de propósito: o branco a 65% que
   * havia antes media 3,78:1 contra a base do degradê, abaixo do piso de
   * 4,5:1 que esta change passa a exigir. Este tom mede 10,58:1 no topo do
   * degradê e 5,48:1 na base — folgado nos dois extremos.
   */
  textoSobreEscuro: '#CBD5DD',
  /**
   * Borda **decorativa** — divisória, contorno de cartão, separador de
   * tabela. Não carrega informação, logo não precisa de contraste (mede
   * 1,27:1 sobre branco). Não serve de contorno de controle (design.md D3).
   */
  bordaDecorativa: '#DCE6EC',
  /**
   * Borda **de controle** — contorno de campo e de caixa de seleção, que
   * identifica o controle e por isso tem piso de 3:1: mede 3,57:1 sobre
   * branco e 3,31:1 sobre a superfície (design.md D3).
   */
  bordaControle: '#788A97',
} as const;

/**
 * Tons semânticos de rótulo de estado (change `identidade-visual-isetes`,
 * tasks 7.1). Os presets de cor do design system **reprovam** no piso de
 * 4,5:1 que esta change passa a exigir — o verde mede 3,37:1 e o laranja
 * 3,34:1 sobre seus próprios fundos. Em vez de repetir uma cor literal em
 * cada tela que exibe estado, o tom vive aqui e é consumido pelo componente
 * `RotuloDeEstado`; os pares são apurados em `__tests__/contraste.test.ts`.
 */
export const tonsDeEstado = {
  positivo: { texto: '#067A52', fundo: '#E6F5EF', borda: '#9CD3BE' },
  alerta: { texto: '#8A4B00', fundo: '#FDF2E2', borda: '#E8C48C' },
  negativo: { texto: '#A8071A', fundo: '#FDECEA', borda: '#EBA9A2' },
  informativo: { texto: '#025484', fundo: '#E8F1F7', borda: '#9CC0D8' },
  neutro: { texto: paleta.texto, fundo: paleta.superficie, borda: paleta.bordaDecorativa },
} as const;

export type TomDeEstado = keyof typeof tonsDeEstado;

/**
 * Tons da etiqueta de **tipo documental** (Épico 10, US 10.1), um por tipo do
 * enum `DocumentType` de `@gdoc/shared`.
 *
 * Moram aqui pela mesma razão de `tonsDeEstado`: o requisito "Tokens de
 * apresentação têm origem única" proíbe uma tela declarar cor de marca por
 * literal, e os presets de cor do design system reprovam no piso de 4,5:1.
 * Cada par texto/fundo é apurado por cálculo em `__tests__/contraste.test.ts`
 * — acrescentar um tipo sem acrescentá-lo lá deixa o piso sem guarda.
 *
 * A cor **nunca** é a portadora da informação: quem diz o tipo é a sigla, que
 * acompanha sempre a etiqueta (US 10.1 cenário 2). A cor é redundância, para
 * quem a distingue.
 */
export const tonsDeTipoDocumental = {
  protocol: { texto: '#025484', fundo: '#E8F1F7', borda: '#9CC0D8' },
  procedure: { texto: '#067A52', fundo: '#E6F5EF', borda: '#9CD3BE' },
  policy: { texto: '#5B3A9B', fundo: '#EFE9FA', borda: '#C2B0E4' },
  form: { texto: '#8A4B00', fundo: '#FDF2E2', borda: '#E8C48C' },
  flowchart: { texto: '#0F6E70', fundo: '#E2F2F2', borda: '#9FD1D2' },
  manual: { texto: '#012442', fundo: '#E8EEF3', borda: '#A9BECE' },
  consent_term: { texto: '#A8071A', fundo: '#FDECEA', borda: '#EBA9A2' },
  internal_notice: { texto: '#3D4F5C', fundo: '#EDF1F4', borda: '#B4C1CA' },
} as const;

/** Família dos títulos (guia do cliente); auto-hospedada via `@fontsource` — design.md D5. */
export const FAMILIA_TITULO = "Lexend, 'Segoe UI', Roboto, Arial, sans-serif";

/** Família do texto corrido; auto-hospedada via `@fontsource` — design.md D5. */
export const FAMILIA_TEXTO = "'Source Sans 3', 'Segoe UI', Roboto, Arial, sans-serif";

/**
 * Piso de tamanho de texto (guia do cliente, item 17). Nenhum texto visível
 * é renderizado abaixo disto — por isso é também o `fontSizeSM` do tema, que
 * é o tamanho de legendas e textos auxiliares do design system.
 */
export const TAMANHO_MINIMO_TEXTO = 13;

/**
 * Piso de área de acionamento (guia do cliente, item 17). Aplicado a
 * `controlHeight` **e** a `controlHeightSM`: "pequeno" neste produto muda
 * densidade tipográfica e espaçamento interno, nunca o alvo de toque — um
 * botão de ação de item numa tabela é acionado por dedo como qualquer outro.
 */
export const ALTURA_MINIMA_ACIONAMENTO = 44;

/** Raio de botões e campos (guia do cliente, bloco 06). */
export const RAIO_CONTROLE = 10;

/** Raio de cartões e superfícies elevadas (guia do cliente, bloco 06). */
export const RAIO_SUPERFICIE = 14;

/**
 * Degradê da navegação lateral — azul-marinho escuro ao topo, claro à base.
 * Vive aqui, e não na tela, para que `AppShell` não declare cor de marca por
 * literal (requisito "Tokens de apresentação têm origem única").
 */
export const DEGRADE_NAVEGACAO = `linear-gradient(180deg, ${paleta.marinhoEscuro} 0%, ${paleta.marinhoClaro} 100%)`;

export const theme: ThemeConfig = {
  token: {
    colorPrimary: paleta.verdeAcao,
    colorLink: paleta.azulLink,
    colorLinkHover: paleta.marinhoClaro,
    colorText: paleta.texto,
    colorTextSecondary: paleta.textoApoio,
    colorTextDescription: paleta.textoApoio,
    colorBgLayout: paleta.superficie,
    colorBorder: paleta.bordaControle,
    colorBorderSecondary: paleta.bordaDecorativa,
    colorSplit: paleta.bordaDecorativa,
    borderRadius: RAIO_CONTROLE,
    borderRadiusLG: RAIO_SUPERFICIE,
    fontFamily: FAMILIA_TEXTO,
    fontSize: 14,
    fontSizeSM: TAMANHO_MINIMO_TEXTO,
    controlHeight: ALTURA_MINIMA_ACIONAMENTO,
    controlHeightSM: ALTURA_MINIMA_ACIONAMENTO,
  },
  components: {
    // O degradê é pintado pela própria navegação (`AppShell`), que precisa
    // cobri-la inteira — topo, menu e rodapé do colapso. O token fica
    // transparente para o fundo chapado do design system não vazar por cima.
    Layout: {
      siderBg: 'transparent',
      // Transparente: o rodapé do colapso fica **sobre** o degradê. Uma cor
      // chapada aqui produziria exatamente a faixa de outra cor que a
      // verificação do degradê proíbe.
      triggerBg: 'transparent',
      triggerColor: paleta.branco,
      headerBg: paleta.branco,
      bodyBg: paleta.superficie,
    },
    // Item ativo: pílula no verde da marca com rótulo e ícone escuros
    // (design.md D2) — 7,77:1, contra os 2,21:1 que o rótulo branco do
    // desenho de referência produziria.
    Menu: {
      darkItemBg: 'transparent',
      darkSubMenuItemBg: 'transparent',
      darkItemSelectedBg: paleta.verdeMarca,
      darkItemSelectedColor: paleta.texto,
      darkItemColor: paleta.branco,
      itemSelectedBg: paleta.verdeMarca,
      itemSelectedColor: paleta.texto,
      itemBorderRadius: RAIO_CONTROLE,
    },
    Button: {
      borderRadius: RAIO_CONTROLE,
      borderRadiusSM: RAIO_CONTROLE,
      primaryShadow: 'none',
      fontWeight: 600,
    },
    Card: { borderRadiusLG: RAIO_SUPERFICIE },
    Input: { borderRadius: RAIO_CONTROLE, borderRadiusSM: RAIO_CONTROLE },
    Select: { borderRadius: RAIO_CONTROLE, borderRadiusSM: RAIO_CONTROLE },
    Table: { borderColor: paleta.bordaDecorativa, headerBg: paleta.superficie },
  },
};

/**
 * Única folha global de estilo da aplicação, e **derivada** dos tokens acima
 * — não é uma segunda fonte da verdade (design.md D1). Existe para as duas
 * coisas que o design system não expõe como token:
 *
 * 1. **Família de título.** Os `Typography.Title` herdam a família do corpo,
 *    e não há token de família para cabeçalho. O requisito "Hierarquia
 *    tipográfica distingue título de texto corrido" exige famílias
 *    distintas; declarar a família em cada tela é o que o requisito "Tokens
 *    de apresentação têm origem única" proíbe.
 * 2. **Área de acionamento da caixa de seleção.** `controlHeight` não
 *    alcança a caixa de seleção, que fica em 22px — abaixo do piso de 44px.
 *    A altura mínima vai no invólucro clicável, com a caixa centrada: o alvo
 *    de toque cresce, o desenho da caixa não.
 * 3. **Foco de teclado em link.** O design system dá anel de foco aos seus
 *    controles, mas o link dentro de um item de menu fica com `outline:
 *    none` — ele **recebe** o foco e nada muda na tela, que é precisamente o
 *    que o requisito "Navegação por teclado revela o elemento focado"
 *    proíbe. O anel é declarado por superfície: azul sobre fundo claro
 *    (8,06:1) e verde da marca sobre a navegação escura (7,77:1) — nenhuma
 *    cor única alcança o piso de 3:1 nos dois fundos ao mesmo tempo.
 *
 * Fora disto não há folha de estilo na aplicação, e nenhuma tela acrescenta
 * uma.
 */
export const ESTILO_GLOBAL = `
h1, h2, h3, h4, h5, h6,
.ant-card-head-title,
.ant-modal-title,
.ant-drawer-title,
.ant-result-title { font-family: ${FAMILIA_TITULO}; }

.ant-checkbox-wrapper,
.ant-radio-wrapper {
  min-height: ${ALTURA_MINIMA_ACIONAMENTO}px;
  display: inline-flex;
  align-items: center;
}

a:focus-visible {
  outline: 3px solid ${paleta.azulLink};
  outline-offset: 2px;
  border-radius: 4px;
}

.ant-menu-dark a:focus-visible,
.ant-layout-sider a:focus-visible {
  outline-color: ${paleta.verdeMarca};
}
`;
