import { Avatar, Button, Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import type { AuthenticatedIdentity } from '@gdoc/shared';
import { IconeConta, IconeSair } from '../app/icons';
import { paleta, TAMANHO_MINIMO_TEXTO } from '../app/theme';
import { iniciaisDoNome, nomeExibido } from './identidade';
import { ROLE_LABEL } from './role-label';

/**
 * Identidade no **rodapé da navegação** (demanda do cliente nº 2, seção 1.1;
 * capability `web-shell-e-auth`, requisito "Identidade no rodapé da navegação
 * apresenta nome, papel e unidade"; change `menu-lateral-e-barra-superior`,
 * design.md D6).
 *
 * Origem única consumida pela coluna lateral **e** pelo painel sobreposto: o
 * requisito exige que os dois modos sejam alimentados do mesmo lugar, e uma
 * segunda composição divergiria em silêncio.
 *
 * **Corpo do cartão é link para "Minha conta"; Sair é botão irmão, fora do
 * link.** A demanda pede o cartão "+ botão Sair" visível e o requisito vigente
 * exige "Minha conta" alcançável por qualquer papel, inclusive
 * `collaborator` — resolver com menu suspenso manteria as duas ações
 * escondidas atrás de um clique, que é justamente o que esta fatia tira do
 * topo. Aninhar o botão dentro do link produziria alvo ambíguo para teclado e
 * para leitor de tela.
 *
 * **A identidade é o nome, nunca o identificador interno nem fragmento dele**
 * (requisito "A identidade apresentada é o nome, não o identificador"). Conta
 * sem nome recorre ao ícone genérico e ao papel.
 *
 * **O "perfil" aqui é o papel de acesso** (`ROLE_LABEL`). A demanda e a US
 * 11.1 falam de **função**, que é `job_title` do cadastro e ainda não chega à
 * identidade autenticada — é a fatia A1, travada pela decisão D2 do plano.
 * Este cartão é a única superfície do shell que apresenta o dado, então a
 * troca fica contida aqui.
 */
export function CartaoDoUsuario({
  identity,
  collapsed,
  onLogout,
}: {
  identity: AuthenticatedIdentity;
  collapsed: boolean;
  onLogout: () => void;
}) {
  const nome = nomeExibido(identity);
  const papel = ROLE_LABEL[identity.role];
  // Texto íntegro para quem aponta ou usa leitor de tela — é ele que preserva
  // o dado quando o nome é mais longo que a largura do cartão.
  const resumo = `${nome ?? papel} — ${papel} — ${identity.unitName}`;

  const avatar =
    nome === null ? (
      <Avatar
        icon={<IconeConta />}
        style={{ background: paleta.azulAvatar, color: paleta.texto }}
      />
    ) : (
      // Iniciais em `texto`, nunca em branco: o par branco × azulAvatar mede
      // 1,54:1 (theme.ts, design.md D7), e o `Avatar` escreve em branco por
      // padrão — sem fixar a cor aqui, o piso de 4,5:1 cairia.
      <Avatar style={{ background: paleta.azulAvatar, color: paleta.texto, fontWeight: 600 }}>
        {iniciaisDoNome(nome)}
      </Avatar>
    );

  if (collapsed) {
    // Colapsado: só o avatar, com os três dados no nome acessível. O
    // identificador interno não aparece em nenhum estado.
    return (
      <div style={{ padding: 12, display: 'flex', justifyContent: 'center' }}>
        <Tooltip title={resumo} placement="right">
          <Link to="/minha-conta" aria-label={`Minha conta — ${resumo}`}>
            {avatar}
          </Link>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        borderTop: `1px solid ${paleta.textoSobreEscuro}33`,
      }}
    >
      <Link
        to="/minha-conta"
        title={resumo}
        aria-label={`Minha conta — ${resumo}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
          color: 'inherit',
        }}
      >
        {avatar}
        {/* `minWidth: 0` nos dois níveis é o que permite o truncamento
            funcionar dentro do flex: sem ele o texto empurra a largura da
            coluna em vez de encurtar. */}
        <span style={{ minWidth: 0, display: 'block' }}>
          <span
            style={{
              display: 'block',
              color: paleta.branco,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {nome ?? papel}
          </span>
          <span
            style={{
              display: 'block',
              color: paleta.textoSobreEscuro,
              fontSize: TAMANHO_MINIMO_TEXTO,
              lineHeight: '18px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {papel} · {identity.unitName}
          </span>
        </span>
      </Link>
      {/* Sair em linha própria, com rótulo **visível** — a demanda pede
          "cartão do usuário + botão Sair", e um botão só de ícone ao lado do
          nome disputaria com ele a largura de 264px. Fora do link acima:
          controle acionável dentro de link é alvo ambíguo para teclado. */}
      <Button
        type="text"
        onClick={onLogout}
        icon={<IconeSair />}
        style={{ color: paleta.branco, justifyContent: 'flex-start' }}
        block
      >
        Sair
      </Button>
    </div>
  );
}
