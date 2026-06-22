#!/usr/bin/env node

const Backtester = require('../src/analysis/backtester');
const TradePrediction = require('../src/analysis/tradePrediction');
const logger = require('../src/utils/logger');
const axios = require('axios');

/**
 * SOLANA MARKET ANALYSIS SCRIPT
 *
 * Fetches historical SOL data, runs backtests, and predicts upcoming trades
 */

class SolanaAnalyzer {
  constructor() {
    this.backtester = new Backtester({});
    this.predictor = new TradePrediction({ minPredictionConfidence: 0.65 });
  }

  /**
   * Fetch historical SOL/USDT data from Binance
   */
  async fetchHistoricalData(symbol = 'SOLUSDT', interval = '1h', limit = 500) {
    try {
      logger.info(`Fetching ${limit} ${interval} candles for ${symbol} from Binance`);

      const url = `https://api.binance.com/api/v3/klines`;
      const params = {
        symbol: symbol,
        interval: interval,
        limit: limit
      };

      const response = await axios.get(url, { params });

      // Convert Binance format to our format
      const candles = response.data.map(candle => ({
        timestamp: candle[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5])
      }));

      logger.success(`Fetched ${candles.length} candles`, {
        period: `${new Date(candles[0].timestamp).toISOString()} to ${new Date(candles[candles.length - 1].timestamp).toISOString()}`,
        priceRange: `$${candles.reduce((min, c) => Math.min(min, c.low), Infinity).toFixed(2)} - $${candles.reduce((max, c) => Math.max(max, c.high), 0).toFixed(2)}`
      });

      return candles;

    } catch (error) {
      logger.error('Error fetching historical data:', error.message);
      throw error;
    }
  }

  /**
   * Run backtest on last week's data
   */
  async backtestLastWeek(historicalData) {
    logger.info('═══════════════════════════════════════════════');
    logger.info('BACKTESTING LAST WEEK\'S SOLANA PRICE ACTION');
    logger.info('═══════════════════════════════════════════════\n');

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
    logger.info('\n═══════════════════════════════════════════════');
    logger.info('PREDICTING SOLANA TRADES FOR UPCOMING WEEK');
    logger.info('═══════════════════════════════════════════════\n');

    const predictions = await this.predictor.predictTrades(historicalData, {
      timeframe: '1h',
      maxPredictions: 5
    });

    this.printTradePredictions(predictions);

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

    if (report.worstTrades.length > 0) {
      console.log('📉 WORST TRADES\n');
      report.worstTrades.forEach((trade, i) => {
        console.log(`${i + 1}. ${trade.type} | Entry: $${trade.entry.toFixed(2)} → Exit: $${trade.exit.toFixed(2)} | P&L: $${trade.pnl.toFixed(2)} (${trade.pnlPercent.toFixed(2)}%)`);
      });
      console.log('\n');
    }
  }

  /**
   * Print trade predictions
   */
  printTradePredictions(predictions) {
    if (predictions.length === 0) {
      console.log('⚠️  No high-confidence trade setups identified\n');
      return;
    }

    console.log(`🎯 ${predictions.length} HIGH-PROBABILITY TRADE SETUPS IDENTIFIED\n`);

    predictions.forEach((setup, i) => {
      const rr = ((setup.takeProfit - setup.entry) / (setup.entry - setup.stopLoss)).toFixed(1);

      console.log(`─────────────────────────────────────────────`);
      console.log(`TRADE ${i + 1}: ${setup.type} (${setup.direction})`);
      console.log(`─────────────────────────────────────────────`);
      console.log(`📍 Entry:         $${setup.entry.toFixed(2)}`);
      console.log(`🛑 Stop Loss:     $${setup.stopLoss.toFixed(2)} (${((setup.stopLoss - setup.entry) / setup.entry * 100).toFixed(2)}%)`);
      console.log(`🎯 Take Profit:   $${setup.takeProfit.toFixed(2)} (${((setup.takeProfit - setup.entry) / setup.entry * 100).toFixed(2)}%)`);
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

  /**
   * Get current SOL price
   */
  async getCurrentPrice(symbol = 'SOLUSDT') {
    try {
      const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      return parseFloat(response.data.price);
    } catch (error) {
      logger.error('Error fetching current price:', error.message);
      return null;
    }
  }
}

// Main execution
async function main() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║         SOLANA TRADING BOT - MARKET ANALYSIS SYSTEM           ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const analyzer = new SolanaAnalyzer();

  try {
    // Get current price
    const currentPrice = await analyzer.getCurrentPrice();
    if (currentPrice) {
      console.log(`📊 Current SOL/USDT Price: $${currentPrice.toFixed(2)}\n`);
    }

    // Fetch last week's data (168 hours)
    const historicalData = await analyzer.fetchHistoricalData('SOLUSDT', '1h', 168);

    // Run backtest on last week
    const backtestResults = await analyzer.backtestLastWeek(historicalData);

    // Predict upcoming trades
    const predictions = await analyzer.predictUpcomingTrades(historicalData);

    console.log('═══════════════════════════════════════════════');
    console.log('ANALYSIS COMPLETE');
    console.log('═══════════════════════════════════════════════\n');

    console.log('💡 RECOMMENDATIONS:\n');

    if (backtestResults.totalReturn > 0) {
      console.log('✅ Strategy showed positive returns in backtest');
      console.log(`   → ${backtestResults.totalReturn.toFixed(2)}% profit over last week`);
    } else {
      console.log('⚠️  Strategy showed negative returns in backtest');
      console.log('   → Consider adjusting parameters or waiting for better conditions');
    }

    if (predictions.length > 0) {
      const topSetup = predictions[0];
      console.log(`\n🎯 HIGHEST CONFIDENCE SETUP: ${topSetup.type}`);
      console.log(`   Direction: ${topSetup.direction}`);
      console.log(`   Entry: $${topSetup.entry.toFixed(2)}`);
      console.log(`   Confidence: ${(topSetup.confidence * 100).toFixed(1)}%`);
    }

    console.log('\n');

  } catch (error) {
    logger.error('Analysis failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = SolanaAnalyzer;
