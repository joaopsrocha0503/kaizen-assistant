import json
import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "kaizen.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS problems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            area TEXT NOT NULL,
            responsible TEXT NOT NULL,
            priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high', 'critical')),
            status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'completed', 'cancelled')),
            analysis_5w1h TEXT,
            a3_report TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            problem_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            responsible TEXT NOT NULL,
            deadline TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'overdue')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
        );
    """)

    conn.commit()
    conn.close()


def row_to_dict(row):
    if row is None:
        return None
    return dict(row)


def now():
    return datetime.utcnow().isoformat()


# --- Problems ---

def create_problem(data):
    conn = get_connection()
    ts = now()
    cursor = conn.execute(
        """INSERT INTO problems (title, description, area, responsible, priority, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'open', ?, ?)""",
        (data["title"], data["description"], data["area"], data["responsible"], data["priority"], ts, ts)
    )
    problem_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return get_problem(problem_id)


def get_problem(problem_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM problems WHERE id = ?", (problem_id,)).fetchone()
    conn.close()
    return row_to_dict(row)


def list_problems(status=None, area=None, priority=None):
    conn = get_connection()
    query = "SELECT * FROM problems WHERE 1=1"
    params = []
    if status:
        query += " AND status = ?"
        params.append(status)
    if area:
        query += " AND area = ?"
        params.append(area)
    if priority:
        query += " AND priority = ?"
        params.append(priority)
    query += " ORDER BY created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


def update_problem(problem_id, data):
    conn = get_connection()
    allowed = ["title", "description", "area", "responsible", "priority", "status", "analysis_5w1h", "a3_report"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        conn.close()
        return get_problem(problem_id)
    fields["updated_at"] = now()
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [problem_id]
    conn.execute(f"UPDATE problems SET {set_clause} WHERE id = ?", values)
    conn.commit()
    conn.close()
    return get_problem(problem_id)


def delete_problem(problem_id):
    conn = get_connection()
    conn.execute("DELETE FROM problems WHERE id = ?", (problem_id,))
    conn.commit()
    conn.close()


# --- Actions ---

def create_action(data):
    conn = get_connection()
    ts = now()
    cursor = conn.execute(
        """INSERT INTO actions (problem_id, title, description, responsible, deadline, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)""",
        (data["problem_id"], data["title"], data.get("description", ""), data["responsible"], data["deadline"], ts, ts)
    )
    action_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return get_action(action_id)


def get_action(action_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM actions WHERE id = ?", (action_id,)).fetchone()
    conn.close()
    return row_to_dict(row)


def list_actions_for_export(status=None):
    conn = get_connection()
    query = """
        SELECT a.*, p.title AS problem_title, p.priority
        FROM actions a
        JOIN problems p ON a.problem_id = p.id
        WHERE 1=1
    """
    params = []
    if status:
        query += " AND a.status = ?"
        params.append(status)
    query += " ORDER BY a.deadline ASC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


def list_actions(problem_id=None, status=None):
    conn = get_connection()
    query = "SELECT * FROM actions WHERE 1=1"
    params = []
    if problem_id:
        query += " AND problem_id = ?"
        params.append(problem_id)
    if status:
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY deadline ASC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


def update_action(action_id, data):
    conn = get_connection()
    allowed = ["title", "description", "responsible", "deadline", "status"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        conn.close()
        return get_action(action_id)
    fields["updated_at"] = now()
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [action_id]
    conn.execute(f"UPDATE actions SET {set_clause} WHERE id = ?", values)
    conn.commit()
    conn.close()
    return get_action(action_id)


def delete_action(action_id):
    conn = get_connection()
    conn.execute("DELETE FROM actions WHERE id = ?", (action_id,))
    conn.commit()
    conn.close()


# --- KPIs ---

def get_kpis():
    conn = get_connection()
    total = conn.execute("SELECT COUNT(*) FROM problems").fetchone()[0]
    open_p = conn.execute("SELECT COUNT(*) FROM problems WHERE status = 'open'").fetchone()[0]
    in_progress = conn.execute("SELECT COUNT(*) FROM problems WHERE status = 'in_progress'").fetchone()[0]
    completed = conn.execute("SELECT COUNT(*) FROM problems WHERE status = 'completed'").fetchone()[0]
    total_actions = conn.execute("SELECT COUNT(*) FROM actions").fetchone()[0]
    completed_actions = conn.execute("SELECT COUNT(*) FROM actions WHERE status = 'completed'").fetchone()[0]
    overdue_actions = conn.execute(
        "SELECT COUNT(*) FROM actions WHERE status != 'completed' AND deadline < ?",
        (datetime.utcnow().date().isoformat(),)
    ).fetchone()[0]

    by_priority = {}
    for row in conn.execute("SELECT priority, COUNT(*) as cnt FROM problems GROUP BY priority").fetchall():
        by_priority[row["priority"]] = row["cnt"]

    by_area = {}
    for row in conn.execute("SELECT area, COUNT(*) as cnt FROM problems GROUP BY area ORDER BY cnt DESC LIMIT 5").fetchall():
        by_area[row["area"]] = row["cnt"]

    conn.close()
    completion_rate = round((completed / total * 100), 1) if total > 0 else 0

    action_completion_rate = round((completed_actions / total_actions * 100), 1) if total_actions > 0 else 0

    return {
        "total_problems": total,
        "open_problems": open_p,
        "in_progress_problems": in_progress,
        "completed_problems": completed,
        "completion_rate": completion_rate,
        "total_actions": total_actions,
        "completed_actions": completed_actions,
        "overdue_actions": overdue_actions,
        "action_completion_rate": action_completion_rate,
        "by_priority": by_priority,
        "by_area": by_area,
    }


# --- Upcoming actions ---

def get_upcoming_actions(days=7):
    """Devolve ações não concluídas com deadline nos próximos N dias, ordenadas por urgência."""
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT a.id, a.title, a.responsible, a.deadline, a.status, a.problem_id,
               p.title AS problem_title, p.priority
        FROM actions a
        JOIN problems p ON a.problem_id = p.id
        WHERE a.status NOT IN ('completed')
          AND a.deadline >= date('now')
          AND a.deadline <= date('now', ? || ' days')
        ORDER BY a.deadline ASC
        """,
        (str(days),),
    ).fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


# --- Stats ---

def get_monthly_problem_counts(months=6):
    """Devolve a contagem de problemas criados por mês nos últimos N meses."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count "
        "FROM problems GROUP BY month"
    ).fetchall()
    conn.close()

    counts = {r["month"]: r["count"] for r in rows}

    today = datetime.utcnow()
    result = []
    for i in range(months - 1, -1, -1):
        month = today.month - i
        year = today.year
        while month <= 0:
            month += 12
            year -= 1
        key = f"{year:04d}-{month:02d}"
        result.append({"month": key, "count": counts.get(key, 0)})

    return result


# --- Seed ---

def seed_database():
    """Apaga todos os dados e insere dados de exemplo realistas para ambiente industrial."""
    conn = get_connection()
    conn.execute("DELETE FROM actions")
    conn.execute("DELETE FROM problems")
    conn.commit()

    problems = [
        # ── P1 ──────────────────────────────────────────────────────────────
        {
            "title": "Paragem Não Planeada na Linha de Montagem 3",
            "description": (
                "A Linha de Montagem 3 registou 7 paragens não planeadas em abril, "
                "totalizando 18,5 horas de downtime. As paragens ocorrem principalmente "
                "durante o turno da manhã e causam atrasos semanais de 340 unidades. "
                "Custo estimado de produção perdida: 12 400 €/mês."
            ),
            "area": "Produção — Linha 3",
            "responsible": "Miguel Santos",
            "priority": "critical",
            "status": "in_progress",
            "created_at": "2026-04-10T07:30:00",
            "analysis_5w1h": {
                "what": "7 paragens não planeadas em abril, downtime médio de 2,6 h/evento e perda de 340 un/semana na Linha 3.",
                "why": "Cada paragem provoca perda direta de produção, atrasos a clientes Tier-1 e sobrecusto de horas-extra para recuperar o plano.",
                "where": "Estação 5 da Linha 3 — posto de aparafusamento automático, Nave B, chão de fábrica.",
                "when": "Principalmente no turno da manhã (06 h–14 h), com pico entre as 09 h e as 11 h na cadência máxima.",
                "who": "Operadores do turno manhã, técnico de manutenção Eng.º Paulo Leal, chefe de linha Miguel Santos.",
                "how": "O manipulador automático entra em falha por sobreaquecimento do servo-motor, ativa o alarme E-47 e para a linha. Reposição manual: 90–180 min.",
                "root_causes": [
                    "Servo-motor operado acima da temperatura nominal por filtros de arrefecimento colmatados",
                    "Plano de manutenção preventiva não atualizado após substituição do manipulador há 18 meses",
                    "Sensor de temperatura E-47 sem calibração desde a instalação (3 anos)",
                ],
                "immediate_actions": [
                    "Limpeza imediata dos filtros do sistema de arrefecimento",
                    "Calibração do sensor de temperatura E-47",
                    "Monitorização horária da temperatura até resolução definitiva",
                ],
                "suggested_solutions": [
                    "Substituição do servo-motor por modelo ABB BSM-N com maior dissipação térmica",
                    "Manutenção preventiva trimestral ao sistema de arrefecimento",
                    "Sistema IoT de monitorização de temperatura com alertas preditivos",
                ],
            },
            "a3_report": {
                "header": {"titulo": "Eliminação de Paragens na Linha de Montagem 3", "responsavel": "Miguel Santos", "area": "Produção — Linha 3", "revisao": "Rev. 02"},
                "background": "A Linha 3 representa 35 % da capacidade produtiva da Nave B e alimenta clientes Tier-1 com SLA de 98 % on-time. As paragens recorrentes colocam em risco o plano trimestral.",
                "current_state": "7 paragens/mês, downtime médio 2,6 h, 18,5 h perdidas em abril. OEE atual: 71 % (meta corporativa: 88 %).",
                "target_state": "Máximo 1 paragem/mês até julho 2026. OEE ≥ 85 % até setembro 2026. Zero alarmes E-47 por sobreaquecimento.",
                "root_cause_analysis": {
                    "fishbone": {
                        "maquina": ["Servo-motor sobredimensionado termicamente", "Filtros de arrefecimento colmatados", "Sensor E-47 descalibrado"],
                        "metodo": ["Plano de manutenção preventiva desatualizado", "Ausência de check-list de início de turno", "Procedimento de reposição não documentado"],
                        "material": ["Lubrificante do manipulador fora do prazo", "Filtros com especificação inadequada para ambiente com poeira metálica"],
                        "mao_de_obra": ["Técnico de manutenção sem formação no novo manipulador", "Elevada rotatividade no turno da manhã"],
                        "medicao": ["Sem monitorização contínua de temperatura", "Histórico de alarmes E-47 não registado no CMMS"],
                        "meio_ambiente": ["Temperatura na Nave B > 28 °C no verão", "Poeira metálica do posto de corte adjacente"],
                    },
                    "five_whys": [
                        {"why": "Porque é que a linha para?", "answer": "O servo-motor atinge a temperatura limite e ativa o alarme de proteção E-47."},
                        {"why": "Porque é que o motor sobreaquece?", "answer": "O sistema de arrefecimento tem filtros colmatados e caudal de ar reduzido."},
                        {"why": "Porque é que os filtros estão colmatados?", "answer": "A limpeza dos filtros não consta do plano de manutenção preventiva atual."},
                        {"why": "Porque é que o plano não inclui esta tarefa?", "answer": "O plano foi criado para o equipamento anterior e não foi atualizado após a substituição do manipulador."},
                        {"why": "Porque é que o plano não foi atualizado?", "answer": "Não existe processo formal de revisão do plano de manutenção após substituições de equipamento."},
                    ],
                    "root_cause": "Ausência de processo formal de atualização do plano de manutenção preventiva após modificações de equipamentos.",
                },
                "countermeasures": [
                    {"acao": "Limpeza e substituição dos filtros de arrefecimento", "responsavel": "Eng.º Paulo Leal", "prazo": "2026-06-05", "indicador": "T.º motor < 65 °C"},
                    {"acao": "Calibração do sensor E-47 (Metrologia)", "responsavel": "Lab. Metrologia", "prazo": "2026-06-10", "indicador": "Certificado emitido"},
                    {"acao": "Revisão e publicação do plano de manutenção no CMMS", "responsavel": "Miguel Santos", "prazo": "2026-06-20", "indicador": "Plano aprovado"},
                    {"acao": "Instalação de monitorização IoT de temperatura", "responsavel": "Equipa Automação", "prazo": "2026-07-15", "indicador": "Dashboard ativo"},
                ],
                "implementation_plan": [
                    {"etapa": "Ação imediata — Restauro do arrefecimento", "responsavel": "Eng.º Paulo Leal", "prazo": "2026-06-05", "atividades": ["Paragem programada de 4 h", "Substituição dos filtros (ref. FLT-ABB-N)", "Teste de temperatura em carga por 2 h"]},
                    {"etapa": "Atualização do CMMS e formação", "responsavel": "Miguel Santos", "prazo": "2026-06-20", "atividades": ["Levantamento de equipamentos substituídos nos últimos 2 anos", "Revisão dos planos associados", "Formação da equipa de manutenção (2 h)"]},
                    {"etapa": "Monitorização preditiva IoT", "responsavel": "Equipa Automação", "prazo": "2026-07-15", "atividades": ["Instalação de sondas nos 3 servo-motores da linha", "Configuração de alertas SCADA a 60 °C", "Dashboard de acompanhamento em tempo real"]},
                ],
                "follow_up": {
                    "indicadores": ["Nº paragens/mês", "OEE Linha 3", "T.º média servo-motor", "MTBF do manipulador"],
                    "frequencia_revisao": "Semanal nas primeiras 4 semanas, depois mensal",
                    "criterio_sucesso": "Zero paragens por sobreaquecimento durante 60 dias consecutivos e OEE ≥ 85 %",
                },
                "lessons_learned": "A substituição de equipamentos deve acionar automaticamente a revisão do plano de manutenção. Foi criado o procedimento PR-MANUT-012 para garantir esta atualização em todas as substituições futuras.",
            },
            "actions": [
                {"title": "Limpeza e substituição dos filtros de arrefecimento do servo-motor", "responsible": "Eng.º Paulo Leal", "deadline": "2026-06-05", "status": "pending"},
                {"title": "Calibração do sensor de temperatura E-47 pelo laboratório de metrologia", "responsible": "Lab. Metrologia", "deadline": "2026-06-10", "status": "pending"},
                {"title": "Revisão e atualização do plano de manutenção preventiva no CMMS", "responsible": "Miguel Santos", "deadline": "2026-06-20", "status": "in_progress"},
                {"title": "Instalação de sistema IoT de monitorização de temperatura nos servo-motores", "responsible": "Equipa Automação", "deadline": "2026-07-15", "status": "pending"},
            ],
        },
        # ── P2 ──────────────────────────────────────────────────────────────
        {
            "title": "Elevada Taxa de Refugo na Linha de Embalagem — Lote LE-04",
            "description": (
                "A linha de embalagem LE-04 apresentou uma taxa de refugo de 8,7 % em março, "
                "muito acima do limite de controlo de 2 %. O refugo resulta maioritariamente "
                "de embalagens mal seladas e rótulos desalinhados, causando devoluções de "
                "clientes e desperdício estimado em 3 200 €/mês."
            ),
            "area": "Embalagem",
            "responsible": "Rui Oliveira",
            "priority": "high",
            "status": "completed",
            "created_at": "2026-03-15T08:00:00",
            "analysis_5w1h": {
                "what": "Taxa de refugo de 8,7 % na linha LE-04 em março: selagem deficiente e rótulos desalinhados, 4× acima do limite de controlo.",
                "why": "Devoluções de clientes, custo de reprocessamento e desperdício de embalagem estimado em 3 200 €/mês. Risco de perda de certificação ISO 9001.",
                "where": "Linha de embalagem LE-04, estações de termosselagem (E3) e rotulagem (E6), turno da tarde.",
                "when": "Agravamento progressivo ao longo de março; pico no 3.º turno (22 h–06 h) com operadores menos experientes.",
                "who": "Operadores do turno da tarde e noite, técnico de qualidade Sónia Pinto, chefe de linha Rui Oliveira.",
                "how": "A temperatura da seladora varia ±15 °C por desgaste da resistência e a cabeça de rotulagem apresenta folga de 0,8 mm por falta de aperto.",
                "root_causes": [
                    "Resistência de termosselagem com 4 200 h de operação (vida útil: 3 500 h)",
                    "Folga mecânica na cabeça de rotulagem por parafuso de aperto não incluído na manutenção preventiva",
                    "Ausência de controlo estatístico de processo (SPC) na linha",
                ],
                "immediate_actions": [
                    "Substituição imediata da resistência de termosselagem",
                    "Aperto e verificação da cabeça de rotulagem com calibre de folga",
                    "Verificação visual de 100 % das embalagens até estabilização",
                ],
                "suggested_solutions": [
                    "Implementação de SPC com carta de controlo Xbar-R para temperatura de selagem",
                    "Sistema de visão artificial para inspeção automática de rótulos",
                    "Check-list de verificação de parâmetros críticos no início de cada turno",
                ],
            },
            "a3_report": {
                "header": {"titulo": "Redução de Refugo na Linha de Embalagem LE-04", "responsavel": "Rui Oliveira", "area": "Embalagem", "revisao": "Rev. 03"},
                "background": "A linha LE-04 embala produtos de consumo com requisito de aspeto A+. A taxa de refugo de 8,7 % gerou 2 devoluções de clientes em março e coloca em risco a renovação do contrato anual.",
                "current_state": "Taxa de refugo: 8,7 % (limite: 2 %). Custo de desperdício: 3 200 €/mês. Dois eventos de devolução em março. Satisfação do cliente: 72/100.",
                "target_state": "Taxa de refugo ≤ 1,5 % até maio 2026. Zero devoluções por defeito de embalagem. Cpk ≥ 1,33 na temperatura de selagem.",
                "root_cause_analysis": {
                    "fishbone": {
                        "maquina": ["Resistência de termosselagem com vida útil esgotada (4 200 h)", "Folga de 0,8 mm na cabeça de rotulagem", "Variação de temperatura ±15 °C na seladora"],
                        "metodo": ["Ausência de SPC na linha", "Check-list de início de turno incompleto", "Sem critério formal de aceitação/rejeição visual"],
                        "material": ["Filme de embalagem com espessura fora da especificação em lote de março", "Cola de rotulagem com viscosidade alterada por temperatura ambiente"],
                        "mao_de_obra": ["Operadores do turno noturno com menos de 3 meses de experiência", "Formação de qualidade não renovada há 18 meses"],
                        "medicao": ["Sem medição contínua da temperatura de selagem", "Controlo de rótulos apenas visual (subjetivo)"],
                        "meio_ambiente": ["Temperatura ambiente oscilante (18 °C–26 °C) afeta viscosidade da cola", "Humidade relativa alta em dias de chuva"],
                    },
                    "five_whys": [
                        {"why": "Porque é que o refugo aumentou para 8,7 %?", "answer": "As embalagens saem com selagem deficiente e rótulos desalinhados."},
                        {"why": "Porque é que a selagem é deficiente?", "answer": "A resistência varia ±15 °C, produzindo selos frios em alguns ciclos."},
                        {"why": "Porque é que a temperatura varia tanto?", "answer": "A resistência tem 4 200 h de uso, acima das 3 500 h de vida útil recomendada."},
                        {"why": "Porque é que a resistência não foi substituída?", "answer": "O contador de horas não estava integrado no plano de manutenção preventiva."},
                        {"why": "Porque é que o contador não estava integrado?", "answer": "Aquando da instalação da máquina, o parâmetro de vida útil da resistência não foi registado no CMMS."},
                    ],
                    "root_cause": "Resistência de termosselagem operada além da vida útil por ausência de registo do parâmetro de substituição no CMMS.",
                },
                "countermeasures": [
                    {"acao": "Substituição da resistência de termosselagem", "responsavel": "Manutenção", "prazo": "2026-04-02", "indicador": "Temperatura estável ±3 °C"},
                    {"acao": "Aperto e calibração da cabeça de rotulagem", "responsavel": "Rui Oliveira", "prazo": "2026-04-02", "indicador": "Folga < 0,1 mm"},
                    {"acao": "Implementação de carta de controlo SPC (Xbar-R)", "responsavel": "Sónia Pinto", "prazo": "2026-04-20", "indicador": "Cpk ≥ 1,33"},
                    {"acao": "Registo de todos os parâmetros de vida útil no CMMS", "responsavel": "Manutenção", "prazo": "2026-04-30", "indicador": "100 % parâmetros registados"},
                ],
                "implementation_plan": [
                    {"etapa": "Restauro imediato das condições nominais", "responsavel": "Manutenção + Rui Oliveira", "prazo": "2026-04-02", "atividades": ["Substituição da resistência (ref. RES-SEAL-220V)", "Calibração da cabeça de rotulagem com calibre", "Inspeção 100 % durante 48 h"]},
                    {"etapa": "Implementação de SPC e formação", "responsavel": "Sónia Pinto", "prazo": "2026-04-20", "atividades": ["Instalação de termómetro de registo contínuo", "Definição de limites de controlo UCL/LCL", "Formação dos operadores em interpretação de cartas SPC (3 h)"]},
                    {"etapa": "Atualização do CMMS com parâmetros de vida útil", "responsavel": "Manutenção", "prazo": "2026-04-30", "atividades": ["Inventário de todos os consumíveis com vida útil definida", "Registo no CMMS com alertas automáticos", "Auditoria interna de verificação"]},
                ],
                "follow_up": {
                    "indicadores": ["Taxa de refugo (%)", "Cpk temperatura de selagem", "Desvio de rotulagem (mm)", "Nº devoluções/mês"],
                    "frequencia_revisao": "Diária durante 2 semanas, depois semanal",
                    "criterio_sucesso": "Taxa de refugo ≤ 1,5 % durante 30 dias consecutivos e Cpk ≥ 1,33",
                },
                "lessons_learned": "Os parâmetros de vida útil de consumíveis críticos devem ser registados no CMMS no momento da instalação. O SPC implementado revelou também uma variação sazonal da cola que levou à climatização da zona de rotulagem.",
            },
            "actions": [
                {"title": "Substituição da resistência de termosselagem (ref. RES-SEAL-220V)", "responsible": "Manutenção", "deadline": "2026-04-02", "status": "completed"},
                {"title": "Calibração e aperto da cabeça de rotulagem com calibre de folga", "responsible": "Rui Oliveira", "deadline": "2026-04-02", "status": "completed"},
                {"title": "Implementação de carta de controlo SPC Xbar-R com termómetro de registo", "responsible": "Sónia Pinto", "deadline": "2026-04-20", "status": "completed"},
                {"title": "Registo dos parâmetros de vida útil de todos os consumíveis no CMMS", "responsible": "Manutenção", "deadline": "2026-04-30", "status": "completed"},
            ],
        },
        # ── P3 ──────────────────────────────────────────────────────────────
        {
            "title": "Tempo Excessivo de Setup na Prensa Hidráulica P-07",
            "description": (
                "O tempo de setup (troca de ferramenta) na prensa P-07 é em média 87 minutos, "
                "versus os 35 minutos definidos como objetivo. O excesso de tempo causa perda "
                "de 4 a 6 ordens de produção por semana e representa 11 % da capacidade "
                "disponível da prensa desperdiçada em mudanças."
            ),
            "area": "Maquinagem",
            "responsible": "Carlos Mendes",
            "priority": "medium",
            "status": "in_progress",
            "created_at": "2026-04-28T09:15:00",
            "analysis_5w1h": {
                "what": "Tempo médio de setup de 87 min na prensa P-07 vs. objetivo de 35 min — excesso de 52 min por troca de ferramenta.",
                "why": "Perda de 4–6 ordens/semana, 11 % de capacidade desperdiçada em setups e atrasos no plano de produção de peças estruturais.",
                "where": "Prensa hidráulica P-07, célula de maquinagem C3, Nave A.",
                "when": "Em cada troca de ferramenta, com frequência de 3–4 trocas/dia. Agravado em trocas de matrizes de grande dimensão (> 45 kg).",
                "who": "Operadores de prensa (3 turnos), Carlos Mendes (chefe de célula), Logística interna.",
                "how": "O setup atual é totalmente interno (máquina parada): pesquisa de ferramentas em armazém desorganizado, ajuste por tentativa e erro dos parâmetros de pressão e curso.",
                "root_causes": [
                    "Setup totalmente interno — sem preparação externa prévia enquanto a máquina está em produção",
                    "Armazém de ferramentas sem organização por endereço (shadow boards inexistentes)",
                    "Parâmetros de pressão e curso ajustados por tentativa e erro sem ficha técnica de setup",
                ],
                "immediate_actions": [
                    "Criar fichas de setup com parâmetros pré-definidos para as 10 ferramentas mais frequentes",
                    "Organizar o armazém de ferramentas com endereçamento e shadow boards",
                    "Filmar o setup atual para análise e identificação de desperdícios",
                ],
                "suggested_solutions": [
                    "Metodologia SMED: converter tarefas internas em externas (objetivo: < 35 min)",
                    "Carro de setup dedicado com todas as ferramentas e consumíveis organizados",
                    "Sistema de ajuste rápido de ferramentas (quick-clamp) para matrizes de grande dimensão",
                ],
            },
            "a3_report": {
                "header": {"titulo": "Redução do Tempo de Setup da Prensa P-07 — SMED", "responsavel": "Carlos Mendes", "area": "Maquinagem", "revisao": "Rev. 01"},
                "background": "A prensa P-07 é gargalo da célula C3 e processa 60 % das peças estruturais do portfólio. A redução do tempo de setup é prioritária para aumentar a flexibilidade e capacidade efetiva.",
                "current_state": "Tempo médio de setup: 87 min. 3–4 trocas/dia. Capacidade desperdiçada: 11 %. Atraso médio de 4–6 ordens/semana.",
                "target_state": "Tempo de setup ≤ 35 min até agosto 2026. Capacidade desperdiçada em setup ≤ 4 %. Eliminação de atrasos por causa de setup.",
                "root_cause_analysis": {
                    "fishbone": {
                        "maquina": ["Sem sistema de quick-clamp para fixação de matrizes", "Painel de parâmetros com interface obsoleta (ajuste manual por botão)"],
                        "metodo": ["Setup 100 % interno — máquina parada durante toda a troca", "Sem ficha de setup com parâmetros pré-definidos", "Sequência de operações não padronizada"],
                        "material": ["Ferramentas dispersas por 3 armários sem endereçamento", "Consumíveis (calços, pernos) sem stock junto à máquina"],
                        "mao_de_obra": ["3 operadores com métodos de setup diferentes", "Sem formação formal em SMED", "Operador procura ajuda externa em 30 % das trocas"],
                        "medicao": ["Tempo de setup não medido sistematicamente", "Sem registo de causa de desvio ao plano"],
                        "meio_ambiente": ["Corredor de acesso ao armazém partilhado com AGV — esperas frequentes"],
                    },
                    "five_whys": [
                        {"why": "Porque é que o setup demora 87 min?", "answer": "Grande parte do tempo é gasta à procura de ferramentas e no ajuste de parâmetros por tentativa e erro."},
                        {"why": "Porque é que a procura de ferramentas demora tanto?", "answer": "As ferramentas estão dispersas por 3 armários sem organização por endereço ou referência visual."},
                        {"why": "Porque é que os armários não estão organizados?", "answer": "Não existe um sistema de gestão de ferramentas (shadow boards, 5S) implementado na célula C3."},
                        {"why": "Porque é que o ajuste é feito por tentativa e erro?", "answer": "Não existem fichas de setup com os parâmetros (pressão, curso, velocidade) para cada ferramenta/peça."},
                        {"why": "Porque é que as fichas de setup não foram criadas?", "answer": "Nunca foi alocado tempo para documentar os parâmetros — a prioridade sempre foi manter a máquina a produzir."},
                    ],
                    "root_cause": "Ausência de padronização do processo de setup: sem fichas técnicas, sem organização de ferramentas e sem separação de tarefas internas/externas (SMED).",
                },
                "countermeasures": [
                    {"acao": "Filmagem e análise do setup atual (cronoanalise)", "responsavel": "Carlos Mendes", "prazo": "2026-05-30", "indicador": "Relatório de desperdícios produzido"},
                    {"acao": "Criação de fichas de setup para top 10 ferramentas", "responsavel": "Carlos Mendes", "prazo": "2026-06-15", "indicador": "10 fichas validadas e afixadas"},
                    {"acao": "Implementação de 5S e shadow boards no armazém de ferramentas", "responsavel": "Logística + C. Mendes", "prazo": "2026-06-30", "indicador": "Audit 5S score ≥ 4/5"},
                    {"acao": "Formação SMED e piloto de setup com novo método", "responsavel": "Carlos Mendes", "prazo": "2026-07-31", "indicador": "Tempo setup ≤ 35 min em 3 trocas consecutivas"},
                ],
                "implementation_plan": [
                    {"etapa": "Diagnóstico — filmagem e cronoanalise", "responsavel": "Carlos Mendes", "prazo": "2026-05-30", "atividades": ["Filmar 5 setups completos nos 3 turnos", "Identificar e classificar tarefas internas vs. externas", "Quantificar desperdícios (procura, ajuste, deslocamentos)"]},
                    {"etapa": "Padronização — fichas de setup e 5S", "responsavel": "Carlos Mendes + Logística", "prazo": "2026-06-30", "atividades": ["Criar fichas de setup com parâmetros validados", "Implementar shadow boards e endereçamento", "Criar carro de setup com consumíveis e ferramentas frequentes"]},
                    {"etapa": "SMED — piloto e consolidação", "responsavel": "Carlos Mendes", "prazo": "2026-07-31", "atividades": ["Formação SMED para 3 operadores (4 h)", "Piloto com novo método em 10 trocas cronometradas", "Ajuste e validação final — meta: ≤ 35 min"]},
                ],
                "follow_up": {
                    "indicadores": ["Tempo médio de setup (min)", "% capacidade em setup", "Nº ordens atrasadas/semana", "Score 5S armazém ferramentas"],
                    "frequencia_revisao": "Semanal durante implementação, mensal após consolidação",
                    "criterio_sucesso": "Tempo médio de setup ≤ 35 min durante 4 semanas consecutivas e score 5S ≥ 4/5",
                },
                "lessons_learned": "A filmagem do processo revelou que 35 % do tempo de setup era gasto em deslocamentos ao armazém, um desperdício invisível nas análises anteriores. O SMED deve ser aplicado a todas as prensas da célula C3.",
            },
            "actions": [
                {"title": "Filmar e analisar 5 setups completos nos 3 turnos (cronoanalise)", "responsible": "Carlos Mendes", "deadline": "2026-05-30", "status": "in_progress"},
                {"title": "Criar fichas de setup com parâmetros validados para top 10 ferramentas", "responsible": "Carlos Mendes", "deadline": "2026-06-15", "status": "pending"},
                {"title": "Implementar shadow boards e 5S no armazém de ferramentas da célula C3", "responsible": "Logística", "deadline": "2026-06-30", "status": "pending"},
                {"title": "Formação SMED e piloto de setup com novo método (meta: ≤ 35 min)", "responsible": "Carlos Mendes", "deadline": "2026-07-31", "status": "pending"},
            ],
        },
        # ── P4 ──────────────────────────────────────────────────────────────
        {
            "title": "Desperdício Excessivo de Fio de Soldadura na Estação S-12",
            "description": (
                "A estação de soldadura S-12 consome em média 1,8 kg/h de fio MIG, "
                "enquanto a referência de processo define 1,1 kg/h para o mesmo tipo de cordão. "
                "O excesso de 0,7 kg/h representa um desperdício de material de 2 100 €/mês "
                "e indica potencial de qualidade não conforme nas soldaduras."
            ),
            "area": "Soldadura",
            "responsible": "Ana Ferreira",
            "priority": "high",
            "status": "open",
            "created_at": "2026-05-10T14:00:00",
            "analysis_5w1h": {
                "what": "Consumo de fio MIG de 1,8 kg/h vs. referência de 1,1 kg/h na estação S-12 — excesso de 64 % e custo adicional de 2 100 €/mês.",
                "why": "Desperdício direto de material, risco de defeitos de qualidade nas soldaduras (porosidade, salpicos excessivos) e NCRs de cliente.",
                "where": "Estação de soldadura MIG S-12, posto 3, turno da tarde, Nave C.",
                "when": "Detetado na auditoria de consumos de maio. Dados de produção indicam desvio consistente nos últimos 3 meses.",
                "who": "Soldador António Rodrigues (turno tarde), chefe de soldadura Ana Ferreira, Qualidade Gonçalo Neves.",
                "how": "Os parâmetros de soldadura (tensão, velocidade de arame, gás) estão desajustados, causando arco instável, projeções excessivas e retrabalho de acabamento.",
                "root_causes": [
                    "Parâmetros WPS (tensão 28V vs. 24V recomendado, velocidade de arame 20 % acima) configurados incorretamente após última manutenção",
                    "Mistura de gás de proteção fora da especificação (Ar/CO₂ 75/25 em vez de 80/20)",
                    "Bocal da tocha com salpicos acumulados reduzindo eficiência de proteção",
                ],
                "immediate_actions": [
                    "Verificar e corrigir os parâmetros WPS na estação S-12 para os valores do caderno de encargos",
                    "Verificar a composição da mistura de gás — análise no fornecedor de gases",
                    "Limpeza e substituição do bocal da tocha",
                ],
                "suggested_solutions": [
                    "Bloqueio eletrónico dos parâmetros WPS na fonte de soldadura (password de acesso)",
                    "Medidor de caudal de gás com alarme de desvio integrado na estação",
                    "Programa de verificação mensal de parâmetros por técnico de qualidade de soldadura",
                ],
            },
            "a3_report": {
                "header": {"titulo": "Redução do Consumo de Fio MIG na Estação de Soldadura S-12", "responsavel": "Ana Ferreira", "area": "Soldadura", "revisao": "Rev. 01"},
                "background": "A soldadura MIG é processo crítico com impacto direto na resistência estrutural dos produtos. O desvio de consumo é simultaneamente um problema de custo e um sinal de qualidade potencialmente comprometida.",
                "current_state": "Consumo: 1,8 kg/h (ref.: 1,1 kg/h). Desvio: +64 %. Custo adicional: 2 100 €/mês. Nível de salpicos: classe 3 (máx. permitido: classe 2).",
                "target_state": "Consumo de fio ≤ 1,15 kg/h até junho 2026. Salpicos ≤ classe 2. Zero NCRs por defeito de soldadura nos 60 dias seguintes.",
                "root_cause_analysis": {
                    "fishbone": {
                        "maquina": ["Parâmetros WPS incorretos na fonte de soldadura", "Bocal com salpicos acumulados", "Fonte de soldadura sem bloqueio de parâmetros"],
                        "metodo": ["WPS não verificado após manutenção da fonte", "Sem check-list de parâmetros no início de turno", "Retrabalho de salpicos não registado como defeito"],
                        "material": ["Mistura de gás Ar/CO₂ fora da especificação (75/25 vs. 80/20)", "Fio MIG com humidade elevada (bobine armazenada sem proteção)"],
                        "mao_de_obra": ["Operador configurou parâmetros sem consultar WPS", "Sem certificação CWI renovada (expirou em jan. 2026)"],
                        "medicao": ["Sem medição sistemática de consumo de fio por turno", "Análise de gás não realizada desde instalação"],
                        "meio_ambiente": ["Humidade relativa > 70 % em dias de chuva afeta qualidade do arco", "Corrente de ar da porta adjacente destabiliza o gás de proteção"],
                    },
                    "five_whys": [
                        {"why": "Porque é que o consumo de fio é 64 % acima da referência?", "answer": "O arco está instável, gerando salpicos e depósito ineficiente de material."},
                        {"why": "Porque é que o arco está instável?", "answer": "A tensão (28V) e a velocidade de arame estão acima dos valores WPS, e a proteção gasosa é insuficiente."},
                        {"why": "Porque é que os parâmetros estão errados?", "answer": "Foram alterados durante a última manutenção da fonte e não foram repostos para os valores do WPS."},
                        {"why": "Porque é que os valores não foram repostos?", "answer": "Não existe procedimento de verificação de parâmetros pós-manutenção nem bloqueio eletrónico."},
                        {"why": "Porque é que não existe este procedimento?", "answer": "A estação S-12 foi instalada antes da implementação do sistema de gestão de qualidade de soldadura atual."},
                    ],
                    "root_cause": "Ausência de procedimento de verificação e bloqueio de parâmetros WPS após intervenções de manutenção na fonte de soldadura.",
                },
                "countermeasures": [
                    {"acao": "Correção imediata dos parâmetros WPS na estação S-12", "responsavel": "Ana Ferreira", "prazo": "2026-05-28", "indicador": "Consumo < 1,2 kg/h em teste"},
                    {"acao": "Verificação e correção da mistura de gás de proteção", "responsavel": "Gonçalo Neves", "prazo": "2026-05-30", "indicador": "Certificado de análise de gás"},
                    {"acao": "Bloqueio eletrónico de parâmetros WPS (password)", "responsavel": "Fornecedor equipamento", "prazo": "2026-06-15", "indicador": "Parâmetros bloqueados e documentados"},
                    {"acao": "Renovação da certificação CWI do operador António Rodrigues", "responsavel": "RH + Ana Ferreira", "prazo": "2026-06-30", "indicador": "Certificado emitido"},
                ],
                "implementation_plan": [
                    {"etapa": "Correção imediata dos parâmetros", "responsavel": "Ana Ferreira", "prazo": "2026-05-28", "atividades": ["Repor parâmetros WPS (24V, velocidade nominal)", "Limpar e substituir bocal da tocha", "Teste de 1h com medição de consumo e inspeção visual"]},
                    {"etapa": "Verificação da cadeia de proteção gasosa", "responsavel": "Gonçalo Neves", "prazo": "2026-05-30", "atividades": ["Colher amostra de gás para análise laboratorial", "Verificar estanquidade das ligações", "Instalar fluxómetro com alarme de desvio"]},
                    {"etapa": "Prevenção de recorrência — bloqueio e formação", "responsavel": "Ana Ferreira + RH", "prazo": "2026-06-30", "atividades": ["Ativar bloqueio de parâmetros na fonte (suporte do fornecedor)", "Criar check-list de verificação pós-manutenção", "Agendar renovação CWI do operador"]},
                ],
                "follow_up": {
                    "indicadores": ["Consumo de fio MIG (kg/h)", "Nível de salpicos (classe)", "Nº NCRs de soldadura/mês", "% conformidade WPS em auditoria"],
                    "frequencia_revisao": "Diária durante 1 semana, semanal durante 1 mês",
                    "criterio_sucesso": "Consumo ≤ 1,15 kg/h durante 30 dias e zero NCRs por defeito de soldadura",
                },
                "lessons_learned": "Qualquer intervenção de manutenção em equipamento de soldadura deve incluir verificação obrigatória dos parâmetros WPS. A instalação de bloqueio eletrónico será estendida a todas as 6 estações de soldadura MIG.",
            },
            "actions": [
                {"title": "Corrigir parâmetros WPS na fonte de soldadura S-12 para valores nominais (24V)", "responsible": "Ana Ferreira", "deadline": "2026-05-28", "status": "pending"},
                {"title": "Análise laboratorial da mistura de gás de proteção e correção se necessário", "responsible": "Gonçalo Neves", "deadline": "2026-05-30", "status": "pending"},
                {"title": "Instalação de bloqueio eletrónico de parâmetros WPS na fonte S-12", "responsible": "Fornecedor equip.", "deadline": "2026-06-15", "status": "pending"},
            ],
        },
        # ── P5 ──────────────────────────────────────────────────────────────
        {
            "title": "Risco de Queda de Material no Corredor de Armazenamento A",
            "description": (
                "O corredor A do armazém apresenta prateleiras com sobrecarga visível e "
                "material empilhado de forma instável acima da linha de segurança (1,8 m). "
                "Foram registados 2 incidentes de queda de material em abril sem lesionados. "
                "A situação representa risco grave de acidente e possível coima da ACT."
            ),
            "area": "Armazém",
            "responsible": "Sofia Rodrigues",
            "priority": "critical",
            "status": "open",
            "created_at": "2026-05-20T10:30:00",
            "analysis_5w1h": {
                "what": "2 incidentes de queda de material no corredor A em abril. Prateleiras sobrecarregadas e material empilhado acima de 1,8 m sem fixação.",
                "why": "Risco grave de lesão para trabalhadores, incumprimento do DL 50/2005 (segurança no trabalho) e exposição a coima da ACT até 12 000 €.",
                "where": "Corredor A, prateleiras C3 a C8, Armazém de Matérias-Primas, Nave D.",
                "when": "Incidentes registados a 08/04 e a 22/04, durante operação de picking com empilhador. Risco permanente identificado na auditoria de segurança de maio.",
                "who": "Operadores de armazém (turno manhã e tarde), Responsável de segurança Eng.ª Marta Costa, Sofia Rodrigues.",
                "how": "Material recebido em excesso face à capacidade das prateleiras é empilhado manualmente acima da linha de segurança, sem verificação da carga máxima admissível.",
                "root_causes": [
                    "Capacidade máxima das prateleiras não está afixada e desconhecida pelos operadores",
                    "Ausência de zona de overflow para material excedente — todo o material é forçado no corredor A",
                    "Receção de material sem verificação prévia de espaço disponível no armazém",
                ],
                "immediate_actions": [
                    "Reorganização imediata do corredor A — remoção de todo o material acima de 1,8 m",
                    "Afixação da capacidade máxima em cada prateleira (etiqueta com carga max. em kg e nº de paletes)",
                    "Interdição temporária do corredor A a empilhadores até nova organização",
                ],
                "suggested_solutions": [
                    "Sistema de gestão de espaço de armazém (WMS) com alertas de capacidade",
                    "Definição de zona de overflow sinalizada para material excedente",
                    "Procedimento de receção com verificação obrigatória de disponibilidade de espaço",
                ],
            },
            "a3_report": {
                "header": {"titulo": "Eliminação do Risco de Queda no Corredor A — Armazém", "responsavel": "Sofia Rodrigues", "area": "Armazém", "revisao": "Rev. 01"},
                "background": "O armazém de matérias-primas serve 100 % da produção. O corredor A é o acesso principal ao stock de aço e alumínio. Os incidentes de queda colocam em risco os trabalhadores e a continuidade operacional.",
                "current_state": "2 incidentes de queda em abril. Prateleiras C3–C8 com sobrecarga estimada de 20–35 %. Material empilhado até 2,4 m (limite: 1,8 m). Score de auditoria de segurança: 52/100.",
                "target_state": "Zero incidentes de queda de material. 100 % das prateleiras dentro da capacidade nominal. Score de auditoria de segurança ≥ 85/100 até julho 2026.",
                "root_cause_analysis": {
                    "fishbone": {
                        "maquina": ["Prateleiras antigas sem etiqueta de carga máxima", "Empilhador sem limitador de altura de elevação"],
                        "metodo": ["Receção de material sem verificação de espaço disponível", "Sem procedimento de gestão de overflow", "Picking sem regra FIFO aplicada"],
                        "material": ["Stock de aço 40 % acima do nível de reabastecimento por compras em excesso", "Embalagens de fornecedor não padronizadas (difícil empilhamento estável)"],
                        "mao_de_obra": ["Operadores não treinados nas regras de carga máxima de prateleiras", "Pressão para acomodar todo o material recebido imediatamente"],
                        "medicao": ["Sem sistema de controlo de ocupação de espaço por localização", "Auditoria de segurança realizada apenas anualmente"],
                        "meio_ambiente": ["Corredor A com largura reduzida (2,1 m) — dificulta manobra segura do empilhador"],
                    },
                    "five_whys": [
                        {"why": "Porque é que o material está empilhado acima de 1,8 m?", "answer": "As prateleiras estão cheias e o novo material recebido é empilhado em cima do existente."},
                        {"why": "Porque é que as prateleiras estão cheias?", "answer": "O stock de aço está 40 % acima do nível de reabastecimento por compras em excesso."},
                        {"why": "Porque é que as compras foram em excesso?", "answer": "A equipa de compras não tem visibilidade do nível de stock atual em tempo real."},
                        {"why": "Porque é que não têm visibilidade em tempo real?", "answer": "Não existe WMS — a gestão de stock é feita em folha Excel não atualizada em tempo real."},
                        {"why": "Porque é que não há WMS?", "answer": "O investimento em WMS foi adiado por 3 anos por prioridade orçamental a outras áreas."},
                    ],
                    "root_cause": "Ausência de sistema de gestão de armazém (WMS) que forneça visibilidade de stock em tempo real, levando a compras excessivas e sobrecarga de prateleiras.",
                },
                "countermeasures": [
                    {"acao": "Reorganização imediata do corredor A e remoção de sobrecarga", "responsavel": "Sofia Rodrigues", "prazo": "2026-05-27", "indicador": "100 % prateleiras dentro do limite"},
                    {"acao": "Afixação de capacidade máxima em todas as prateleiras", "responsavel": "Sofia Rodrigues", "prazo": "2026-05-30", "indicador": "Etiquetas afixadas e verificadas"},
                    {"acao": "Definição e sinalização de zona de overflow", "responsavel": "Sofia Rodrigues + SST", "prazo": "2026-06-10", "indicador": "Zona demarcada e sinalizada"},
                    {"acao": "Implementação de WMS (fase 1 — controlo de localizações)", "responsavel": "TI + Sofia Rodrigues", "prazo": "2026-08-31", "indicador": "Visibilidade de stock em tempo real"},
                ],
                "implementation_plan": [
                    {"etapa": "Ação imediata — Segurança do corredor A", "responsavel": "Sofia Rodrigues", "prazo": "2026-05-27", "atividades": ["Parar receção de material no corredor A", "Redistribuir material excedente por corredores B e C", "Afixar capacidade máxima em etiquetas nas prateleiras", "Formação de segurança de 1h para todos os operadores de armazém"]},
                    {"etapa": "Gestão de overflow e procedimentos", "responsavel": "Sofia Rodrigues + SST", "prazo": "2026-06-10", "atividades": ["Identificar e demarcar zona de overflow (mínimo 50 m²)", "Criar procedimento de receção com verificação de espaço", "Implementar auditorias de segurança mensais"]},
                    {"etapa": "WMS — Fase 1", "responsavel": "TI + Sofia Rodrigues", "prazo": "2026-08-31", "atividades": ["Seleção de solução WMS (3 fornecedores)", "Mapeamento de localizações e capacidades", "Integração com sistema de compras para alertas de stock"]},
                ],
                "follow_up": {
                    "indicadores": ["Nº incidentes de queda/mês", "% prateleiras dentro da capacidade", "Score auditoria de segurança", "Nível de stock vs. reabastecimento"],
                    "frequencia_revisao": "Semanal durante 1 mês, depois mensal",
                    "criterio_sucesso": "Zero incidentes durante 90 dias e score de auditoria de segurança ≥ 85/100",
                },
                "lessons_learned": "A ausência de WMS é a causa raiz de múltiplos problemas de armazém (segurança, stock excessivo, picking ineficiente). O investimento em WMS foi aprovado para Q3 2026 após apresentação deste A3 à direção.",
            },
            "actions": [
                {"title": "Reorganização imediata do corredor A — remover todo o material acima de 1,8 m", "responsible": "Sofia Rodrigues", "deadline": "2026-05-27", "status": "in_progress"},
                {"title": "Afixar etiquetas de capacidade máxima (kg e nº paletes) em todas as prateleiras", "responsible": "Sofia Rodrigues", "deadline": "2026-05-30", "status": "pending"},
                {"title": "Demarcar e sinalizar zona de overflow para material excedente (mínimo 50 m²)", "responsible": "SST", "deadline": "2026-06-10", "status": "pending"},
                {"title": "Kick-off do projeto WMS — seleção de fornecedor e mapeamento de localizações", "responsible": "TI + Sofia Rodrigues", "deadline": "2026-08-31", "status": "pending"},
            ],
        },
    ]

    problem_ids = []
    ts_update = "2026-05-25T18:00:00"
    for p in problems:
        w5h1_json = json.dumps(p["analysis_5w1h"], ensure_ascii=False)
        a3_json = json.dumps(p["a3_report"], ensure_ascii=False)
        cursor = conn.execute(
            """INSERT INTO problems
               (title, description, area, responsible, priority, status,
                analysis_5w1h, a3_report, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (p["title"], p["description"], p["area"], p["responsible"],
             p["priority"], p["status"], w5h1_json, a3_json,
             p["created_at"], ts_update),
        )
        problem_ids.append(cursor.lastrowid)

    action_count = 0
    for pid, p in zip(problem_ids, problems):
        for a in p["actions"]:
            conn.execute(
                """INSERT INTO actions
                   (problem_id, title, description, responsible, deadline, status,
                    created_at, updated_at)
                   VALUES (?, ?, '', ?, ?, ?, ?, ?)""",
                (pid, a["title"], a["responsible"], a["deadline"],
                 a["status"], p["created_at"], ts_update),
            )
            action_count += 1

    conn.commit()
    conn.close()
    return {"problems": len(problem_ids), "actions": action_count}
