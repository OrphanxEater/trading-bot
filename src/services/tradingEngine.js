const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

/**
 * Trading Engine
 * Executes trades based on strategy signals
 */
class TradingEngine {
  constructor(jupiterService, connectionManager, walletManager, config) {
    this.jupiterService = jupiterService;
    this.connectionManager = connectionManager;
    this.walletManager = walletManager;
    this.config = config;
    this.isTrading = false;
    this.tradeHistory = [];
  }

  /**
   * Execute a buy order
   * @param {number} amount - Amount to buy (in SOL or input token)
   */
  async executeBuy(amount = null) {
    if (this.config.dryRun) {
      logger.warn('DRY RUN: Buy order would be executed', { amount });
      return { dryRun: true, action: 'buy', amount };
    }

    try {
      const tradeAmount = amount || this.config.tradeAmount;
      const amountInLamports = Helpers.solToLamports(tradeAmount);

      logger.info('Executing BUY order', {
        amount: tradeAmount,
        inputToken: this.config.inputToken,
        outputToken: this.config.outputToken,
      });

      const result = await this.jupiterService.executeSwap(
        this.connectionManager.getConnection(),
        this.walletManager.getKeypair(),
        this.config.inputToken,
        this.config.outputToken,
        amountInLamports,
        this.config.slippageBps,
        this.config.priorityFee
      );

      // Record trade
      this.recordTrade('buy', result);

      return result;
    } catch (error) {
      logger.error('Buy order failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute a sell order
   * @param {number} amount - Amount to sell (in output token)
   */
  async executeSell(amount = null) {
    if (this.config.dryRun) {
      logger.warn('DRY RUN: Sell order would be executed', { amount });
      return { dryRun: true, action: 'sell', amount };
    }

    try {
      const tradeAmount = amount || this.config.tradeAmount;

      // For selling, we swap output token back to input token
      // Amount needs to be in the output token's smallest units
      const amountInTokenUnits = Helpers.parseTokenAmount(tradeAmount, 6); // USDC has 6 decimals

      logger.info('Executing SELL order', {
        amount: tradeAmount,
        inputToken: this.config.outputToken,
        outputToken: this.config.inputToken,
      });

      const result = await this.jupiterService.executeSwap(
        this.connectionManager.getConnection(),
        this.walletManager.getKeypair(),
        this.config.outputToken, // Swap output back to input
        this.config.inputToken,
        amountInTokenUnits,
        this.config.slippageBps,
        this.config.priorityFee
      );

      // Record trade
      this.recordTrade('sell', result);

      return result;
    } catch (error) {
      logger.error('Sell order failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Record trade in history
   */
  recordTrade(action, result) {
    const trade = {
      action,
      timestamp: Date.now(),
      signature: result.signature,
      inputAmount: result.inputAmount,
      outputAmount: result.outputAmount,
      quote: result.quote,
    };

    this.tradeHistory.push(trade);

    logger.success(`${action.toUpperCase()} trade recorded`, {
      signature: result.signature,
      tradeCount: this.tradeHistory.length,
    });
  }

  /**
   * Get trade history
   */
  getTradeHistory() {
    return this.tradeHistory;
  }

  /**
   * Get current balances
   */
  async getBalances() {
    const publicKey = this.walletManager.getPublicKey();

    const tokens = [
      { mint: this.config.outputToken, symbol: 'USDC', decimals: 6 },
    ];

    return await this.connectionManager.getAllBalances(publicKey, tokens);
  }

  /**
   * Display current balances
   */
  async displayBalances() {
    const balances = await this.getBalances();

    logger.info('Current Balances:', balances);

    return balances;
  }

  /**
   * Check if trading is active
   */
  isActive() {
    return this.isTrading;
  }

  /**
   * Set trading status
   */
  setTradingStatus(status) {
    this.isTrading = status;
  }
}

module.exports = TradingEngine;
