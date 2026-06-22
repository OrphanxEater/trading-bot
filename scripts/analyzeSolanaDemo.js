#!/usr/bin/env node

const Backtester = require('../src/analysis/backtester');
const TradePrediction = require('../src/analysis/tradePrediction');
const logger = require('../src/utils/logger');

/**
 * SOLANA MARKET ANALYSIS DEMO
 *
 * Demonstrates backtesting and trade prediction using simulated SOL data
 * (Use this when live API access is unavailable)
 */

class SolanaAnalyzerDemo {
  constructor() {
    this.backtester = new Backtester({});
    this.predictor = new TradePrediction({ minPredictionConfidence: 0.65 });
  }

  /**
   * Generate realistic SOL price data
   * Simulates last week's SOL/USDT price action
   */
  generateRealisticSolData() {
    const data = [];
    const startPrice = 145.50; // Realistic SOL price
    const now = Date.now();
    const hourMs = 3600000;

    let price = startPrice;
    let trend = 1; // 1 = up, -1 = down

    // Generate 168 hours (1 week) of data
    for (let i = 168; i >= 0; i--) {
      const timestamp = now - (i * hourMs);

      // Add some realistic volatility
      const volatility = 0.015; // 1.5% per hour volatility
      const randomMove = (Math.random() - 0.5) * 2 * volatility * price;
      const trendMove = trend * 0.003 * price; // 0.3% trend
      price += randomMove + trendMove;

      // Random trend changes
      if (Math.random() < 0.05) {
        trend *= -1;
      }

      // Create realistic OHLCV
      const high = price * (1 + Math.random() * 0.008);
      const low = price * (1 - Math.random() * 0.008);
      const open = low + Math.random() * (high - low);
      const close = low + Math.random() * (high - low);
      const volume = 5000000 + Math.random() * 10000000;

      data.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume
      });
    }

    return data;
  }

  /**
   * Run backtest on last week's data
   */
  async backtestLastWeek(historicalData) {
    console.log('═══════════════════════════════════════════════');
    console.log('BACKTESTING LAST WEEK\'S SOLANA PRICE ACTION');
    console.log('═══════════════════════════════════════════════\n');

    // Define a simple scalping strategy for testing
    const scalpStrategy = {
      name: 'Scalp Strategy',
      analyze: async (candle, history, params) => {
        if (history.length < 20) return { action: 'HOLD' };

        const closes = history.map(h => h.close);
        const rsi = this.calculateSimpleRSI(closes, 14);
        const lastRSI = rsi[rsi.length - 1];
        const currentPrice = candle.close;

        // Simple mean reversion scalp
        if (lastRSI < 30) {
          return {
            action: 'BUY',
            stopLoss: currentPrice * 0.99,
            takeProfit: currentPrice * 1.02,
            reason: `RSI oversold at ${lastRSI.toFixed(1)}`
          };
        } else if (lastRSI > 70) {
          return {
            action: 'SHORT',
            stopLoss: currentPrice * 1.01,
            takeProfit: currentPrice * 0.98,
            reason: `RSI overbought at ${lastRSI.toFixed(1)}`
          };
        }

        // Close signals
        if (lastRSI > 45 && lastRSI < 55) {
          return { action: 'CLOSE', reason: 'RSI neutral zone' };
        }

        return { action: 'HOLD' };
      }
    };

    const results = await this.backtester.runBacktest(historicalData, scalpStrategy, {
      initialCapital: 10000,
      positionSize: 0.95
    });

    this.printBacktestResults(results);

    return results;
  }

  /**
   * Predict trades for upcoming week
   */
  async predictUpcomingTrades(historicalData) {
    console.log('\n═══════════════════════════════════════════════');
    console.log('PREDICTING SOLANA TRADES FOR UPCOMING WEEK');
    console.log('═══════════════════════════════════════════════\n');

    const predictions = await this.predictor.predictTrades(historicalData, {
      timeframe: '1h',
      maxPredictions: 5
    });

    this.printTradePredictions(predictions, historicalData);

    return predictions;
  }

  /**
   * Print backtest results in readable format
   */
  printBacktestResults(results) {
    const report = this.backtester.generateReport(results);

    console.log('\n📊 BACKTEST PERFORMANCE SUMMARY\n');
    console.log('─────────────────────────────────────────────');
    console.log(`Total Return:     ${results.totalReturn >= 0 ? '+' : ''}${results.totalReturn.toFixed(2)}%`);
    console.log(`Final Capital:    $${results.finalCapital.toFixed(2)}`);
    console.log(`Total Trades:     ${report.summary.totalTrades}`);
    console.log(`Win Rate:         ${report.summary.winRate.toFixed(1)}%`);
    console.log(`Profit Factor:    ${report.summary.profitFactor.toFixed(2)}`);
    console.log(`Sharpe Ratio:     ${report.summary.sharpeRatio.toFixed(2)}`);
    console.log(`Max Drawdown:     ${report.summary.maxDrawdown.toFixed(2)}%`);
    console.log('─────────────────────────────────────────────\n');

    console.log('💰 TRADE STATISTICS\n');
    console.log(`Winning Trades:   ${report.trades.winning}`);
    console.log(`Losing Trades:    ${report.trades.losing}`);
    console.log(`Average Win:      $${report.trades.averageWin.toFixed(2)}`);
    console.log(`Average Loss:     $${Math.abs(report.trades.averageLoss).toFixed(2)}`);
    console.log(`Expectancy:       $${report.trades.expectancy.toFixed(2)}`);
    console.log('\n');

    if (report.bestTrades.length > 0) {
      console.log('🏆 BEST TRADES\n');
      report.bestTrades.forEach((trade, i) => {
        console.log(`${i + 1}. ${trade.type} | Entry: $${trade.entry.toFixed(2)} → Exit: $${trade.exit.toFixed(2)} | P&L: +$${trade.pnl.toFixed(2)} (+${trade.pnlPercent.toFixed(2)}%)`);
      });
      console.log('\n');
    }
  }

  /**
   * Print trade predictions
   */
  printTradePredictions(predictions, historicalData) {
    const currentPrice = historicalData[historicalData.length - 1].close;

    if (predictions.length === 0) {
      console.log('⚠️  No high-confidence trade setups identified\n');
      return;
    }

    console.log(`🎯 ${predictions.length} HIGH-PROBABILITY TRADE SETUPS IDENTIFIED\n`);
    console.log(`Current SOL Price: $${currentPrice.toFixed(2)}\n`);

    predictions.forEach((setup, i) => {
      const riskPercent = Math.abs((setup.stopLoss - setup.entry) / setup.entry * 100);
      const rewardPercent = Math.abs((setup.takeProfit - setup.entry) / setup.entry * 100);
      const rr = (rewardPercent / riskPercent).toFixed(1);

      console.log(`─────────────────────────────────────────────`);
      console.log(`TRADE ${i + 1}: ${setup.type} (${setup.direction})`);
      console.log(`─────────────────────────────────────────────`);
      console.log(`📍 Entry:         $${setup.entry.toFixed(2)}`);
      console.log(`🛑 Stop Loss:     $${setup.stopLoss.toFixed(2)} (-${riskPercent.toFixed(2)}%)`);
      console.log(`🎯 Take Profit:   $${setup.takeProfit.toFixed(2)} (+${rewardPercent.toFixed(2)}%)`);
      console.log(`⚖️  Risk/Reward:   1:${rr}`);
      console.log(`✅ Confidence:    ${(setup.confidence * 100).toFixed(1)}%`);
      console.log(`⏱️  Timeframe:     ${setup.timeframe}`);
      console.log(`📝 Reasoning:     ${setup.reasoning}`);
      console.log('\n');
    });

    // Summary
    const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
    const longSetups = predictions.filter(p => p.direction === 'LONG').length;
    const shortSetups = predictions.filter(p => p.direction === 'SHORT').length;

    console.log('📈 MARKET BIAS');
    console.log(`Long Setups:      ${longSetups}`);
    console.log(`Short Setups:     ${shortSetups}`);
    console.log(`Avg Confidence:   ${(avgConfidence * 100).toFixed(1)}%`);
    console.log(`Overall Bias:     ${longSetups > shortSetups ? '🟢 BULLISH' : shortSetups > longSetups ? '🔴 BEARISH' : '⚪ NEUTRAL'}`);
    console.log('\n');
  }

  /**
   * Calculate simple RSI
   */
  calculateSimpleRSI(closes, period = 14) {
    const rsi = [];
    const gains = [];
    const losses = [];

    for (let i = 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    for (let i = period; i < gains.length; i++) {
      const avgGain = gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period;

      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
      }
    }

    return rsi;
  }
}

// Main execution
async function main() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║         SOLANA TRADING BOT - MARKET ANALYSIS SYSTEM           ║');
  console.log('║                     (Demo with Simulated Data)                ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const analyzer = new SolanaAnalyzerDemo();

  try {
    // Generate realistic SOL data
    console.log('📊 Generating realistic SOL/USDT price data (Last 7 days)\n');
    const historicalData = analyzer.generateRealisticSolData();

    const weekStart = historicalData[0].close;
    const weekEnd = historicalData[historicalData.length - 1].close;
    const weekChange = ((weekEnd - weekStart) / weekStart) * 100;

    console.log(`Period: ${new Date(historicalData[0].timestamp).toLocaleDateString()} → ${new Date(historicalData[historicalData.length - 1].timestamp).toLocaleDateString()}`);
    console.log(`Price Range: $${Math.min(...historicalData.map(d => d.low)).toFixed(2)} - $${Math.max(...historicalData.map(d => d.high)).toFixed(2)}`);
    console.log(`Week Performance: ${weekChange >= 0 ? '+' : ''}${weekChange.toFixed(2)}%\n`);

    // Run backtest on last week
    const backtestResults = await analyzer.backtestLastWeek(historicalData);

    // Predict upcoming trades
    const predictions = await analyzer.predictUpcomingTrades(historicalData);

    console.log('═══════════════════════════════════════════════');
    console.log('ANALYSIS COMPLETE');
    console.log('═══════════════════════════════════════════════\n');

    console.log('💡 ACTIONABLE INSIGHTS:\n');

    if (backtestResults.totalReturn > 0) {
      console.log('✅ Strategy Performance: POSITIVE');
      console.log(`   → ${backtestResults.totalReturn.toFixed(2)}% profit over last week`);
      console.log(`   → Win rate: ${backtestResults.metrics.winRate.toFixed(1)}%`);
      console.log(`   → Sharpe ratio: ${backtestResults.metrics.sharpeRatio.toFixed(2)}`);
    } else {
      console.log('⚠️  Strategy Performance: NEGATIVE');
      console.log('   → Market conditions unfavorable for mean-reversion scalps');
      console.log('   → Consider trend-following or wait for ranging market');
    }

    if (predictions.length > 0) {
      const topSetup = predictions[0];
      console.log(`\n🎯 PRIORITY TRADE SETUP: ${topSetup.type}`);
      console.log(`   Direction: ${topSetup.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT'}`);
      console.log(`   Entry: $${topSetup.entry.toFixed(2)}`);
      console.log(`   Stop: $${topSetup.stopLoss.toFixed(2)} | Target: $${topSetup.takeProfit.toFixed(2)}`);
      console.log(`   Confidence: ${(topSetup.confidence * 100).toFixed(1)}%`);
      console.log(`   Risk/Reward: 1:${(Math.abs(topSetup.takeProfit - topSetup.entry) / Math.abs(topSetup.entry - topSetup.stopLoss)).toFixed(1)}`);
    }

    console.log('\n📋 NEXT STEPS:\n');
    console.log('1. Review the 5 predicted trade setups above');
    console.log('2. Wait for price to reach entry levels');
    console.log('3. Set stop-loss and take-profit orders as specified');
    console.log('4. Monitor positions according to timeframe');
    console.log('5. Adjust strategy if market conditions change');

    console.log('\n⚡ AUTOMATED EXECUTION:');
    console.log('   To run these trades automatically, configure the bot with:');
    console.log('   → Auto-trading enabled');
    console.log('   → Position size limits');
    console.log('   → Maximum concurrent trades');
    console.log('   → Risk per trade percentage\n');

  } catch (error) {
    logger.error('Analysis failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = SolanaAnalyzerDemo;
