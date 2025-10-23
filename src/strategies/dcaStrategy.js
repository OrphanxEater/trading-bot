const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

/**
 * DCA (Dollar-Cost Averaging) Strategy
 * Buys a fixed amount at regular intervals regardless of price
 */
class DCAStrategy {
  constructor(tradingEngine, priceMonitor, config) {
    this.tradingEngine = tradingEngine;
    this.priceMonitor = priceMonitor;
    this.config = config;
    this.isActive = false;
    this.interval = null;
    this.purchaseCount = 0;
  }

  /**
   * Start the strategy
   */
  async start() {
    if (this.isActive) {
      logger.warn('DCA strategy already running');
      return;
    }

    this.isActive = true;

    logger.info('Starting DCA strategy', {
      amount: this.config.dcaAmount,
      interval: `${this.config.dcaInterval / 1000}s`,
    });

    // Display initial balances
    await this.tradingEngine.displayBalances();

    // Start price monitoring (for logging purposes)
    await this.priceMonitor.start(
      this.config.inputToken,
      this.config.outputToken,
      this.config.priceCheckInterval
    );

    // Execute first purchase immediately
    await this.executePurchase();

    // Set up interval for recurring purchases
    this.interval = setInterval(async () => {
      await this.executePurchase();
    }, this.config.dcaInterval);
  }

  /**
   * Execute a DCA purchase
   */
  async executePurchase() {
    try {
      const currentPrice = this.priceMonitor.getCurrentPrice();

      logger.info('Executing DCA purchase', {
        purchaseNumber: this.purchaseCount + 1,
        amount: this.config.dcaAmount,
        currentPrice: currentPrice ? Helpers.formatNumber(currentPrice, 4) : 'N/A',
      });

      const result = await this.tradingEngine.executeBuy(this.config.dcaAmount);

      this.purchaseCount++;

      logger.success('DCA purchase completed', {
        purchaseCount: this.purchaseCount,
        result,
      });

      // Display balances after purchase
      await this.tradingEngine.displayBalances();
    } catch (error) {
      logger.error('DCA purchase failed', { error: error.message });
    }
  }

  /**
   * Stop the strategy
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.isActive = false;
    this.priceMonitor.stop();

    logger.info('DCA strategy stopped', {
      totalPurchases: this.purchaseCount,
    });
  }

  /**
   * Get strategy status
   */
  getStatus() {
    return {
      active: this.isActive,
      purchaseCount: this.purchaseCount,
      dcaAmount: this.config.dcaAmount,
      dcaInterval: this.config.dcaInterval,
      currentPrice: this.priceMonitor.getCurrentPrice(),
    };
  }
}

module.exports = DCAStrategy;
