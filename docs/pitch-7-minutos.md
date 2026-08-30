# Pitch de 7 minutos — Nomad

## Estratégia de storytelling aplicada

A estrutura combina duas abordagens:

- A [Y Combinator recomenda](https://www.ycombinator.com/blog/guide-to-demo-day-pitches/) não esconder o principal argumento, comunicar com clareza e escolher apenas três ou quatro “vértebras” que a audiência conseguirá lembrar. A YC também trata o [*unique insight*](https://www.ycombinator.com/blog/how-to-pitch-your-company/) — aquilo que entendemos sobre o problema e os outros não — como o melhor momento de “aha” do pitch.
- O [guia de speakers da TED](https://storage.ted.com/tedx/manuals/tedx_speaker_guide.pdf?lang=en) sugere começar fazendo a audiência se importar, explicar uma única ideia com clareza, apresentar evidência e terminar mostrando o impacto dessa ideia. A orientação de storytelling da TED acrescenta personagem, dilema, tensão, apenas os detalhes necessários e uma resolução satisfatória.

### A única ideia que deve sobreviver ao pitch

> **A Nomad não tenta tornar a IA confiável. Ela torna a autoridade da IA limitada, verificável e revogável.**

O pitch inteiro deve provar essa frase. O problema do hackathon aparece rapidamente, pois todos estão resolvendo o mesmo desafio. O tempo é usado para explicar por que a Nomad resolveu de uma forma diferente.

### As quatro vértebras da história

1. **A autoridade nunca viaja com o agente.** Ele não recebe cartão nem segredo reutilizável de pagamento.
2. **A prova é específica para uma ação.** Ela vincula agente, intenção, bytes da requisição, rota, mandato, versão, nonce e prazo.
3. **Assinatura é evidência, não permissão.** O backend reconsulta o mandato atual; até uma prova criptográfica válida perde contra uma revogação.
4. **A segurança cria valor para todos.** A pessoa ganha controle, o agente ganha autonomia limitada e o lojista ganha conversão com evidência auditável.

Essas quatro ideias correspondem diretamente aos critérios da banca: mecanismo original, profundidade arquitetural, casos reais de falha, prova de funcionamento e uma experiência compreensível para os três participantes.

| Critério | Como a narrativa prova |
| --- | --- |
| Bom funcionamento | A demo altera o estado ao vivo e mostra três respostas diferentes do mesmo sistema: permitir, escalar e bloquear. |
| Resolução real | A história cobre os “casos feios” que causam perda financeira: excesso de limite, comprometimento do agente, replay e revogação. |
| Profundidade | O mecanismo revela três fronteiras de confiança, prova vinculada à ação, revalidação e um trade-off arquitetural consciente. |
| Originalidade | O “aha” não é o mandato; é separar identidade humana, intenção do agente e autoridade financeira. |
| Clareza | Uma pessoa, um pedido e uma transação atravessam comprador, agente e lojista sem trocar de exemplo. |

## Gate de integridade antes da apresentação

O roteiro principal pressupõe que comprador, agente, API e lojista compartilham o mesmo mandato e a mesma tentativa de compra. No estado inspecionado do repositório, a compra visual e o workspace do lojista ainda usam mocks, enquanto limite, escalonamento e revogação são comprovados no backend demonstrativo do agente.

Só diga “ponta a ponta” se, antes da apresentação:

- a revogação da interface atingir o mandato realmente consumido pelo agente;
- a tentativa recém-executada aparecer no workspace do lojista;
- a alteração feita pelo juiz não exigir mudança de código ou reinício;
- toda a demo usar o mesmo caso — monitor ou voo, sem alternar entre os dois.

## Roteiro principal

### 0:00–0:35 — Abra pelo diferencial, não pelo problema

> Todos aqui receberam o mesmo desafio: permitir que uma IA compre em nome de uma pessoa. Então o nosso diferencial não é mostrar que um agente consegue pagar.
>
> O nosso diferencial começa com uma constatação: **um sistema financeiro seguro não pode depender de a IA se comportar bem.** Ela pode alucinar, sofrer prompt injection ou ser comprometida.
>
> Por isso, a Nomad não tenta tornar a IA confiável. Ela torna a autoridade da IA limitada, verificável e revogável.

### 0:35–1:10 — Marta e a falsa solução óbvia

> Marta quer que seu agente compre um monitor por até 300 dólares.
>
> A solução mais direta seria entregar ao agente um cartão ou um token de pagamento com algumas regras. Mas, se a autoridade para gastar viaja com o agente, comprometer o agente significa comprometer essa autoridade.
>
> Nós separamos três coisas que normalmente são tratadas como uma só: **a identidade da Marta, a intenção do agente e a autoridade para mover dinheiro.** Essa separação é o centro da Nomad.

### 1:10–2:05 — Revele o mecanismo em três atos

> Primeiro, Marta transforma linguagem natural em um mandato estruturado: produto, limite, validade e meio de pagamento. Ela confirma sua presença com uma passkey. A biometria, quando usada pelo dispositivo, não sai do autenticador.
>
> Segundo, o modelo pode pesquisar e escolher uma oferta, mas não recebe o cartão nem guarda uma chave privada. Para apresentar uma compra, ele solicita uma prova Ed25519 de curta duração, vinculada aos bytes exatos da intenção, à rota, ao mandato e à versão atual, com nonce e expiração.
>
> Terceiro, essa assinatura não autoriza o pagamento. Ela apenas prova quem apresentou aquela intenção. O backend verifica identidade, escopo, valor, validade, versão e revogação no momento da decisão. **O modelo propõe; regras determinísticas decidem.**

### 2:05–2:35 — Mostre por que todos ganham

> Para Marta, isso significa autonomia sem entregar o cartão e revogação a qualquer momento.
>
> Para o agente, significa liberdade dentro de um limite, sem carregar um segredo financeiro.
>
> Para o lojista, significa aceitar a venda sem confiar na narrativa da IA: ele recebe verificação pseudônima, prova da execução, motivos determinísticos e uma trilha para disputa.
>
> Cada parte recebe exatamente o que precisa — e não recebe o que não precisa.

### 2:35–3:00 — Crie a tensão da demo

> Em vez de mostrar apenas um caminho feliz, vamos tentar quebrar essa arquitetura.
>
> O mesmo agente fará uma compra válida, tentará ultrapassar o limite e, por fim, apresentará uma prova criptográfica correta depois que um juiz revogar o mandato.
>
> Se a autoridade realmente está fora do agente, o sistema precisa saber quando aceitar, quando escalar e quando bloquear.

## 3:00–6:00 — Demo como clímax da história

### 3:00–3:35 — A pessoa define a fronteira

Marta pede: “Compre um monitor ultrawide por até 300 dólares.” Mostre o mandato gerado, altere um campo e confirme com passkey.

> A IA interpretou o pedido, mas ainda não ganhou permissão para gastar. Marta enxerga e controla escopo, teto, validade e método de pagamento. A passkey confirma a pessoa; nenhum cartão ou dado biométrico vai para o agente.

**O que a banca deve perceber:** clareza da experiência e controle humano explícito.

### 3:35–4:10 — Autonomia quando tudo está dentro da regra

Execute a oferta válida. No recibo, destaque valor, mandato e ID da prova.

> O agente encontrou uma oferta elegível. A prova foi criada para esta intenção exata, e o backend confirmou o mandato atual antes de permitir a execução. Dentro da fronteira, a experiência é autônoma e sem fricção.

**O que a banca deve perceber:** o sistema funciona sem transformar segurança em aprovação manual de cada passo.

### 4:10–4:45 — A IA quer; a regra não deixa

Peça ao juiz um valor acima do teto ou selecione a oferta fora do limite. Mostre `escalation_required` ou a rejeição com os dois valores visíveis.

> Agora o modelo quer uma compra de valor maior. Ele pode argumentar, recomendar e até apresentar uma intenção bem-formada. Mas ele não pode transformar justificativa em autoridade financeira. O fluxo para e devolve a decisão à pessoa.

**O que a banca deve perceber:** resolução do caso feio por regra determinística, não por prompt.

### 4:45–5:25 — Trial by fire: a prova válida que deve falhar

Entregue ao juiz o controle de revogação. Depois, execute uma nova tentativa com o mesmo agente e mostre `MANDATE_REVOKED` sem reiniciar nada.

> Este é o ponto central da Nomad: o agente continua sendo quem diz ser, e sua prova pode estar criptograficamente correta. Mesmo assim, a compra falha.
>
> **Assinatura é evidência, não permissão.** Como a autoridade permanece no backend, a revogação atual vence uma credencial antiga.

**O que a banca deve perceber:** originalidade, profundidade e leitura de estado em tempo real.

### 5:25–6:00 — A mesma história pelo olhar do lojista

Abra a tentativa que acabou de acontecer no workspace do lojista. Mostre agente verificado, motivo determinístico, prova, referência do pagamento e eventos de auditoria.

> Marta vê controle. O agente vê uma fronteira. O lojista vê evidência operacional: o que foi apresentado, qual regra decidiu e qual foi o resultado.
>
> Nós não deslocamos o risco para o lojista para proteger o comprador. Criamos uma transação em que segurança e conversão apontam para o mesmo lado.

**O que a banca deve perceber:** benefício multilateral e fechamento visual da história.

## 6:00–7:00 — Interpretação e frase final

> Algumas soluções param no mandato. Mas ele ainda pode expirar, ser revogado, reapresentado contra outra compra ou usado pela identidade errada.
>
> Por isso, construímos três controles independentes: presença humana por passkey, intenção do agente por prova específica e autoridade financeira por validação de estado no backend.
>
> Escolhemos uma máquina de estados pequena, uma única decisão probabilística e interrupção humana explícita. Perdemos flexibilidade, mas tornamos o caminho do dinheiro testável e explicável.
>
> A originalidade da Nomad não é um novo algoritmo criptográfico. É colocar a confiança no lugar certo.
>
> **Nós confiamos na IA para encontrar valor. Nunca confiamos nela para definir a própria autoridade.**
>
> A Nomad transforma agentes de bots que os lojistas precisam bloquear em compradores que pessoas podem controlar e empresas podem verificar.

## Versão honesta se a integração não estiver pronta

Se as três superfícies ainda não compartilharem a mesma transação, substitua a transição por:

> Construímos três camadas funcionais: a experiência do comprador, o núcleo autoritativo e a operação do lojista. Hoje vamos provar o mecanismo central em cada uma e deixar explícita a integração que ainda falta entre elas.

Nesse caso:

1. Diga que a execução mostrada na interface do comprador é simulada.
2. Mostre limite, escalonamento e revogação no harness autoritativo do agente.
3. Diga que o workspace do lojista está exibindo uma projeção pré-carregada do formato de auditoria.
4. Retire “ponta a ponta”, “a tentativa que acabou de acontecer” e qualquer afirmação de que as três telas compartilham o mesmo estado.

## Frases de apoio para perguntas da banca

- **Qual é o diferencial em uma frase?** “A autoridade nunca viaja com o agente; ele apresenta evidência, e o backend decide usando o mandato atual.”
- **Por que não usar apenas um token com limite?** “Porque uma credencial reutilizável concentra autoridade no processo mais exposto. Nossa prova é curta, vinculada a uma única ação e ainda depende do estado atual.”
- **Onde a IA realmente decide?** “Na descoberta e seleção da oferta. Ela nunca decide se o dinheiro está autorizado a se mover.”
- **Como o lojista se beneficia?** “Ele aceita mais tráfego automatizado com motivos determinísticos, prova vinculada à transação e evidência para operação e disputa.”
- **Por que isso é original?** “Porque tratamos identidade do humano, intenção do agente e autoridade financeira como três elementos independentes, em vez de comprimi-los numa credencial entregue à IA.”

## Alegações a evitar

- “A biometria gera uma chave matriz.”
- “O agente recebe um token de pagamento impossível de fraudar.”
- “Zero-Knowledge”, pois o projeto mantém o cartão fora do agente, mas não implementa uma prova de conhecimento zero.
- “Trilha imutável”, enquanto não houver uma garantia formal de imutabilidade; use “trilha auditável”.
- “Ponta a ponta”, enquanto comprador, agente, pagamento e lojista não compartilharem comprovadamente a mesma execução.
