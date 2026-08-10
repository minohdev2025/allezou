#!/usr/bin/env bash
# ask-codestral.sh — Délègue une tâche de code à Codestral (Mistral)
#
# Usage :
#   scripts/ask-codestral.sh "tâche" [fichier1.ts] [fichier2.ts] ...
#
# Exemples :
#   scripts/ask-codestral.sh "Génère les types Prisma pour ce schéma" prisma/schema.prisma
#   scripts/ask-codestral.sh "Écris les tests unitaires" features/invoices/InvoiceCard.tsx
#   scripts/ask-codestral.sh "Refactorise ce hook pour utiliser useCallback" features/auth/useAuth.ts

set -euo pipefail

TASK="${1:-}"
if [ -z "$TASK" ]; then
  echo "Usage: $0 \"tâche\" [fichier1] [fichier2...]" >&2
  exit 1
fi
shift
FILES=("$@")

# ── Clé API depuis le store OpenCode ─────────────────────────────────────────
# Convertir le chemin Git Bash → chemin Windows pour Python
AUTH_FILE_WIN=$(cygpath -w "$HOME/.local/share/opencode/auth.json" 2>/dev/null || echo "")
if [ -z "$AUTH_FILE_WIN" ] || [ ! -f "$HOME/.local/share/opencode/auth.json" ]; then
  echo "Erreur : fichier auth OpenCode introuvable" >&2
  exit 1
fi

export CODESTRAL_KEY
CODESTRAL_KEY=$(python3 -c "
import json, sys
try:
    d = json.load(open(r'$AUTH_FILE_WIN'))
    print(d['mistral-codestral']['key'])
except Exception as e:
    print(f'Erreur lecture clé : {e}', file=sys.stderr)
    sys.exit(1)
")

if [ -z "$CODESTRAL_KEY" ]; then
  echo "Erreur : clé Codestral introuvable dans le store OpenCode" >&2
  exit 1
fi

# ── Convertir les chemins de fichiers en chemins Windows ─────────────────────
WIN_FILES=()
for f in "${FILES[@]+"${FILES[@]}"}"; do
  WIN_FILES+=("$(cygpath -w "$f" 2>/dev/null || echo "$f")")
done

# ── Appel à Codestral via Python ─────────────────────────────────────────────
python3 - "$TASK" "${WIN_FILES[@]+"${WIN_FILES[@]}"}" <<'PYEOF'
import json, sys, os, urllib.request

task  = sys.argv[1]
files = sys.argv[2:]
key   = os.environ.get("CODESTRAL_KEY", "")

if not key:
    sys.stderr.write("Erreur : CODESTRAL_KEY non défini\n")
    sys.exit(1)

# Construire le contexte fichiers
context_parts = []
for f in files:
    if os.path.isfile(f):
        ext = os.path.splitext(f)[1].lstrip(".")
        try:
            content = open(f, encoding="utf-8").read()
            context_parts.append(f"```{ext}\n// {f}\n{content}\n```")
        except Exception as e:
            sys.stderr.write(f"Impossible de lire {f} : {e}\n")
    else:
        sys.stderr.write(f"Attention : fichier ignoré (introuvable) : {f}\n")

# Prompt final
if context_parts:
    prompt = "\n\n".join(context_parts) + "\n\n---\n\n" + task
else:
    prompt = task

# Appel API
payload = {
    "model": "codestral-latest",
    "messages": [
        {
            "role": "system",
            "content": (
                "Tu es Codestral, un assistant expert en génération et édition de code. "
                "Réponds directement avec le code demandé. "
                "Pour un fichier complet, retourne uniquement son contenu sans bloc markdown. "
                "Pour un extrait, utilise un bloc de code avec le bon langage. "
                "Sois précis et concis, sans explication superflue sauf si demandée."
            )
        },
        {"role": "user", "content": prompt}
    ],
    "max_tokens": 8192,
    "temperature": 0.05,
}

req = urllib.request.Request(
    "https://codestral.mistral.ai/v1/chat/completions",
    data=json.dumps(payload).encode(),
    headers={
        "Content-Type":  "application/json",
        "Authorization": f"Bearer {key}",
    },
    method="POST",
)

try:
    with urllib.request.urlopen(req, timeout=90) as r:
        data = json.loads(r.read())
        print(data["choices"][0]["message"]["content"])
except urllib.error.HTTPError as e:
    body = e.read().decode(errors="replace")
    sys.stderr.write(f"Erreur HTTP {e.code} : {body}\n")
    sys.exit(1)
except Exception as e:
    sys.stderr.write(f"Erreur : {e}\n")
    sys.exit(1)
PYEOF
