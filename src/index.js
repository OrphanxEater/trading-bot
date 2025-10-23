#!/usr/bin/env node

/**
 * Solana Trading Bot
 * Professional automated trading bot for Solana using Jupiter DEX
 */

const config = require('./config/config');
const logger = require('./utils/logger');
const walletManager = require('./services/walletManager');
const connectionManager = require('./services/connectionManager');
const jupiterService = require('./services/jupiterService');
const PriceMonitor = require('./services/priceMonitor');
const TradingEngine = require('./services/tradingEngine');
const ThresholdStrategy = require('./strategies/thresholdStrategy');
const DCAStrategy = require('./strategies/dcaStrategy');

/**
 * Main Bot Class
 */
class SolanaTradingBot {
  constructor() {
    this.config = config;
    this.priceMonitor = null;
    this.tradingEngine = null;
    this.strategy = null;
    this.isRunning = false;
  }

  /**
   * Initialize the bot
   */
  async initialize() {
    try {
      logger.info('='.repeat(60));
      logger.info('Solana Trading Bot Initializing...');
      logger.info('='.repeat(60));

      // Display configuration
      logger.info('Configuration:', this.config.display());

      // Initialize wallet
      walletManager.initialize(this.config.privateKey);

      // Initialize connection
      connectionManager.initialize(this.config.rpcEndpoint);

      // Check network health
      const health = await connectionManager.checkHealth();
      if (!health.healthy) {
        throw new Error('Network is unhealthy');
      }
      logger.success('Network health check passed', { slot: health.slot });

      // Initialize services
      this.priceMonitor = new PriceMonitor(jupiterService);
      this.tradingEngine = new TradingEngine(
        jupiterService,
        connectionManager,
        walletManager,
        this.config
      );

      // Get initial balances
      const balances = await this.tradingEngine.getBalances();
      logger.info('Initial Balances:', balances);

      // Validate sufficient balance
      if (balances.SOL < 0.01) {
        logger.warn('Warning: Low SOL balance. Ensure you have enough SOL for trading and fees.');
      }

      logger.success('Bot initialized successfully');
      logger.info('='.repeat(60));

      return true;
    } catch (error) {
      logger.error('Bot initialization failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Start the bot with selected strategy
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Bot is already running');
      return;
    }

    try {
      this.isRunning = true;

      logger.info(`Starting bot with ${this.config.strategy} strategy`);

      // Select and start strategy
      switch (this.config.strategy.toLowerCase()) {
        case 'threshold':
          this.strategy = new ThresholdStrategy(
            this.tradingEngine,
            this.priceMonitor,
            this.config
          );
          break;

        case 'dca':
          this.strategy = new DCAStrategy(
            this.tradingEngine,
            this.priceMonitor,
            this.config
          );
          break;

        default:
          throw new Error(`Unknown strategy: ${this.config.strategy}`);
      }

      await this.strategy.start();

      logger.success('Bot started successfully');

      // Handle graceful shutdown
      this.setupShutdownHandlers();
    } catch (error) {
      logger.error('Failed to start bot', { error: error.message });
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the bot
   */
  async stop() {
    if (!this.isRunning) {
      logger.warn('Bot is not running');
      return;
    }

    logger.info('Stopping bot...');

    if (this.strategy) {
      this.strategy.stop();
    }

    this.isRunning = false;

    logger.success('Bot stopped successfully');
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await this.stop();

      // Display final status
      if (this.strategy) {
        logger.info('Final Strategy Status:', this.strategy.getStatus());
      }

      if (this.tradingEngine) {
        const history = this.tradingEngine.getTradeHistory();
        logger.info(`Total trades executed: ${history.length}`);

        // Display final balances
        await this.tradingEngine.displayBalances();
      }

      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack,
      });
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', {
        reason,
        promise,
      });
      shutdown('unhandledRejection');
    });
  }
}

/**
 * Main entry point
 */
async function main() {
  const bot = new SolanaTradingBot();

  try {
    await bot.initialize();
    await bot.start();
  } catch (error) {
    logger.error('Fatal error', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Run the bot
if (require.main === module) {
  main();
}

module.exports = SolanaTradingBot;
