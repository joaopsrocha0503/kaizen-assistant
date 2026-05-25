# Kaizen Assistant — Projeto de Portfólio (EGI FEUP)

## Contexto do Projeto
Aplicação web de gestão de Kaizen e melhoria contínua para ambiente industrial.
Desenvolvida por João (estudante de EGI na FEUP) como projeto de portfólio.

## Stack Técnica
- **Backend:** Python + Flask + SQLite
- **Frontend:** HTML + CSS + JavaScript puro (sem frameworks)
- **IA:** Groq API (modelo llama-3.3-70b-versatile) — gratuito
- **Base de dados:** SQLite (ficheiro local `database.db`)

## Estrutura de Pastas
```
kaizen-assistant/
├── backend/
│   ├── app.py          ← API REST principal
│   ├── database.py     ← modelos e conexão SQLite
│   └── ai.py           ← integração Groq API
├── frontend/
│   ├── index.html      ← dashboard principal
│   ├── style.css       ← estilos
│   └── app.js          ← lógica frontend
├── CLAUDE.md           ← este ficheiro
├── requirements.txt
└── README.md
```

## Funcionalidades Principais
1. **Dashboard** com KPIs (nº kaizens, taxa conclusão, problemas abertos)
2. **Registo de problemas** com campos: título, descrição, área, responsável, prioridade
3. **Análise 5W1H** assistida por IA
4. **Gerador de relatório A3** automático via IA (Groq)
5. **Tracker de ações** com deadlines, responsáveis e estados
6. **Filtros e estados** dos problemas: aberto, em progresso, concluído

## Convenções de Código
- Python: snake_case, docstrings em português
- JavaScript: camelCase, comentários em português
- API endpoints: prefixo `/api/`
- Respostas JSON sempre com campos `success`, `data`, `error`

## Variáveis de Ambiente
Criar ficheiro `.env` na raiz (nunca commitar):
```
GROQ_API_KEY=a_tua_chave_aqui
FLASK_SECRET_KEY=qualquer_string_aleatoria
```

## Como Correr o Projeto
```powershell
# Instalar dependências
pip install -r requirements.txt

# Correr o backend
cd backend
python app.py

# Abrir o frontend
# Abrir frontend/index.html no browser
```

## Notas Importantes
- A Groq API é gratuita — não usar a API do Claude/Anthropic no código da app
- O frontend comunica com o backend via fetch() para `http://localhost:5000/api/`
- Manter o design profissional e adequado para ambiente industrial (cores sóbrias)
- O projeto deve ser facilmente demonstrável — dados de exemplo incluídos
