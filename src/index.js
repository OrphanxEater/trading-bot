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
const MomentumStrategy = require('./strategies/momentumStrategy');
const GridStrategy = require('./strategies/gridStrategy');
const NFTMarketMakingStrategy = require('./strategies/nftMarketMakingStrategy');
const RiskManager = require('./utils/riskManager');
const PerformanceAnalytics = require('./utils/performanceAnalytics');
const MarketIntelligence = require('./services/marketIntelligence');
const NFTMarketIntelligence = require('./services/nftMarketIntelligence');
const PortfolioManager = require('./services/portfolioManager');

/**
 * Main Bot Class
 */
class SolanaTradingBot {
  constructor() {
    this.config = config;
    this.priceMonitor = null;
    this.tradingEngine = null;
    this.strategy = null;
    this.nftStrategy = null;
    this.riskManager = null;
    this.performanceAnalytics = null;
    this.marketIntelligence = null;
    this.nftMarketIntelligence = null;
    this.portfolioManager = null;
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

      // Initialize risk management if enabled
      if (this.config.enableRiskManagement) {
        this.riskManager = new RiskManager(this.config);
        logger.success('Risk management enabled');
      }

      // Initialize performance tracking if enabled
      if (this.config.enablePerformanceTracking) {
        this.performanceAnalytics = new PerformanceAnalytics();
        logger.success('Performance tracking enabled');
      }

      // Get initial balances
      const balances = await this.tradingEngine.getBalances();
      logger.info('Initial Balances:', balances);

      // Initialize performance analytics with starting balance
      if (this.performanceAnalytics) {
        this.performanceAnalytics.initialize(balances.SOL);
      }

      // Initialize risk manager with peak balance
      if (this.riskManager) {
        this.riskManager.peakBalance = balances.SOL;
        this.riskManager.dailyStartBalance = balances.SOL;
      }

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
   * Run intelligent market analysis
   */
  async runMarketAnalysis(balances) {
    try {
      logger.info('='.repeat(60));
      logger.info('🧠 RUNNING INTELLIGENT MARKET ANALYSIS');
      logger.info('='.repeat(60));

      // Initialize intelligence services
      this.marketIntelligence = new MarketIntelligence(
        jupiterService,
        connectionManager
      );

      this.nftMarketIntelligence = new NFTMarketIntelligence();
      this.portfolioManager = new PortfolioManager(this.config);

      // Run parallel market analysis
      logger.info('Analyzing token and NFT markets...');

      const [tokenAnalysis, nftAnalysis] = await Promise.all([
        this.marketIntelligence.analyzeMarket(
          this.config.inputToken,
          this.config.outputToken,
          this.config.analysisLookbackHours || 8
        ),
        this.config.enableNFTTrading
          ? this.nftMarketIntelligence.analyzeNFTMarket(
              this.config.analysisLookbackHours || 8
            )
          : Promise.resolve({
              overallActivity: 'DISABLED',
              recommendation: { action: 'SKIP', allocation: 0 }
            })
      ]);

      // Display analysis reports
      logger.info(this.marketIntelligence.generateReport(tokenAnalysis));

      if (this.config.enableNFTTrading) {
        logger.info(this.nftMarketIntelligence.generateReport(nftAnalysis));
      }

      // Calculate portfolio allocation
      const allocation = this.portfolioManager.calculateAllocation(
        balances.SOL,
        tokenAnalysis,
        nftAnalysis
      );

      this.portfolioManager.displayAllocation();

      return {
        tokenAnalysis,
        nftAnalysis,
        allocation
      };
    } catch (error) {
      logger.error('Market analysis failed', { error: error.message });
      // Return default safe allocation
      return {
        tokenAnalysis: {
          recommendedStrategy: this.config.strategy || 'dca',
          confidence: 50
        },
        nftAnalysis: {
          recommendation: { action: 'SKIP', allocation: 0 }
        },
        allocation: {
          tokenTrading: balances.SOL * 0.8,
          nftMarketMaking: 0,
          reserve: balances.SOL * 0.2,
          strategy: this.config.strategy || 'dca'
        }
      };
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

      // Get current balances
      const balances = await this.tradingEngine.getBalances();

      // Run intelligent market analysis if enabled
      let analysis = null;
      let selectedStrategy = this.config.strategy;

      if (this.config.enableIntelligentAnalysis) {
        analysis = await this.runMarketAnalysis(balances);

        // Use AI-recommended strategy if not manually overridden
        if (this.config.strategy === 'auto' || !this.config.strategy) {
          selectedStrategy = analysis.tokenAnalysis.recommendedStrategy;
          logger.success(`AI selected strategy: ${selectedStrategy}`, {
            confidence: analysis.tokenAnalysis.confidence + '%',
            reasoning: analysis.tokenAnalysis.reasoning
          });
        } else {
          logger.info(`Using manual strategy: ${this.config.strategy} (AI recommended: ${analysis.tokenAnalysis.recommendedStrategy})`);
        }
      }

      logger.info(`Starting bot with ${selectedStrategy} strategy`);

      // Select and start strategy
      switch (selectedStrategy.toLowerCase()) {
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

        case 'momentum':
          this.strategy = new MomentumStrategy(
            this.tradingEngine,
            this.priceMonitor,
            this.config
          );
          break;

        case 'grid':
          this.strategy = new GridStrategy(
            this.tradingEngine,
            this.priceMonitor,
            this.config
          );
          break;

        default:
          throw new Error(`Unknown strategy: ${selectedStrategy}. Available: threshold, dca, momentum, grid, auto`);
      }

      await this.strategy.start();

      // Start NFT market making if analysis recommended it
      if (analysis && analysis.nftAnalysis.recommendation.action === 'MARKET_MAKE') {
        logger.info('Starting NFT market making strategy...');

        this.nftStrategy = new NFTMarketMakingStrategy(
          analysis.nftAnalysis,
          this.config
        );

        await this.nftStrategy.start(analysis.allocation.nftMarketMaking);
      }

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

    if (this.nftStrategy) {
      this.nftStrategy.stop();
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
        logger.info('Final Token Strategy Status:', this.strategy.getStatus());
      }

      if (this.nftStrategy) {
        logger.info('Final NFT Strategy Status:', this.nftStrategy.getStatus());
      }

      if (this.tradingEngine) {
        const history = this.tradingEngine.getTradeHistory();
        logger.info(`Total trades executed: ${history.length}`);

        // Display final balances
        const finalBalances = await this.tradingEngine.displayBalances();

        // Display performance report
        if (this.performanceAnalytics && finalBalances) {
          this.performanceAnalytics.displayReport(finalBalances.SOL);
        }

        // Display risk metrics
        if (this.riskManager && finalBalances) {
          const riskMetrics = this.riskManager.getRiskMetrics(finalBalances.SOL);
          logger.info('Final Risk Metrics:', riskMetrics);
        }
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
