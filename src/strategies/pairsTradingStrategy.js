const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');
const { PairsTradingKalman } = require('../utils/kalmanFilter');

/**
 * Statistical Arbitrage Pairs Trading Strategy
 * Uses Kalman filter to identify mean-reverting opportunities between correlated tokens
 */
class PairsTradingStrategy {
  constructor(jupiterService, connectionManager, walletManager, config) {
    this.jupiterService = jupiterService;
    this.connectionManager = connectionManager;
    this.walletManager = walletManager;
    this.config = config;
    this.isActive = false;

    // Pairs configuration
    this.tokenA = config.pairsTokenA; // e.g., SOL
    this.tokenB = config.pairsTokenB; // e.g., mSOL
    this.pairName = `${config.pairsTokenASymbol || 'A'}/${config.pairsTokenBSymbol || 'B'}`;

    // Strategy parameters
    this.entryZScore = parseFloat(config.pairsEntryZScore || 2.0);
    this.exitZScore = parseFloat(config.pairsExitZScore || 0.5);
    this.updateInterval = parseInt(config.pairsUpdateInterval || 5000); // 5 seconds
    this.hedgeRatioUpdateFreq = parseInt(config.pairsHedgeRatioUpdate || 20); // Every 20 updates

    // Kalman filter
    this.kalman = new PairsTradingKalman({
      processNoise: parseFloat(config.pairsProcessNoise || 0.0001),
      measurementNoise: parseFloat(config.pairsMeasurementNoise || 0.01)
    });

    // Position tracking
    this.position = {
      inTrade: false,
      type: null, // 'LONG_SPREAD' or 'SHORT_SPREAD'
      entrySpread: null,
      entryZScore: null,
      tokenASize: 0,
      tokenBSize: 0,
      entryTime: null
    };

    this.priceHistory = [];
    this.updateCount = 0;
    this.updateTimer = null;
  }

  /**
   * Start pairs trading
   */
  async start() {
    if (this.isActive) {
      logger.warn('Pairs trading already running');
      return;
    }

    this.isActive = true;

    logger.info('Starting Statistical Arbitrage Pairs Trading', {
      pair: this.pairName,
      entryZScore: this.entryZScore,
      exitZScore: this.exitZScore,
      updateInterval: this.updateInterval + 'ms'
    });

    // Initial price fetch and correlation check
    await this.initializePair();

    // Start monitoring loop
    this.updateTimer = setInterval(async () => {
      await this.updatePricesAndAnalyze();
    }, this.updateInterval);

    logger.success('Pairs trading started');
  }

  /**
   * Initialize pair and check correlation
   */
  async initializePair() {
    logger.info('Initializing pair and checking correlation...');

    // Gather initial price history
    for (let i = 0; i < 30; i++) {
      await this.fetchPrices();
      await Helpers.sleep(1000);
    }

    // Check correlation
    const correlation = this.kalman.getCorrelation();

    if (correlation) {
      logger.info('Pair correlation analysis', {
        correlation: correlation.correlation.toFixed(3),
        isCointegrated: correlation.isCointegrated,
        hedgeRatio: correlation.hedgeRatio.toFixed(4)
      });

      if (!correlation.isCointegrated) {
        logger.warn('Warning: Pair may not be cointegrated (correlation < 0.7)');
      }
    }
  }

  /**
   * Fetch current prices for both tokens
   */
  async fetchPrices() {
    try {
      // For this example, we'll use a common base (e.g., USDC) to price both
      const baseToken = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC

      const [priceDataA, priceDataB] = await Promise.all([
        this.jupiterService.getPrice(this.tokenA, baseToken, 1e9),
        this.jupiterService.getPrice(this.tokenB, baseToken, 1e9)
      ]);

      const priceA = priceDataA.price;
      const priceB = priceDataB.price;

      this.priceHistory.push({
        timestamp: Date.now(),
        priceA,
        priceB
      });

      // Keep last 1000 prices
      if (this.priceHistory.length > 1000) {
        this.priceHistory.shift();
      }

      return { priceA, priceB };
    } catch (error) {
      logger.error('Failed to fetch pair prices', { error: error.message });
      return null;
    }
  }

  /**
   * Update prices and analyze for trading signals
   */
  async updatePricesAndAnalyze() {
    if (!this.isActive) return;

    this.updateCount++;

    // Fetch current prices
    const prices = await this.fetchPrices();
    if (!prices) return;

    const { priceA, priceB } = prices;

    // Update Kalman filter
    const kalmanUpdate = this.kalman.updatePrices(priceA, priceB);

    // Periodically update hedge ratio
    if (this.updateCount % this.hedgeRatioUpdateFreq === 0) {
      const newHedgeRatio = this.kalman.updateHedgeRatio();
      logger.info('Hedge ratio updated', {
        hedgeRatio: newHedgeRatio.toFixed(4),
        updates: this.updateCount
      });
    }

    // Get trading signal
    const signal = this.kalman.getTradingSignal(
      kalmanUpdate.spread,
      this.entryZScore,
      this.exitZScore
    );

    logger.debug('Pairs analysis', {
      pair: this.pairName,
      priceA: priceA.toFixed(4),
      priceB: priceB.toFixed(4),
      spread: kalmanUpdate.spread.toFixed(4),
      zScore: signal.zScore,
      signal: signal.signal,
      inTrade: this.position.inTrade
    });

    // Execute trading logic
    await this.processTradingSignal(signal, prices);
  }

  /**
   * Process trading signal and execute trades
   */
  async processTradingSignal(signal, prices) {
    try {
      // Entry signals
      if (!this.position.inTrade && signal.action) {
        if (signal.signal === 'LONG_SPREAD') {
          await this.enterLongSpread(signal, prices);
        } else if (signal.signal === 'SHORT_SPREAD') {
          await this.enterShortSpread(signal, prices);
        }
      }

      // Exit signals
      else if (this.position.inTrade && signal.signal === 'EXIT') {
        await this.exitPosition(signal, prices);
      }

      // Monitor position
      else if (this.position.inTrade) {
        this.monitorPosition(signal, prices);
      }

    } catch (error) {
      logger.error('Failed to process trading signal', { error: error.message });
    }
  }

  /**
   * Enter long spread position (buy A, sell B)
   */
  async enterLongSpread(signal, prices) {
    logger.success('LONG SPREAD signal detected', {
      zScore: signal.zScore,
      spread: signal.spread,
      confidence: (signal.action.confidence * 100).toFixed(1) + '%'
    });

    if (this.config.dryRun) {
      logger.warn('DRY RUN: Would enter long spread position');
      this.position = {
        inTrade: true,
        type: 'LONG_SPREAD',
        entrySpread: signal.spread,
        entryZScore: parseFloat(signal.zScore),
        tokenASize: this.config.pairsPositionSize || 0.1,
        tokenBSize: this.config.pairsPositionSize || 0.1,
        entryTime: Date.now(),
        entryPriceA: prices.priceA,
        entryPriceB: prices.priceB
      };
      return;
    }

    // In production: Execute actual trades
    // Buy token A, Sell token B
    logger.info('Executing long spread entry...');
    // const buyA = await this.tradingEngine.executeBuy(tokenA, size);
    // const sellB = await this.tradingEngine.executeSell(tokenB, size);

    this.position = {
      inTrade: true,
      type: 'LONG_SPREAD',
      entrySpread: signal.spread,
      entryZScore: parseFloat(signal.zScore),
      tokenASize: this.config.pairsPositionSize || 0.1,
      tokenBSize: this.config.pairsPositionSize || 0.1,
      entryTime: Date.now(),
      entryPriceA: prices.priceA,
      entryPriceB: prices.priceB
    };
  }

  /**
   * Enter short spread position (sell A, buy B)
   */
  async enterShortSpread(signal, prices) {
    logger.success('SHORT SPREAD signal detected', {
      zScore: signal.zScore,
      spread: signal.spread,
      confidence: (signal.action.confidence * 100).toFixed(1) + '%'
    });

    if (this.config.dryRun) {
      logger.warn('DRY RUN: Would enter short spread position');
      this.position = {
        inTrade: true,
        type: 'SHORT_SPREAD',
        entrySpread: signal.spread,
        entryZScore: parseFloat(signal.zScore),
        tokenASize: this.config.pairsPositionSize || 0.1,
        tokenBSize: this.config.pairsPositionSize || 0.1,
        entryTime: Date.now(),
        entryPriceA: prices.priceA,
        entryPriceB: prices.priceB
      };
      return;
    }

    // In production: Execute actual trades
    // Sell token A, Buy token B
    logger.info('Executing short spread entry...');

    this.position = {
      inTrade: true,
      type: 'SHORT_SPREAD',
      entrySpread: signal.spread,
      entryZScore: parseFloat(signal.zScore),
      tokenASize: this.config.pairsPositionSize || 0.1,
      tokenBSize: this.config.pairsPositionSize || 0.1,
      entryTime: Date.now(),
      entryPriceA: prices.priceA,
      entryPriceB: prices.priceB
    };
  }

  /**
   * Exit position
   */
  async exitPosition(signal, prices) {
    const holdTime = Date.now() - this.position.entryTime;
    const spreadChange = signal.spread - this.position.entrySpread;

    // Calculate P&L
    const pnl = this.calculatePnL(prices);

    logger.success('EXITING position', {
      type: this.position.type,
      entryZScore: this.position.entryZScore,
      exitZScore: signal.zScore,
      holdTime: (holdTime / 1000).toFixed(1) + 's',
      spreadChange: spreadChange.toFixed(4),
      estimatedPnL: pnl.toFixed(4)
    });

    if (this.config.dryRun) {
      logger.warn('DRY RUN: Would close position');
    } else {
      // Execute closing trades
      logger.info('Closing position...');
      // Close both legs
    }

    // Reset position
    this.position = {
      inTrade: false,
      type: null,
      entrySpread: null,
      entryZScore: null,
      tokenASize: 0,
      tokenBSize: 0,
      entryTime: null
    };
  }

  /**
   * Monitor active position
   */
  monitorPosition(signal, prices) {
    const holdTime = (Date.now() - this.position.entryTime) / 1000;
    const unrealizedPnL = this.calculatePnL(prices);

    if (holdTime % 30 === 0) { // Log every 30 seconds
      logger.info('Position monitoring', {
        type: this.position.type,
        holdTime: holdTime.toFixed(0) + 's',
        currentZScore: signal.zScore,
        unrealizedPnL: unrealizedPnL.toFixed(4)
      });
    }
  }

  /**
   * Calculate unrealized P&L
   */
  calculatePnL(prices) {
    if (!this.position.inTrade) return 0;

    const { priceA, priceB } = prices;

    if (this.position.type === 'LONG_SPREAD') {
      // Long A, Short B
      const pnlA = (priceA - this.position.entryPriceA) * this.position.tokenASize;
      const pnlB = (this.position.entryPriceB - priceB) * this.position.tokenBSize;
      return pnlA + pnlB;
    } else if (this.position.type === 'SHORT_SPREAD') {
      // Short A, Long B
      const pnlA = (this.position.entryPriceA - priceA) * this.position.tokenASize;
      const pnlB = (priceB - this.position.entryPriceB) * this.position.tokenBSize;
      return pnlA + pnlB;
    }

    return 0;
  }

  /**
   * Stop the strategy
   */
  stop() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    this.isActive = false;

    const correlation = this.kalman.getCorrelation();
    const stats = this.kalman.getStatistics();

    logger.info('Pairs trading stopped', {
      pair: this.pairName,
      updates: this.updateCount,
      correlation: correlation?.correlation.toFixed(3),
      hedgeRatio: correlation?.hedgeRatio.toFixed(4),
      meanSpread: stats.mean.toFixed(4),
      spreadStdDev: stats.stdDev.toFixed(4),
      inPosition: this.position.inTrade
    });

    if (this.position.inTrade) {
      logger.warn('Position still open - manual intervention may be required');
    }
  }

  /**
   * Get strategy status
   */
  getStatus() {
    const correlation = this.kalman.getCorrelation();
    const stats = this.kalman.getStatistics();

    return {
      active: this.isActive,
      pair: this.pairName,
      inTrade: this.position.inTrade,
      positionType: this.position.type,
      updates: this.updateCount,
      correlation: correlation?.correlation.toFixed(3),
      hedgeRatio: correlation?.hedgeRatio.toFixed(4),
      spreadMean: stats.mean.toFixed(4),
      spreadStdDev: stats.stdDev.toFixed(4),
      currentZScore: this.kalman.getStatistics().current
    };
  }
}

module.exports = PairsTradingStrategy;
