# Os seus dados no Allezou

Esta página diz o que o Allezou regista, porquê, durante quanto tempo, e quem o pode ver.
Está escrita para ser lida até ao fim: se alguma coisa não estiver clara, é um defeito
desta página, não da sua atenção.

## Quem é responsável

**Michael Urbina**, residente em Petit-Lancy.

Para qualquer questão ou pedido:

> [contact@allezou.ch](mailto:contact@allezou.ch)  
> Michael Urbina

O tratamento está sujeito à lei federal suíça de proteção de dados (nLPD).

## O que o Allezou regista

O Allezou trata dados pessoais, alguns dos quais dizem respeito a crianças. É por isso
que esta página existe.

| Dado | Porque existe | Durante quanto tempo | Quem o vê |
|---|---|---|---|
| O seu endereço de e-mail | É a sua única forma de entrar: o Allezou não tem palavra-passe | Enquanto a sua conta existir | Só a pessoa titular da conta. Nunca é mostrado aos outros membros |
| O nome que escolhe mostrar | Para que os outros o(a) reconheçam. Escreve-o livremente: « Sophie », « Mãe da Léa », o que preferir | Enquanto a sua conta existir | Os membros dos seus círculos |
| O **primeiro nome** dos seus filhos, e nada mais | Para dizer quem está presente numa saída: « estamos no parque com o Matéo » | Enquanto o mantiver declarado | Os membros dos seus círculos, quando declara a criança presente |
| Os seus círculos e quem deles faz parte | É o coração do produto | Enquanto o círculo existir | Os membros do círculo em causa |
| O nome sob o qual vê um círculo, quando difere do original | Para que « Classe 4P » possa ler-se « Turma do Jules » do seu lado | Enquanto o mantiver | Só a pessoa titular da conta. Os outros membros veem o nome original |
| Que filho está ligado a que círculo | Para que uma saída sem o(a) mais velho(a) não vá parar à turma errada | Enquanto o mantiver | O(a) titular da conta, e o outro progenitor da criança, se existir. Os restantes membros do círculo não veem isto |
| As suas saídas: um local escolhido numa lista, uma hora de fim, e eventualmente uma nota de 140 carateres | É o que partilha | **Apagada 24 horas depois da hora de fim** | Apenas os círculos que escolheu no momento de publicar |
| As suas inscrições em atividades da agenda | Para que outras famílias saibam que o filho delas vai encontrar ali alguém | **Apagada 24 horas depois do fim da atividade**, tal como uma saída | Apenas os círculos que escolheu |
| As suas definições de notificação | Para só o(a) incomodar quando pediu para isso | Enquanto a sua conta existir | Só a pessoa titular da conta |
| As palavras que vigia na agenda: « piscina », « judo » | Para o(a) avisar quando uma atividade publicada contém uma delas | Enquanto as mantiver | Só a pessoa titular da conta. Não são mostradas a ninguém e não servem para mais nada |
| O endereço técnico do seu telemóvel para as notificações | Para lhe enviar as notificações | Enquanto as aceitar | Ninguém: é um identificador técnico |
| Um registo das alterações de permissões (quem fez entrar quem num círculo, quem excluiu quem) | Para permitir compreender um problema de segurança | **12 meses** | O responsável, em caso de incidente |

## O que o Allezou não regista

Cada uma destas ausências pode ser verificada no código.

- **Nenhuma palavra-passe.** Não existe nenhuma em lado nenhum, por isso não há nenhuma
  que possa vazar.
- **Nenhuma posição GPS, nunca.** Uma saída é um local que escolhe numa lista, com uma
  hora de fim. O Allezou nunca pede a posição ao seu telemóvel, nem quando a aplicação
  está aberta, nem em segundo plano.
- **Nenhum histórico de deslocações.** Uma saída passada é apagada, não é arquivada. Nem
  o próprio responsável consegue reconstituir onde uma família esteve no mês passado,
  nem sequer sob a forma de estatística.
- **Nenhuma mensagem.** Não há fio de conversa, nem mensagens privadas, nem comentários.
- **Nenhuma ferramenta de análise de audiência.** Sem Google Analytics, sem pixel
  publicitário, sem rastreadores de terceiros.
- **Nenhuma venda, nenhuma partilha comercial.** Os seus dados não são transmitidos a
  ninguém.
- **Sobre os seus filhos, nada além do primeiro nome.** Os membros de um círculo já
  conhecem as crianças em questão, a aplicação não tem nada a acrescentar. Sem apelido,
  **sem idade nem data de nascimento**, sem fotografia, sem género, sem escola, sem
  turma, sem dados de saúde. O campo « ano de nascimento » existiu durante a conceção,
  e foi depois removido por falta de uma utilização que o justificasse.

## Quem vê o quê, exatamente

Este é o ponto mais importante, e obedece a uma única regra:

> **Uma pessoa vê a sua saída se e só se, no momento em que olha, for membro de um dos
> círculos aos quais dirigiu essa saída, e não tiver cortado a ligação com essa
> pessoa.**

O que daqui decorre:

- Quem **sai de um círculo** deixa imediatamente de ver as saídas desse círculo.
- Quem **não está no círculo** não vê nada, e nem sequer fica a saber quem dele faz
  parte.
- Pode **desmarcar uma pessoa** num círculo: os dois deixam de ver as saídas um do
  outro, sem que a outra pessoa seja avisada disso.
- Quando várias famílias se juntam à mesma saída, **só vê na lista as pessoas com quem
  já partilha um círculo**. Uma família vinda da vizinhança não aparece a um progenitor
  da turma que não a conhece.
- As **notificações** seguem exatamente a mesma regra: não pode receber um aviso sobre
  algo que não veria no ecrã. E a mensagem enviada para o seu telemóvel não diz nem
  quem, nem onde, apenas o nome do círculo, para que um ecrã bloqueado pousado numa
  mesa não revele nada.
- Os **alertas da agenda** são à parte, porque a agenda é pública: todos veem as mesmas
  atividades. O que aí se calcula não é quem tem o direito de saber, é quem pediu para
  ser avisado. A mensagem nomeia então a palavra que vigia, que é sua, e nunca o título
  da atividade.

Esta regra está escrita num único local do código, e é verificada por uma série de
testes que enumeram os casos um a um. É uma demonstração, que pode ser mostrada a
pedido.

## Onde estão os dados

Em servidores situados **na Suíça**. Não saem do país.

Três exceções técnicas, que não dizem respeito a nenhum dado pessoal:

- a agenda é alimentada a partir de sites públicos genebrinos (Cidade de Genebra,
  comunas);
- as páginas desses sites que não publicam uma agenda estruturada são lidas por um
  serviço de inteligência artificial para daí extrair as datas. **Só lhe são enviadas
  páginas web públicas**, nunca um dado que lhe diga respeito. O que daí é extraído é
  depois confrontado com a página de origem: uma data, um título ou um local que aí não
  se encontre não aparece na agenda, e aguarda uma verificação manual;
- a morada de um parque ou de uma sala é enviada uma vez ao OpenStreetMap, para
  conhecer as suas coordenadas e para que a ligação para um mapa caia no ponto certo. É
  a morada de um local público, enviada a partir do nosso servidor. **Nunca a sua, e
  nunca o que consulta**: o seu telemóvel não contacta mais ninguém além de nós — com
  uma exceção, desencadeada por si próprio(a): o mapa, logo a seguir.

## O mapa

A agenda e « Vamos sair » propõem um mapa dos locais. Vem do Google Maps — é o mapa que
a maioria dos pais já sabe ler — e um mapa de fundo carregado automaticamente seria um
rastreador de terceiros, exatamente aquilo que esta página exclui. Obedece por isso a
uma regra simples: **nada é enviado para a Google sem um gesto da sua parte**.

- **Enquanto não pedir o mapa, a Google não vê nada.** Não é carregado com a página:
  nada é enviado antes de tocar em « Ver no mapa ».
- **No momento em que o pede**, o seu navegador descarrega o mapa a partir da Google,
  como se abrisse o Google Maps por sua própria conta. A Google vê então a zona
  apresentada — locais públicos genebrinos — mas nunca quem está a ver que lista: não
  fica a saber nem quem é no Allezou, nem que saída ou atividade estava a ler, nem de
  que página vem.
- As ligações ↗ colocadas ao lado dos locais seguem a mesma regra: abrem o Google Maps
  no momento em que lhes toca, nunca antes.
- **A sua posição nunca entra em jogo.** O mapa mostra locais, não pessoas. O Allezou
  nunca pede a posição ao seu telemóvel — o mapa não muda nada nisso, e o navegador
  recusaria de qualquer forma. A sua posição não é, portanto, enviada para lado nenhum:
  nem para a Google, nem para o Allezou.

## Os seus direitos

Pode, a qualquer momento:

- **ver** todos os dados que lhe dizem respeito;
- **corrigir** o que estiver errado;
- **eliminar** a sua conta, o que apaga os seus dados;
- **remover** um filho, o que apaga o seu primeiro nome;
- **pedir explicações** sobre qualquer ponto desta página.

Escreva para [contact@allezou.ch](mailto:contact@allezou.ch). Tem também o direito de
se dirigir ao Comissário Federal para a Proteção de Dados e a Transparência.

## Se esta página mudar

Qualquer alteração ser-lhe-á anunciada na aplicação antes de entrar em vigor. Uma
alteração que alargasse o que é recolhido ou quem o pode ver nunca será aplicada em
silêncio.

---

*Última atualização: 16 de agosto de 2026.*
