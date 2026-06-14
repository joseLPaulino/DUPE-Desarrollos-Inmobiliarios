#!/usr/bin/env bash
# Run this once from your terminal in the /Users/josepaulino/dev/dupe folder
# Requires: git + SSH key already configured for github.com

set -e
cd "$(dirname "$0")"

echo "🔧 Initializing git repo..."
rm -rf .git   # Remove any partial .git from sandbox attempts
git init
git branch -m main
git config user.name  "Jose Paulino"
git config user.email "jose.paulino@hcltech.com"
git remote add origin git@github.com:joseLPaulino/DUPE-Desarrollos-Inmobiliarios.git

echo "📁 Staging files..."
git add -A

echo "✅ Committing..."
git commit -m "feat: DUPE Agentic Business Platform — initial commit

HCLTech AI Labs · MVP Solution proposal for DUPE Desarrollos Inmobiliarios

Includes:
- L1 Architecture document (docs/architecture/)
- ROM Estimate (docs/rom/)
- Client deck — Spanish, light theme, 13 slides (docs/rom/decks/client/)
- Deck build scripts: v1 English, ES dark, ES light
- Project scaffold: agents, modules, integrations (src/)
- Input questionnaires and financial models (inputs/)
- ADR-0001: engagement classification
- CLAUDE.md: standing AI agent context

Agents: Orchestrator · Reconciliation · Collections Notification ·
        Financial Intelligence · Escalation Router · Reporting
ROM: 14–18 pod days · ~7–8 elapsed weeks · 3-role agentic pod
Prepared by: Jose Paulino, Senior AI Solution Architect, HCLTech AI Labs"

echo "🚀 Pushing to GitHub..."
git push -u origin main

echo ""
echo "✅ Done! Repo pushed to:"
echo "   https://github.com/joseLPaulino/DUPE-Desarrollos-Inmobiliarios"
