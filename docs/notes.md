# Notas do projeto

## Direcao do produto (atualizada 29/8 14h)

Conversa com o Banin definiu o que construir:

- **MPP + x402**: mockar marketplace de produtos diversos.
- **Stripe MPP para comprar em USDC**: verificar integracao com dinheiro real.
- **Credenciais cruzadas**: o agente precisa cruzar passkey e MPP para fazer a compra. Isso evita prompt injection e takeover do agente.
- **Agente tem cartao de credito e passkey**: a passkey esta atrelada a uma biometria.
- **Guidelines injetadas**: limites de custo e regras de gasto injetados no agente.
- **Deteccao de anomalia**: tanto do lado do vendedor quanto do consumidor.
- **Agente judge com guidelines**: valida compras contra as regras.
- **Sistema inteligente de refund**.
- **Marketplace de agentes inteligente**.
- **Mercado Livre como referencia**, mas o agente consegue comprar fora tambem.
- **Tracks 2 e 3**: ver argumentos (decisao de foco pendente).

---

## Analise de tracks (rascunho inicial)

### Track 1: The Buyer Who Isn't Human

- Pagamentos agenticos: x402? MPP?
- Evitar alucinacao e prompt injection.
- Limite de custos e guidelines para gasto.
- Como o vendedor sabe se eh uma IA comprando?
- HITL na compra: tanto pro lado do cliente (refund, controle) quanto pro vendedor (verificar).

### Track 2: The Control Tower

- Conversao entre diferentes provedores para de funcionar.
- RCA da falha de modo agentico.
- Cruzamento de informacao de pagamento, provedor, pais, AI driven.
- Ponto focal de falha (ML hibrido com LLM).

### Track 3: The Interface That Builds Itself

- Agente que lida com documentacao e email (RAG vs Anthropic/skills).
- Trigger com atividades externas EDA/mail.
- ReAct no environment (notifica cliente, monitora entregas).
- Harness complexo e tooling, com HITL (tool call) quando precisa.
- Lidar com rotas via texto.

### Track 4: The Agent on the Line

- ElevenLabs.
- Executa tool call mid conversa.
- Negocia; precisa de system prompt muito bom.
- Entrega call para humano quando precisa.
- Twilio funcionando.
- Negocia em paralelo com contexto de mercado.
- Agente adapta conforme conversa; latencia baixa.

---

## Perguntas em aberto

- Quais tracks sao da Nauta vs Yuno?
- Quais tracks tem menos gente/competitividade?
- Qual tem a ideia mais diferenciada?
- Ver numeros iniciais de inscricao.
