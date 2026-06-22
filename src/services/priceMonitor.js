const EventEmitter = require('events');
const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

/**
 * Price Monitor
 * Monitors token prices and emits events on price changes
 */
class PriceMonitor extends EventEmitter {
  constructor(jupiterService) {
    super();
    this.jupiterService = jupiterService;
    this.isMonitoring = false;
    this.interval = null;
    this.currentPrice = null;
    this.previousPrice = null;
  }

  /**
   * Start monitoring price
   * @param {string} inputMint - Input token mint
   * @param {string} outputMint - Output token mint
   * @param {number} checkInterval - Check interval in milliseconds
   * @param {number} baseAmount - Base amount for price calculation
   */
  async start(inputMint, outputMint, checkInterval = 10000, baseAmount = 1e9) {
    if (this.isMonitoring) {
      logger.warn('Price monitor already running');
      return;
    }

    this.isMonitoring = true;
    this.inputMint = inputMint;
    this.outputMint = outputMint;
    this.baseAmount = baseAmount;

    logger.info('Starting price monitor', {
      inputMint,
      outputMint,
      checkInterval,
    });

    // Initial price check
    await this.checkPrice();

    // Set up interval for continuous monitoring
    this.interval = setInterval(async () => {
      await this.checkPrice();
    }, checkInterval);
  }

  /**
   * Check current price
   */
  async checkPrice() {
    try {
      const priceData = await this.jupiterService.getPrice(
        this.inputMint,
        this.outputMint,
        this.baseAmount
      );

      this.previousPrice = this.currentPrice;
      this.currentPrice = priceData.price;

      // Calculate price change if we have a previous price
      let priceChange = null;
      if (this.previousPrice) {
        priceChange = Helpers.percentageChange(this.previousPrice, this.currentPrice);
      }

      logger.debug('Price checked', {
        price: Helpers.formatNumber(this.currentPrice),
        previousPrice: this.previousPrice ? Helpers.formatNumber(this.previousPrice) : 'N/A',
        change: priceChange ? `${priceChange}%` : 'N/A',
      });

      // Emit price update event
      this.emit('priceUpdate', {
        price: this.currentPrice,
        previousPrice: this.previousPrice,
        priceChange,
        timestamp: Date.now(),
        priceData,
      });

      return this.currentPrice;
    } catch (error) {
      logger.error('Price check failed', { error: error.message });
      this.emit('error', error);
    }
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isMonitoring = false;
    logger.info('Price monitor stopped');
  }

  /**
   * Get current price
   */
  getCurrentPrice() {
    return this.currentPrice;
  }

  /**
   * Get previous price
   */
  getPreviousPrice() {
    return this.previousPrice;
  }

  /**
   * Check if monitoring
   */
  isActive() {
    return this.isMonitoring;
  }
}

module.exports = PriceMonitor;
