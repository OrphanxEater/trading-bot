# Advanced Trading Features Guide

This guide covers the advanced features added to the Solana Trading Bot.

## Table of Contents

1. [New Trading Strategies](#new-trading-strategies)
2. [Risk Management System](#risk-management-system)
3. [Performance Analytics](#performance-analytics)
4. [Technical Indicators](#technical-indicators)
5. [Configuration Examples](#configuration-examples)

## New Trading Strategies

### 1. Momentum Strategy

The momentum strategy identifies and trades strong price movements using multiple technical indicators.

**How It Works:**
- Monitors RSI (Relative Strength Index) for overbought/oversold conditions
- Tracks price momentum (% change over time)
- Analyzes trend using moving averages
- Requires multiple confirmations before trading
- Uses trailing stop-loss to protect profits

**When to Use:**
- Trending markets with clear direction
- High volatility periods
- When you want to ride price momentum

**Configuration:**
```env
STRATEGY="momentum"

# Momentum Parameters
RSI_PERIOD="14"              # Standard RSI period
RSI_OVERSOLD="30"            # Buy when RSI < 30
RSI_OVERBOUGHT="70"          # Sell when RSI > 70
MOMENTUM_THRESHOLD="2.0"     # 2% price change triggers signal
CONFIRMATION_REQUIRED="true" # Wait for multiple indicators
TRAILING_STOP_PERCENT="5.0"  # Exit if price drops 5% from peak
```

**Example Use Case:**
```env
# Aggressive momentum trading
STRATEGY="momentum"
RSI_OVERSOLD="35"
RSI_OVERBOUGHT="65"
MOMENTUM_THRESHOLD="3.0"
CONFIRMATION_REQUIRED="false"  # More aggressive
TRAILING_STOP_PERCENT="3.0"    # Tighter stop
```

**Signals Used:**
- **BUY when:** RSI < 30 + Upward momentum + Uptrend detected
- **SELL when:** RSI > 70 + Downward momentum + Downtrend detected
- **STOP when:** Trailing stop hit or trend reversal

### 2. Grid Trading Strategy

Grid trading profits from price oscillations by placing buy and sell orders at regular intervals.

**How It Works:**
- Creates a "grid" of buy and sell orders at different price levels
- Buys when price hits lower levels
- Sells when price hits upper levels
- Profits from each completed buy/sell cycle
- Works best in ranging (sideways) markets

**When to Use:**
- Sideways/ranging markets
- High volatility with no clear trend
- Pairs that oscillate within a range

**Configuration:**
```env
STRATEGY="grid"

# Grid Parameters
GRID_LEVELS="10"             # Number of price levels
GRID_SPACING="2.0"           # 2% between each level
GRID_UPPER_PRICE="0"         # Auto-calculate from current price
GRID_LOWER_PRICE="0"         # Auto-calculate from current price
GRID_ORDER_SIZE="0.01"       # Trade 0.01 SOL per grid
```

**Manual Grid Setup:**
```env
# If SOL is at $150, set up grid from $140-$160
STRATEGY="grid"
GRID_LEVELS="10"
GRID_SPACING="2.0"
GRID_UPPER_PRICE="160"       # Sell up to $160
GRID_LOWER_PRICE="140"       # Buy down to $140
GRID_ORDER_SIZE="0.05"
```

**How Grid Levels Work:**
```
If SOL is at $150 and you use 10 levels with 2% spacing:

Level 10 (SELL): $165 ─┐
Level 9  (SELL): $162  │
Level 8  (SELL): $159  │
Level 7  (SELL): $156  │
Level 6  (SELL): $153  ├─ Current price zone
Level 5  (BUY):  $150  │
Level 4  (BUY):  $147  │
Level 3  (BUY):  $144  │
Level 2  (BUY):  $141  │
Level 1  (BUY):  $138 ─┘

When price drops to $147 → Buy
When price rises to $153 → Sell
Profit: 4% per cycle
```

## Risk Management System

Advanced risk controls to protect your capital.

### Features

1. **Kelly Criterion Position Sizing**
   - Calculates optimal position size based on win rate and risk/reward
   - Uses fractional Kelly for safety
   - Prevents over-leveraging

2. **Maximum Drawdown Protection**
   - Stops trading if losses exceed threshold
   - Protects against catastrophic losses

3. **Daily Loss Limits**
   - Prevents runaway losses
   - Resets daily

4. **Position Size Limits**
   - Caps individual trade size
   - Ensures diversification

### Configuration

```env
ENABLE_RISK_MANAGEMENT="true"

# Risk Parameters
MAX_DRAWDOWN="0.2"           # Stop if down 20% from peak
MAX_POSITION_SIZE="0.25"     # Max 25% of capital per trade
KELLY_FRACTION="0.25"        # Use 1/4 Kelly (conservative)
MAX_DAILY_LOSS="0.1"         # Stop if down 10% in one day
```

### How It Works

**Kelly Criterion:**
```
Position Size = (Win% × Avg Win - Loss% × Avg Loss) / Avg Win × Kelly Fraction

Example:
- Win Rate: 60%
- Avg Win: $10
- Avg Loss: $5
- Kelly Fraction: 0.25

Position = (0.6 × 10 - 0.4 × 5) / 10 × 0.25 = 10% of capital
```

**Drawdown Protection:**
```
Peak Balance: $1000
Current Balance: $850
Drawdown: 15%

If MAX_DRAWDOWN = 0.2 (20%):
✓ Trading continues (15% < 20%)

If balance drops to $790:
Drawdown: 21%
✗ Trading stops until reset
```

## Performance Analytics

Track your trading performance with professional metrics.

### Metrics Tracked

1. **Win Rate** - Percentage of profitable trades
2. **Profit Factor** - Gross profit / Gross loss
3. **Sharpe Ratio** - Risk-adjusted returns
4. **Sortino Ratio** - Downside risk-adjusted returns
5. **Maximum Drawdown** - Largest peak-to-trough decline
6. **Expectancy** - Expected profit per trade

### Enable Performance Tracking

```env
ENABLE_PERFORMANCE_TRACKING="true"
```

### Sample Performance Report

```
==========================================================
PERFORMANCE REPORT
==========================================================
Summary: {
  totalTrades: 45,
  winningTrades: 28,
  losingTrades: 17,
  winRate: '62.22%'
}
Profitability: {
  totalPnL: 2.3456,
  totalReturn: '23.46%',
  avgWin: 0.1234,
  avgLoss: 0.0567,
  profitFactor: 2.18,
  expectancy: 0.0521
}
Risk Metrics: {
  sharpeRatio: 2.34,
  sortinoRatio: 3.21,
  maxDrawdown: '8.45%'
}
==========================================================
```

### Interpreting Metrics

**Sharpe Ratio:**
- < 1.0: Poor risk-adjusted returns
- 1.0 - 2.0: Good
- 2.0 - 3.0: Very good
- \> 3.0: Excellent

**Profit Factor:**
- < 1.0: Losing strategy
- 1.0 - 1.5: Break-even to marginal
- 1.5 - 2.0: Good
- \> 2.0: Excellent

**Win Rate:**
- 40-50%: Acceptable with good risk/reward
- 50-60%: Good
- \> 60%: Excellent

## Technical Indicators

### Available Indicators

1. **RSI (Relative Strength Index)**
   - Identifies overbought/oversold conditions
   - Range: 0-100
   - < 30 = Oversold (buy signal)
   - \> 70 = Overbought (sell signal)

2. **Moving Averages (SMA/EMA)**
   - Identifies trend direction
   - SMA 20/50 for trend confirmation

3. **MACD (Moving Average Convergence Divergence)**
   - Momentum and trend indicator
   - Crossovers signal trend changes

4. **Bollinger Bands**
   - Volatility bands around moving average
   - Price touching lower band = potential buy
   - Price touching upper band = potential sell

5. **ATR (Average True Range)**
   - Measures volatility
   - Used for position sizing
   - Higher ATR = reduce position size

### Using Indicators

Indicators are automatically used by the momentum strategy. You can also access them programmatically:

```javascript
const TechnicalIndicators = require('./utils/technicalIndicators');

// Calculate RSI
const rsi = TechnicalIndicators.calculateRSI(prices, 14);

// Calculate Bollinger Bands
const bands = TechnicalIndicators.calculateBollingerBands(prices, 20, 2);

// Detect trend
const trend = TechnicalIndicators.detectTrend(prices);
```

## Configuration Examples

### Conservative Trading

```env
# Safe, low-risk configuration
STRATEGY="dca"
DCA_AMOUNT="0.05"
DCA_INTERVAL="7200000"        # Every 2 hours

ENABLE_RISK_MANAGEMENT="true"
MAX_DRAWDOWN="0.10"           # Stop at 10% loss
MAX_POSITION_SIZE="0.10"      # Max 10% per trade
MAX_DAILY_LOSS="0.05"         # Stop at 5% daily loss

SLIPPAGE_BPS="100"            # Higher slippage tolerance
DRY_RUN="false"
```

### Moderate Risk

```env
# Balanced approach
STRATEGY="momentum"
TRADE_AMOUNT="0.1"
TRAILING_STOP_PERCENT="5.0"

ENABLE_RISK_MANAGEMENT="true"
MAX_DRAWDOWN="0.15"
MAX_POSITION_SIZE="0.20"

RSI_PERIOD="14"
CONFIRMATION_REQUIRED="true"
```

### Aggressive Trading

```env
# Higher risk, higher reward
STRATEGY="momentum"
TRADE_AMOUNT="0.2"
TRAILING_STOP_PERCENT="3.0"   # Tighter stops

ENABLE_RISK_MANAGEMENT="true"
MAX_DRAWDOWN="0.25"
MAX_POSITION_SIZE="0.30"

RSI_OVERSOLD="35"
RSI_OVERBOUGHT="65"
CONFIRMATION_REQUIRED="false"  # Trade on single signals
MOMENTUM_THRESHOLD="1.5"       # Lower threshold
```

### Grid Trading Setup

```env
# Range-bound market exploitation
STRATEGY="grid"
GRID_LEVELS="15"
GRID_SPACING="1.5"            # Tighter grid
GRID_ORDER_SIZE="0.05"

# Set specific range (optional)
GRID_UPPER_PRICE="165"
GRID_LOWER_PRICE="135"

ENABLE_PERFORMANCE_TRACKING="true"
```

## Best Practices

### 1. Always Test First

```env
DRY_RUN="true"
SOLANA_NETWORK="devnet"
```

### 2. Start Small

```env
TRADE_AMOUNT="0.01"
GRID_ORDER_SIZE="0.01"
```

### 3. Use Risk Management

```env
ENABLE_RISK_MANAGEMENT="true"
MAX_DRAWDOWN="0.15"
MAX_DAILY_LOSS="0.10"
```

### 4. Monitor Performance

```env
ENABLE_PERFORMANCE_TRACKING="true"
LOG_LEVEL="info"
```

### 5. Adjust Based on Market Conditions

**Trending Market:**
```env
STRATEGY="momentum"
```

**Ranging Market:**
```env
STRATEGY="grid"
```

**Uncertain Market:**
```env
STRATEGY="dca"
```

## Troubleshooting

### Strategy Not Executing Trades

1. Check if dry run is enabled: `DRY_RUN="false"`
2. Verify sufficient balance for trading
3. Check if risk limits are breached
4. Review log output for errors

### Too Many Trades (Grid Strategy)

```env
GRID_SPACING="3.0"   # Increase spacing
GRID_LEVELS="8"      # Reduce levels
```

### Not Enough Trades (Momentum Strategy)

```env
CONFIRMATION_REQUIRED="false"  # Don't require multiple signals
MOMENTUM_THRESHOLD="1.0"       # Lower threshold
```

### Risk Management Stopping Trades

Check current risk metrics and adjust limits:
```env
MAX_DRAWDOWN="0.25"    # Increase if needed
MAX_DAILY_LOSS="0.15"  # Increase if needed
```

## Support

For questions or issues with advanced features:
- Check the main README.md
- Review example configurations above
- Enable debug logging: `LOG_LEVEL="debug"`

---

**Remember:** These are powerful tools, but they don't guarantee profits. Always:
- Test thoroughly
- Start small
- Monitor closely
- Understand the risks
- Never invest more than you can afford to lose
