import { Avatar, Button, Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import type { AuthenticatedIdentity } from '@gdoc/shared';
import { IconeConta, IconeSair } from '../app/icons';
import { paleta, TAMANHO_MINIMO_TEXTO } from '../app/theme';
import { funcaoExibida, iniciaisDoNome, nomeExibido, setorExibido } from './identidade';

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
 * **O "perfil" aqui é a função do cadastro** (`funcaoExibida`), com o rótulo
 * do papel de acesso só quando não há função — a decisão D2 do plano, fechada
 * pela resposta 1a do cliente: *"para quem usa o sistema, o cargo é o que faz
 * sentido; 'Colaborador' ou 'Gestor' é coisa interna do sistema"*.
 *
 * **O setor fica no texto íntegro, não na linha visível** (change
 * `funcao-e-setor-na-identidade`, design.md D7). A segunda linha deste cartão
 * já trunca com dois termos ao lado do avatar, nos 264 px medidos na change
 * `menu-lateral-e-barra-superior`; um terceiro termo não acrescentaria
 * informação, acrescentaria elipse. A demanda pede o setor na linha abaixo da
 * saudação (seção 1.3), e é lá que ele aparece.
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
  const funcao = funcaoExibida(identity);
  const setor = setorExibido(identity);
  // Texto íntegro para quem aponta ou usa leitor de tela — é ele que preserva
  // o dado quando o nome é mais longo que a largura do cartão, e é por ele que
  // o setor segue alcançável sem disputar a largura da linha visível.
  const resumo = [nome ?? funcao, funcao, setor, identity.unitName]
    .filter((parte): parte is string => parte !== null)
    .join(' — ');

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
            {nome ?? funcao}
          </span>
          <span
            style={{
              color: paleta.textoSobreEscuro,
              fontSize: TAMANHO_MINIMO_TEXTO,
              lineHeight: '18px',
              // Até **duas** linhas antes de cortar (change
              // `rotulo-administrador-da-unidade`): com o rótulo
              // "Administrador da unidade", uma linha só cortava o nome da
              // unidade — medido: 191px de largura para o texto. Acima de duas
              // linhas o corte volta, e o texto íntegro segue no `title` e no
              // nome acessível.
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflowWrap: 'anywhere',
            }}
          >
            {funcao} · {identity.unitName}
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
