# Kaizen Assistant — Gestão de Melhoria Contínua Industrial

Aplicação web completa para gestão de Kaizen e melhoria contínua em ambiente industrial, com análise assistida por Inteligência Artificial (Groq + LLaMA 3.3 70B).

## Funcionalidades

- **Dashboard** com KPIs em tempo real (total de kaizens, taxa de conclusão, ações atrasadas, problemas por área e prioridade)
- **Registo de Problemas** com título, descrição, área, responsável e prioridade
- **Análise 5W1H assistida por IA** — gera automaticamente a análise estruturada do problema (What, Why, Where, When, Who, How) com causas raiz e ações imediatas sugeridas
- **Gerador de Relatório A3** completo com:
  - Cabeçalho do projeto (título, responsável, área, data, revisão)
  - Contexto e justificativa
  - Estado atual e estado futuro com metas mensuráveis
  - Diagrama de Ishikawa (6M) — todas as 6 categorias preenchidas com causas concretas
  - Análise 5 Porquês
  - Plano de ação com responsáveis por cargo/papel e indicadores numéricos mensuráveis
  - Plano de implementação por etapas
  - Indicadores de acompanhamento e critério de sucesso
  - Lições aprendidas
- **Exportação do Relatório A3 para PDF** gerado programaticamente via jsPDF (sem captura de HTML), com layout multi-página, cabeçalhos coloridos por secção e tabela de contramedidas
- **Sugestões de Melhoria por IA** — quick wins, médio e longo prazo com análise de impacto/esforço e benchmarks do setor
- **Sugestões de Ações por IA** — lista de ações corretivas priorizadas com prazo sugerido em dias
- **Tracker de Ações** com deadlines, responsáveis, controlo de estado e deteção automática de ações atrasadas
- Filtros por estado, prioridade e área em todos os listados
- Design profissional responsivo adequado a ambiente industrial

## Requisitos

- Python 3.9+
- Chave de API Groq (gratuita em [console.groq.com](https://console.groq.com))

## Instalação

```bash
# 1. Clonar/aceder ao diretório do projeto
cd kaizen-assistant

# 2. Criar ambiente virtual
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

# 3. Instalar dependências
pip install -r requirements.txt

# 4. Configurar variáveis de ambiente
copy .env.example .env        # Windows
# cp .env.example .env        # macOS/Linux

# Editar .env e adicionar a sua chave Groq:
# GROQ_API_KEY=gsk_...

# 5. Iniciar o servidor
python app.py
```

## Acesso

Abrir o browser em: **http://localhost:5000**

## Obter Chave Groq (gratuita)

1. Aceder a [console.groq.com](https://console.groq.com)
2. Criar conta gratuita
3. Ir a "API Keys" → "Create API Key"
4. Copiar a chave para o ficheiro `.env`

## Estrutura do Projeto

```
kaizen-assistant/
├── app.py              # Servidor Flask + API REST
├── database.py         # Base de dados SQLite e operações CRUD
├── ai_service.py       # Integração com API Groq
├── requirements.txt    # Dependências Python
├── .env.example        # Template de variáveis de ambiente
└── static/
    ├── index.html      # Frontend SPA
    ├── css/style.css   # Estilos
    └── js/app.js       # Lógica frontend
```

## Stack Técnica

| Camada | Tecnologia |
|--------|------------|
| Backend | Python 3.9+ · Flask · SQLite |
| Frontend | HTML + CSS + JavaScript puro (SPA sem frameworks) |
| IA | Groq API · LLaMA 3.3 70B Versatile |
| PDF | jsPDF 2.5.1 · jsPDF-AutoTable 3.8.2 (client-side) |

## API REST

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/kpis` | KPIs do dashboard |
| GET | `/api/problems` | Listar problemas (filtros: `status`, `area`, `priority`) |
| POST | `/api/problems` | Criar problema |
| GET | `/api/problems/:id` | Obter problema |
| PUT | `/api/problems/:id` | Atualizar problema |
| DELETE | `/api/problems/:id` | Apagar problema |
| POST | `/api/problems/:id/analyze` | Gerar análise 5W1H com IA |
| POST | `/api/problems/:id/a3` | Gerar relatório A3 com IA |
| POST | `/api/problems/:id/suggestions` | Gerar sugestões de melhoria com IA |
| POST | `/api/problems/:id/suggest_actions` | Gerar sugestões de ações corretivas com IA |
| GET | `/api/actions` | Listar ações (filtros: `problem_id`, `status`) |
| POST | `/api/actions` | Criar ação |
| GET | `/api/actions/:id` | Obter ação |
| PUT | `/api/actions/:id` | Atualizar ação |
| DELETE | `/api/actions/:id` | Apagar ação |

## Campos do Problema

| Campo | Tipo | Valores |
|-------|------|---------|
| title | string | Obrigatório |
| description | string | Obrigatório |
| area | string | Obrigatório |
| responsible | string | Obrigatório |
| priority | enum | `low`, `medium`, `high`, `critical` |
| status | enum | `open`, `in_progress`, `completed`, `cancelled` |
| analysis_5w1h | JSON (texto) | Preenchido pela IA via `/analyze` |
| a3_report | JSON (texto) | Preenchido pela IA via `/a3` |

## Campos da Ação

| Campo | Tipo | Valores |
|-------|------|---------|
| problem_id | integer | Obrigatório — ID do problema associado |
| title | string | Obrigatório |
| description | string | Opcional |
| responsible | string | Obrigatório |
| deadline | date | Obrigatório (formato `YYYY-MM-DD`) |
| status | enum | `pending`, `in_progress`, `completed` |
