const logger = require('../utils/logger');

/**
 * BACKTESTING ENGINE
 *
 * Tests trading strategies against historical data to:
 * - Validate strategy profitability
 * - Optimize parameters
 * - Calculate risk metrics
 * - Identify best market conditions for each strategy
 */

class Backtester {
  constructor(config) {
    this.config = config;

    // Performance metrics
    this.metrics = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalProfit: 0,
      totalLoss: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      winRate: 0,
      averageWin: 0,
      averageLoss: 0,
      profitFactor: 0,
      expectancy: 0
    };

    // Trade history
    this.trades = [];
    this.equityCurve = [];

    logger.info('Backtester initialized');
  }

  /**
   * Run backtest on historical data
   *
   * @param {Array} historicalData - OHLCV candles
   * @param {Object} strategy - Strategy to test
   * @param {Object} params - Strategy parameters
   */
  async runBacktest(historicalData, strategy, params = {}) {
    try {
      logger.info('Starting backtest', {
        candles: historicalData.length,
        strategy: strategy.name,
        timeframe: `${historicalData[0].timestamp} to ${historicalData[historicalData.length - 1].timestamp}`
      });

      // Reset metrics
      this.resetMetrics();

      let position = null;
      let capital = params.initialCapital || 10000;
      let peakCapital = capital;

      // Simulate trading through historical data
      for (let i = 50; i < historicalData.length; i++) {
        const currentCandle = historicalData[i];
        const historicalWindow = historicalData.slice(Math.max(0, i - 50), i);

        // Get strategy signal
        const signal = await strategy.analyze(currentCandle, historicalWindow, params);

        // Execute trades based on signals
        if (!position && signal.action === 'BUY') {
          // Enter long position
          position = this.openPosition({
            type: 'LONG',
            entryPrice: currentCandle.close,
            entryTime: currentCandle.timestamp,
            size: (capital * (params.positionSize || 0.95)) / currentCandle.close,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            reason: signal.reason
          });

          logger.debug('Position opened', {
            type: 'LONG',
            price: currentCandle.close,
            time: new Date(currentCandle.timestamp).toISOString()
          });

        } else if (!position && signal.action === 'SHORT') {
          // Enter short position
          position = this.openPosition({
            type: 'SHORT',
            entryPrice: currentCandle.close,
            entryTime: currentCandle.timestamp,
            size: (capital * (params.positionSize || 0.95)) / currentCandle.close,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            reason: signal.reason
          });

          logger.debug('Position opened', {
            type: 'SHORT',
            price: currentCandle.close,
            time: new Date(currentCandle.timestamp).toISOString()
          });

        } else if (position) {
          // Check if position should be closed
          const shouldClose = this.checkExitConditions(position, currentCandle, signal);

          if (shouldClose.exit) {
            const closedTrade = this.closePosition(position, currentCandle.close, currentCandle.timestamp, shouldClose.reason);

            // Update capital
            capital += closedTrade.pnl;

            // Track drawdown
            if (capital > peakCapital) {
              peakCapital = capital;
            }
            const drawdown = (peakCapital - capital) / peakCapital;
            if (drawdown > this.metrics.maxDrawdown) {
              this.metrics.maxDrawdown = drawdown;
            }

            // Record equity curve
            this.equityCurve.push({
              timestamp: currentCandle.timestamp,
              capital: capital,
              drawdown: drawdown
            });

            position = null;

            logger.debug('Position closed', {
              pnl: closedTrade.pnl.toFixed(2),
              pnlPercent: closedTrade.pnlPercent.toFixed(2),
              capital: capital.toFixed(2),
              reason: shouldClose.reason
            });
          }
        }
      }

      // Close any remaining open position
      if (position) {
        const lastCandle = historicalData[historicalData.length - 1];
        this.closePosition(position, lastCandle.close, lastCandle.timestamp, 'END_OF_BACKTEST');
      }

      // Calculate final metrics
      this.calculateMetrics(params.initialCapital || 10000, capital);

      const results = {
        metrics: this.metrics,
        trades: this.trades,
        equityCurve: this.equityCurve,
        finalCapital: capital,
        totalReturn: ((capital - (params.initialCapital || 10000)) / (params.initialCapital || 10000)) * 100,
        strategyName: strategy.name,
        parameters: params
      };

      logger.success('Backtest complete', {
        trades: this.metrics.totalTrades,
        winRate: `${this.metrics.winRate.toFixed(1)}%`,
        totalReturn: `${results.totalReturn.toFixed(2)}%`,
        sharpe: this.metrics.sharpeRatio.toFixed(2),
        maxDrawdown: `${(this.metrics.maxDrawdown * 100).toFixed(2)}%`
      });

      return results;

    } catch (error) {
      logger.error('Backtest error:', error);
      throw error;
    }
  }

  /**
   * Open a new position
   */
  openPosition(params) {
    return {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...params,
      status: 'OPEN'
    };
  }

  /**
   * Check if position should be closed
   */
  checkExitConditions(position, currentCandle, signal) {
    // Check stop loss
    if (position.type === 'LONG') {
      if (position.stopLoss && currentCandle.low <= position.stopLoss) {
        return { exit: true, reason: 'STOP_LOSS' };
      }
      if (position.takeProfit && currentCandle.high >= position.takeProfit) {
        return { exit: true, reason: 'TAKE_PROFIT' };
      }
    } else if (position.type === 'SHORT') {
      if (position.stopLoss && currentCandle.high >= position.stopLoss) {
        return { exit: true, reason: 'STOP_LOSS' };
      }
      if (position.takeProfit && currentCandle.low <= position.takeProfit) {
        return { exit: true, reason: 'TAKE_PROFIT' };
      }
    }

    // Check strategy exit signal
    if (signal.action === 'CLOSE') {
      return { exit: true, reason: signal.reason || 'STRATEGY_EXIT' };
    }

    return { exit: false };
  }

  /**
   * Close a position and record trade
   */
  closePosition(position, exitPrice, exitTime, reason) {
    let pnl, pnlPercent;

    if (position.type === 'LONG') {
      pnl = (exitPrice - position.entryPrice) * position.size;
      pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
    } else {
      pnl = (position.entryPrice - exitPrice) * position.size;
      pnlPercent = ((position.entryPrice - exitPrice) / position.entryPrice) * 100;
    }

    const trade = {
      ...position,
      exitPrice,
      exitTime,
      pnl,
      pnlPercent,
      holdTime: exitTime - position.entryTime,
      exitReason: reason,
      status: 'CLOSED'
    };

    this.trades.push(trade);
    this.metrics.totalTrades++;

    if (pnl > 0) {
      this.metrics.winningTrades++;
      this.metrics.totalProfit += pnl;
    } else {
      this.metrics.losingTrades++;
      this.metrics.totalLoss += Math.abs(pnl);
    }

    return trade;
  }

  /**
   * Calculate performance metrics
   */
  calculateMetrics(initialCapital, finalCapital) {
    // Win rate
    this.metrics.winRate = this.metrics.totalTrades > 0
      ? (this.metrics.winningTrades / this.metrics.totalTrades) * 100
      : 0;

    // Average win/loss
    this.metrics.averageWin = this.metrics.winningTrades > 0
      ? this.metrics.totalProfit / this.metrics.winningTrades
      : 0;

    this.metrics.averageLoss = this.metrics.losingTrades > 0
      ? this.metrics.totalLoss / this.metrics.losingTrades
      : 0;

    // Profit factor
    this.metrics.profitFactor = this.metrics.totalLoss > 0
      ? this.metrics.totalProfit / this.metrics.totalLoss
      : this.metrics.totalProfit > 0 ? Infinity : 0;

    // Expectancy
    this.metrics.expectancy = this.metrics.totalTrades > 0
      ? (this.metrics.totalProfit - this.metrics.totalLoss) / this.metrics.totalTrades
      : 0;

    // Sharpe ratio (simplified)
    const returns = this.equityCurve.map((point, i) => {
      if (i === 0) return 0;
      return (point.capital - this.equityCurve[i - 1].capital) / this.equityCurve[i - 1].capital;
    });

    if (returns.length > 1) {
      const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      this.metrics.sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
    }
  }

  /**
   * Reset metrics for new backtest
   */
  resetMetrics() {
    this.metrics = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalProfit: 0,
      totalLoss: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      winRate: 0,
      averageWin: 0,
      averageLoss: 0,
      profitFactor: 0,
      expectancy: 0
    };
    this.trades = [];
    this.equityCurve = [];
  }

  /**
   * Optimize strategy parameters
   * Tests multiple parameter combinations to find optimal settings
   */
  async optimizeParameters(historicalData, strategy, parameterSpace) {
    logger.info('Starting parameter optimization', {
      parameters: Object.keys(parameterSpace),
      combinations: this.countCombinations(parameterSpace)
    });

    const results = [];

    // Generate all parameter combinations
    const combinations = this.generateCombinations(parameterSpace);

    for (const params of combinations) {
      const result = await this.runBacktest(historicalData, strategy, params);
      results.push({
        params,
        metrics: result.metrics,
        score: this.calculateOptimizationScore(result.metrics)
      });
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    logger.success('Optimization complete', {
      tested: results.length,
      bestScore: results[0].score.toFixed(2),
      bestParams: results[0].params
    });

    return results;
  }

  /**
   * Calculate optimization score (higher is better)
   */
  calculateOptimizationScore(metrics) {
    // Weighted combination of metrics
    return (
      metrics.totalProfit * 0.3 +
      metrics.winRate * 0.2 +
      metrics.profitFactor * 100 * 0.2 +
      metrics.sharpeRatio * 50 * 0.2 +
      (1 - metrics.maxDrawdown) * 100 * 0.1
    );
  }

  /**
   * Generate all combinations of parameters
   */
  generateCombinations(space) {
    const keys = Object.keys(space);
    if (keys.length === 0) return [{}];

    const [firstKey, ...restKeys] = keys;
    const firstValues = space[firstKey];
    const restSpace = {};
    restKeys.forEach(key => restSpace[key] = space[key]);

    const restCombinations = this.generateCombinations(restSpace);
    const combinations = [];

    for (const value of firstValues) {
      for (const restCombo of restCombinations) {
        combinations.push({ [firstKey]: value, ...restCombo });
      }
    }

    return combinations;
  }

  /**
   * Count total combinations
   */
  countCombinations(space) {
    return Object.values(space).reduce((total, values) => total * values.length, 1);
  }

  /**
   * Generate performance report
   */
  generateReport(results) {
    const report = {
      summary: {
        totalReturn: results.totalReturn,
        finalCapital: results.finalCapital,
        totalTrades: results.metrics.totalTrades,
        winRate: results.metrics.winRate,
        profitFactor: results.metrics.profitFactor,
        sharpeRatio: results.metrics.sharpeRatio,
        maxDrawdown: results.metrics.maxDrawdown * 100
      },
      trades: {
        winning: results.metrics.winningTrades,
        losing: results.metrics.losingTrades,
        averageWin: results.metrics.averageWin,
        averageLoss: results.metrics.averageLoss,
        expectancy: results.metrics.expectancy
      },
      bestTrades: results.trades
        .sort((a, b) => b.pnl - a.pnl)
        .slice(0, 5)
        .map(t => ({
          type: t.type,
          entry: t.entryPrice,
          exit: t.exitPrice,
          pnl: t.pnl,
          pnlPercent: t.pnlPercent,
          duration: this.formatDuration(t.holdTime)
        })),
      worstTrades: results.trades
        .sort((a, b) => a.pnl - b.pnl)
        .slice(0, 5)
        .map(t => ({
          type: t.type,
          entry: t.entryPrice,
          exit: t.exitPrice,
          pnl: t.pnl,
          pnlPercent: t.pnlPercent,
          duration: this.formatDuration(t.holdTime)
        }))
    };

    return report;
  }

  formatDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }
}

module.exports = Backtester;
