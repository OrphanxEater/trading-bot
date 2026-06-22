# 🔐 SECURE API KEY SETUP GUIDE

## ⚠️ CRITICAL: Never Share API Keys in Chat or Public Spaces!

### Step-by-Step Secure Setup

#### 1. Create Your Local .env File

```bash
cd /home/user/trading-bot
cp .env.example .env
```

This creates a local `.env` file that will **NEVER** be committed to git.

#### 2. Add Your API Keys Securely

Edit the `.env` file (use nano, vim, or any text editor):

```bash
nano .env
```

Find these lines and replace with your **NEW** keys (after revoking the old ones):

```bash
# MadeOnSol API (get from https://madeonsol.com/developer)
MADEONSOL_API_KEY="your_new_key_here"

# Solscan Pro API (get from https://pro.solscan.io/)
SOLSCAN_API_KEY="your_new_jwt_here"

# Enable KOL tracking
ENABLE_KOL_TRACKING="true"
```

Save and exit (Ctrl+X, then Y, then Enter in nano).

#### 3. Verify Your Keys Are Secure

```bash
# This should show .env is in the ignore list
grep ".env" .gitignore

# This should NOT show .env in tracked files
git status
```

If `.env` appears in `git status`, **STOP** and verify your `.gitignore` is correct.

#### 4. Test Your API Connections

```bash
node scripts/testAPIConnections.js
```

You should see:
```
✅ MadeOnSol API: ALL TESTS PASSED
✅ KOL Monitor: ALL TESTS PASSED
🎉 All systems operational!
```

---

## 🚨 What To Do If You Exposed Keys

**If you accidentally posted your API keys in chat/public:**

1. **Immediately revoke the exposed keys:**
   - MadeOnSol: https://madeonsol.com/developer → Delete/Revoke API Key
   - Solscan: https://pro.solscan.io/ → Regenerate Token

2. **Generate new keys** from the same dashboards

3. **Add new keys ONLY to your local `.env` file**
   - NEVER post them in chat
   - NEVER commit them to git
   - NEVER share them in screenshots

4. **Verify the old keys no longer work:**
   ```bash
   # Try with old key - should fail
   curl -H "Authorization: Bearer OLD_KEY" https://api.madeonsol.com/v1/kol/list
   ```

---

## 📋 Security Checklist

Before running the bot, verify:

- [ ] `.env` file exists locally
- [ ] `.env` contains your API keys
- [ ] `.env` is listed in `.gitignore`
- [ ] `git status` does NOT show `.env`
- [ ] You have NOT posted keys in chat/public
- [ ] Old exposed keys have been revoked
- [ ] Test script passes: `node scripts/testAPIConnections.js`

---

## 🎯 What Your Keys Enable

**MadeOnSol API Key:**
- Track top 50 KOL wallets in real-time
- Detect coordinated buying (3+ KOLs on same token)
- Check deployer reputation scores
- Get trending Pump.fun tokens with risk levels
- Alert you BEFORE pumps peak

**Solscan API Key:**
- Deep blockchain transaction history
- Wallet balance tracking
- Token holder analysis
- Historical trade data

---

## ⚡ Quick Start After Setup

```bash
# 1. Test connections
node scripts/testAPIConnections.js

# 2. Check market intelligence
node -e "
const MadeOnSolClient = require('./src/services/madeOnSolClient');
require('dotenv').config();
(async () => {
  const client = new MadeOnSolClient();
  const intel = await client.getMarketIntelligence();
  console.log(intel);
})();
"

# 3. Start KOL monitoring (coming soon - will integrate into main bot)
```

---

## 🆘 Troubleshooting

**Error: "MadeOnSol API not configured"**
- Check `.env` file exists
- Verify `MADEONSOL_API_KEY` is set
- Make sure key is not wrapped in quotes if using dotenv

**Error: "Invalid API key"**
- Key might be revoked - generate a new one
- Copy-paste error - verify no extra spaces
- Try regenerating the key

**Error: "Rate limit exceeded"**
- Wait 60 seconds
- Reduce request frequency
- Check if multiple instances are running

**Keys showing in git status:**
- Run: `git rm --cached .env`
- Verify `.gitignore` has `.env` listed
- Check for typos in `.gitignore`

---

## 📚 Related Documentation

- [MadeOnSol API Docs](https://docs.madeonsol.com)
- [Solscan API Docs](https://docs.solscan.io)
- [Helius RPC Docs](https://docs.helius.dev)

---

**Remember: Your API keys are like passwords. Treat them with the same security!**

Never share them, never commit them, never post them publicly.
