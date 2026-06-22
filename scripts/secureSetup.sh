#!/bin/bash

# Secure API Key Setup Script
# This script helps you add API keys to .env WITHOUT exposing them

set -e

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║           🔐 SECURE API KEY SETUP WIZARD                      ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check if .env already exists
if [ -f .env ]; then
    echo "⚠️  .env file already exists!"
    echo ""
    read -p "Do you want to update it? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Exiting..."
        exit 0
    fi
else
    echo "Creating new .env file from template..."
    cp .env.example .env
    echo "✓ Created .env"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚨 SECURITY REMINDER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "NEVER share your API keys in:"
echo "  ❌ Chat messages"
echo "  ❌ Screenshots"
echo "  ❌ Public repositories"
echo "  ❌ Discord/Telegram/Twitter"
echo ""
echo "Your keys will be stored LOCALLY in .env (not committed to git)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Function to safely add key to .env
add_key_to_env() {
    local key_name=$1
    local key_value=$2

    # Remove existing key if present
    sed -i "/^${key_name}=/d" .env

    # Add new key
    echo "${key_name}=\"${key_value}\"" >> .env
}

# MadeOnSol API Key
echo "📡 MadeOnSol API Key"
echo "   Get from: https://madeonsol.com/developer"
echo ""
read -p "Enter your MadeOnSol API key (or press Enter to skip): " -s MADEONSOL_KEY
echo ""

if [ ! -z "$MADEONSOL_KEY" ]; then
    add_key_to_env "MADEONSOL_API_KEY" "$MADEONSOL_KEY"
    echo "✓ MadeOnSol key added"
else
    echo "⊘ Skipped MadeOnSol"
fi

echo ""

# Solscan API Key
echo "📡 Solscan API Key (JWT Token)"
echo "   Get from: https://pro.solscan.io/"
echo ""
read -p "Enter your Solscan JWT token (or press Enter to skip): " -s SOLSCAN_KEY
echo ""

if [ ! -z "$SOLSCAN_KEY" ]; then
    add_key_to_env "SOLSCAN_API_KEY" "$SOLSCAN_KEY"
    echo "✓ Solscan key added"
else
    echo "⊘ Skipped Solscan"
fi

echo ""

# Helius API Key
echo "📡 Helius RPC API Key (Optional but recommended)"
echo "   Get from: https://helius.dev"
echo ""
read -p "Enter your Helius API key (or press Enter to skip): " -s HELIUS_KEY
echo ""

if [ ! -z "$HELIUS_KEY" ]; then
    add_key_to_env "HELIUS_API_KEY" "$HELIUS_KEY"
    add_key_to_env "HELIUS_RPC_URL" "https://rpc.helius.xyz/?api-key=${HELIUS_KEY}"
    echo "✓ Helius key added"
else
    echo "⊘ Skipped Helius"
fi

echo ""

# Enable KOL tracking?
echo "🔍 Enable KOL Tracking?"
echo "   This monitors top KOL wallets and alerts on coordinated buying"
echo ""
read -p "Enable KOL tracking? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    add_key_to_env "ENABLE_KOL_TRACKING" "true"
    echo "✓ KOL tracking enabled"
else
    add_key_to_env "ENABLE_KOL_TRACKING" "false"
    echo "⊘ KOL tracking disabled"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ SETUP COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Verify .env is not tracked
if git check-ignore .env > /dev/null 2>&1; then
    echo "✓ .env is properly ignored by git (secure)"
else
    echo "⚠️  WARNING: .env might not be in .gitignore!"
    echo "   Run: echo '.env' >> .gitignore"
fi

echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Test your API connections:"
echo "   node scripts/testAPIConnections.js"
echo ""
echo "2. View market intelligence:"
echo "   node scripts/quickSolPredictions.js"
echo ""
echo "3. Start the trading bot:"
echo "   npm start (coming soon)"
echo ""
echo "📚 For troubleshooting, see: SECURITY_SETUP.md"
echo ""
