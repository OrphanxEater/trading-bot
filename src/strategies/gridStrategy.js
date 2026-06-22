const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

/**
 * Grid Trading Strategy
 * Places buy and sell orders at regular intervals (grid levels)
 * Profits from price oscillations in ranging markets
 */
class GridStrategy {
  constructor(tradingEngine, priceMonitor, config) {
    this.tradingEngine = tradingEngine;
    this.priceMonitor = priceMonitor;
    this.config = config;
    this.isActive = false;

    // Grid parameters
    this.gridLevels = parseInt(config.gridLevels || 10);
    this.gridSpacing = parseFloat(config.gridSpacing || 2.0); // % between levels
    this.upperPrice = parseFloat(config.gridUpperPrice || 0);
    this.lowerPrice = parseFloat(config.gridLowerPrice || 0);
    this.baseOrderSize = parseFloat(config.gridOrderSize || 0.01);

    this.grids = [];
    this.activeOrders = [];
  }

  /**
   * Start the strategy
   */
  async start() {
    if (this.isActive) {
      logger.warn('Grid strategy already running');
      return;
    }

    this.isActive = true;

    logger.info('Starting grid trading strategy');

    // Display initial balances
    await this.tradingEngine.displayBalances();

    // Initialize grid based on current price if bounds not set
    if (this.upperPrice === 0 || this.lowerPrice === 0) {
      await this.initializeGridFromCurrentPrice();
    } else {
      this.createGridLevels();
    }

    logger.info('Grid levels created', {
      levels: this.gridLevels,
      upper: Helpers.formatNumber(this.upperPrice, 4),
      lower: Helpers.formatNumber(this.lowerPrice, 4),
      spacing: this.gridSpacing + '%'
    });

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
   * Initialize grid from current price
   */
  async initializeGridFromCurrentPrice() {
    // Wait for first price
    await Helpers.sleep(2000);

    const currentPrice = this.priceMonitor.getCurrentPrice();
    if (!currentPrice) {
      throw new Error('Could not get current price to initialize grid');
    }

    // Set grid bounds around current price
    const range = this.gridSpacing * this.gridLevels / 2;
    this.upperPrice = currentPrice * (1 + range / 100);
    this.lowerPrice = currentPrice * (1 - range / 100);

    this.createGridLevels();
  }

  /**
   * Create grid levels
   */
  createGridLevels() {
    this.grids = [];

    const priceRange = this.upperPrice - this.lowerPrice;
    const levelSpacing = priceRange / (this.gridLevels - 1);

    for (let i = 0; i < this.gridLevels; i++) {
      const price = this.lowerPrice + (levelSpacing * i);

      this.grids.push({
        level: i,
        price: price,
        type: i < this.gridLevels / 2 ? 'BUY' : 'SELL',
        filled: false,
        orderSize: this.baseOrderSize
      });
    }

    logger.info('Grid structure:', {
      grids: this.grids.map(g => ({
        level: g.level,
        price: Helpers.formatNumber(g.price, 4),
        type: g.type
      }))
    });
  }

  /**
   * Handle price update event
   */
  async onPriceUpdate(data) {
    const { price } = data;

    logger.info('Price Update', {
      price: Helpers.formatNumber(price, 4),
      activeOrders: this.activeOrders.length
    });

    // Check if price crossed any grid levels
    await this.checkGridLevels(price);
  }

  /**
   * Check if price crossed grid levels
   */
  async checkGridLevels(currentPrice) {
    for (const grid of this.grids) {
      // Skip if already filled
      if (grid.filled) continue;

      // Check if price crossed this level
      if (grid.type === 'BUY' && currentPrice <= grid.price) {
        await this.executeBuyGrid(grid, currentPrice);
      } else if (grid.type === 'SELL' && currentPrice >= grid.price) {
        await this.executeSellGrid(grid, currentPrice);
      }
    }
  }

  /**
   * Execute buy at grid level
   */
  async executeBuyGrid(grid, currentPrice) {
    logger.success('Grid BUY level reached', {
      level: grid.level,
      gridPrice: Helpers.formatNumber(grid.price, 4),
      currentPrice: Helpers.formatNumber(currentPrice, 4),
      orderSize: grid.orderSize
    });

    try {
      const result = await this.tradingEngine.executeBuy(grid.orderSize);

      // Mark grid as filled
      grid.filled = true;
      grid.executionPrice = currentPrice;
      grid.executionTime = Date.now();

      this.activeOrders.push({
        grid: grid.level,
        type: 'BUY',
        price: currentPrice,
        size: grid.orderSize,
        result
      });

      logger.success('Grid buy executed', {
        level: grid.level,
        activeOrders: this.activeOrders.length
      });

      // Display balances
      await this.tradingEngine.displayBalances();

      // Check if we should create a sell grid above
      this.createPairedSellGrid(grid, currentPrice);
    } catch (error) {
      logger.error('Grid buy failed', {
        level: grid.level,
        error: error.message
      });
    }
  }

  /**
   * Execute sell at grid level
   */
  async executeSellGrid(grid, currentPrice) {
    logger.success('Grid SELL level reached', {
      level: grid.level,
      gridPrice: Helpers.formatNumber(grid.price, 4),
      currentPrice: Helpers.formatNumber(currentPrice, 4),
      orderSize: grid.orderSize
    });

    try {
      const result = await this.tradingEngine.executeSell(grid.orderSize);

      // Mark grid as filled
      grid.filled = true;
      grid.executionPrice = currentPrice;
      grid.executionTime = Date.now();

      // Calculate profit if there was a matching buy
      const matchingBuy = this.activeOrders.find(o => o.type === 'BUY' && !o.closed);
      if (matchingBuy) {
        const profit = ((currentPrice - matchingBuy.price) / matchingBuy.price) * 100;
        logger.success('Grid profit realized', {
          buyPrice: Helpers.formatNumber(matchingBuy.price, 4),
          sellPrice: Helpers.formatNumber(currentPrice, 4),
          profit: profit.toFixed(2) + '%'
        });
        matchingBuy.closed = true;
      }

      this.activeOrders.push({
        grid: grid.level,
        type: 'SELL',
        price: currentPrice,
        size: grid.orderSize,
        result
      });

      // Display balances
      await this.tradingEngine.displayBalances();

      // Reset the grid for reuse
      this.resetGrid(grid);
    } catch (error) {
      logger.error('Grid sell failed', {
        level: grid.level,
        error: error.message
      });
    }
  }

  /**
   * Create a paired sell grid above a buy
   */
  createPairedSellGrid(buyGrid, buyPrice) {
    // Create sell grid at spacing% above buy price
    const sellPrice = buyPrice * (1 + this.gridSpacing / 100);

    // Check if sell grid already exists at this level
    const existingSell = this.grids.find(g =>
      g.type === 'SELL' &&
      Math.abs(g.price - sellPrice) < sellPrice * 0.01 // Within 1%
    );

    if (existingSell && !existingSell.filled) {
      logger.debug('Sell grid already exists', {
        price: Helpers.formatNumber(sellPrice, 4)
      });
      return;
    }

    // Add new sell grid
    this.grids.push({
      level: this.grids.length,
      price: sellPrice,
      type: 'SELL',
      filled: false,
      orderSize: buyGrid.orderSize,
      paired: buyGrid.level
    });

    logger.info('Paired sell grid created', {
      buyLevel: buyGrid.level,
      sellPrice: Helpers.formatNumber(sellPrice, 4)
    });
  }

  /**
   * Reset grid for reuse
   */
  resetGrid(grid) {
    grid.filled = false;
    grid.executionPrice = null;
    grid.executionTime = null;

    logger.debug('Grid reset for reuse', { level: grid.level });
  }

  /**
   * Stop the strategy
   */
  stop() {
    this.isActive = false;
    this.priceMonitor.stop();

    logger.info('Grid strategy stopped', {
      totalGrids: this.grids.length,
      filledGrids: this.grids.filter(g => g.filled).length,
      totalOrders: this.activeOrders.length
    });
  }

  /**
   * Get strategy status
   */
  getStatus() {
    return {
      active: this.isActive,
      gridLevels: this.gridLevels,
      upperPrice: this.upperPrice,
      lowerPrice: this.lowerPrice,
      activeGrids: this.grids.filter(g => g.filled).length,
      totalOrders: this.activeOrders.length,
      currentPrice: this.priceMonitor.getCurrentPrice(),
    };
  }

  /**
   * Get grid statistics
   */
  getGridStats() {
    const completedTrades = this.activeOrders.filter(o => o.closed);

    return {
      totalGrids: this.grids.length,
      filledGrids: this.grids.filter(g => g.filled).length,
      buyOrders: this.activeOrders.filter(o => o.type === 'BUY').length,
      sellOrders: this.activeOrders.filter(o => o.type === 'SELL').length,
      completedTrades: completedTrades.length,
      grids: this.grids
    };
  }
}

module.exports = GridStrategy;
