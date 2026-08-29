# Especificação da Página Web do Cliente — Agentic Marketplace

## 1. Objetivo

Construir uma aplicação web moderna, responsiva e interativa em **Next.js** para o **cliente de um marketplace agentic**, na qual o usuário possa:

- Conversar com um agente de IA por meio de um chatbot.
- Pedir ao agente para pesquisar, comparar e comprar produtos ou serviços.
- Criar e gerenciar **mandatos de compra** (purchase mandates).
- Definir limites e condições de compra para o agente.
- Acompanhar o raciocínio operacional do agente de forma resumida e auditável.
- Aprovar ou rejeitar compras que exijam intervenção humana.
- Gerenciar métodos de pagamento sem expor dados sensíveis ao agente.
- Revogar permissões em tempo real.
- Consultar histórico de compras, tentativas bloqueadas e autorizações.
- Visualizar claramente quando uma operação foi aprovada, recusada ou escalada.

A interface deve transmitir confiança, segurança, sofisticação tecnológica e simplicidade, com identidade visual inspirada na **Yuno**, sem copiar literalmente sua marca ou componentes proprietários.

---

# 2. Stack recomendada

A aplicação deve ser construída prioritariamente com o ecossistema **Next.js**, aproveitando recursos nativos de renderização, roteamento, APIs e streaming.

## Framework principal

- **Next.js 15+**
- **React 19+**
- **TypeScript**
- **App Router**
- **Server Components** por padrão
- **Client Components** apenas onde houver interatividade
- **Route Handlers** para endpoints internos
- **Server Actions** para mutações simples e seguras quando fizer sentido

## UI e estilização

- **Tailwind CSS**
- **shadcn/ui** ou **Radix UI** para primitives acessíveis
- **Lucide React** para ícones
- **Framer Motion** para animações em Client Components
- **Geist Sans** e **Geist Mono** via `next/font`

## Estado e dados

- **TanStack Query** apenas para estados remotos altamente interativos no cliente
- **Zustand** para estado global local leve, quando necessário
- Preferir **Server Components + fetch no servidor** para dados que não exigem sincronização contínua no browser
- Utilizar **React Context** apenas para estados de UI realmente globais

## Comunicação e API — mockadas nesta fase

Nesta primeira versão, **não implementar integrações reais de backend, pagamentos, marketplace ou agentes externos**.

Toda a camada de API deve ser **mockada localmente dentro do projeto Next.js**, com o objetivo de permitir a construção e demonstração completa da interface antes da integração com serviços reais.

Utilizar preferencialmente:

- `app/api/.../route.ts` para endpoints mockados;
- objetos TypeScript estáticos;
- arquivos JSON locais;
- delays artificiais para simular latência;
- respostas progressivas mockadas para simular o agente;
- SSE/streaming local mockado quando necessário para demonstrar estados em tempo real.

Os mocks devem simular:

- respostas do agente de IA;
- busca de produtos e serviços;
- merchants;
- ofertas;
- criação, edição e revogação de mandates;
- verificação de autorização;
- aprovação humana;
- métodos de pagamento;
- execução de pagamento;
- receipts;
- histórico de compras;
- audit trail;
- falhas e tentativas bloqueadas.

### Regra importante

Nesta fase:

```text
UI → Next.js Route Handler mockado → dados locais/mockados
```

Não deve existir dependência obrigatória de:

- banco de dados externo;
- gateway de pagamento real;
- MPP real;
- AP2 real;
- Stripe;
- merchant API real;
- serviço de autenticação externo;
- LLM externo;
- marketplace externo.

A arquitetura deve, entretanto, ser preparada para que esses mocks possam ser substituídos posteriormente por implementações reais sem exigir grandes mudanças nos componentes da interface.

## Estratégia recomendada de mocks

Criar uma camada isolada:

```text
src/
└── mocks/
    ├── agents.ts
    ├── conversations.ts
    ├── mandates.ts
    ├── merchants.ts
    ├── offers.ts
    ├── payments.ts
    ├── purchases.ts
    └── audit.ts
```

E serviços que abstraem o acesso:

```text
src/
└── services/
    ├── agent-service.ts
    ├── mandate-service.ts
    ├── marketplace-service.ts
    ├── payment-service.ts
    └── audit-service.ts
```

Os componentes da UI devem consumir os `services`, e não importar diretamente os arquivos de mock.

Dessa forma, futuramente:

```text
mock service
    ↓
real API integration
```

pode ser trocado sem reestruturar a interface.

## Simulação de latência

Para tornar a demo mais realista, utilizar pequenos delays artificiais.

Exemplo conceitual:

```ts
await sleep(700);
```

Estados como:

```text
SEARCHING
COMPARING
VERIFYING_MANDATE
PAYMENT_PENDING
```

devem aparecer gradualmente na interface.

## Simulação de erros

Os mocks também devem implementar cenários negativos deliberadamente.

Exemplos:

```text
MANDATE_REVOKED
AMOUNT_LIMIT_EXCEEDED
CATEGORY_NOT_ALLOWED
AGENT_NOT_VERIFIED
MERCHANT_NOT_VERIFIED
PAYMENT_FAILED
HUMAN_APPROVAL_REQUIRED
```

Esses estados são essenciais para o roteiro do hackathon.

## Persistência

**Não é necessária persistência real nesta fase.**

O estado pode existir:

- em memória;
- em mocks locais;
- em Zustand;
- em estado React;
- ou em uma camada simples de armazenamento temporário.

Opcionalmente, usar `localStorage` apenas para dados não sensíveis e para preservar a experiência durante a demo.

Não armazenar:

- dados reais de cartão;
- tokens reais;
- private keys;
- credentials reais.

## Persistência recomendada futura

Quando a aplicação sair da fase de protótipo, considerar:

- **PostgreSQL**
- **Prisma ORM** ou **Drizzle ORM**

Essas tecnologias **não devem ser uma dependência obrigatória da versão atual**.

Entidades mínimas:

- User
- Agent
- Mandate
- PaymentMethod
- Merchant
- Offer
- Purchase
- AuditEvent
- Conversation
- Message

## Validação

- **Zod** para schemas e validação de payloads
- Reutilizar os mesmos schemas entre:
  - Server Actions;
  - Route Handlers;
  - formulários;
  - objetos de domínio.

## Formulários

- **React Hook Form**
- **Zod**
- Server Actions para submissões sempre que isso simplificar o fluxo

## Autenticação

Para hackathon, pode ser mockada.

Caso implementada:

- **Auth.js / NextAuth**
- sessão segura via cookies HTTP-only
- nunca armazenar credenciais sensíveis em `localStorage`

# 3. Conceito visual

A interface deve combinar:

- dashboard fintech;
- chatbot AI-native;
- estética developer-friendly;
- alto contraste;
- blocos modulares;
- feedback visual de segurança e autorização.

A experiência deve parecer uma mistura conceitual entre:

- ChatGPT;
- dashboard financeiro;
- ferramenta de developer infrastructure;
- Yuno.

O resultado não deve parecer um e-commerce convencional.

---

# 4. Identidade visual

## 4.1 Paleta principal

### Background

```css
--background-primary: #F7F7F5;
--background-secondary: #FFFFFF;
--background-dark: #0B0B0D;
--background-subtle: #F0F1F3;
```

### Azul principal

Inspirado na estética descrita da Yuno:

```css
--primary: #3E4FE0;
--primary-hover: #3342C5;
--primary-soft: #EEF0FF;
```

### Status

```css
--success: #BDEB5D;
--success-dark: #4B6B12;

--danger: #EF4444;
--danger-soft: #FEECEC;

--warning: #F59E0B;
--warning-soft: #FFF7DF;

--info: #3E4FE0;
```

### Texto

```css
--text-primary: #101114;
--text-secondary: #64666C;
--text-muted: #92949A;
--text-inverse: #FFFFFF;
```

### Bordas

```css
--border-default: #E5E6E8;
--border-strong: #CFD1D5;
```

---

# 5. Tipografia

Utilizar uma combinação de:

## Fonte principal

**Geist Sans**, Inter ou equivalente.

Uso:

- títulos;
- mensagens do chat;
- corpo da aplicação;
- menus;
- cards.

## Fonte técnica

**Geist Mono**, JetBrains Mono ou equivalente.

Uso:

- IDs;
- valores monetários importantes;
- labels de status;
- nomes de protocolos;
- detalhes de mandato;
- eventos de auditoria;
- badges;
- logs do agente.

Exemplo:

```text
MANDATE ACTIVE
MAX_SPEND: $150.00
AGENT: travel-agent-01
```

---

# 6. Layout geral

A aplicação desktop deve ocupar toda a viewport.

```text
┌──────────────────────────────────────────────────────────────────┐
│ Sidebar │                    Main Content                        │
│         │                                                        │
│ Logo    │                    Chat Header                         │
│         │--------------------------------------------------------│
│ + Chat  │                                                        │
│         │                                                        │
│ Chats   │                     Chat                               │
│         │                                                        │
│         │                                                        │
│         │                                                        │
│         │--------------------------------------------------------│
│         │                  Chat Composer                         │
│---------│                                                        │
│ Mandate │                                                        │
│ Payment │                                                        │
│ History │                                                        │
│ Settings│                                                        │
│ Profile │                                                        │
└──────────────────────────────────────────────────────────────────┘
```

## Desktop

- Sidebar: `260–280px`
- Main content: restante da tela
- Altura: `100vh`
- Sidebar fixa
- Chat com scroll independente

## Mobile

- Sidebar vira drawer
- Header contém botão hamburger
- Chat ocupa toda largura
- Cards de compra adaptados para coluna única
- Painéis detalhados podem abrir como bottom sheet

---

# 7. Sidebar

A sidebar deve ter aparência semelhante à navegação do ChatGPT, porém com identidade fintech/agentic.

## 7.1 Topo

### Logo

Criar nome temporário do produto ou usar placeholder.

Exemplo:

```text
◈ NOMAD
AGENTIC COMMERCE
```

O símbolo pode usar:

- quadrado;
- hexágono;
- cubo;
- grid;
- símbolo abstrato de conexão.

### Botão de novo chat

Botão destacado:

```text
+ New request
```

ou

```text
+ New purchase
```

Estilo:

- fundo preto;
- texto branco;
- radius 8–10px;
- ícone `Plus`.

---

# 8. Conversas recentes

Exibir seção:

```text
RECENT
```

Exemplos:

- Flight to Córdoba
- Best headphones under $200
- Hotel in Buenos Aires
- SaaS subscription comparison

Cada item:

- título;
- ícone;
- hover;
- menu de contexto com `...`.

Ações:

- renomear;
- arquivar;
- deletar.

---

# 9. Navegação inferior da sidebar

A parte inferior deve conter:

```text
Agent permissions
Payment methods
Purchase history
Audit trail
Settings
```

Ícones sugeridos:

- ShieldCheck
- CreditCard
- ReceiptText
- ScrollText
- Settings

Separar visualmente as funcionalidades relacionadas a segurança.

---

# 10. Perfil do usuário

Na base da sidebar:

```text
┌──────────────────────────┐
│ ● MF                     │
│ Marta Fernández          │
│ Personal account         │
│                       ⋮  │
└──────────────────────────┘
```

Ao clicar:

- profile;
- account;
- logout.

---

# 11. Área principal — Chat

O chat deve ser o centro da experiência.

Objetivo:

> Fazer com que contratar o agente para uma compra seja tão simples quanto conversar com uma IA.

---

# 12. Header do chat

Exemplo:

```text
Shopping Agent
Online · Ready to purchase
```

À direita:

```text
[Mandate: Active] [⋯]
```

Badge do mandate:

- verde limão quando ativo;
- vermelho quando revogado;
- amarelo quando requer aprovação.

Exemplo:

```text
● ACTIVE MANDATE
```

---

# 13. Empty state

Ao iniciar uma nova conversa:

## Título

```text
What can I buy for you?
```

Subtexto:

```text
Tell your agent what you need. It can search, compare,
negotiate and purchase within your permissions.
```

---

# 14. Prompt suggestions

Criar quatro cards rápidos:

```text
✈ Find a flight
Find the best flight to Córdoba under $150
```

```text
💻 Compare products
Find the best mechanical keyboard under $120
```

```text
↻ Subscription
Compare AI coding plans and recommend the best one
```

```text
◇ Reorder
Buy the same coffee I ordered last month
```

Cards:

- border suave;
- hover com leve elevação;
- fundo branco;
- radius ~12px;
- animação de hover.

---

# 15. Mensagens

## Usuário

Alinhamento à direita.

Estilo:

- fundo `#3E4FE0`;
- texto branco;
- border radius grande;
- largura máxima ~70%.

Exemplo:

```text
Find me a flight to Córdoba next Friday.
I don't want to spend more than $150.
```

## Agente

Alinhamento à esquerda.

Estilo:

- sem bubble pesada;
- avatar abstrato;
- texto escuro;
- componentes ricos abaixo da mensagem.

---

# 16. Estado de processamento do agente

Não exibir chain-of-thought interno.

Mostrar apenas ações operacionais resumidas.

Exemplo:

```text
Agent is working

✓ Understanding request
✓ Checking your mandate
● Searching 12 merchants
○ Comparing offers
○ Preparing purchase
```

Ou formato compacto:

```text
SEARCHING MARKETPLACE
12 merchants · 48 offers
```

Utilizar fonte monospace para estados.

---

# 17. Cards de oferta

Quando o agente encontrar opções, apresentar cards.

Exemplo:

```text
┌─────────────────────────────────────────────────────┐
│ BEST MATCH                                          │
│                                                     │
│ LATAM                                  $132.00      │
│ São Paulo → Córdoba                                 │
│                                                     │
│ 10:20 GRU                         15:30 COR          │
│ 1 stop · 7h10                                      │
│                                                     │
│ ✓ Within mandate                                   │
│                                                     │
│ [View details]                      [Select]         │
└─────────────────────────────────────────────────────┘
```

Badges:

- BEST MATCH
- LOWEST PRICE
- FASTEST
- WITHIN MANDATE

---

# 18. Purchase card

Quando o agente decidir comprar:

```text
┌───────────────────────────────────────────────────────┐
│ PURCHASE REQUEST                                      │
│                                                       │
│ Flight GRU → COR                                      │
│ VuelaYa                                               │
│                                                       │
│ Flight                                  $118.00        │
│ Taxes                                    $14.00        │
│ ───────────────────────────────────────────────        │
│ Total                                    $132.00        │
│                                                       │
│ Mandate                                                │
│ Flights to Córdoba · Max $150                         │
│                                                       │
│ ✓ Merchant verified                                  │
│ ✓ Agent identity verified                            │
│ ✓ Within spending limit                              │
│ ✓ Payment method available                           │
│                                                       │
│ Payment                                               │
│ Visa •••• 4242                                       │
│                                                       │
│ [View authorization]                 [Purchase]       │
└───────────────────────────────────────────────────────┘
```

---

# 19. Compra autônoma

Caso o mandate permita compra automática:

```text
✓ Purchase completed autonomously
```

Mostrar:

```text
AUTHORIZED BY
Travel Mandate #MND-4291
```

E:

```text
PAID VIA
MPP
```

ou outro protocolo utilizado.

---

# 20. Human-in-the-loop

Se a compra sair parcialmente do mandato:

Exemplo:

```text
Requires your approval

This flight costs $162.
Your agent is authorized up to $150.

Difference: +$12
```

Botões:

```text
[Reject]
[Approve once]
```

Opcional:

```text
[Update mandate]
```

### Approve once

Deve gerar uma autorização exclusiva para aquela compra.

Não alterar silenciosamente o mandate original.

---

# 21. Compra bloqueada

Exemplo:

```text
PURCHASE BLOCKED
```

Visual:

- borda vermelha;
- ícone ShieldX;
- fundo danger-soft.

Conteúdo:

```text
The agent attempted a purchase outside its mandate.

Requested: $300
Allowed:   $150

Reason
AMOUNT_LIMIT_EXCEEDED
```

Botões:

```text
[Dismiss]
[Review mandate]
```

---

# 22. Composer do chat

Posicionado na parte inferior.

Formato:

```text
┌─────────────────────────────────────────────────────┐
│ Ask your agent to buy something...                 │
│                                                     │
│ +     Mandate: Travel · $150        ⌘ Enter  ➤     │
└─────────────────────────────────────────────────────┘
```

Elementos:

- input textarea expansível;
- botão anexar;
- seletor de mandate;
- botão enviar;
- indicador de agente ativo.

---

# 23. Quick commands

Ao digitar `/`:

```text
/mandate
/payment
/history
/revoke
/status
```

Por exemplo:

```text
/revoke
```

abre modal de revogação do mandate atual.

---

# 24. Página / modal — Agent Permissions

Esta é uma das partes mais importantes do produto.

Título:

```text
Agent Permissions
```

Subtexto:

```text
Control exactly what your agent can purchase.
```

---

# 25. Mandate cards

Exemplo:

```text
┌───────────────────────────────────────────┐
│ ● ACTIVE                                 │
│                                           │
│ Travel Mandate                            │
│                                           │
│ Category          Flights                 │
│ Destination       Córdoba                 │
│ Spending limit    $150                    │
│ Max purchases     1                       │
│ Valid until       Aug 31                  │
│                                           │
│ Agent             Shopping Agent          │
│                                           │
│ [Edit]                       [Revoke]      │
└───────────────────────────────────────────┘
```

---

# 26. Criar mandate

CTA:

```text
+ New mandate
```

Abrir wizard ou modal.

## Passo 1 — O que o agente pode comprar?

Campos:

```text
Category
Product / service
Merchant restrictions
Destination (quando aplicável)
```

## Passo 2 — Limites

```text
Maximum amount
Currency
Maximum number of purchases
Frequency
```

## Passo 3 — Validade

```text
Starts
Expires
```

## Passo 4 — Pagamento

Selecionar método:

```text
Visa •••• 4242
Mastercard •••• 9281
Wallet
```

## Passo 5 — Revisão

Mostrar versão humana:

```text
Your agent will be able to:

Buy one flight to Córdoba
for up to $150
using Visa •••• 4242
until August 31.
```

Mostrar também versão técnica:

```text
CATEGORY = flight
DESTINATION = COR
MAX_AMOUNT = 150 USD
MAX_USAGE = 1
EXP = 2026-08-31T23:59:59Z
```

Botão:

```text
Create & Sign Mandate
```

---

# 27. Mandate simulator

Antes da criação, permitir visualizar exemplos:

```text
Would this mandate allow:
```

```text
✓ Flight to Córdoba — $132
✕ Flight to Córdoba — $180
✕ Hotel in Córdoba — $100
✕ Second flight — $120
```

Este componente deve ser visualmente marcante porque demonstra segurança e transparência.

---

# 28. Revogação

Ao clicar:

```text
Revoke mandate
```

Abrir modal:

```text
Revoke Travel Mandate?

Your agent will immediately lose the ability
to make new purchases using this authorization.
```

Botões:

```text
Cancel
Revoke immediately
```

Depois:

```text
● REVOKED
```

A atualização deve aparecer instantaneamente no chat e no status da aplicação.

---

# 29. Métodos de pagamento

Página/modal:

```text
Payment Methods
```

Cards:

```text
┌───────────────────────────────────┐
│ VISA                              │
│ •••• 4242                         │
│                                   │
│ Default                           │
│                                   │
│ [Manage]                          │
└───────────────────────────────────┘
```

CTA:

```text
+ Add payment method
```

---

# 30. Princípio de segurança na UI

Nunca exibir:

- número completo do cartão;
- CVV;
- private keys;
- tokens sensíveis.

Mensagem opcional:

```text
Your agent never receives your raw payment credentials.
```

Com ícone de shield.

---

# 31. Histórico de compras

Página:

```text
Purchase History
```

Tabela/cards:

| Status | Purchase | Merchant | Amount | Agent | Date |
|---|---|---|---:|---|---|
| Success | Flight GRU → COR | VuelaYa | $132 | Shopping Agent | Aug 29 |
| Blocked | Flight GRU → COR | VuelaYa | $300 | Shopping Agent | Aug 29 |
| Revoked | Hotel Córdoba | HotelNow | $110 | Shopping Agent | Aug 29 |

Filtros:

- status;
- merchant;
- mandate;
- date;
- amount.

---

# 32. Drawer de detalhes da transação

Ao clicar em uma compra:

```text
Purchase #P-83920
```

Mostrar timeline:

```text
14:20:02  Purchase intent created
14:20:02  Agent identity verified
14:20:03  Mandate verified
14:20:03  Merchant challenge received
14:20:03  Payment authorized
14:20:04  Purchase completed
```

Fonte monospace nos eventos.

---

# 33. Audit Trail

Criar página específica:

```text
Audit Trail
```

Objetivo:

Permitir que cliente, merchant ou auditor reconstruam a decisão.

Exemplo:

```text
EVENT #EVT-92831

TYPE
MANDATE_EVALUATION

Agent
shopping-agent-01

Mandate
MND-4291

Purchase
Flight GRU → COR

Checks

✓ agent_identity
✓ mandate_status
✓ expiration
✓ category
✓ destination
✓ amount
✓ usage_limit

DECISION
ALLOW
```

---

# 34. Timeline do agente

No chat, algumas ações importantes podem aparecer como cards discretos:

```text
12 merchants searched
```

```text
48 offers compared
```

```text
3 offers matched your mandate
```

```text
Merchant verified
```

```text
Payment authorized
```

Usar animações suaves e ícones técnicos.

---

# 35. Estados de segurança

Definir visualmente:

## Verde

```text
VERIFIED
AUTHORIZED
SUCCESS
```

## Azul

```text
PROCESSING
SEARCHING
EVALUATING
```

## Amarelo

```text
HUMAN APPROVAL REQUIRED
NEAR LIMIT
```

## Vermelho

```text
DENIED
REVOKED
FAILED
```

---

# 36. Painel de detalhes de autorização

Ao clicar em:

```text
View authorization
```

abrir drawer à direita.

Exemplo:

```text
Authorization

Mandate
Travel Mandate

Status
ACTIVE

Agent
shopping-agent-01
VERIFIED

Purchase
$132 USD

Maximum
$150 USD

Remaining
$18 USD

Policy checks

✓ category == flight
✓ destination == COR
✓ amount <= 150
✓ usage_count < 1
✓ mandate_status == ACTIVE
```

---

# 37. Microinterações

Utilizar Framer Motion para:

- entrada de mensagens;
- surgimento de cards;
- mudança de status;
- expand/collapse;
- modais;
- drawers;
- loading;
- botões.

Evitar animações excessivas.

Duração típica:

```text
150–300ms
```

---

# 38. Elementos visuais inspirados na Yuno

Adicionar discretamente:

## Grid background

Em empty states:

```css
background-image:
  linear-gradient(...),
  linear-gradient(...);
```

Grid extremamente sutil.

## Dots pattern

Utilizar em cards especiais e páginas de segurança.

## Glow azul

Em estados ativos do agente:

```text
box-shadow:
0 0 40px rgba(62, 79, 224, 0.12);
```

## Verde limão

Usar apenas como destaque funcional:

- status aprovado;
- métricas positivas;
- success badges.

Não usar como cor principal.

---

# 39. Bento boxes

Nas páginas de dashboard/configuração, usar composição bento.

Exemplo:

```text
┌───────────────────────┬───────────────┐
│ Active Mandates       │ This month    │
│                       │               │
│ 3                     │ $284 spent    │
├───────────────┬───────┴───────────────┤
│ Blocked       │ Agent activity        │
│               │                       │
│ 4 attempts    │ 27 decisions          │
└───────────────┴───────────────────────┘
```

---

# 40. Responsividade

## Desktop

`> 1024px`

- sidebar fixa;
- chat central;
- drawers laterais.

## Tablet

`768–1024px`

- sidebar compactável;
- cards responsivos.

## Mobile

`< 768px`

- sidebar em drawer;
- chat full screen;
- composer fixo;
- cards em uma coluna;
- actions em bottom sheets.

---

# 41. Acessibilidade

Implementar:

- contraste WCAG AA;
- foco visível;
- navegação por teclado;
- `aria-label`;
- semantic HTML;
- modais com focus trap;
- tooltips acessíveis;
- não depender apenas de cor para indicar status.

Exemplo:

```text
✓ Authorized
```

e não apenas um círculo verde.

---

# 42. Estrutura de rotas — Next.js App Router

Utilizar a pasta `app/`.

Sugestão:

```text
app/
├── layout.tsx
├── page.tsx
├── globals.css
│
├── (app)/
│   ├── layout.tsx
│   │
│   ├── chat/
│   │   ├── new/
│   │   │   └── page.tsx
│   │   └── [conversationId]/
│   │       └── page.tsx
│   │
│   ├── permissions/
│   │   └── page.tsx
│   │
│   ├── payments/
│   │   └── page.tsx
│   │
│   ├── history/
│   │   └── page.tsx
│   │
│   ├── audit/
│   │   └── page.tsx
│   │
│   └── settings/
│       └── page.tsx
│
└── api/
    ├── agent/
    │   └── route.ts
    ├── mandates/
    │   └── route.ts
    ├── purchases/
    │   └── route.ts
    └── agent-events/
        └── route.ts
```

O route group `(app)` deve compartilhar o shell autenticado com:

- sidebar;
- perfil;
- navegação;
- providers necessários.

A rota `/` pode redirecionar para:

```text
/chat/new
```

## Layouts

### `app/layout.tsx`

Responsável por:

- HTML root;
- fonts;
- metadata;
- providers globais mínimos.

### `app/(app)/layout.tsx`

Responsável por:

- `AppShell`;
- sidebar;
- navegação mobile;
- áreas autenticadas.

# 43. Estrutura sugerida de componentes

```text
src/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   └── MobileNav.tsx
│   │
│   ├── chat/
│   │   ├── ChatHeader.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── ChatComposer.tsx
│   │   ├── AgentActivity.tsx
│   │   ├── OfferCard.tsx
│   │   └── PurchaseCard.tsx
│   │
│   ├── mandate/
│   │   ├── MandateCard.tsx
│   │   ├── MandateBadge.tsx
│   │   ├── MandateWizard.tsx
│   │   ├── MandateSimulator.tsx
│   │   └── AuthorizationDrawer.tsx
│   │
│   ├── payment/
│   │   ├── PaymentMethodCard.tsx
│   │   └── PaymentSelector.tsx
│   │
│   ├── audit/
│   │   ├── AuditTimeline.tsx
│   │   ├── AuditEvent.tsx
│   │   └── PolicyChecks.tsx
│   │
│   └── ui/
│       ├── Badge.tsx
│       ├── Button.tsx
│       ├── Modal.tsx
│       ├── Drawer.tsx
│       └── Tooltip.tsx
│
├── actions/
│   ├── mandates.ts
│   ├── payments.ts
│   └── purchases.ts
│
├── lib/
│   ├── auth.ts
│   ├── db.ts
│   ├── mandates.ts
│   ├── payments.ts
│   ├── marketplace.ts
│   ├── audit.ts
│   └── validations/
│       ├── mandate.ts
│       ├── purchase.ts
│       └── payment.ts
│
├── stores/
│   ├── useAgentStore.ts
│   └── useUiStore.ts
│
└── types/
    ├── agent.ts
    ├── mandate.ts
    ├── purchase.ts
    └── payment.ts
```

## Regra Server vs Client Components

Por padrão, componentes devem ser **Server Components**.

Adicionar:

```ts
"use client";
```

somente quando necessário para:

- eventos do browser;
- `useState`;
- `useEffect`;
- Zustand;
- Framer Motion;
- dialogs/drawers interativos;
- textarea do chat;
- atualização de progresso em tempo real.

Exemplos:

### Server Components

- páginas de histórico;
- carregamento inicial de mandates;
- detalhes de compra;
- audit log;
- layout;
- cards puramente informativos.

### Client Components

- `ChatComposer`;
- `MandateWizard`;
- `AuthorizationDrawer`;
- `AgentActivity`;
- controles de revogação;
- modais;
- componentes animados.

# 44. Modelos de dados front-end

## Agent

```ts
type Agent = {
  id: string;
  name: string;
  status: "online" | "working" | "offline";
  verified: boolean;
};
```

## Mandate

```ts
type Mandate = {
  id: string;
  name: string;
  agentId: string;

  status:
    | "active"
    | "revoked"
    | "expired";

  constraints: {
    category?: string;
    merchantIds?: string[];
    maxAmount?: number;
    currency?: string;
    maxPurchases?: number;
    destination?: string;
  };

  validFrom: string;
  validUntil: string;

  paymentMethodId: string;
};
```

## Purchase

```ts
type Purchase = {
  id: string;

  merchant: {
    id: string;
    name: string;
    verified: boolean;
  };

  items: PurchaseItem[];

  subtotal: number;
  fees: number;
  taxes: number;
  total: number;

  currency: string;

  mandateId: string;

  status:
    | "searching"
    | "pending_authorization"
    | "requires_approval"
    | "authorized"
    | "paying"
    | "completed"
    | "blocked"
    | "failed";
};
```

---

# 45. Estados do fluxo de compra

Usar uma state machine conceitual:

```text
IDLE
 ↓
UNDERSTANDING_REQUEST
 ↓
SEARCHING
 ↓
COMPARING
 ↓
OFFER_SELECTED
 ↓
VERIFYING_MANDATE
 ├──────────────→ BLOCKED
 ├──────────────→ REQUIRES_HUMAN_APPROVAL
 ↓
AUTHORIZED
 ↓
PAYMENT_PENDING
 ↓
PAID
 ↓
COMPLETED
```

Em qualquer momento antes do pagamento:

```text
MANDATE_REVOKED
      ↓
BLOCKED
```

---

# 46. Cenário principal da demo

A interface deve suportar exatamente este roteiro:

## Etapa 1

Usuário:

```text
Buy me a flight to Córdoba if it costs less than $150.
```

Agente:

```text
I'll look for flights that match your Travel Mandate.
```

---

## Etapa 2

Mostrar busca:

```text
Searching 12 merchants...
48 offers found.
```

---

## Etapa 3

Oferta:

```text
VuelaYa
GRU → COR
$132
```

---

## Etapa 4

Mostrar verificação:

```text
✓ Agent verified
✓ Merchant verified
✓ Mandate active
✓ Flight allowed
✓ $132 <= $150
```

---

## Etapa 5

Compra completa:

```text
Purchase completed
$132

Authorized by
Travel Mandate #MND-4291
```

---

# 47. Trial by fire — revogação

Durante a demo:

Usuário abre:

```text
Agent Permissions
```

Clica:

```text
Revoke mandate
```

O badge global muda imediatamente:

```text
REVOKED
```

Depois pede:

```text
Buy another flight.
```

Agente tenta.

UI mostra:

```text
PURCHASE BLOCKED

Mandate MND-4291 was revoked
at 14:32:08.

No payment was initiated.
```

---

# 48. Trial by fire — limite excedido

Mandate:

```text
MAX $150
```

Agente encontra:

```text
$300
```

Mostrar:

```text
BLOCKED

Requested
$300

Authorized
$150

Violation
AMOUNT_LIMIT_EXCEEDED
```

---

# 49. Trial by fire — human approval

Preço:

```text
$162
```

Sistema:

```text
Requires approval

Your current limit is $150.

Approve this $162 purchase once?
```

Botões:

```text
Reject
Approve once
```

---

# 50. Página inicial recomendada para o protótipo

A primeira tela deve priorizar:

1. sidebar;
2. identidade do agente;
3. chat;
4. composer;
5. mandate ativo;
6. quick prompts.

Evitar dashboards excessivos antes do usuário iniciar uma conversa.

O produto deve comunicar:

> "Eu posso pedir para meu agente comprar qualquer coisa, mas continuo no controle."

---

# 51. Princípios de UX

## Controle humano

O usuário deve saber:

- o que o agente pode fazer;
- por que uma compra foi aceita;
- por que foi recusada;
- quanto será cobrado;
- qual método será usado;
- qual mandate autorizou a compra.

## Transparência sem excesso técnico

O usuário comum vê:

```text
Within your $150 travel limit
```

O usuário avançado pode expandir:

```text
amount <= mandate.constraints.maxAmount
```

## Segurança visível

Não esconder verificações importantes.

Mostrar claramente:

```text
Agent verified
Mandate verified
Merchant verified
Payment protected
```

## Fail visibly

Nenhuma compra fora do mandate deve parecer silenciosamente bem-sucedida.

---

# 52. Copy / tom de voz

Tom:

- direto;
- confiante;
- técnico sem ser complexo;
- sem linguagem infantil;
- sem exageros.

Preferir:

```text
Purchase blocked
Your mandate was revoked before payment.
```

Evitar:

```text
Oops! Something went wrong 😅
```

---

# 53. Animação de carregamento

Evitar spinner genérico como único feedback.

Mostrar etapas:

```text
Checking mandate
Searching merchants
Comparing 48 offers
Verifying merchant
Preparing payment
```

Ícones podem alternar entre:

```text
○ pending
● active
✓ complete
× failed
```

---

# 54. Toasts

Exemplos:

## Mandate criado

```text
Mandate created
Your agent can now purchase within these limits.
```

## Revogado

```text
Mandate revoked
Future purchases using this mandate will be blocked.
```

## Compra

```text
Purchase completed
$132 paid to VuelaYa.
```

## Compra bloqueada

```text
Purchase blocked
Amount exceeded the mandate limit.
```

---

# 55. Segurança visual

Componentes sensíveis podem usar um pequeno label:

```text
SECURE
```

ou:

```text
VERIFIED
```

com fonte monospace.

Evitar cadeados gigantes ou estética bancária antiquada.

A segurança deve parecer infraestrutura moderna.

---

# 56. Dark elements

A identidade visual pode usar blocos pretos pontualmente.

Por exemplo:

```text
┌────────────────────────────────────────┐
│ AGENT STATUS                           │
│                                        │
│ ● ONLINE                               │
│                                        │
│ 27 decisions                           │
│ 3 purchases                            │
│ 4 blocked attempts                     │
└────────────────────────────────────────┘
```

Não transformar toda a aplicação em dark mode por padrão.

---

# 57. Configurações

Página:

```text
Settings
```

Seções:

### Agent

- nome;
- modo de autonomia;
- notificações;
- default mandate.

### Purchase behavior

- always ask before purchase;
- allow autonomous purchases;
- require approval near limit;
- merchant preference.

### Notifications

- completed purchases;
- blocked attempts;
- mandate expiration;
- mandate usage.

### Appearance

- light;
- dark;
- system.

---

# 58. Modos do agente

Poderão existir três níveis:

```text
Suggest only
```

Agente busca e recomenda, mas nunca compra.

```text
Ask before buying
```

Agente pode preparar a compra, mas exige confirmação.

```text
Autonomous within mandate
```

Agente compra automaticamente desde que todas as políticas sejam atendidas.

Isso deve aparecer de forma clara nas configurações.

---

# 58.1 Estratégia de renderização no Next.js

A aplicação deve utilizar renderização híbrida.

## SSR / Server Components

Usar para:

- carregamento de conversas;
- histórico de compras;
- mandates;
- métodos de pagamento;
- audit trail;
- configurações iniciais.

## Client-side interaction

Usar para:

- chatbot;
- composer;
- progresso do agente;
- animações;
- human approval;
- revogação instantânea;
- filtros interativos;
- drawers e modais.

## Streaming

O fluxo do agente deve preferencialmente ser exibido progressivamente.

Exemplo:

```text
User sends message
      ↓
POST /api/agent
      ↓
Agent process starts
      ↓
SSE / streaming
      ↓
UNDERSTANDING_REQUEST
      ↓
SEARCHING
      ↓
COMPARING
      ↓
VERIFYING_MANDATE
      ↓
AUTHORIZED
      ↓
PURCHASE_COMPLETED
```

A UI deve atualizar cada estado sem recarregar a página.

---

# 58.2 Server Actions recomendadas

Exemplos:

```ts
createMandate()
updateMandate()
revokeMandate()
approvePurchaseOnce()
addPaymentMethod()
setDefaultPaymentMethod()
```

Operações sensíveis devem sempre ser revalidadas no servidor.

Nunca confiar apenas no estado enviado pelo cliente.

Exemplo:

```text
Client:
"mandate is active"

Servidor:
consulta o estado real do mandate
antes de autorizar qualquer operação.
```

---

# 58.3 Segurança específica para Next.js

- Nunca expor secrets em variáveis prefixadas com `NEXT_PUBLIC_`.
- Chaves privadas, tokens de pagamento e secrets devem existir apenas no servidor.
- Não armazenar dados sensíveis em Zustand, React state persistido ou localStorage.
- Validar novamente permissões em Server Actions e Route Handlers.
- Utilizar cookies HTTP-only para sessão.
- Proteger rotas privadas via middleware ou validação server-side.
- Toda mutação financeira deve ocorrer no servidor.
- O browser pode solicitar uma compra, mas nunca assinar ou executar diretamente credenciais de pagamento.
- Aplicar rate limiting em endpoints de agente e pagamento.
- Usar idempotency keys em criação de compras.

---

# 58.4 Estrutura de API mockada sugerida

```text
POST   /api/agent
GET    /api/agent-events

GET    /api/mandates
POST   /api/mandates
PATCH  /api/mandates/:id
POST   /api/mandates/:id/revoke

GET    /api/offers
POST   /api/purchases
POST   /api/purchases/:id/approve

GET    /api/history
GET    /api/audit/:purchaseId
```

Nesta fase, esses endpoints devem ser implementados como **Route Handlers mockados do próprio Next.js**.

Eles devem retornar dados fictícios consistentes com o fluxo da interface.

Exemplo:

```text
POST /api/agent
→ retorna eventos simulados do agente

POST /api/mandates
→ cria mandate em memória/mock

POST /api/mandates/:id/revoke
→ altera estado local para REVOKED

POST /api/purchases
→ simula ALLOW / DENY / ESCALATE

GET /api/audit/:purchaseId
→ retorna timeline mockada
```

Não integrar serviços externos nesta etapa.

---

# 58.5 Fluxo da aplicação nesta fase

Nesta fase, o fluxo deve ser:

```text
Browser
   │
   │ user message
   ▼
Next.js Client Component
   │
   ▼
Mock Route Handler
   │
   ▼
Mock Agent / Mock Marketplace / Mock Mandate Engine
   │
   ▼
Local mock data
   │
   ▼
SSE / streamed mock response
   │
   ▼
React UI updates
```

Exemplo de compra:

```text
User:
"Find me a flight under $150"

        ↓

POST /api/agent

        ↓

Mock agent emits:

UNDERSTANDING_REQUEST
SEARCHING
COMPARING

        ↓

Mock marketplace returns offers

        ↓

Mock mandate engine returns:

ALLOW

        ↓

Mock payment service returns:

PAYMENT_COMPLETED

        ↓

UI renders receipt
```

A interface deve ser construída de forma que posteriormente seja possível substituir:

```text
Mock Agent          → Real AI Agent
Mock Marketplace    → Real merchant integrations
Mock Mandate Engine → AP2 / authorization backend
Mock Payment        → MPP / Stripe / payment rail
Mock Audit          → persistent audit infrastructure
```

sem alterar significativamente os componentes React.

A regra central continua sendo:

> **Toda decisão de segurança é representada como uma resposta do servidor, mesmo quando o servidor está mockado. O cliente apenas solicita ações e apresenta os resultados.**

# 59. Entregável mínimo do hackathon

A implementação mínima precisa ter:

- sidebar funcional;
- chat interativo;
- sugestões iniciais;
- estado de busca;
- cards de ofertas;
- purchase card;
- mandate ativo;
- criação ou edição de mandate;
- botão de revogação;
- fluxo de compra aprovada;
- fluxo de compra bloqueada;
- human approval;
- métodos de pagamento;
- histórico;
- audit drawer ou timeline.

---

# 60. Prioridade de implementação

## P0 — obrigatório

1. App shell
2. Sidebar
3. Chat
4. Composer
5. Mandate card
6. Purchase card
7. ALLOW / DENY / ESCALATE
8. Revogação ao vivo
9. Payment method card
10. Histórico básico

## P1 — alto impacto

11. Offer cards
12. Agent progress
13. Audit timeline
14. Authorization drawer
15. Mandate simulator
16. Framer Motion

## P2 — se houver tempo

17. Dark mode
18. Quick commands
19. Métricas em bento boxes
20. Filtros avançados
21. Merchant reputation
22. Notificações em tempo real

---

# 61. Critérios de qualidade

A página deve parecer:

- produto real;
- consistente;
- rápida;
- altamente interativa;
- confiável;
- agent-first;
- preparada para desktop e mobile.

Evitar:

- aparência de template genérico;
- excesso de gradientes;
- glassmorphism exagerado;
- cards em todas as áreas;
- bordas arredondadas excessivas;
- emojis em excesso;
- interfaces com estética infantil;
- texto técnico demais na experiência principal;
- ocultar decisões de segurança críticas.

---

# 62. Resultado esperado

Ao olhar a página por poucos segundos, o usuário deve entender:

1. Há um agente de IA disponível.
2. Ele pode pesquisar e comprar.
3. Existe um limite explícito do que ele pode fazer.
4. O usuário continua controlando o dinheiro.
5. Compras são verificadas antes de serem pagas.
6. Permissões podem ser revogadas imediatamente.
7. Existe um registro completo das decisões.

A mensagem central da experiência deve ser:

> **Your agent can shop for you. You stay in control.**


---

# 63. Instruções para geração do projeto

Ao gerar o código inicial, utilizar:

```bash
npx create-next-app@latest agentic-marketplace-client \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"
```

Estruturar a aplicação usando exclusivamente o **Next.js App Router**.

Não utilizar:

- Vite;
- React Router;
- backend separado nesta fase.

O roteamento deve ser controlado pelo Next.js.

Priorizar:

- Server Components;
- Client Components apenas para interatividade;
- Route Handlers mockados;
- Server Actions quando úteis;
- streaming/SSE mockado;
- tipagem forte com TypeScript;
- componentes desacoplados da implementação das APIs.

## Requisito obrigatório de mocks

A aplicação gerada deve funcionar integralmente sem qualquer serviço externo.

Executar apenas:

```bash
npm install
npm run dev
```

deve ser suficiente para demonstrar:

- conversa com agente;
- busca simulada;
- comparação de ofertas;
- criação de mandate;
- compra autorizada;
- compra bloqueada;
- aprovação humana;
- revogação ao vivo;
- pagamento simulado;
- receipt;
- histórico;
- audit trail.

Toda API deve ser implementada temporariamente como mock local em:

```text
app/api/
```

ou por meio da camada:

```text
src/mocks/
src/services/
```

## Separação obrigatória

Evitar lógica mockada diretamente dentro dos componentes React.

Preferir:

```text
Component
    ↓
Service
    ↓
Mock API / Mock Data
```

e não:

```text
Component
    ↓
hardcoded business logic
```

Isso permitirá trocar os mocks posteriormente por integrações reais.

## Integrações futuras

Deixar pontos de extensão claros para:

```text
Agent          → LLM / agent framework
Mandates       → AP2 / authorization service
Payment        → MPP
Merchants      → marketplace APIs
Authentication → Auth.js / provider externo
Database       → PostgreSQL
Audit          → persistent event store
```

Nenhuma dessas integrações deve ser necessária para a versão atual.

O projeto final deve abrir localmente em:

```text
http://localhost:3000
```
