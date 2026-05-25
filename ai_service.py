import os
import httpx
from groq import Groq

MODEL = "llama-3.3-70b-versatile"


def _client():
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY environment variable not set")
    # groq==0.9.0 passes `proxies` to httpx.Client which was removed in httpx>=0.28
    # passing http_client directly bypasses that internal construction
    return Groq(api_key=api_key, http_client=httpx.Client())


def generate_5w1h(problem_title, problem_description, area):
    prompt = f"""Você é um especialista em melhoria contínua Kaizen e metodologias de qualidade industrial.

Analise o seguinte problema e gere uma análise estruturada 5W1H completa em português:

Problema: {problem_title}
Descrição: {problem_description}
Área: {area}

Responda APENAS com um objeto JSON válido com a seguinte estrutura, sem texto adicional:
{{
  "what": "O que aconteceu exatamente? Descrição clara do problema",
  "why": "Por que isto é um problema? Qual o impacto?",
  "where": "Onde ocorre o problema? Localização específica na área {area}",
  "when": "Quando ocorre? Frequência, horários, condições",
  "who": "Quem está envolvido? Quem é afetado?",
  "how": "Como ocorre? Mecanismo ou processo que origina o problema",
  "root_causes": ["causa raiz 1", "causa raiz 2", "causa raiz 3"],
  "immediate_actions": ["ação imediata 1", "ação imediata 2"],
  "suggested_solutions": ["solução 1", "solução 2", "solução 3"]
}}"""

    client = _client()
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=1500,
    )
    content = response.choices[0].message.content.strip()
    # Extract JSON if wrapped in markdown code block
    if "```" in content:
        start = content.find("{")
        end = content.rfind("}") + 1
        content = content[start:end]
    import json
    return json.loads(content)


def generate_a3_report(problem):
    analysis = problem.get("analysis_5w1h", "")
    prompt = f"""Você é um especialista em Lean Manufacturing e relatórios A3 para ambiente industrial.

Gere um relatório A3 completo em português para o seguinte problema Kaizen:

Título: {problem['title']}
Descrição: {problem['description']}
Área: {problem['area']}
Responsável: {problem['responsible']}
Prioridade: {problem['priority']}
Análise 5W1H: {analysis}

REGRAS OBRIGATÓRIAS:
1. No campo "fishbone", TODAS as 6 categorias (maquina, metodo, material, mao_de_obra, medicao, meio_ambiente) devem ter pelo menos uma causa concreta e plausível relacionada com o problema descrito. Nunca deixar nenhuma categoria vazia ou com valores genéricos como "causa 1".
2. No campo "countermeasures", o campo "responsavel" deve ser um cargo/papel funcional (ex: "Equipa de Manutenção", "Supervisor de Produção", "Engenheiro de Qualidade", "Equipa de Logística") — NUNCA usar o nome pessoal do responsável do problema.
3. No campo "countermeasures", o campo "indicador" deve ser específico e mensurável com meta numérica concreta (ex: "Taxa de paragens < 1 por semana", "OEE > 85%", "Tempo de resposta < 4h", "Rejeições < 0,5%") — NUNCA usar frases genéricas como "como medir" ou "verificar melhoria".

Responda APENAS com um objeto JSON válido com a seguinte estrutura:
{{
  "header": {{
    "titulo": "título do projeto A3",
    "responsavel": "nome do responsável",
    "area": "área afetada",
    "data": "data atual",
    "revisao": "Rev. 01"
  }},
  "background": "Contexto e justificativa do problema. Por que este problema precisa ser resolvido agora?",
  "current_state": "Descrição detalhada do estado atual. Métricas, dados, situação observada.",
  "target_state": "Descrição do estado futuro desejado. Metas específicas e mensuráveis.",
  "root_cause_analysis": {{
    "fishbone": {{
      "maquina": ["Desgaste do componente X", "Falta de manutenção preventiva"],
      "metodo": ["Procedimento desatualizado", "Ausência de checklist de verificação"],
      "material": ["Qualidade do material abaixo do especificado"],
      "mao_de_obra": ["Falta de formação específica", "Rotatividade elevada de operadores"],
      "medicao": ["Instrumentos de medição sem calibração recente"],
      "meio_ambiente": ["Condições ambientais fora do intervalo operacional"]
    }},
    "five_whys": [
      {{"why": "Por que 1?", "answer": "Resposta 1"}},
      {{"why": "Por que 2?", "answer": "Resposta 2"}},
      {{"why": "Por que 3?", "answer": "Resposta 3"}},
      {{"why": "Por que 4?", "answer": "Resposta 4"}},
      {{"why": "Por que 5?", "answer": "Causa raiz identificada"}}
    ],
    "root_cause": "Causa raiz principal identificada"
  }},
  "countermeasures": [
    {{"acao": "descrição da ação", "responsavel": "Equipa de Manutenção", "prazo": "prazo", "indicador": "OEE > 85%"}}
  ],
  "implementation_plan": [
    {{"etapa": "nome da etapa", "atividades": ["atividade 1", "atividade 2"], "prazo": "prazo", "responsavel": "responsável"}}
  ],
  "follow_up": {{
    "indicadores": ["KPI 1", "KPI 2"],
    "frequencia_revisao": "Semanal/Quinzenal/Mensal",
    "criterio_sucesso": "Como saberemos que o problema foi resolvido?"
  }},
  "lessons_learned": "O que aprendemos com este problema que pode ser aplicado em outras áreas?"
}}"""

    client = _client()
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=3000,
    )
    content = response.choices[0].message.content.strip()
    if "```" in content:
        start = content.find("{")
        end = content.rfind("}") + 1
        content = content[start:end]
    import json
    return json.loads(content)


def generate_action_suggestions(problem):
    prompt = f"""Você é um especialista em Kaizen e gestão de ações corretivas para ambiente industrial.

Com base no seguinte problema, gere uma lista de ações corretivas concretas e priorizadas:

Título: {problem['title']}
Descrição: {problem['description']}
Área: {problem['area']}
Responsável: {problem['responsible']}
Prioridade: {problem['priority']}

Responda APENAS com um objeto JSON válido:
{{
  "actions": [
    {{
      "title": "Título curto e objetivo da ação",
      "description": "Descrição detalhada do que deve ser feito",
      "responsible": "Cargo ou nome sugerido do responsável",
      "deadline_days": 7
    }}
  ]
}}

Gere entre 3 e 6 ações práticas e ordenadas por urgência. O campo deadline_days indica em quantos dias deve ser concluída (use valores como 3, 7, 14, 30, 60)."""

    client = _client()
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
        max_tokens=1500,
    )
    content = response.choices[0].message.content.strip()
    if "```" in content:
        start = content.find("{")
        end = content.rfind("}") + 1
        content = content[start:end]
    import json
    return json.loads(content)


def generate_improvement_suggestions(problem_title, description, area):
    prompt = f"""Você é um consultor especialista em Lean Manufacturing, Six Sigma e Kaizen para indústria.

Com base no seguinte problema industrial, gere sugestões práticas de melhoria:

Problema: {problem_title}
Descrição: {description}
Área: {area}

Responda APENAS com um objeto JSON válido:
{{
  "quick_wins": [
    {{"titulo": "nome", "descricao": "descrição detalhada", "esforco": "baixo/médio/alto", "impacto": "baixo/médio/alto"}}
  ],
  "medium_term": [
    {{"titulo": "nome", "descricao": "descrição detalhada", "esforco": "baixo/médio/alto", "impacto": "baixo/médio/alto"}}
  ],
  "long_term": [
    {{"titulo": "nome", "descricao": "descrição detalhada", "esforco": "baixo/médio/alto", "impacto": "baixo/médio/alto"}}
  ],
  "benchmarks": "Exemplos de como outras empresas resolveram problemas similares",
  "kpis_sugeridos": ["KPI 1", "KPI 2", "KPI 3"]
}}"""

    client = _client()
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.5,
        max_tokens=2000,
    )
    content = response.choices[0].message.content.strip()
    if "```" in content:
        start = content.find("{")
        end = content.rfind("}") + 1
        content = content[start:end]
    import json
    return json.loads(content)
