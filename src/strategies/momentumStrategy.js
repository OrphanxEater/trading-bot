const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');
const TechnicalIndicators = require('../utils/technicalIndicators');

/**
 * Momentum Strategy
 * Buys when momentum is strong and confirmed by multiple indicators
 * Uses RSI, moving averages, and volume confirmation
 */
class MomentumStrategy {
  constructor(tradingEngine, priceMonitor, config) {
    this.tradingEngine = tradingEngine;
    this.priceMonitor = priceMonitor;
    this.config = config;
    this.isActive = false;
    this.position = null;
    this.priceHistory = [];
    this.maxHistoryLength = 100;

    // Strategy parameters
    this.rsiPeriod = parseInt(config.rsiPeriod || 14);
    this.rsiOversold = parseFloat(config.rsiOversold || 30);
    this.rsiOverbought = parseFloat(config.rsiOverbought || 70);
    this.momentumThreshold = parseFloat(config.momentumThreshold || 2.0); // % change
    this.confirmationRequired = config.confirmationRequired !== 'false';
    this.trailingStopPercent = parseFloat(config.trailingStopPercent || 5.0);
  }

  /**
   * Start the strategy
   */
  async start() {
    if (this.isActive) {
      logger.warn('Momentum strategy already running');
      return;
    }

    this.isActive = true;

    logger.info('Starting momentum strategy', {
      rsiPeriod: this.rsiPeriod,
      rsiOversold: this.rsiOversold,
      rsiOverbought: this.rsiOverbought,
      momentumThreshold: this.momentumThreshold + '%',
      trailingStop: this.trailingStopPercent + '%'
    });

    // Display initial balances
    await this.tradingEngine.displayBalances();

    // Listen to price updates
    this.priceMonitor.on('priceUpdate', async (data) => {
      await this.onPriceUpdate(data);
    });

    // Start price monitoring
    await this.priceMonitor.start(
      this.config.inputToken,
      this.config.outputToken,
      this.config.priceCheckInterval
    );
  }

  /**
   * Handle price update event
   */
  async onPriceUpdate(data) {
    const { price } = data;

    // Add to price history
    this.priceHistory.push(price);
    if (this.priceHistory.length > this.maxHistoryLength) {
      this.priceHistory.shift();
    }

    // Need enough data for indicators
    if (this.priceHistory.length < this.rsiPeriod + 1) {
      logger.debug('Collecting price data...', {
        collected: this.priceHistory.length,
        needed: this.rsiPeriod + 1
      });
      return;
    }

    // Calculate indicators
    const signals = this.analyzeMarket(price);

    logger.info('Market Analysis', {
      price: Helpers.formatNumber(price, 4),
      trend: signals.trend,
      rsi: signals.rsi?.toFixed(2),
      momentum: signals.momentum?.toFixed(2) + '%',
      signal: signals.overallSignal
    });

    try {
      // If no position, look for entry
      if (!this.position) {
        if (signals.overallSignal === 'BUY') {
          await this.enterPosition(price, signals);
        }
      }
      // If in position, manage it
      else {
        await this.managePosition(price, signals);
      }
    } catch (error) {
      logger.error('Error processing momentum signal', { error: error.message });
    }
  }

  /**
   * Analyze market conditions
   */
  analyzeMarket(currentPrice) {
    const signals = {};

    // Calculate RSI
    const rsi = TechnicalIndicators.calculateRSI(this.priceHistory, this.rsiPeriod);
    signals.rsi = rsi;
    signals.rsiSignal = TechnicalIndicators.getRSISignal(rsi);

    // Calculate momentum (% change over period)
    const oldPrice = this.priceHistory[this.priceHistory.length - this.rsiPeriod];
    const momentum = ((currentPrice - oldPrice) / oldPrice) * 100;
    signals.momentum = momentum;

    // Detect trend
    signals.trend = TechnicalIndicators.detectTrend(this.priceHistory);

    // Calculate moving averages
    const sma20 = TechnicalIndicators.calculateSMA(this.priceHistory, 20);
    const sma50 = TechnicalIndicators.calculateSMA(this.priceHistory, 50);
    signals.sma20 = sma20;
    signals.sma50 = sma50;

    // Generate overall signal
    signals.overallSignal = this.generateSignal(signals, currentPrice);

    return signals;
  }

  /**
   * Generate buy/sell signal based on indicators
   */
  generateSignal(signals, currentPrice) {
    const { rsi, rsiSignal, momentum, trend, sma20, sma50 } = signals;

    let buyScore = 0;
    let sellScore = 0;

    // RSI signals
    if (rsi < this.rsiOversold) {
      buyScore += 2; // Strong buy signal
    } else if (rsi < 40) {
      buyScore += 1; // Weak buy signal
    } else if (rsi > this.rsiOverbought) {
      sellScore += 2; // Strong sell signal
    } else if (rsi > 60) {
      sellScore += 1; // Weak sell signal
    }

    // Momentum signals
    if (momentum > this.momentumThreshold) {
      buyScore += 1;
    } else if (momentum < -this.momentumThreshold) {
      sellScore += 1;
    }

    // Trend signals
    if (trend === 'UPTREND') {
      buyScore += 1;
    } else if (trend === 'DOWNTREND') {
      sellScore += 1;
    }

    // Moving average signals
    if (sma20 && sma50) {
      if (currentPrice > sma20 && sma20 > sma50) {
        buyScore += 1; // Golden cross territory
      } else if (currentPrice < sma20 && sma20 < sma50) {
        sellScore += 1; // Death cross territory
      }
    }

    // Decision logic
    if (this.confirmationRequired) {
      // Need multiple confirmations
      if (buyScore >= 3) return 'BUY';
      if (sellScore >= 3) return 'SELL';
    } else {
      // More aggressive
      if (buyScore >= 2) return 'BUY';
      if (sellScore >= 2) return 'SELL';
    }

    return 'HOLD';
  }

  /**
   * Enter a position
   */
  async enterPosition(price, signals) {
    logger.success('MOMENTUM BUY SIGNAL DETECTED', {
      price: Helpers.formatNumber(price, 4),
      rsi: signals.rsi?.toFixed(2),
      momentum: signals.momentum?.toFixed(2) + '%',
      trend: signals.trend
    });

    try {
      const result = await this.tradingEngine.executeBuy();

      this.position = {
        entryPrice: price,
        entryTime: Date.now(),
        highestPrice: price,
        amount: this.config.tradeAmount,
        trailingStopPrice: price * (1 - this.trailingStopPercent / 100)
      };

      logger.success('Position opened', this.position);

      // Display balances
      await this.tradingEngine.displayBalances();
    } catch (error) {
      logger.error('Failed to enter position', { error: error.message });
    }
  }

  /**
   * Manage existing position
   */
  async managePosition(currentPrice, signals) {
    if (!this.position) return;

    // Update highest price and trailing stop
    if (currentPrice > this.position.highestPrice) {
      this.position.highestPrice = currentPrice;
      this.position.trailingStopPrice = currentPrice * (1 - this.trailingStopPercent / 100);

      logger.info('Trailing stop updated', {
        highestPrice: Helpers.formatNumber(this.position.highestPrice, 4),
        trailingStop: Helpers.formatNumber(this.position.trailingStopPrice, 4),
        profit: ((currentPrice - this.position.entryPrice) / this.position.entryPrice * 100).toFixed(2) + '%'
      });
    }

    // Check exit conditions
    const shouldExit = this.shouldExitPosition(currentPrice, signals);

    if (shouldExit.exit) {
      await this.exitPosition(currentPrice, shouldExit.reason);
    }
  }

  /**
   * Determine if should exit position
   */
  shouldExitPosition(currentPrice, signals) {
    // Trailing stop hit
    if (currentPrice <= this.position.trailingStopPrice) {
      return {
        exit: true,
        reason: 'Trailing stop hit'
      };
    }

    // Strong sell signal
    if (signals.overallSignal === 'SELL') {
      return {
        exit: true,
        reason: 'Sell signal detected'
      };
    }

    // RSI overbought
    if (signals.rsi > this.rsiOverbought) {
      return {
        exit: true,
        reason: 'RSI overbought'
      };
    }

    // Trend reversal
    if (signals.trend === 'DOWNTREND') {
      return {
        exit: true,
        reason: 'Trend reversal'
      };
    }

    return { exit: false };
  }

  /**
   * Exit position
   */
  async exitPosition(price, reason) {
    logger.success('EXITING POSITION', {
      reason,
      entryPrice: Helpers.formatNumber(this.position.entryPrice, 4),
      exitPrice: Helpers.formatNumber(price, 4),
      profit: ((price - this.position.entryPrice) / this.position.entryPrice * 100).toFixed(2) + '%'
    });

    try {
      const result = await this.tradingEngine.executeSell();

      logger.success('Position closed', result);

      // Reset position
      this.position = null;

      // Display balances
      await this.tradingEngine.displayBalances();
    } catch (error) {
      logger.error('Failed to exit position', { error: error.message });
    }
  }

  /**
   * Stop the strategy
   */
  stop() {
    this.isActive = false;
    this.priceMonitor.stop();
    logger.info('Momentum strategy stopped');
  }

  /**
   * Get strategy status
   */
  getStatus() {
    return {
      active: this.isActive,
      inPosition: !!this.position,
      position: this.position,
      priceHistory: this.priceHistory.length,
      currentPrice: this.priceMonitor.getCurrentPrice(),
    };
  }
}

module.exports = MomentumStrategy;
