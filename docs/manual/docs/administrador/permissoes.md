# Conceder e revogar permissões

As permissões são geridas **por recurso** (pasta ou arquivo), na própria página
**Arquivos**. Na linha do item, clique em **Permissões**:

1. Escolha a **pessoa**.
2. Marque os **verbos** desejados: **Visualizar, Baixar, Enviar, Renomear, Excluir**.
3. Opcionalmente, informe um **prazo de expiração**. Deixe em branco para uma
   concessão **permanente**, que vale até ser revogada manualmente.
4. Clique em **Conceder**.

As concessões aparecem em **Concessões**, cada uma marcada como **vigente** (com a
data do vencimento, se houver) ou **expirada**. Você pode **Revogar** qualquer uma
individualmente, vigente ou expirada.

!!! warning "Expirar não é revogar"
    Quando o prazo é atingido, o acesso é encerrado automaticamente, mas a
    concessão **permanece registrada** na lista, marcada como expirada — isso
    preserva o histórico de quem teve acesso e até quando. Só **Revogar** remove a
    concessão da lista.

!!! note "Reconceder atualiza o prazo"
    Conceder de novo o mesmo verbo para a mesma pessoa sobre o mesmo recurso
    substitui o prazo anterior pelo novo — estendendo ou encurtando o acesso.
    Reconceder **sem** informar prazo torna a concessão **permanente**, mesmo que
    ela tivesse um prazo antes.

!!! note "Avisos automáticos"
    Quando você concede um acesso **com prazo**, a pessoa é avisada na hora, pela
    central de notificações. Com a antecedência configurada para o aviso prévio de
    expiração (ver [Limites](../referencia/limites.md)), ela recebe um novo aviso.
    Quando o prazo é atingido e o acesso é encerrado, a **administração da unidade**
    recebe um aviso identificando a pessoa, o recurso e o verbo cortado.

!!! warning "Sem herança automática"
    Conceder permissão sobre uma **pasta** libera **apenas aquela pasta** — não os
    arquivos e subpastas internos, que precisam de concessão própria. Isso é
    intencional, para evitar liberar mais do que o pretendido. A tela exibe um
    aviso lembrando disso ao conceder sobre pasta.

Um colaborador não concede permissão sobre o próprio arquivo — essa ação é exclusiva
da administração. Ver [Compartilhar um arquivo que você enviou](../colaborador/enviar.md#compartilhar-um-arquivo-que-voce-enviou).
