Sistema de gerenciamento de arquivos com regras de negócio por usuários, um sistema de armazenamento de arquivos. 
Tendo a possibilidade de dizer quais são os usuários que tem acesso a visualizar, baixar e subir o arquivo.

•	Navegador de arquivos com pastas aninhadas estilo windows explore, upload/download/visualização, e breadcrumb de navegação
•	Permissões granulares por usuário ou grupo, com expiração de acesso
•	Painel administrativo para gerenciar usuários, grupos e todas as permissões
•	Design limpo e premium

Adicionar um sistema de registro de auditoria para que o usuário possa ver exatamente quem visualizou ou baixou cada arquivo, incluindo a data e hora da ação.
Criar uma página de dashboard com gráficos de quantidade de arquivos, tipos, e espaço utilizado/livre.
O Dashboard deve ter gráficos de quantidade de arquivos por tipo, uploads por mês, espaço utilizado vs. livre (cota de 10 GB) e cards com estatísticas principais, acessível pela barra lateral.
Deve ter um componente de filtros (data, tipo, autor) e integrá-lo na página de arquivos.
A busca deve ser nome e filtros por data, tipo de arquivo (imagens, vídeos, áudios, PDFs, etc.) e autor na página de arquivos, com botão para limpar filtros.
Adicionar upload de múltiplos arquivos, upload de pasta inteira e download de pasta completa (em zip).
Temos que ter:
•	Enviar Arquivos: upload de múltiplos arquivos de uma vez, com progresso individual
•	Enviar Pasta: seleciona uma pasta inteira preservando a estrutura de subpastas
•	Baixar Pasta: compacta todos os arquivos da pasta (incluindo subpastas) em um ZIP para download
•	Cadastro de usuários: Nome, unidade qual ele está cadastrado, telefone, mail, função/cargo, área de trabalho, observação
•	Permissões por usuário: o admin configura permissões granulares (visualizar, baixar, enviar, editar, excluir) por arquivo ou pasta, com expiração opcional
•	Controle de acesso ativo: usuários comuns só veem arquivos e pastas para os quais receberam permissão (ou que eles mesmos criaram); admins veem tudo
•	FileViewer protegido: acesso direto por URL a um arquivo sem permissão é bloqueado

Criar Lixeira: Itens excluídos vão para a lixeira em vez de serem apagados, podem ser restaurados por até 30 dias, e um workflow roda diariamente às 3h para exclusão permanente automática dos itens vencidos. A página de lixeira fica acessível pelo menu lateral.
Visualizador de  PDFs, imagens, vídeos e áudios. Vou adicionar suporte para documentos Office (Word, Excel, PowerPoint) via Google Docs Viewer e arquivos de texto, sem precisar baixar.

Ambiente de produção será na Google GCP com armazenamento dos arquivos em buckets
