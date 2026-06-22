const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

/**
 * Threshold Strategy
 * Buys when price drops below buy threshold
 * Sells when price rises above sell threshold
 */
class ThresholdStrategy {
  constructor(tradingEngine, priceMonitor, config) {
    this.tradingEngine = tradingEngine;
    this.priceMonitor = priceMonitor;
    this.config = config;
    this.isActive = false;
    this.hasBought = false;
    this.hasSold = false;
  }

  /**
   * Start the strategy
   */
  async start() {
    if (this.isActive) {
      logger.warn('Threshold strategy already running');
      return;
    }

    this.isActive = true;

    logger.info('Starting threshold strategy', {
      buyThreshold: this.config.buyThreshold,
      sellThreshold: this.config.sellThreshold,
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
    const { price, priceChange } = data;

    logger.info('Price Update', {
      price: Helpers.formatNumber(price, 4),
      change: priceChange ? `${priceChange}%` : 'N/A',
    });

    try {
      // Check buy threshold
      if (this.config.buyThreshold > 0 && !this.hasBought) {
        if (price <= this.config.buyThreshold) {
          logger.success(`Buy threshold reached! Price: ${price} <= ${this.config.buyThreshold}`);
          await this.executeBuy();
        }
      }

      // Check sell threshold
      if (this.config.sellThreshold > 0 && this.hasBought && !this.hasSold) {
        if (price >= this.config.sellThreshold) {
          logger.success(`Sell threshold reached! Price: ${price} >= ${this.config.sellThreshold}`);
          await this.executeSell();
        }
      }
    } catch (error) {
      logger.error('Error processing price update', { error: error.message });
    }
  }

  /**
   * Execute buy order
   */
  async executeBuy() {
    if (this.hasBought) {
      logger.warn('Already bought, skipping buy order');
      return;
    }

    try {
      const result = await this.tradingEngine.executeBuy();
      this.hasBought = true;

      logger.success('Buy order completed', result);

      // Display balances after buy
      await this.tradingEngine.displayBalances();
    } catch (error) {
      logger.error('Buy order failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute sell order
   */
  async executeSell() {
    if (this.hasSold) {
      logger.warn('Already sold, skipping sell order');
      return;
    }

    try {
      const result = await this.tradingEngine.executeSell();
      this.hasSold = true;

      logger.success('Sell order completed', result);

      // Display balances after sell
      await this.tradingEngine.displayBalances();

      // Stop monitoring after completing the cycle
      this.stop();
    } catch (error) {
      logger.error('Sell order failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Stop the strategy
   */
  stop() {
    this.isActive = false;
    this.priceMonitor.stop();
    logger.info('Threshold strategy stopped');
  }

  /**
   * Get strategy status
   */
  getStatus() {
    return {
      active: this.isActive,
      hasBought: this.hasBought,
      hasSold: this.hasSold,
      currentPrice: this.priceMonitor.getCurrentPrice(),
      buyThreshold: this.config.buyThreshold,
      sellThreshold: this.config.sellThreshold,
    };
  }
}

module.exports = ThresholdStrategy;
