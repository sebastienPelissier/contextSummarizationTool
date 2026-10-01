# context-export hooks

Ces deux fichiers sont des **hooks Kiro** (pas des Skills) à installer dans `.kiro/hooks/`
du projet où vous utilisez le serveur MCP.

## Installation

Copiez les deux fichiers dans votre `.kiro/hooks/` :

```bash
cp session-id-capture.json    /votre-projet/.kiro/hooks/
cp context-usage-reminder.json /votre-projet/.kiro/hooks/
```

## Fonctionnement

### session-id-capture.json (AgentSpawn)

Au démarrage de chaque session, capture le session ID via `/session-id` et le stocke
dans `.kiro/.session-id`. Ce fichier est lu par le hook suivant.

> Requiert `KIRO_API_KEY` pour le mode headless.

### context-usage-reminder.json (AgentStop)

Après chaque réponse de l'agent, lit le **vrai %** de contexte via :

```bash
kiro-cli chat --agent-engine=v2 --no-interactive \
  --resume-id "$(cat .kiro/.session-id)" "/context"
```

- **>= 80%** → 🚨 CRITIQUE — export immédiat recommandé
- **>= 60%** → ⚠️ ATTENTION — déclencher Document and Clear
- **< 60%**  → silence

## Prérequis

- `KIRO_API_KEY` défini dans l'environnement
- `kiro-cli` disponible dans le `PATH`
- `.kiro/.session-id` présent (créé par `session-id-capture`)
