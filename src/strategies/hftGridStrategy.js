const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

/**
 * High-Frequency Grid Trading Strategy
 * Sub-second rebalancing for volatile pairs
 * Optimized for high-frequency opportunities
 */
class HFTGridStrategy {
  constructor(tradingEngine, priceMonitor, jupiterService, config) {
    this.tradingEngine = tradingEngine;
    this.priceMonitor = priceMonitor;
    this.jupiterService = jupiterService;
    this.config = config;
    this.isActive = false;

    // HFT Grid parameters
    this.gridLevels = parseInt(config.hftGridLevels || 20); // More levels for HFT
    this.gridSpacing = parseFloat(config.hftGridSpacing || 0.5); // Tighter spacing (0.5%)
    this.rebalanceInterval = parseInt(config.hftRebalanceInterval || 500); // 500ms = sub-second
    this.minProfitBps = parseInt(config.hftMinProfitBps || 10); // 0.1% minimum profit
    this.maxSlippageBps = parseInt(config.hftMaxSlippageBps || 5); // 0.05% max slippage

    this.grids = [];
    this.activeOrders = [];
    this.lastPrice = null;
    this.priceUpdateCount = 0;
    this.rebalanceTimer = null;
  }

  /**
   * Start HFT grid trading
   */
  async start() {
    if (this.isActive) {
      logger.warn('HFT Grid strategy already running');
      return;
    }

    this.isActive = true;

    logger.info('Starting HFT Grid Trading', {
      levels: this.gridLevels,
      spacing: this.gridSpacing + '%',
      rebalanceInterval: this.rebalanceInterval + 'ms',
      minProfit: (this.minProfitBps / 100) + '%'
    });

    // Get initial price and create grids
    await Helpers.sleep(2000);
    const currentPrice = this.priceMonitor.getCurrentPrice();

    if (!currentPrice) {
      throw new Error('Could not get current price for HFT grid');
    }

    this.lastPrice = currentPrice;
    this.createDynamicGrids(currentPrice);

    // Start high-frequency rebalancing
    this.startHighFrequencyRebalancing();

    // Listen to price updates
    this.priceMonitor.on('priceUpdate', async (data) => {
      await this.onPriceUpdate(data);
    });

    logger.success('HFT Grid strategy started');
  }

  /**
   * Create dynamic grids around current price
   */
  createDynamicGrids(currentPrice) {
    this.grids = [];

    // Create grids both above and below current price
    const halfLevels = Math.floor(this.gridLevels / 2);

    for (let i = -halfLevels; i <= halfLevels; i++) {
      if (i === 0) continue; // Skip exact current price

      const priceOffset = (this.gridSpacing / 100) * i;
      const gridPrice = currentPrice * (1 + priceOffset);

      this.grids.push({
        level: i,
        price: gridPrice,
        type: i < 0 ? 'BUY' : 'SELL',
        filled: false,
        orderSize: this.config.hftOrderSize || 0.01,
        timestamp: Date.now()
      });
    }

    logger.info(`Created ${this.grids.length} dynamic grid levels`, {
      range: `${this.grids[0].price.toFixed(4)} - ${this.grids[this.grids.length - 1].price.toFixed(4)}`,
      currentPrice: currentPrice.toFixed(4)
    });
  }

  /**
   * Start high-frequency rebalancing loop
   */
  startHighFrequencyRebalancing() {
    this.rebalanceTimer = setInterval(async () => {
      await this.rebalanceGrids();
    }, this.rebalanceInterval);

    logger.info('High-frequency rebalancing started', {
      interval: this.rebalanceInterval + 'ms'
    });
  }

  /**
   * Handle price updates (high frequency)
   */
  async onPriceUpdate(data) {
    const { price } = data;
    this.priceUpdateCount++;

    // Check for execution opportunities
    await this.checkExecutionOpportunities(price);

    // Log update frequency
    if (this.priceUpdateCount % 10 === 0) {
      logger.debug('HFT Price updates', {
        count: this.priceUpdateCount,
        currentPrice: price.toFixed(4),
        activeGrids: this.grids.filter(g => !g.filled).length
      });
    }
  }

  /**
   * Check for immediate execution opportunities
   */
  async checkExecutionOpportunities(currentPrice) {
    // Find nearest unfilled grids
    const nearestBuyGrid = this.findNearestGrid('BUY', currentPrice);
    const nearestSellGrid = this.findNearestGrid('SELL', currentPrice);

    // Execute if price crosses grid level
    if (nearestBuyGrid && currentPrice <= nearestBuyGrid.price && !nearestBuyGrid.filled) {
      await this.executeGridOrder(nearestBuyGrid, currentPrice);
    }

    if (nearestSellGrid && currentPrice >= nearestSellGrid.price && !nearestSellGrid.filled) {
      await this.executeGridOrder(nearestSellGrid, currentPrice);
    }
  }

  /**
   * Find nearest unfilled grid
   */
  findNearestGrid(type, currentPrice) {
    const gridsOfType = this.grids.filter(g => g.type === type && !g.filled);

    if (gridsOfType.length === 0) return null;

    return gridsOfType.reduce((nearest, grid) => {
      const currentDist = Math.abs(grid.price - currentPrice);
      const nearestDist = Math.abs(nearest.price - currentPrice);
      return currentDist < nearestDist ? grid : nearest;
    });
  }

  /**
   * Execute grid order
   */
  async executeGridOrder(grid, currentPrice) {
    // Check profitability
    const expectedProfit = Math.abs(grid.price - currentPrice) / currentPrice;
    if (expectedProfit * 10000 < this.minProfitBps) {
      logger.debug('Skipping grid order - insufficient profit', {
        expectedProfit: (expectedProfit * 100).toFixed(3) + '%',
        minProfit: (this.minProfitBps / 100).toFixed(3) + '%'
      });
      return;
    }

    logger.info(`HFT Grid ${grid.type} triggered`, {
      level: grid.level,
      gridPrice: grid.price.toFixed(4),
      executionPrice: currentPrice.toFixed(4),
      size: grid.orderSize
    });

    if (this.config.dryRun) {
      logger.warn('DRY RUN: Grid order simulated', {
        type: grid.type,
        price: currentPrice.toFixed(4)
      });

      grid.filled = true;
      grid.executionPrice = currentPrice;
      grid.executionTime = Date.now();

      this.activeOrders.push({
        grid: grid.level,
        type: grid.type,
        price: currentPrice,
        size: grid.orderSize,
        timestamp: Date.now()
      });

      // In real trading, execute actual order here
      // const result = await this.tradingEngine.executeBuy/Sell(grid.orderSize);

      return;
    }

    try {
      let result;
      if (grid.type === 'BUY') {
        result = await this.tradingEngine.executeBuy(grid.orderSize);
      } else {
        result = await this.tradingEngine.executeSell(grid.orderSize);
      }

      grid.filled = true;
      grid.executionPrice = currentPrice;
      grid.executionTime = Date.now();

      this.activeOrders.push({
        grid: grid.level,
        type: grid.type,
        price: currentPrice,
        size: grid.orderSize,
        result,
        timestamp: Date.now()
      });

      logger.success('HFT Grid order executed', {
        type: grid.type,
        level: grid.level,
        activeOrders: this.activeOrders.length
      });

    } catch (error) {
      logger.error('HFT Grid execution failed', {
        error: error.message,
        grid: grid.level
      });
    }
  }

  /**
   * Rebalance grids (high frequency)
   */
  async rebalanceGrids() {
    if (!this.isActive) return;

    const currentPrice = this.priceMonitor.getCurrentPrice();
    if (!currentPrice) return;

    const priceChange = Math.abs(currentPrice - this.lastPrice) / this.lastPrice;

    // Significant price movement - recreate grids
    if (priceChange > 0.02) { // 2% movement
      logger.info('Significant price movement detected, recreating grids', {
        oldPrice: this.lastPrice.toFixed(4),
        newPrice: currentPrice.toFixed(4),
        change: (priceChange * 100).toFixed(2) + '%'
      });

      this.createDynamicGrids(currentPrice);
      this.lastPrice = currentPrice;
    }

    // Reset filled grids that are far from current price
    this.resetDistantGrids(currentPrice);
  }

  /**
   * Reset grids that are too far from current price
   */
  resetDistantGrids(currentPrice) {
    const resetThreshold = 0.05; // 5% away from current price

    this.grids.forEach(grid => {
      if (grid.filled) {
        const distance = Math.abs(grid.price - currentPrice) / currentPrice;
        if (distance > resetThreshold) {
          grid.filled = false;
          logger.debug('Reset distant grid', {
            level: grid.level,
            price: grid.price.toFixed(4),
            distance: (distance * 100).toFixed(2) + '%'
          });
        }
      }
    });
  }

  /**
   * Stop the strategy
   */
  stop() {
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
      this.rebalanceTimer = null;
    }

    this.isActive = false;

    const totalOrders = this.activeOrders.length;
    const buyOrders = this.activeOrders.filter(o => o.type === 'BUY').length;
    const sellOrders = this.activeOrders.filter(o => o.type === 'SELL').length;

    logger.info('HFT Grid strategy stopped', {
      totalOrders,
      buyOrders,
      sellOrders,
      priceUpdates: this.priceUpdateCount,
      avgUpdateFrequency: this.priceUpdateCount > 0
        ? ((Date.now() - this.activeOrders[0]?.timestamp) / this.priceUpdateCount / 1000).toFixed(2) + 's'
        : 'N/A'
    });
  }

  /**
   * Get strategy status
   */
  getStatus() {
    const filledGrids = this.grids.filter(g => g.filled).length;
    const activeGrids = this.grids.length - filledGrids;

    return {
      active: this.isActive,
      gridLevels: this.gridLevels,
      activeGrids,
      filledGrids,
      totalOrders: this.activeOrders.length,
      priceUpdates: this.priceUpdateCount,
      rebalanceInterval: this.rebalanceInterval + 'ms',
      currentPrice: this.priceMonitor.getCurrentPrice()
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    if (this.activeOrders.length === 0) {
      return { totalTrades: 0, avgExecutionTime: 0 };
    }

    const executionTimes = this.activeOrders
      .filter(o => o.executionTime && o.timestamp)
      .map(o => o.executionTime - o.timestamp);

    return {
      totalTrades: this.activeOrders.length,
      buyTrades: this.activeOrders.filter(o => o.type === 'BUY').length,
      sellTrades: this.activeOrders.filter(o => o.type === 'SELL').length,
      avgExecutionTime: executionTimes.length > 0
        ? (executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length).toFixed(0) + 'ms'
        : 'N/A',
      priceUpdateFrequency: (this.priceUpdateCount / ((Date.now() - (this.activeOrders[0]?.timestamp || Date.now())) / 1000)).toFixed(2) + ' Hz'
    };
  }
}

module.exports = HFTGridStrategy;
