# Solana Trading Bot

A professional, production-ready automated trading bot for Solana blockchain using Jupiter DEX aggregator. This bot supports multiple trading strategies and provides comprehensive logging, error handling, and configuration management.

## Features

- **Jupiter DEX Integration** - Access to best prices across all Solana DEXs
- **Multiple Trading Strategies**
  - Threshold Strategy: Buy/sell based on price thresholds
  - DCA Strategy: Dollar-cost averaging at regular intervals
  - **NEW** Momentum Strategy: Trade based on RSI, trend, and momentum indicators
  - **NEW** Grid Trading: Profit from price oscillations in ranging markets
- **Advanced Risk Management**
  - Kelly Criterion position sizing
  - Maximum drawdown protection
  - Daily loss limits
  - Position size limits
- **Performance Analytics**
  - Real-time P&L tracking
  - Sharpe & Sortino ratios
  - Win rate and profit factor
  - Trade history and reporting
- **Technical Indicators**
  - RSI, MACD, Bollinger Bands
  - Moving averages (SMA/EMA)
  - ATR for volatility measurement
  - Trend detection
- **Professional Architecture**
  - Modular design with separation of concerns
  - Comprehensive error handling and logging
  - Configuration management
  - Dry run mode for testing
- **Real-time Price Monitoring** - Continuous price tracking with configurable intervals
- **Transaction Management** - Priority fees and retry logic for reliable execution
- **Security Best Practices** - Secure wallet management and private key handling

**📚 [See ADVANCED_FEATURES.md for detailed guide on new features](./ADVANCED_FEATURES.md)**

## Architecture

```
src/
├── config/
│   └── config.js                  # Configuration management
├── services/
│   ├── walletManager.js           # Wallet and keypair operations
│   ├── connectionManager.js       # Solana RPC connection
│   ├── jupiterService.js          # Jupiter DEX integration
│   ├── priceMonitor.js            # Price tracking service
│   └── tradingEngine.js           # Trade execution engine
├── strategies/
│   ├── thresholdStrategy.js       # Price threshold strategy
│   ├── dcaStrategy.js             # Dollar-cost averaging strategy
│   ├── momentumStrategy.js        # Momentum trading with indicators
│   └── gridStrategy.js            # Grid trading for ranging markets
├── utils/
│   ├── logger.js                  # Winston logger
│   ├── helpers.js                 # Utility functions
│   ├── riskManager.js             # Risk management system
│   ├── performanceAnalytics.js    # Performance tracking
│   └── technicalIndicators.js     # Technical analysis tools
└── index.js                       # Main entry point
```

## Prerequisites

- Node.js >= 16.x
- A Solana wallet with SOL for trading and fees
- RPC endpoint (public or private like QuickNode, Helius)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd trading-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` file with your settings**
   - Add your private key
   - Configure trading parameters
   - Set your strategy

## Configuration

### Required Settings

```env
# Your Solana private key (KEEP THIS SECURE!)
PRIVATE_KEY="your-base58-private-key"

# Trading pair (default: SOL/USDC)
INPUT_TOKEN="So11111111111111111111111111111111111111112"
OUTPUT_TOKEN="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
```

### Getting Your Private Key

**From Phantom Wallet:**
- Open Phantom
- Go to Settings → Export Private Key
- Copy the base58 string

**From Solana CLI:**
```bash
cat ~/.config/solana/id.json
```
Use the entire JSON array as your private key.

### Strategy: Threshold Trading

Buy when price drops, sell when price rises:

```env
STRATEGY="threshold"
BUY_THRESHOLD="150"      # Buy when SOL drops to $150
SELL_THRESHOLD="160"     # Sell when SOL rises to $160
TRADE_AMOUNT="0.1"       # Trade 0.1 SOL
```

### Strategy: Dollar-Cost Averaging (DCA)

Buy fixed amounts at regular intervals:

```env
STRATEGY="dca"
DCA_AMOUNT="0.1"         # Buy 0.1 SOL each time
DCA_INTERVAL="3600000"   # Every hour (in milliseconds)
```

## Usage

### Testing First (Recommended)

Always test with dry run mode first:

```bash
# Edit .env
DRY_RUN="true"

# Run bot
npm start
```

This will simulate trades without executing them.

### Running on Devnet

Test on devnet before using real funds:

```bash
# Edit .env
SOLANA_RPC_ENDPOINT="https://api.devnet.solana.com"
SOLANA_NETWORK="devnet"
DRY_RUN="false"
```

Get devnet SOL from faucet:
```bash
solana airdrop 2 YOUR_WALLET_ADDRESS --url devnet
```

### Running on Mainnet

Once tested, run on mainnet:

```bash
# Edit .env
SOLANA_RPC_ENDPOINT="https://api.mainnet-beta.solana.com"
SOLANA_NETWORK="mainnet-beta"
DRY_RUN="false"

# Start bot
npm start
```

### Running in Production

For production, consider using PM2 for process management:

```bash
# Install PM2
npm install -g pm2

# Start bot with PM2
pm2 start src/index.js --name solana-trading-bot

# View logs
pm2 logs solana-trading-bot

# Monitor
pm2 monit

# Stop
pm2 stop solana-trading-bot
```

## Token Configuration

### Popular Token Mint Addresses

```javascript
// Solana (wrapped SOL)
So11111111111111111111111111111111111111112

// USDC
EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

// USDT
Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB

// RAY (Raydium)
4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R

// BONK
DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263
```

To find other token addresses, visit:
- https://solscan.io/
- https://solana.fm/

## Price Thresholds

The bot monitors prices in terms of OUTPUT_TOKEN per INPUT_TOKEN.

Example (SOL/USDC):
- `BUY_THRESHOLD="150"` means buy when SOL price is 150 USDC
- `SELL_THRESHOLD="160"` means sell when SOL price is 160 USDC

To get current prices, check:
- https://jup.ag/
- https://www.coingecko.com/

## NEW: Advanced Trading Strategies

### Momentum Strategy

Trade based on technical indicators and market momentum:

```env
STRATEGY="momentum"
RSI_OVERSOLD="30"
RSI_OVERBOUGHT="70"
TRAILING_STOP_PERCENT="5.0"
ENABLE_PERFORMANCE_TRACKING="true"
```

**When to use:** Trending markets with clear direction.

### Grid Trading Strategy

Profit from price oscillations:

```env
STRATEGY="grid"
GRID_LEVELS="10"
GRID_SPACING="2.0"
GRID_ORDER_SIZE="0.05"
```

**When to use:** Ranging/sideways markets with high volatility.

**📚 [Full guide on advanced strategies in ADVANCED_FEATURES.md](./ADVANCED_FEATURES.md)**

## Advanced Configuration

### Slippage Tolerance

```env
SLIPPAGE_BPS="50"  # 0.5% slippage
```

- 50 BPS = 0.5% (recommended for most tokens)
- 100 BPS = 1% (for less liquid tokens)
- 500 BPS = 5% (for very volatile/illiquid tokens)

### Priority Fees

```env
PRIORITY_FEE="1000"  # microLamports
```

Higher priority fees = faster transaction confirmation.

- 1000 = low priority (slower, cheaper)
- 10000 = medium priority (balanced)
- 100000 = high priority (faster, more expensive)

### Custom RPC Endpoints

For better performance, use a private RPC:

```env
# QuickNode
SOLANA_RPC_ENDPOINT="https://your-quicknode-endpoint.solana-mainnet.quiknode.pro/..."

# Helius
SOLANA_RPC_ENDPOINT="https://rpc.helius.xyz/?api-key=YOUR_KEY"

# Triton
SOLANA_RPC_ENDPOINT="https://your-endpoint.rpcpool.com/..."
```

## Logging

The bot uses Winston for structured logging:

```env
LOG_LEVEL="info"  # Options: debug, info, warn, error
```

- **debug**: Detailed technical information
- **info**: General operational messages (recommended)
- **warn**: Warning messages
- **error**: Error messages only

## Safety Tips

1. **Start Small**: Test with small amounts first
2. **Use Devnet**: Always test on devnet before mainnet
3. **Dry Run**: Use `DRY_RUN=true` to test configuration
4. **Monitor Closely**: Watch the first few trades carefully
5. **Set Stop Losses**: Consider implementing stop-loss logic
6. **Secure Keys**: Never share or commit your private key
7. **Check Balances**: Ensure sufficient SOL for fees
8. **Understand Risks**: Crypto trading involves significant risk

## Common Token Pairs

### Stablecoin Pairs
- SOL/USDC (most liquid)
- SOL/USDT

### DeFi Tokens
- SOL/RAY (Raydium)
- SOL/SRM (Serum)

### Memecoins
- SOL/BONK
- SOL/WIF

## Troubleshooting

### "Insufficient balance" error
- Check you have enough SOL for trading + fees
- Minimum ~0.01 SOL for fees recommended

### "Transaction failed" error
- Increase `PRIORITY_FEE`
- Increase `SLIPPAGE_BPS`
- Check RPC endpoint health

### "Wallet initialization failed"
- Verify `PRIVATE_KEY` format
- Ensure no extra spaces or quotes

### "No quote data received"
- Check RPC endpoint is working
- Verify token addresses are correct
- Ensure sufficient liquidity for token pair

### Rate limiting issues
- Use a private RPC endpoint
- Increase `PRICE_CHECK_INTERVAL`

## API Rate Limits

**Jupiter API**: Generally unlimited for quotes, but be respectful

**Public RPC**: ~100 requests/second (consider private RPC for production)

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Disclaimer

This bot is for educational purposes. Cryptocurrency trading involves substantial risk of loss. Always:
- Do your own research (DYOR)
- Only invest what you can afford to lose
- Test thoroughly before using real funds
- Monitor your bot regularly
- Understand the code before running it

**The authors are not responsible for any financial losses incurred while using this bot.**

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review the code and documentation

## Roadmap

- [ ] Stop-loss functionality
- [ ] Take-profit targets
- [ ] Multiple trading pairs simultaneously
- [ ] Advanced order types
- [ ] Backtesting framework
- [ ] Web dashboard
- [ ] Telegram notifications
- [ ] Performance analytics

## Acknowledgments

- [Jupiter Aggregator](https://jup.ag/) for DEX aggregation
- [Solana Labs](https://solana.com/) for the blockchain
- [@solana/web3.js](https://github.com/solana-labs/solana-web3.js) for the SDK

---

**Happy Trading! 🚀**
