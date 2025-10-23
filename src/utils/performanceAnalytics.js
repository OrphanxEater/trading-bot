const BigNumber = require('bignumber.js');
const logger = require('./logger');

/**
 * Performance Analytics
 * Tracks and analyzes trading performance metrics
 */
class PerformanceAnalytics {
  constructor() {
    this.trades = [];
    this.startingBalance = 0;
    this.startTime = Date.now();
  }

  /**
   * Initialize with starting balance
   */
  initialize(startingBalance) {
    this.startingBalance = startingBalance;
    this.startTime = Date.now();
    logger.info('Performance analytics initialized', { startingBalance });
  }

  /**
   * Record a trade
   */
  recordTrade(trade) {
    const tradeRecord = {
      ...trade,
      timestamp: Date.now(),
      profit: trade.profit || 0,
      profitPercent: trade.profitPercent || 0,
    };

    this.trades.push(tradeRecord);
  }

  /**
   * Calculate total profit/loss
   */
  calculateTotalPnL() {
    return this.trades.reduce((total, trade) => total + (trade.profit || 0), 0);
  }

  /**
   * Calculate win rate
   */
  calculateWinRate() {
    if (this.trades.length === 0) return 0;

    const wins = this.trades.filter(t => (t.profit || 0) > 0).length;
    return (wins / this.trades.length) * 100;
  }

  /**
   * Calculate average win and loss
   */
  calculateAvgWinLoss() {
    const wins = this.trades.filter(t => (t.profit || 0) > 0);
    const losses = this.trades.filter(t => (t.profit || 0) < 0);

    const avgWin = wins.length > 0
      ? wins.reduce((sum, t) => sum + t.profit, 0) / wins.length
      : 0;

    const avgLoss = losses.length > 0
      ? losses.reduce((sum, t) => sum + Math.abs(t.profit), 0) / losses.length
      : 0;

    return { avgWin, avgLoss };
  }

  /**
   * Calculate profit factor
   * (Gross profit / Gross loss)
   */
  calculateProfitFactor() {
    const wins = this.trades.filter(t => (t.profit || 0) > 0);
    const losses = this.trades.filter(t => (t.profit || 0) < 0);

    const grossProfit = wins.reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0));

    if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;

    return grossProfit / grossLoss;
  }

  /**
   * Calculate Sharpe Ratio
   * Risk-adjusted return metric
   */
  calculateSharpeRatio(riskFreeRate = 0) {
    if (this.trades.length < 2) return 0;

    const returns = this.trades.map(t => t.profitPercent || 0);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    // Calculate standard deviation
    const squaredDiffs = returns.map(r => Math.pow(r - avgReturn, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualized Sharpe (assuming daily returns)
    const sharpe = ((avgReturn - riskFreeRate) / stdDev) * Math.sqrt(252);

    return sharpe;
  }

  /**
   * Calculate Sortino Ratio
   * Like Sharpe but only considers downside volatility
   */
  calculateSortinoRatio(targetReturn = 0) {
    if (this.trades.length < 2) return 0;

    const returns = this.trades.map(t => t.profitPercent || 0);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    // Only consider negative returns for downside deviation
    const negativeReturns = returns.filter(r => r < targetReturn);
    if (negativeReturns.length === 0) return Infinity;

    const squaredDiffs = negativeReturns.map(r => Math.pow(r - targetReturn, 2));
    const downsideVariance = squaredDiffs.reduce((a, b) => a + b, 0) / negativeReturns.length;
    const downsideDev = Math.sqrt(downsideVariance);

    if (downsideDev === 0) return 0;

    // Annualized Sortino
    const sortino = ((avgReturn - targetReturn) / downsideDev) * Math.sqrt(252);

    return sortino;
  }

  /**
   * Calculate maximum drawdown
   */
  calculateMaxDrawdown() {
    if (this.trades.length === 0) return 0;

    let peak = this.startingBalance;
    let maxDrawdown = 0;
    let runningBalance = this.startingBalance;

    this.trades.forEach(trade => {
      runningBalance += trade.profit || 0;

      if (runningBalance > peak) {
        peak = runningBalance;
      }

      const drawdown = (peak - runningBalance) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    });

    return maxDrawdown * 100; // Return as percentage
  }

  /**
   * Calculate expectancy
   * Average amount you can expect to win/lose per trade
   */
  calculateExpectancy() {
    const winRate = this.calculateWinRate() / 100;
    const { avgWin, avgLoss } = this.calculateAvgWinLoss();

    return (winRate * avgWin) - ((1 - winRate) * avgLoss);
  }

  /**
   * Get comprehensive performance report
   */
  getPerformanceReport(currentBalance) {
    const totalPnL = this.calculateTotalPnL();
    const winRate = this.calculateWinRate();
    const { avgWin, avgLoss } = this.calculateAvgWinLoss();
    const profitFactor = this.calculateProfitFactor();
    const sharpeRatio = this.calculateSharpeRatio();
    const sortinoRatio = this.calculateSortinoRatio();
    const maxDrawdown = this.calculateMaxDrawdown();
    const expectancy = this.calculateExpectancy();

    const totalReturn = this.startingBalance > 0
      ? ((currentBalance - this.startingBalance) / this.startingBalance) * 100
      : 0;

    const tradingDays = (Date.now() - this.startTime) / (1000 * 60 * 60 * 24);

    return {
      summary: {
        totalTrades: this.trades.length,
        winningTrades: this.trades.filter(t => (t.profit || 0) > 0).length,
        losingTrades: this.trades.filter(t => (t.profit || 0) < 0).length,
        winRate: winRate.toFixed(2) + '%',
      },
      profitability: {
        totalPnL: totalPnL.toFixed(4),
        totalReturn: totalReturn.toFixed(2) + '%',
        avgWin: avgWin.toFixed(4),
        avgLoss: avgLoss.toFixed(4),
        profitFactor: profitFactor.toFixed(2),
        expectancy: expectancy.toFixed(4),
      },
      riskMetrics: {
        sharpeRatio: sharpeRatio.toFixed(2),
        sortinoRatio: sortinoRatio.toFixed(2),
        maxDrawdown: maxDrawdown.toFixed(2) + '%',
      },
      account: {
        startingBalance: this.startingBalance.toFixed(4),
        currentBalance: currentBalance.toFixed(4),
        tradingDays: tradingDays.toFixed(1),
      }
    };
  }

  /**
   * Display performance report
   */
  displayReport(currentBalance) {
    const report = this.getPerformanceReport(currentBalance);

    logger.info('='.repeat(60));
    logger.info('PERFORMANCE REPORT');
    logger.info('='.repeat(60));
    logger.info('Summary:', report.summary);
    logger.info('Profitability:', report.profitability);
    logger.info('Risk Metrics:', report.riskMetrics);
    logger.info('Account:', report.account);
    logger.info('='.repeat(60));

    return report;
  }

  /**
   * Get recent trades
   */
  getRecentTrades(count = 10) {
    return this.trades.slice(-count);
  }

  /**
   * Get trade history
   */
  getTradeHistory() {
    return this.trades;
  }

  /**
   * Export trades to CSV format
   */
  exportToCSV() {
    if (this.trades.length === 0) return '';

    const headers = ['Timestamp', 'Action', 'Amount', 'Price', 'Profit', 'Profit %'];
    const rows = this.trades.map(t => [
      new Date(t.timestamp).toISOString(),
      t.action || 'TRADE',
      t.amount || '',
      t.price || '',
      t.profit || 0,
      t.profitPercent || 0
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    return csv;
  }
}

module.exports = PerformanceAnalytics;
