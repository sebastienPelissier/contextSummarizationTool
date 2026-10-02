# MCP Context Manager

> The model is the CPU. The context window is RAM. This server is the OS that loads only what is needed.
>
>, Benoît Fontaine, Devoxx France 2026

---

## English

### Why This Project Exists

AI agents degrade their responses as their context window fills up, without knowing it and without warning. This project implements the **Document and Clear** workflow, the transparent alternative to `/compact`.

**The three phases:**

```
MEASURE → DOCUMENT → RESUME
```

1. **MEASURE**, know where you stand (% of context used)
2. **DOCUMENT**, summarize what matters before losing context
3. **RESUME**, reload the summary in the next session

**What the project contains:**

4 MCP tools: `summarize_context`, `suggest_cleanup`, `export_summary`, `load_session`, a multi-tool config system: `kiro.json`, `claude-code.json`, `default.json`, each with its own output regex, Kiro hooks: `session-id-capture` and `context-usage-reminder`, a Claude Code hook reading token usage from the session transcript, a Markdown session template with 6 mandatory sections, a `.mcp.json` at the project root for Claude Code.

---

### Context Rot Signals

Don't wait for 60%. Act immediately when you observe:

**API hallucinations**: the agent calls methods or parameters that don't exist, **forgotten conventions**: produced code no longer follows rules set at session start, **error loops**: the agent repeats the same failed approach without escalating, **contradictions**: the agent contradicts a decision it made earlier in the session.

---

### The 4 MCP Tools

| Tool | Role |
|------|------|
| `summarize_context` | Validates an agent-written summary, 6 mandatory sections, hollow phrases, 1 000-token budget (warn, never block) |
| `suggest_cleanup` | Identifies verbose content: code blocks >50 lines, resolved errors, repeated paragraphs |
| `export_summary` | Saves summary as `session-YYYY-MM-DD-<subject>.md`, validates in agentic mode (2 000 tokens), anti-overwrite |
| `load_session` | Lists available sessions, loads the one confirmed by the user, never silently loads the most recent |

All processing is local, no external LLM, no network. Works offline.

---

### Token Budgets

`summarize_context` always uses **conversational mode** (≤ 1 000 tokens). `export_summary` always validates in **agentic mode** (≤ 2 000 tokens) before writing. The mode is determined by intent, not by the caller, before a `/clear`, maximum detail is always warranted.

Token budget overrun adds a warning but never blocks export. The summary should represent at most 5–10% of your available context budget.

---

### Context Thresholds

| Status | Threshold | Action |
|--------|-----------|--------|
| OK | < 50% | No action needed |
| Early warning | ≥ 50% | Start thinking about a summary |
| Warning | ≥ 60% | Trigger Document and Clear workflow |
| Critical | ≥ 80% | Export immediately, session at risk |

---

### Automated Context Monitoring

**Kiro**, two hooks in `.kiro/hooks/`:

`session-id-capture` (AgentSpawn): captures the session UUID into `.kiro/.session-id`, then `context-usage-reminder` (AgentStop): reads real % via `kiro-cli chat --resume-id "$SESSION_ID" "/context"`, warns at ≥ 50%, 60%, 80%.

**Claude Code**, one hook in `.claude/settings.json`:

`context-monitor.sh` (UserPromptSubmit): reads token usage directly from the session transcript JSON (no subprocess Claude, no API cost, no loop risk). Injects the alert into Claude's context via `hookSpecificOutput.additionalContext` so Claude can act on it.

Set `CONTEXT_WINDOW` to match your model (default: 200 000, use 1 000 000 for `[1m]` models):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PROJECT_DIR}\"/.claude/hooks/context-monitor.sh",
            "env": { "CONTEXT_WINDOW": "200000" }
          }
        ]
      }
    ]
  }
}
```

---

### Session Files

Saved in `./context-summaries/` as `session-YYYY-MM-DD-<subject>.md`. Six mandatory sections:

```markdown
## Main Objective
## Decisions Made
## Modified Files
## Next Steps
## Warnings
## Resume Here
```

`## Resume Here` is the most critical section, it contains the exact first prompt for the next session. A summary that says "Continue where we left off" is rejected.

> **Security**: session files may contain sensitive information. Add `context-summaries/` to `.gitignore`.

---

### Installation

**Prerequisites:** Node.js 24+

```bash
cd mcp-context-manager
npm install
npm run build
```

---

### Configuration

**Kiro** (`.kiro/settings/mcp.json`):

```json
{
  "mcpServers": {
    "context-manager": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-context-manager/dist/index.js"],
      "env": { "MCP_CONTEXT_CONFIG": "kiro" },
      "autoApprove": ["summarize_context", "suggest_cleanup", "export_summary", "load_session"]
    }
  }
}
```

**Claude Code** (`.mcp.json` at project root):

```json
{
  "mcpServers": {
    "context-manager": {
      "command": "node",
      "args": ["./mcp-context-manager/dist/index.js"],
      "env": { "MCP_CONTEXT_CONFIG": "claude-code" },
      "autoApprove": ["summarize_context", "suggest_cleanup", "export_summary", "load_session"]
    }
  }
}
```

**Custom config:**

```json
{
  "mcpServers": {
    "context-manager": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-context-manager/dist/index.js"],
      "env": { "MCP_CONTEXT_CONFIG": "/path/to/my-custom-config.json" }
    }
  }
}
```

---

### References

Context Engineering, Benoît Fontaine: [part 1](https://medium.com/@b-fontaine/pourquoi-vos-agents-ia-codent-mal-le-vrai-probl%C3%A8me-cest-le-contexte-2f247b01259b?sk=8abc3254906b69f2c9a4c9443a5d98c8), [part 2](https://medium.benoitfontaine.fr/context-engineering-partie-2-ad8abb929047?sk=fe44b04eec35393d88475dcecb4eebe4), [part 3](https://medium.com/@b-fontaine/context-engineering-partie-3-b02ae9846d55?sk=b48c10791c16c8d44a66dfba9031b12d)

[document-and-clear Skill](../.kiro/skills/context-engineering/SKILL.md), [Model Context Protocol](https://modelcontextprotocol.io/)

---
---

## Français

### Pourquoi ce projet existe

Les agents IA dégradent leurs réponses à mesure que leur fenêtre de contexte se remplit, sans le savoir et sans prévenir. Ce projet implémente le workflow **Document and Clear**, l'alternative transparente à `/compact`.

**Les trois phases :**

```
MESURER → DOCUMENTER → REPRENDRE
```

1. **MESURER**, savoir où on en est (% de contexte utilisé)
2. **DOCUMENTER**, résumer ce qui compte avant de perdre le contexte
3. **REPRENDRE**, recharger le résumé dans la session suivante

**Ce que le projet contient :**

4 outils MCP : `summarize_context`, `suggest_cleanup`, `export_summary`, `load_session`, un système de config multi-outils : `kiro.json`, `claude-code.json`, `default.json`, chacun avec son propre regex de parsing, des hooks Kiro : `session-id-capture` et `context-usage-reminder`, un hook Claude Code lisant l'usage des tokens depuis le transcript de session, un template de session Markdown avec 6 sections obligatoires, un `.mcp.json` à la racine du projet pour Claude Code.

---

### Signaux de context rot

N'attendez pas 60%. Agissez immédiatement si vous observez :

* Hallucinations d'API : l'agent appelle des méthodes ou paramètres qui n'existent pas
* conventions oubliées : le code produit ne suit plus les règles établies en début de session
* boucles d'erreurs : l'agent répète la même approche qui a déjà échoué sans escalader
* contradictions : l'agent contredit une décision qu'il a prise plus tôt dans la session

---

### Les 4 outils MCP

| Outil | Rôle |
|-------|------|
| `summarize_context` | Valide un résumé écrit par l'agent, 6 sections obligatoires, phrases creuses, budget 1 000 tokens (avertit, ne bloque jamais) |
| `suggest_cleanup` | Identifie le contenu verbeux : blocs de code >50 lignes, erreurs résolues, paragraphes répétés |
| `export_summary` | Sauvegarde le résumé en `session-YYYY-MM-DD-<sujet>.md`, valide en mode agentique (2 000 tokens), anti-écrasement |
| `load_session` | Liste les sessions disponibles, charge celle confirmée par l'utilisateur, ne charge jamais silencieusement la plus récente |

Tout le traitement est local, pas de LLM externe, pas de réseau. Fonctionne hors ligne.

---

### Budgets de tokens

`summarize_context` utilise toujours le **mode conversationnel** (≤ 1 000 tokens). `export_summary` valide toujours en **mode agentique** (≤ 2 000 tokens) avant d'écrire. Le mode est déterminé par l'intention, pas par l'appelant, avant un `/clear`, le maximum de détail est toujours justifié.

Le dépassement du budget ajoute un avertissement mais ne bloque jamais l'export. Le résumé ne devrait pas dépasser 5 à 10% de votre budget de contexte disponible.

---

### Seuils de contexte

| Statut | Seuil | Action |
|--------|-------|--------|
| OK | < 50% | Aucune action nécessaire |
| Alerte précoce | ≥ 50% | Commencer à préparer un résumé |
| Avertissement | ≥ 60% | Déclencher le workflow Document and Clear |
| Critique | ≥ 80% | Exporter immédiatement, session à risque |

---

### Monitoring automatique du contexte

**Kiro**, deux hooks dans `.kiro/hooks/` :

`session-id-capture` (AgentSpawn) : capture l'UUID de session dans `.kiro/.session-id`, puis `context-usage-reminder` (AgentStop) : lit le % réel via `kiro-cli chat --resume-id "$SESSION_ID" "/context"`, avertit à ≥ 50%, 60%, 80%.

**Claude Code**, un hook dans `.claude/settings.json` :

`context-monitor.sh` (UserPromptSubmit) : lit l'usage des tokens directement depuis le transcript JSON de session (pas de sous-processus Claude, pas de coût API, pas de risque de boucle). Injecte l'alerte dans le contexte de Claude via `hookSpecificOutput.additionalContext` pour qu'il puisse agir.

Définir `CONTEXT_WINDOW` selon votre modèle (défaut : 200 000, utiliser 1 000 000 pour les modèles `[1m]`).

---

### Fichiers de session

Sauvegardés dans `./context-summaries/` sous la forme `session-AAAA-MM-JJ-<sujet>.md`. Six sections obligatoires :

```markdown
## Main Objective
## Decisions Made
## Modified Files
## Next Steps
## Warnings
## Resume Here
```

La section `## Resume Here` est la plus critique, elle contient le premier prompt exact pour la session suivante. Un résumé qui dit "Continuer là où on s'était arrêté" est rejeté.

> **Sécurité** : les fichiers de session peuvent contenir des informations sensibles. Ajoutez `context-summaries/` à votre `.gitignore`.

---

### Installation

**Prérequis :** Node.js 24+

```bash
cd mcp-context-manager
npm install
npm run build
```

---

### Configuration

**Kiro** (`.kiro/settings/mcp.json`) : voir section anglaise ci-dessus, même configuration.

**Claude Code** (`.mcp.json` à la racine du projet) : voir section anglaise ci-dessus, même configuration.

---

### Références

Context Engineering, Benoît Fontaine : [partie 1](https://medium.com/@b-fontaine/pourquoi-vos-agents-ia-codent-mal-le-vrai-probl%C3%A8me-cest-le-contexte-2f247b01259b?sk=8abc3254906b69f2c9a4c9443a5d98c8), [partie 2](https://medium.benoitfontaine.fr/context-engineering-partie-2-ad8abb929047?sk=fe44b04eec35393d88475dcecb4eebe4), [partie 3](https://medium.com/@b-fontaine/context-engineering-partie-3-b02ae9846d55?sk=b48c10791c16c8d44a66dfba9031b12d)

[Skill document-and-clear](../.kiro/skills/context-engineering/SKILL.md), [Model Context Protocol](https://modelcontextprotocol.io/)
